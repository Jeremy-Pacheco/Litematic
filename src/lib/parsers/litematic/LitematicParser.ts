import { detachNbt, isNbtCompound, type NbtCompound, type NbtLongArray } from '../../types/nbt'
import type {
  BlockEntity,
  BlockState,
  Entity,
  Structure,
  StructureRegion,
  Vec3,
} from '../../types/structure'
import { createBlockState } from '../blockState'
import { upgradeBlockState } from '../blockStateUpgrade'
import { StructureReadError } from '../errors'
import { getCompound, getInteger, getList, getLongArray, getNumber, getString } from '../nbt/access'
import {
  allocateBlocks,
  assertStructureSize,
  emptyWarnings,
  finishStructure,
  PaletteBuilder,
  type ParseProgressCallback,
} from '../structureBuilder'
import { bitsForPalette, PackedReader, requiredLongs } from './bitArray'

/**
 * Parser for Litematica schematics (`.litematic`), format versions 1–7.
 * Reference: `LitematicaSchematic`, `LitematicaBlockStateContainer` and
 * `LitematicaBitArray` in Litematica's source.
 */

/** First Minecraft data version after the 1.13 "flattening" of block ids (1.13.2). */
const DATA_VERSION_FLATTENING = 1631
/** First Litematica format version written by 1.13+ builds. */
const FORMAT_VERSION_FLATTENING = 5
/** Blocks decoded between two progress reports. */
const PROGRESS_STEP = 1 << 20

interface RawRegion {
  name: string
  /** Minimum corner relative to the schematic origin (before normalizing). */
  origin: Vec3
  size: Vec3
  palette: number[]
  blockStates: NbtLongArray
  bits: number
  tag: NbtCompound
}

export function parseLitematic(root: NbtCompound, onProgress?: ParseProgressCallback): Structure {
  const formatVersion = getInteger(root, 'Version')
  if (formatVersion === undefined || formatVersion < 1) {
    throw invalid('Missing or invalid Litematica format version')
  }
  const dataVersion = getInteger(root, 'MinecraftDataVersion') ?? null
  const warnings = emptyWarnings()
  warnings.legacyBlockNames =
    formatVersion < FORMAT_VERSION_FLATTENING ||
    (dataVersion !== null && dataVersion > 0 && dataVersion < DATA_VERSION_FLATTENING)

  const palette = new PaletteBuilder()
  // Pre-1.13 names are kept as they are (and flagged); later ones are brought
  // up to the current game.
  const upgrade = warnings.legacyBlockNames
    ? (state: BlockState) => state
    : (state: BlockState) => upgradeBlockState(state, dataVersion)
  const regions = readRegions(root, palette, upgrade)

  // Bounding box of all regions; positions are shifted so it starts at 0,0,0.
  const min = { x: Infinity, y: Infinity, z: Infinity }
  const max = { x: -Infinity, y: -Infinity, z: -Infinity }
  for (const { origin, size } of regions) {
    for (const axis of ['x', 'y', 'z'] as const) {
      min[axis] = Math.min(min[axis], origin[axis])
      max[axis] = Math.max(max[axis], origin[axis] + size[axis])
    }
  }
  const size = { x: max.x - min.x, y: max.y - min.y, z: max.z - min.z }
  assertStructureSize(size)

  const blocks = allocateBlocks(size, palette.states.length)
  const totalVolume = regions.reduce((sum, r) => sum + r.size.x * r.size.y * r.size.z, 0)
  let decoded = 0
  let nextReport = PROGRESS_STEP

  const placedRegions: StructureRegion[] = []
  const blockEntities: BlockEntity[] = []
  const entities: Entity[] = []

  for (const region of regions) {
    const offset = {
      x: region.origin.x - min.x,
      y: region.origin.y - min.y,
      z: region.origin.z - min.z,
    }
    placedRegions.push({ name: region.name, min: offset, size: region.size })

    // Region blocks are stored in the same Y-Z-X order as the structure.
    const reader = new PackedReader(region.blockStates, region.bits)
    const lookup = region.palette
    const { x: sx, y: sy, z: sz } = region.size
    for (let y = 0; y < sy; y++) {
      for (let z = 0; z < sz; z++) {
        const base = ((offset.y + y) * size.z + (offset.z + z)) * size.x + offset.x
        for (let x = 0; x < sx; x++) {
          const local = reader.next()
          let global = 0
          if (local < lookup.length) global = lookup[local]
          else warnings.invalidPaletteIndices++
          if (global !== 0) {
            const index = base + x
            if (blocks[index] !== 0 && blocks[index] !== global) warnings.overlappingBlocks++
            blocks[index] = global
          }
        }
      }
      decoded += sx * sz
      if (decoded >= nextReport) {
        onProgress?.(decoded / totalVolume)
        nextReport = decoded + PROGRESS_STEP
      }
    }

    if (formatVersion >= 2) {
      readBlockEntities(region.tag, offset, blockEntities, warnings)
      readEntities(region.tag, offset, entities, warnings)
    } else {
      // Version 1 used a different, undocumented layout for these lists.
      warnings.skippedObjects +=
        (getList(region.tag, 'TileEntities')?.items.length ?? 0) +
        (getList(region.tag, 'Entities')?.items.length ?? 0)
    }
  }
  onProgress?.(1)

  const metadata = getCompound(root, 'Metadata')
  return finishStructure({
    format: 'litematic',
    formatVersion,
    dataVersion,
    size,
    palette: palette.states,
    blocks,
    blockEntities,
    entities,
    regions: placedRegions,
    metadata: {
      name: (metadata && getString(metadata, 'Name')) || null,
      author: (metadata && getString(metadata, 'Author')) || null,
      description: (metadata && getString(metadata, 'Description')) || null,
      createdAt: metadata ? readTime(metadata, 'TimeCreated') : null,
      modifiedAt: metadata ? readTime(metadata, 'TimeModified') : null,
    },
    warnings,
  })
}

function readRegions(
  root: NbtCompound,
  palette: PaletteBuilder,
  upgrade: (state: BlockState) => BlockState,
): RawRegion[] {
  const regionsTag = getCompound(root, 'Regions')
  if (!regionsTag) throw invalid('Missing Regions compound')

  const regions: RawRegion[] = []
  for (const [name, tag] of regionsTag) {
    if (!isNbtCompound(tag)) continue
    const position = readVec3(getCompound(tag, 'Position'))
    const rawSize = readVec3(getCompound(tag, 'Size'))
    if (!position || !rawSize) throw invalid(`Region "${name}" has no position or size`)
    if (rawSize.x === 0 || rawSize.y === 0 || rawSize.z === 0) continue

    // A negative size means the region extends towards negative coordinates
    // from its position: the minimum corner is position + size + 1.
    const origin = {
      x: rawSize.x > 0 ? position.x : position.x + rawSize.x + 1,
      y: rawSize.y > 0 ? position.y : position.y + rawSize.y + 1,
      z: rawSize.z > 0 ? position.z : position.z + rawSize.z + 1,
    }
    const size = { x: Math.abs(rawSize.x), y: Math.abs(rawSize.y), z: Math.abs(rawSize.z) }
    assertStructureSize(size)

    const paletteTag = getList(tag, 'BlockStatePalette')
    const blockStates = getLongArray(tag, 'BlockStates')
    if (!paletteTag || !blockStates) throw invalid(`Region "${name}" has no block data`)

    const lookup = paletteTag.items.map((entry) => {
      if (!isNbtCompound(entry)) throw invalid(`Region "${name}" has an invalid palette entry`)
      return palette.add(upgrade(readBlockState(entry, name)))
    })

    const bits = bitsForPalette(lookup.length)
    const volume = size.x * size.y * size.z
    if (blockStates.words.length / 2 < requiredLongs(volume, bits)) {
      throw invalid(`Region "${name}" has fewer block states than its volume`)
    }
    regions.push({ name, origin, size, palette: lookup, blockStates, bits, tag })
  }

  if (regions.length === 0) throw invalid('The schematic has no regions with blocks')
  return regions
}

function readBlockState(entry: NbtCompound, regionName: string) {
  const name = getString(entry, 'Name')
  if (!name) throw invalid(`Region "${regionName}" has a palette entry without a name`)
  const properties = getCompound(entry, 'Properties')
  const pairs: [string, string][] = properties
    ? [...properties].map(([key, value]) => [key, String(value)])
    : []
  return createBlockState(name, pairs)
}

/** Block entities store x, y, z relative to the region's minimum corner. */
function readBlockEntities(
  regionTag: NbtCompound,
  offset: Vec3,
  out: BlockEntity[],
  warnings: Structure['warnings'],
): void {
  for (const item of getList(regionTag, 'TileEntities')?.items ?? []) {
    const pos = isNbtCompound(item) ? readVec3(item) : null
    if (!pos || !isNbtCompound(item)) {
      warnings.skippedObjects++
      continue
    }
    out.push({
      pos: { x: offset.x + pos.x, y: offset.y + pos.y, z: offset.z + pos.z },
      id: getString(item, 'id') ?? '',
      nbt: detachNbt(item),
    })
  }
}

/** Entities store `Pos` (three doubles) relative to the region's minimum corner. */
function readEntities(
  regionTag: NbtCompound,
  offset: Vec3,
  out: Entity[],
  warnings: Structure['warnings'],
): void {
  for (const item of getList(regionTag, 'Entities')?.items ?? []) {
    const posList = isNbtCompound(item) ? getList(item, 'Pos') : undefined
    const coords = posList?.items
    if (!isNbtCompound(item) || !coords || coords.length !== 3 || !coords.every(isFiniteNumber)) {
      warnings.skippedObjects++
      continue
    }
    const [x, y, z] = coords as number[]
    out.push({
      pos: { x: offset.x + x, y: offset.y + y, z: offset.z + z },
      id: getString(item, 'id') ?? '',
      nbt: detachNbt(item),
    })
  }
}

function readVec3(tag: NbtCompound | undefined): Vec3 | null {
  if (!tag) return null
  const x = getInteger(tag, 'x')
  const y = getInteger(tag, 'y')
  const z = getInteger(tag, 'z')
  return x === undefined || y === undefined || z === undefined ? null : { x, y, z }
}

/** Litematica stores times as milliseconds in a long. */
function readTime(tag: NbtCompound, key: string): number | null {
  const value = tag.get(key)
  if (typeof value === 'bigint') return Number(value)
  return getNumber(tag, key) ?? null
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function invalid(message: string): StructureReadError {
  return new StructureReadError('invalid-structure', message)
}
