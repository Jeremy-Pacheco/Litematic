import type { NbtDocument } from '../types/nbt'
import { detectFormat, type DetectedFormat } from './detectFormat'
import { StructureReadError } from './errors'
import { decompressBlob, type Compression, type DecompressOptions } from './nbt/decompress'
import { readNbt } from './nbt/NbtReader'

export type ReadPhase = 'decompressing' | 'parsing'

export interface ReadProgress {
  phase: ReadPhase
  /** 0–1 */
  fraction: number
}

export interface ReadStructureOptions extends Pick<DecompressOptions, 'maxBytes' | 'signal'> {
  onProgress?: (progress: ReadProgress) => void
}

/** Summary sent back to the UI. Contains no large data, so it is cheap to post. */
export interface StructureFileInfo extends DetectedFormat {
  compression: Compression
  compressedBytes: number
  decompressedBytes: number
  durationMs: number
}

export interface ReadStructureResult {
  document: NbtDocument
  info: StructureFileInfo
}

/**
 * Full read pipeline for one structure file: decompress → NBT → detect format.
 * Runs inside the structure worker; kept free of worker APIs so it can be
 * tested directly.
 *
 * @throws {StructureReadError}
 */
export async function readStructureFile(
  file: Blob,
  options: ReadStructureOptions = {},
): Promise<ReadStructureResult> {
  const start = performance.now()
  const { onProgress, signal, maxBytes } = options

  const { data, compression } = await decompressBlob(file, {
    maxBytes,
    signal,
    onProgress: (consumed, total) =>
      onProgress?.({ phase: 'decompressing', fraction: total > 0 ? consumed / total : 1 }),
  })

  signal?.throwIfAborted()
  onProgress?.({ phase: 'parsing', fraction: 0 })
  const document = readNbt(data)
  onProgress?.({ phase: 'parsing', fraction: 1 })

  const detected = detectFormat(document.root)
  if (!detected) {
    throw new StructureReadError(
      'unknown-format',
      'Valid NBT, but not a Litematica, Sponge or MCEdit structure',
    )
  }

  return {
    document,
    info: {
      ...detected,
      compression,
      compressedBytes: file.size,
      decompressedBytes: data.byteLength,
      durationMs: Math.round(performance.now() - start),
    },
  }
}
