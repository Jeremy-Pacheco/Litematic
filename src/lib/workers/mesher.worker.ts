/// <reference lib="webworker" />
import { Mesher } from '../viewer/mesher'
import type { MesherRequest, MesherResponse } from './mesherProtocol'

/**
 * Builds section meshes off the main thread and streams them as they are
 * ready (bottom layer first), so the structure appears progressively. The
 * vertex arrays are transferred, not copied.
 */
const scope = self as unknown as DedicatedWorkerGlobalScope

scope.onmessage = (event: MessageEvent<MesherRequest>) => {
  if (event.data.type !== 'mesh') return
  try {
    const start = performance.now()
    const mesher = new Mesher(event.data)
    const counts = mesher.sectionCounts
    const total = counts.x * counts.y * counts.z
    const quads: [number, number, number] = [0, 0, 0]
    let done = 0
    let sections = 0

    for (let sy = 0; sy < counts.y; sy++) {
      for (let sz = 0; sz < counts.z; sz++) {
        for (let sx = 0; sx < counts.x; sx++) {
          const mesh = mesher.meshSection(sx, sy, sz)
          done++
          const transfer: ArrayBuffer[] = []
          mesh.layers.forEach((layer, i) => {
            if (!layer) return
            quads[i] += layer.quadCount
            transfer.push(
              layer.positions.buffer as ArrayBuffer,
              layer.uvs.buffer as ArrayBuffer,
              layer.colors.buffer as ArrayBuffer,
              layer.indices.buffer as ArrayBuffer,
            )
          })
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
  } catch (error) {
    const message: MesherResponse = {
      type: 'error',
      message: error instanceof Error ? error.message : String(error),
    }
    scope.postMessage(message)
  }
}
