import type { NbtCompound, NbtDocument } from '../types/nbt'
import type { Structure } from '../types/structure'
import type { StructureFormat } from '../constants/formats'
import { detectFormat, type DetectedFormat } from './detectFormat'
import { StructureReadError } from './errors'
import { parseLitematic, type ParseProgressCallback } from './litematic/LitematicParser'
import { decompressBlob, type Compression, type DecompressOptions } from './nbt/decompress'
import { readNbt } from './nbt/NbtReader'

export type ReadPhase = 'decompressing' | 'parsing' | 'decoding'

export interface ReadProgress {
  phase: ReadPhase
  /** 0–1 */
  fraction: number
}

export interface ReadStructureOptions extends Pick<DecompressOptions, 'maxBytes' | 'signal'> {
  onProgress?: (progress: ReadProgress) => void
}

/** Summary of the file itself. Small, so it is cheap to post between threads. */
export interface StructureFileInfo extends DetectedFormat {
  compression: Compression
  compressedBytes: number
  decompressedBytes: number
  durationMs: number
}

export interface ReadStructureResult {
  document: NbtDocument
  info: StructureFileInfo
  /** Parsed blocks, or `null` if the parser for this format does not exist yet. */
  structure: Structure | null
}

type StructureParser = (root: NbtCompound, onProgress?: ParseProgressCallback) => Structure

/** Block parsers available so far. The rest arrive in their own features. */
const PARSERS: Partial<Record<StructureFormat, StructureParser>> = {
  litematic: parseLitematic,
}

/**
 * Full read pipeline for one structure file:
 * decompress → NBT → detect format → parse blocks (when supported).
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

  const parse = PARSERS[detected.format]
  let structure: Structure | null = null
  if (parse) {
    signal?.throwIfAborted()
    onProgress?.({ phase: 'decoding', fraction: 0 })
    structure = parse(document.root, (fraction) => onProgress?.({ phase: 'decoding', fraction }))
  }

  return {
    document,
    structure,
    info: {
      ...detected,
      // The parser computes the real bounding box; prefer it over metadata.
      dimensions: structure?.size ?? detected.dimensions,
      compression,
      compressedBytes: file.size,
      decompressedBytes: data.byteLength,
      durationMs: Math.round(performance.now() - start),
    },
  }
}
