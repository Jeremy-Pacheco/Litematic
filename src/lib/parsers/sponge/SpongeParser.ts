import { detachNbt, isNbtCompound, type NbtCompound, type NbtValue } from '../../types/nbt'
import type { BlockEntity, Entity, Structure, Vec3 } from '../../types/structure'
import { parseBlockStateString } from '../blockStateString'
import { StructureReadError } from '../errors'
import {
  getByteArray,
  getCompound,
  getInteger,
  getIntArray,
  getList,
  getNumber,
  getString,
} from '../nbt/access'
import {
  allocateBlocks,
  assertStructureSize,
  emptyWarnings,
  finishStructure,
  PaletteBuilder,
  type ParseProgressCallback,
} from '../structureBuilder'
import { VarintReader } from './varint'

/**
 * Parser for Sponge schematics (`.schem`), versions 1–3, as written by
 * WorldEdit and others. Reference: SpongePowered/Schematic-Specification.
 *
 * | Version | Layout                                                             |
 * | ------- | ------------------------------------------------------------------ |
 * | 1       | Fields at the root; `Palette`, `BlockData`, `TileEntities`          |
 * | 2       | Fields at the root; adds `DataVersion`, `BlockEntities`, `Entities` |
 * | 3       | Fields inside `Schematic`; blocks inside `Blocks`; extra data in `Data` |
 */

/** First Minecraft data version after the 1.13 "flattening" of block ids. */
const DATA_VERSION_FLATTENING = 1631
/** Palette indices above this are treated as corrupt (avoids huge lookup tables). */
const MAX_PALETTE_INDEX = 1 << 20
const PROGRESS_STEP = 1 << 20

export function parseSponge(root: NbtCompound, onProgress?: ParseProgressCallback): Structure {
  const body = getCompound(root, 'Schematic') ?? root
  const formatVersion = getInteger(body, 'Version')
  if (formatVersion === undefined || formatVersion < 1) {
    throw invalid('Missing or invalid Sponge schematic version')
  }
  const dataVersion = getInteger(body, 'DataVersion') ?? null

  // Sizes are unsigned shorts stored in signed NBT shorts.
  const width = getInteger(body, 'Width')
  const height = getInteger(body, 'Height')
  const length = getInteger(body, 'Length')
  if (width === undefined || height === undefined || length === undefined) {
    throw invalid('Missing Width, Height or Length')
  }
  const size = { x: width & 0xffff, y: height & 0xffff, z: length & 0xffff }
  assertStructureSize(size)

  const container = formatVersion >= 3 ? getCompound(body, 'Blocks') : body
  if (!container) throw invalid('Missing Blocks container')
  const paletteTag = getCompound(container, 'Palette')
  const data = getByteArray(container, formatVersion >= 3 ? 'Data' : 'BlockData')
  if (!paletteTag || !data) throw invalid('Missing block palette or block data')

  const warnings = emptyWarnings()
  warnings.legacyBlockNames = dataVersion !== null && dataVersion < DATA_VERSION_FLATTENING

  const palette = new PaletteBuilder()
  const lookup = buildLookup(paletteTag, palette)
  const blocks = allocateBlocks(size, palette.states.length)
  const volume = size.x * size.y * size.z

  // Sponge uses the same Y-Z-X order as Structure: x + z·W + y·W·L.
  const reader = new VarintReader(data)
  let nextReport = PROGRESS_STEP
  for (let i = 0; i < volume; i++) {
    const local = reader.next()
    if (local < 0) throw invalid(`Block data ends after ${i} of ${volume} blocks`)
    let global = local < lookup.length ? lookup[local] : -1
    if (global < 0) {
      warnings.invalidPaletteIndices++
      global = 0
    }
    blocks[i] = global
    if (i >= nextReport) {
      onProgress?.(i / volume)
      nextReport = i + PROGRESS_STEP
    }
  }
  if (reader.remaining > 0) throw invalid('Block data is longer than Width × Height × Length')
  onProgress?.(1)

  const blockEntityList =
    getList(container, 'BlockEntities') ??
    getList(container, 'TileEntities') ??
    getList(body, 'BlockEntities') ??
    getList(body, 'TileEntities')
  const blockEntities = readBlockEntities(blockEntityList?.items ?? [], size, warnings)
  const entities = readEntities(getList(body, 'Entities')?.items ?? [], warnings)

  const metadata = getCompound(body, 'Metadata')
  const date = metadata?.get('Date')
  return finishStructure({
    format: 'schem',
    formatVersion,
    dataVersion,
    size,
    palette: palette.states,
    blocks,
    blockEntities,
    entities,
    regions: [{ name: '', min: { x: 0, y: 0, z: 0 }, size }],
    metadata: {
      name: (metadata && getString(metadata, 'Name')) || null,
      author: (metadata && getString(metadata, 'Author')) || null,
      description: null,
      createdAt:
        typeof date === 'bigint'
          ? Number(date)
          : ((metadata && getNumber(metadata, 'Date')) ?? null),
      modifiedAt: null,
    },
    warnings,
  })
}

/**
 * The palette maps block state text to a local index: `{"minecraft:stone": 1}`.
 * Returns a table local index → global index, with -1 for unused indices.
 */
function buildLookup(paletteTag: NbtCompound, palette: PaletteBuilder): Int32Array {
  let maxIndex = -1
  for (const [key, value] of paletteTag) {
    if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
      throw invalid(`Invalid palette index for "${key}"`)
    }
    if (value > MAX_PALETTE_INDEX) throw invalid(`Palette index ${value} is too large`)
    maxIndex = Math.max(maxIndex, value)
  }

  const lookup = new Int32Array(maxIndex + 1).fill(-1)
  for (const [key, value] of paletteTag) {
    const state = parseBlockStateString(key)
    if (!state) throw invalid(`Invalid block state "${key}"`)
    lookup[value as number] = palette.add(state)
  }
  return lookup
}

/**
 * v1/v2 keep the block entity data next to `Pos` and `Id`; v3 moves it into
 * `Data`. `Pos` is relative to the schematic origin (Offset not applied).
 */
function readBlockEntities(
  items: NbtValue[],
  size: Vec3,
  warnings: Structure['warnings'],
): BlockEntity[] {
  const result: BlockEntity[] = []
  for (const item of items) {
    const pos = isNbtCompound(item) ? getIntArray(item, 'Pos') : undefined
    if (!isNbtCompound(item) || !pos || pos.length !== 3) {
      warnings.skippedObjects++
      continue
    }
    const [x, y, z] = pos
    if (x < 0 || y < 0 || z < 0 || x >= size.x || y >= size.y || z >= size.z) {
      warnings.skippedObjects++
      continue
    }
    result.push({
      pos: { x, y, z },
      id: getString(item, 'Id') ?? getString(item, 'id') ?? '',
      nbt: detachNbt(getCompound(item, 'Data') ?? item),
    })
  }
  return result
}

/** Entities: `Pos` is a list of three doubles relative to the schematic origin. */
function readEntities(items: NbtValue[], warnings: Structure['warnings']): Entity[] {
  const result: Entity[] = []
  for (const item of items) {
    const coords = isNbtCompound(item) ? getList(item, 'Pos')?.items : undefined
    if (
      !isNbtCompound(item) ||
      !coords ||
      coords.length !== 3 ||
      !coords.every((c) => typeof c === 'number' && Number.isFinite(c))
    ) {
      warnings.skippedObjects++
      continue
    }
    const [x, y, z] = coords as number[]
    result.push({
      pos: { x, y, z },
      id: getString(item, 'Id') ?? getString(item, 'id') ?? '',
      nbt: detachNbt(getCompound(item, 'Data') ?? item),
    })
  }
  return result
}

function invalid(message: string): StructureReadError {
  return new StructureReadError('invalid-structure', message)
}
