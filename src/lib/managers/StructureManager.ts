import {
  BufferAttribute,
  BufferGeometry,
  Mesh,
  Vector3,
  type DataTexture,
  type Material,
} from 'three'
import type { BakedModels } from '../models/bakeModels'
import type { Structure } from '../types/structure'
import { createAtlasTexture, createLayerMaterials, LAYER_RENDER_ORDER } from '../viewer/materials'
import type { LayerMesh, SectionMesh } from '../viewer/mesher'
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
}

/**
 * Turns a parsed structure into meshes in a scene: bakes the palette's models
 * (models worker), uploads the atlas, then builds the geometry section by
 * section (mesher worker), adding each section as soon as it arrives.
 */
export class StructureManager {
  readonly #scene: SceneManager
  #texture: DataTexture | null = null
  #materials: Material[] = []
  #cancel: (() => void) | null = null

  constructor(scene: SceneManager) {
    this.#scene = scene
  }

  async show(structure: Structure, onProgress?: (p: ShowProgress) => void): Promise<ShowResult> {
    this.clear()
    const size = new Vector3(structure.size.x, structure.size.y, structure.size.z)
    this.#scene.setBounds(size)

    onProgress?.({ phase: 'models', fraction: 0 })
    const bake = ModelManager.bake(structure.palette)
    this.#cancel = bake.cancel
    const models = await bake.promise

    this.#texture = createAtlasTexture(models.atlas.pixels, models.atlas.size)
    this.#materials = createLayerMaterials(this.#texture)

    const stats = await this.#mesh(structure, models, onProgress)
    return { stats, missingBlocks: models.missingBlocks, bakeMs: models.durationMs }
  }

  /** Stops any work in progress and frees every GPU resource of the structure. */
  clear(): void {
    this.#cancel?.()
    this.#cancel = null
    this.#queue = []
    this.#drained = null
    this.#scene.clearContent()
    this.#materials.forEach((m) => m.dispose())
    this.#materials = []
    this.#texture?.dispose()
    this.#texture = null
  }

  #mesh(
    structure: Structure,
    models: BakedModels,
    onProgress?: (p: ShowProgress) => void,
  ): Promise<MesherStats> {
    const worker = new Worker(new URL('../workers/mesher.worker.ts', import.meta.url), {
      type: 'module',
    })
    return new Promise<MesherStats>((resolve, reject) => {
      let settled = false
      const finish = () => {
        settled = true
        worker.terminate()
        this.#cancel = null
      }
      this.#cancel = () => {
        if (settled) return
        finish()
        reject(new DOMException('Meshing was cancelled', 'AbortError'))
      }

      worker.onmessage = (event: MessageEvent<MesherResponse>) => {
        const message = event.data
        if (message.type === 'section') {
          this.#addSection(message.mesh)
          onProgress?.({ phase: 'meshing', fraction: message.done / message.total })
        } else if (message.type === 'done') {
          finish()
          // Report completion once every section is actually in the scene.
          void this.#whenDrained().then(() => resolve(message.stats))
        } else {
          finish()
          reject(new Error(message.message))
        }
      }
      worker.onerror = (event: ErrorEvent) => {
        event.preventDefault()
        finish()
        reject(new Error(event.message || 'Mesher worker error'))
      }

      // The block array is copied (not transferred): the main thread keeps it
      // for the material list and, later, the block inspector.
      const request: MesherRequest = {
        type: 'mesh',
        size: structure.size,
        blocks: structure.blocks,
        states: models.states.map(({ geometry, opaqueFaces, fullFaces, empty }) => ({
          geometry,
          opaqueFaces,
          fullFaces,
          empty,
        })),
      }
      worker.postMessage(request)
    })
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
      section.layers.forEach((layer, index) => {
        if (!layer) return
        vertices += layer.quadCount * 4
        const mesh = new Mesh(toGeometry(layer), this.#materials[index])
        mesh.renderOrder = LAYER_RENDER_ORDER[index as 0 | 1 | 2]
        mesh.matrixAutoUpdate = false
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

  #queue: SectionMesh[] = []
  #flushScheduled = false
  #drained: (() => void) | null = null
}

/** Geometry added to the scene per frame (bounds GPU upload per frame). */
const VERTICES_PER_FRAME = 200_000

function toGeometry(layer: LayerMesh): BufferGeometry {
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(layer.positions, 3))
  geometry.setAttribute('uv', new BufferAttribute(layer.uvs, 2, true))
  geometry.setAttribute('color', new BufferAttribute(layer.colors, 3, true))
  geometry.setIndex(new BufferAttribute(layer.indices, 1))
  geometry.computeBoundingSphere()
  return geometry
}
