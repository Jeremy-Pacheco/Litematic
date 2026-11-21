import {
  BufferAttribute,
  BufferGeometry,
  Mesh,
  Plane,
  Vector3,
  type DataTexture,
  type Material,
} from 'three'
import type { BakedModels } from '../models/bakeModels'
import { buildRenderVariants } from '../models/blockEntityRender'
import type { Structure } from '../types/structure'
import type { LayerRange } from '../viewer/layers'
import { createAtlasTexture, createLayerMaterials, LAYER_RENDER_ORDER } from '../viewer/materials'
import { planMeshing, workerCount } from '../viewer/meshingPlan'
import { SECTION_HEIGHT, type CapSide, type LayerMesh, type SectionMesh } from '../viewer/mesher'
import type { MesherRequest, MesherResponse, MesherStats } from '../workers/mesherProtocol'
import { ModelManager } from './ModelManager'
import type { SceneManager } from './SceneManager'

export type ViewerPhase = 'models' | 'meshing'

export interface ShowProgress {
  phase: ViewerPhase
  /** 0–1 */
  fraction: number
}

export interface ShowResult {
  stats: MesherStats
  missingBlocks: string[]
  bakeMs: number
  /** 1, or the divisor applied to textures too large for the atlas. */
  textureScale: number
}

/** Plane constant that leaves everything visible. */
const FAR = 1e6
/**
 * The cut sits this far inside the visible layers, so the faces lying exactly
 * on the cut plane are always removed (no flicker) and drawn by the caps.
 */
const CUT_INSET = 0.01
/** Caps kept in memory, so stepping back and forth between layers is instant. */
const MAX_CAPS = 8

/**
 * Turns a parsed structure into meshes in a scene: bakes the palette's models
 * (models worker), uploads the atlas, then builds the geometry section by
 * section (mesher worker), adding each section as soon as it arrives.
 *
 * Layers are shown **without rebuilding the geometry**: sections outside the
 * visible layers are hidden, two clipping planes cut the sections that are
 * partly visible, and small "caps" (the top or bottom faces of the cut level,
 * made on demand by the mesher worker) close the cut.
 */
export class StructureManager {
  readonly #scene: SceneManager
  #texture: DataTexture | null = null
  /** Clipped by the layer planes. */
  #materials: Material[] = []
  /** Not clipped: caps lie exactly on the cut. */
  #capMaterials: Material[] = []
  /** Keeps `y <= top` and `y >= bottom`. */
  readonly #planes = [new Plane(new Vector3(0, -1, 0), FAR), new Plane(new Vector3(0, 1, 0), FAR)]
  #cancel: (() => void) | null = null
  #worker: Worker | null = null
  #height = 0
  #range: LayerRange | null = null
  readonly #caps = new Map<string, Mesh[]>()
  readonly #pendingCaps = new Set<string>()
  #queue: SectionMesh[] = []
  #flushScheduled = false
  #drained: (() => void) | null = null

  constructor(scene: SceneManager) {
    this.#scene = scene
  }

  async show(structure: Structure, onProgress?: (p: ShowProgress) => void): Promise<ShowResult> {
    this.clear()
    const size = new Vector3(structure.size.x, structure.size.y, structure.size.z)
    this.#scene.setBounds(size)
    this.#height = structure.size.y
    // Re-apply the layer cut for this structure's height.
    this.setLayerRange(this.#range)

    onProgress?.({ phase: 'models', fraction: 0 })
    // Blocks whose data changes their look (banner patterns) get their own
    // palette entries for drawing; the structure itself is not changed.
    const variants = buildRenderVariants(structure)
    const bake = ModelManager.bake(variants.palette, variants.data)
    this.#cancel = bake.cancel
    const models = await bake.promise

    this.#texture = createAtlasTexture(models.atlas.pixels, models.atlas.size)
    this.#materials = createLayerMaterials(this.#texture, this.#planes)
    this.#capMaterials = createLayerMaterials(this.#texture)

    const stats = await this.#mesh({ ...structure, blocks: variants.blocks }, models, onProgress)
    this.#updateCaps()
    return {
      stats,
      missingBlocks: models.missingBlocks,
      bakeMs: models.durationMs,
      textureScale: models.textureScale,
    }
  }

  /**
   * Shows only the layers in `range` (`null`: all of them). Cheap: no
   * geometry is rebuilt; at most two small caps are requested.
   */
  setLayerRange(range: LayerRange | null): void {
    this.#range = range
    const cutTop = range !== null && range.max < this.#height - 1
    const cutBottom = range !== null && range.min > 0
    this.#planes[0].constant = cutTop ? range.max + 1 - CUT_INSET : FAR
    this.#planes[1].constant = cutBottom ? -(range.min + CUT_INSET) : FAR
    for (const child of this.#scene.content.children) {
      const sy = child.userData.sectionY as number | undefined
      if (sy !== undefined) child.visible = this.#sectionVisible(sy)
    }
    this.#updateCaps()
    this.#scene.requestRender()
  }

  /** Stops any work in progress and frees every GPU resource of the structure. */
  clear(): void {
    this.#cancel?.()
    this.#cancel = null
    this.#worker?.terminate()
    this.#worker = null
    this.#queue = []
    this.#drained = null
    this.#caps.clear()
    this.#pendingCaps.clear()
    this.#scene.clearContent()
    ;[...this.#materials, ...this.#capMaterials].forEach((m) => m.dispose())
    this.#materials = []
    this.#capMaterials = []
    this.#texture?.dispose()
    this.#texture = null
  }

  /**
   * Meshes the structure with one or more workers (see `planMeshing`). The
   * first worker receives the whole block array and stays alive for the
   * layer caps; the others receive only their band of layers and end when
   * they finish.
   */
  #mesh(
    structure: Structure,
    models: BakedModels,
    onProgress?: (p: ShowProgress) => void,
  ): Promise<MesherStats> {
    const cores = globalThis.navigator?.hardwareConcurrency ?? 2
    const tasks = planMeshing(structure.layerBlocks, workerCount(structure.nonAirBlocks, cores))
    const layerSize = structure.size.x * structure.size.z
    const states = models.states.map(
      ({ geometry, opaqueFaces, fullFaces, empty, fluid, fluidFull }) => ({
        geometry,
        opaqueFaces,
        fullFaces,
        empty,
        fluid,
        fluidFull,
      }),
    )
    const workers = tasks.map(
      () => new Worker(new URL('../workers/mesher.worker.ts', import.meta.url), { type: 'module' }),
    )
    this.#worker = workers[0] ?? null

    return new Promise<MesherStats>((resolve, reject) => {
      let settled = false
      let pending = workers.length
      const done = new Array<number>(workers.length).fill(0)
      const totals = new Array<number>(workers.length).fill(1)
      const stats: MesherStats = { sections: 0, quads: [0, 0, 0], durationMs: 0 }

      const stopHelpers = () => workers.slice(1).forEach((w) => w.terminate())
      const fail = (error: Error) => {
        if (settled) {
          // After the structure is shown, only caps can fail: the cut stays
          // open but the viewer keeps working.
          console.error('Layer cap could not be built:', error)
          return
        }
        settled = true
        this.#cancel = null
        stopHelpers()
        reject(error)
      }
      this.#cancel = () => {
        if (settled) return
        settled = true
        workers.forEach((w) => w.terminate())
        this.#worker = null
        reject(new DOMException('Meshing was cancelled', 'AbortError'))
      }

      workers.forEach((worker, i) => {
        worker.onmessage = (event: MessageEvent<MesherResponse>) => {
          const message = event.data
          if (message.type === 'section') {
            if (settled) return
            this.#addSection(message.mesh)
            done[i] = message.done
            totals[i] = message.total
            const fraction = done.reduce((a, b) => a + b, 0) / totals.reduce((a, b) => a + b, 0)
            onProgress?.({ phase: 'meshing', fraction })
          } else if (message.type === 'cap') {
            this.#addCap(message.y, message.side, message.layers)
          } else if (message.type === 'done') {
            stats.sections += message.stats.sections
            message.stats.quads.forEach((q, layer) => (stats.quads[layer] += q))
            stats.durationMs = Math.max(stats.durationMs, message.stats.durationMs)
            if (i > 0) worker.terminate()
            if (--pending > 0 || settled) return
            settled = true
            this.#cancel = null
            // Report completion once every section is actually in the scene.
            void this.#whenDrained().then(() => resolve(stats))
          } else {
            fail(new Error(message.message))
          }
        }
        worker.onerror = (event: ErrorEvent) => {
          event.preventDefault()
          fail(new Error(event.message || 'Mesher worker error'))
        }

        // The first worker gets the whole array (copied: the main thread keeps
        // it for the material list, the inspector and the layers); the others
        // a copy of their layers only, transferred.
        const { rows, layers } = tasks[i]
        const blocks =
          i === 0
            ? structure.blocks
            : structure.blocks.slice(layers.from * layerSize, layers.to * layerSize)
        const request: MesherRequest = {
          type: 'mesh',
          size: structure.size,
          blocks,
          yStart: i === 0 ? 0 : layers.from,
          rows,
          states,
        }
        worker.postMessage(request, i === 0 ? [] : [blocks.buffer as ArrayBuffer])
      })
      if (workers.length === 0) {
        settled = true
        resolve(stats)
      }
    })
  }

  #sectionVisible(sy: number): boolean {
    const range = this.#range
    if (!range) return true
    const y0 = sy * SECTION_HEIGHT
    return y0 <= range.max && y0 + SECTION_HEIGHT - 1 >= range.min
  }

  /** Caps needed by the current range: the top of the highest visible level, the bottom of the lowest. */
  #wantedCaps(): Map<string, { y: number; side: CapSide }> {
    const wanted = new Map<string, { y: number; side: CapSide }>()
    const range = this.#range
    if (!range) return wanted
    if (range.max < this.#height - 1)
      wanted.set(capKey(range.max, 'up'), { y: range.max, side: 'up' })
    if (range.min > 0) wanted.set(capKey(range.min, 'down'), { y: range.min, side: 'down' })
    return wanted
  }

  /** Shows the caps the range needs and asks the worker for the missing ones. */
  #updateCaps(): void {
    const wanted = this.#wantedCaps()
    for (const [key, meshes] of this.#caps) {
      for (const mesh of meshes) mesh.visible = wanted.has(key)
    }
    // Requests wait until the whole structure is meshed (the worker answers in order).
    if (!this.#worker || this.#capMaterials.length === 0) return
    for (const [key, { y, side }] of wanted) {
      if (this.#caps.has(key) || this.#pendingCaps.has(key)) continue
      this.#pendingCaps.add(key)
      const request: MesherRequest = { type: 'cap', y, side }
      this.#worker.postMessage(request)
    }
  }

  #addCap(y: number, side: CapSide, layers: (LayerMesh | null)[]): void {
    const key = capKey(y, side)
    this.#pendingCaps.delete(key)
    const visible = this.#wantedCaps().has(key)
    const meshes: Mesh[] = []
    layers.forEach((layer, index) => {
      if (!layer) return
      const mesh = this.#createMesh(layer, this.#capMaterials[index], index)
      mesh.visible = visible
      this.#scene.content.add(mesh)
      meshes.push(mesh)
    })
    this.#caps.set(key, meshes)
    this.#evictCaps()
    if (visible) this.#scene.requestRender()
  }

  /** Frees the oldest hidden caps beyond `MAX_CAPS`. */
  #evictCaps(): void {
    const wanted = this.#wantedCaps()
    for (const [key, meshes] of this.#caps) {
      if (this.#caps.size <= MAX_CAPS) break
      if (wanted.has(key)) continue
      for (const mesh of meshes) {
        this.#scene.content.remove(mesh)
        mesh.geometry.dispose()
      }
      this.#caps.delete(key)
    }
  }

  #createMesh(layer: LayerMesh, material: Material, index: number): Mesh {
    const mesh = new Mesh(toGeometry(layer), material)
    mesh.renderOrder = LAYER_RENDER_ORDER[index as 0 | 1 | 2]
    mesh.matrixAutoUpdate = false
    return mesh
  }

  /**
   * Queues a section. Sections are added to the scene a few per frame (see
   * `#flush`): each frame then uploads a bounded amount of geometry to the
   * GPU instead of hundreds of megabytes at once.
   */
  #addSection(section: SectionMesh): void {
    this.#queue.push(section)
    if (!this.#flushScheduled) {
      this.#flushScheduled = true
      requestAnimationFrame(() => this.#flush())
    }
  }

  #flush(): void {
    this.#flushScheduled = false
    let vertices = 0
    while (this.#queue.length > 0 && vertices < VERTICES_PER_FRAME) {
      const section = this.#queue.shift()!
      const visible = this.#sectionVisible(section.section.y)
      section.layers.forEach((layer, index) => {
        if (!layer) return
        vertices += layer.quadCount * 4
        const mesh = this.#createMesh(layer, this.#materials[index], index)
        mesh.userData.sectionY = section.section.y
        mesh.visible = visible
        this.#scene.content.add(mesh)
      })
    }
    this.#scene.requestRender()
    if (this.#queue.length > 0) {
      this.#flushScheduled = true
      requestAnimationFrame(() => this.#flush())
    } else {
      this.#drained?.()
    }
  }

  /** Resolves once every queued section is in the scene. */
  #whenDrained(): Promise<void> {
    if (this.#queue.length === 0 && !this.#flushScheduled) return Promise.resolve()
    return new Promise((resolve) => {
      this.#drained = () => {
        this.#drained = null
        resolve()
      }
    })
  }
}

/** Geometry added to the scene per frame (bounds GPU upload per frame). */
const VERTICES_PER_FRAME = 200_000

function capKey(y: number, side: CapSide): string {
  return `${side}:${y}`
}

/**
 * Geometry of one layer mesh. Its arrays are only needed until they reach the
 * GPU: they are released after the upload, so each vertex is not kept twice
 * (in the GPU and in JavaScript). Nothing reads them later: picking and layers
 * work on the block array, and a lost WebGL context rebuilds the structure.
 */
function toGeometry(layer: LayerMesh): BufferGeometry {
  const geometry = new BufferGeometry()
  const attribute = (array: ArrayLike<number>, size: number, normalized = false) =>
    new BufferAttribute(array as Float32Array, size, normalized).onUpload(releaseArray)
  geometry.setAttribute('position', attribute(layer.positions, 3))
  geometry.setAttribute('uv', attribute(layer.uvs, 2, true))
  geometry.setAttribute('color', attribute(layer.colors, 3, true))
  geometry.setIndex(attribute(layer.indices, 1))
  // Bounds for frustum culling are computed before the arrays are released.
  geometry.computeBoundingSphere()
  return geometry
}

function releaseArray(this: BufferAttribute): void {
  ;(this as unknown as { array: null }).array = null
}
