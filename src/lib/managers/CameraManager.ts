import { Box3, PerspectiveCamera, Vector3 } from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'

export type ViewPreset = 'iso' | 'top' | 'front' | 'side'

/** Direction from the target to the camera for each preset view. */
const PRESET_DIRECTIONS: Readonly<Record<ViewPreset, Vector3>> = {
  iso: new Vector3(1, 0.8, 1).normalize(),
  top: new Vector3(0, 1, 0.0001).normalize(),
  front: new Vector3(0, 0.15, 1).normalize(),
  side: new Vector3(1, 0.15, 0).normalize(),
}

/**
 * Orbit camera: rotate (left button), pan (right button), zoom (wheel),
 * fitting to the structure and preset views. Changes trigger a render through
 * `onChange` (rendering is on demand).
 */
export class CameraManager {
  readonly camera: PerspectiveCamera
  readonly controls: OrbitControls
  #bounds = new Box3(new Vector3(0, 0, 0), new Vector3(1, 1, 1))

  constructor(element: HTMLElement, onChange: () => void) {
    this.camera = new PerspectiveCamera(60, 1, 0.05, 4000)
    this.controls = new OrbitControls(this.camera, element)
    this.controls.enableDamping = false
    this.controls.screenSpacePanning = true
    this.controls.addEventListener('change', onChange)
  }

  setAspect(aspect: number): void {
    this.camera.aspect = aspect
    this.camera.updateProjectionMatrix()
  }

  /** Remembers the structure bounds and frames them with the given view. */
  setBounds(bounds: Box3, view: ViewPreset = 'iso'): void {
    this.#bounds = bounds.clone()
    const radius = bounds.getSize(new Vector3()).length() / 2
    this.camera.near = Math.max(0.05, radius / 1000)
    this.camera.far = Math.max(1000, radius * 20)
    this.controls.maxDistance = radius * 10
    this.setView(view)
  }

  /** Frames the whole structure from a preset direction. */
  setView(view: ViewPreset): void {
    this.#frame(PRESET_DIRECTIONS[view])
  }

  /** Frames the whole structure keeping the current viewing direction. */
  fit(): void {
    const direction = this.camera.position.clone().sub(this.controls.target)
    if (direction.lengthSq() === 0) direction.copy(PRESET_DIRECTIONS.iso)
    this.#frame(direction.normalize())
  }

  #frame(direction: Vector3): void {
    const center = this.#bounds.getCenter(new Vector3())
    const radius = Math.max(1, this.#bounds.getSize(new Vector3()).length() / 2)
    const fov = (this.camera.fov * Math.PI) / 180
    const fitFov =
      this.camera.aspect < 1 ? 2 * Math.atan(Math.tan(fov / 2) * this.camera.aspect) : fov
    const distance = (radius / Math.sin(fitFov / 2)) * 1.05
    this.controls.target.copy(center)
    this.camera.position.copy(center).addScaledVector(direction, distance)
    this.camera.updateProjectionMatrix()
    this.controls.update()
  }

  dispose(): void {
    this.controls.dispose()
  }
}
