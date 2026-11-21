/// <reference lib="webworker" />
import { Mesher, type LayerMesh } from '../viewer/mesher'
import type { MesherRequest, MesherResponse } from './mesherProtocol'

/**
 * Builds section meshes off the main thread and streams them as they are
 * ready (bottom layer first), so the structure appears progressively. The
 * vertex arrays are transferred, not copied. Several workers can share a
 * structure, each meshing its own rows of sections.
 *
 * The worker holding the whole structure then stays alive, answering `cap`
 * requests from the layer system, until the viewer changes structure.
 */
const scope = self as unknown as DedicatedWorkerGlobalScope
let mesher: Mesher | null = null

scope.onmessage = (event: MessageEvent<MesherRequest>) => {
  try {
    const request = event.data
    if (request.type === 'mesh') meshAll(request)
    else if (request.type === 'cap') {
      if (!mesher) throw new Error('No structure to cut')
      const layers = mesher.meshCap(request.y, request.side)
      const message: MesherResponse = { type: 'cap', y: request.y, side: request.side, layers }
      scope.postMessage(message, buffersOf(layers))
    }
  } catch (error) {
    const message: MesherResponse = {
      type: 'error',
      message: error instanceof Error ? error.message : String(error),
    }
    scope.postMessage(message)
  }
}

function meshAll(request: Extract<MesherRequest, { type: 'mesh' }>): void {
  const start = performance.now()
  mesher = new Mesher(request)
  const counts = mesher.sectionCounts
  const { from, to } = request.rows
  const total = counts.x * (to - from) * counts.z
  const quads: [number, number, number] = [0, 0, 0]
  let done = 0
  let sections = 0

  for (let sy = from; sy < to; sy++) {
    for (let sz = 0; sz < counts.z; sz++) {
      for (let sx = 0; sx < counts.x; sx++) {
        const mesh = mesher.meshSection(sx, sy, sz)
        done++
        mesh.layers.forEach((layer, i) => {
          if (layer) quads[i] += layer.quadCount
        })
        const transfer = buffersOf(mesh.layers)
        if (transfer.length === 0) continue
        sections++
        const message: MesherResponse = { type: 'section', mesh, done, total }
        scope.postMessage(message, transfer)
      }
    }
  }
  const message: MesherResponse = {
    type: 'done',
    stats: { sections, quads, durationMs: Math.round(performance.now() - start) },
  }
  scope.postMessage(message)
}

function buffersOf(layers: (LayerMesh | null)[]): ArrayBuffer[] {
  const buffers: ArrayBuffer[] = []
  for (const layer of layers) {
    if (!layer) continue
    buffers.push(
      layer.positions.buffer as ArrayBuffer,
      layer.uvs.buffer as ArrayBuffer,
      layer.colors.buffer as ArrayBuffer,
      layer.indices.buffer as ArrayBuffer,
    )
  }
  return buffers
}
