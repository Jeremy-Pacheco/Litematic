import {
  Box3,
  Box3Helper,
  Color,
  GridHelper,
  Group,
  Raycaster,
  Vector2,
  Scene,
  Vector3,
  WebGLRenderer,
  type Object3D,
} from 'three'
import type { Vec3 } from '../types/structure'
import { CameraManager } from './CameraManager'

export interface HelperOptions {
  grid: boolean
  box: boolean
}

/**
 * Owns the WebGL renderer and the scene. Renders **on demand**: nothing is
 * drawn while the camera and the scene are still, so an idle viewer costs no
 * GPU time.
 */
export class SceneManager {
  readonly renderer: WebGLRenderer
  readonly scene = new Scene()
  readonly cameras: CameraManager
  /** Parent of the structure meshes. */
  readonly content = new Group()

  readonly #container: HTMLElement
  readonly #resize: ResizeObserver
  readonly #helpers = new Group()
  #grid: GridHelper | null = null
  #box: Box3Helper | null = null
  #marker: Box3Helper | null = null
  #markerY: number | null = null
  #selection: Box3Helper | null = null
  #selectionPos: Vec3 | null = null
  readonly #raycaster = new Raycaster()
  #size = new Vector3()
  #frame = 0
  #disposed = false

  /** Called after the WebGL context is restored, so the owner can rebuild GPU data. */
  onContextRestored: (() => void) | null = null

  constructor(container: HTMLElement) {
    this.#container = container
    this.renderer = new WebGLRenderer({ antialias: true, powerPreference: 'high-performance' })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    // Materials with clipping planes (layer system) are cut; others are not.
    this.renderer.localClippingEnabled = true
    container.append(this.renderer.domElement)

    this.cameras = new CameraManager(this.renderer.domElement, () => this.requestRender())
    this.scene.add(this.content, this.#helpers)

    this.#resize = new ResizeObserver(() => this.#onResize())
    this.#resize.observe(container)
    this.#onResize()

    const canvas = this.renderer.domElement
    canvas.addEventListener('webglcontextlost', this.#onContextLost)
    canvas.addEventListener('webglcontextrestored', this.#onContextRestored)
  }

  /** Schedules one render on the next animation frame (coalesced). */
  requestRender(): void {
    if (this.#frame || this.#disposed) return
    this.#frame = requestAnimationFrame(() => {
      this.#frame = 0
      this.renderer.render(this.scene, this.cameras.camera)
    })
  }

  setBackground(color: string): void {
    this.scene.background = new Color(color)
    this.requestRender()
  }

  /** Rebuilds the grid and bounding box for a structure of `size` blocks. */
  setBounds(size: Vector3): void {
    this.#clearHelpers()
    this.#size.copy(size)
    const span = Math.max(size.x, size.z) + 4
    this.#grid = new GridHelper(span, span, 0x888888, 0x555555)
    this.#grid.position.set(size.x / 2, 0, size.z / 2)
    const material = this.#grid.material as { opacity: number; transparent: boolean }
    material.transparent = true
    material.opacity = 0.35
    this.#box = new Box3Helper(new Box3(new Vector3(0, 0, 0), size.clone()), 0xe08a55)
    this.#helpers.add(this.#grid, this.#box)
    this.cameras.setBounds(new Box3(new Vector3(0, 0, 0), size.clone()))
    this.setLayerMarker(this.#markerY)
    this.setSelection(this.#selectionPos)
    this.requestRender()
  }

  setHelpers({ grid, box }: HelperOptions): void {
    if (this.#grid) this.#grid.visible = grid
    if (this.#box) this.#box.visible = box
    this.requestRender()
  }

  /** Outlines level `y` of the structure (the layer being built), or hides the outline. */
  setLayerMarker(y: number | null): void {
    this.#markerY = y
    if (this.#marker) {
      this.#helpers.remove(this.#marker)
      disposeObject(this.#marker)
      this.#marker = null
    }
    if (y !== null && this.#size.y > 0) {
      const { x, z } = this.#size
      const box = new Box3(new Vector3(0, y, 0), new Vector3(x, y + 1, z))
      this.#marker = new Box3Helper(box, MARKER_COLOR)
      this.#helpers.add(this.#marker)
    }
    this.requestRender()
  }

  /**
   * Outlines the selected block, drawn over everything (no depth test) so it
   * stays visible when other blocks are in front.
   */
  setSelection(pos: Vec3 | null): void {
    this.#selectionPos = pos
    if (this.#selection) {
      this.#helpers.remove(this.#selection)
      disposeObject(this.#selection)
      this.#selection = null
    }
    if (pos) {
      const pad = 0.004
      const box = new Box3(
        new Vector3(pos.x - pad, pos.y - pad, pos.z - pad),
        new Vector3(pos.x + 1 + pad, pos.y + 1 + pad, pos.z + 1 + pad),
      )
      this.#selection = new Box3Helper(box, SELECTION_COLOR)
      const material = this.#selection.material as { depthTest: boolean; transparent: boolean }
      material.depthTest = false
      material.transparent = true
      this.#selection.renderOrder = 10
      this.#helpers.add(this.#selection)
    }
    this.requestRender()
  }

  /** Ray from the camera through a point of the canvas (client coordinates), in structure space. */
  rayAt(clientX: number, clientY: number): { origin: Vec3; direction: Vec3 } {
    const rect = this.renderer.domElement.getBoundingClientRect()
    const ndc = new Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    )
    this.#raycaster.setFromCamera(ndc, this.cameras.camera)
    const { origin, direction } = this.#raycaster.ray
    return {
      origin: { x: origin.x, y: origin.y, z: origin.z },
      direction: { x: direction.x, y: direction.y, z: direction.z },
    }
  }

  /** Removes and frees every structure mesh. */
  clearContent(): void {
    for (const child of [...this.content.children]) disposeObject(child)
    this.content.clear()
    this.requestRender()
  }

  dispose(): void {
    this.#disposed = true
    cancelAnimationFrame(this.#frame)
    this.#resize.disconnect()
    const canvas = this.renderer.domElement
    canvas.removeEventListener('webglcontextlost', this.#onContextLost)
    canvas.removeEventListener('webglcontextrestored', this.#onContextRestored)
    this.clearContent()
    this.#clearHelpers()
    this.cameras.dispose()
    this.renderer.dispose()
    canvas.remove()
  }

  #onResize(): void {
    const { clientWidth: w, clientHeight: h } = this.#container
    if (w === 0 || h === 0) return
    this.renderer.setSize(w, h, false)
    this.renderer.domElement.style.width = '100%'
    this.renderer.domElement.style.height = '100%'
    this.cameras.setAspect(w / h)
    this.requestRender()
  }

  #clearHelpers(): void {
    for (const child of [...this.#helpers.children]) disposeObject(child)
    this.#helpers.clear()
    this.#grid = null
    this.#box = null
    this.#marker = null
    this.#selection = null
  }

  #onContextLost = (event: Event) => {
    // Allow the browser to restore the context.
    event.preventDefault()
  }

  #onContextRestored = () => {
    this.onContextRestored?.()
  }
}

/** Color of the current layer outline (the secondary color of the app, verdigris). */
const MARKER_COLOR = 0x4fa89a
/** Selected block outline: light copper, readable on dark and light backgrounds. */
const SELECTION_COLOR = 0xffb27a

/** Frees the GPU resources of an object and its children. */
function disposeObject(object: Object3D): void {
  object.traverse((node) => {
    const mesh = node as Partial<{ geometry: { dispose(): void }; material: unknown }>
    mesh.geometry?.dispose()
    const material = mesh.material as
      { dispose?: () => void } | { dispose?: () => void }[] | undefined
    if (Array.isArray(material)) material.forEach((m) => m.dispose?.())
    else material?.dispose?.()
  })
}
