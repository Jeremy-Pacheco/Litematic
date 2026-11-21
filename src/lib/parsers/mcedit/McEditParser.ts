import { detachNbt, isNbtCompound, type NbtCompound, type NbtValue } from '../../types/nbt'
import type { BlockEntity, Entity, Structure, Vec3 } from '../../types/structure'
import { StructureReadError } from '../errors'
import { getByteArray, getInteger, getList, getString } from '../nbt/access'
import {
  assertStructureSize,
  emptyWarnings,
  finishStructure,
  PaletteBuilder,
  type ParseProgressCallback,
} from '../structureBuilder'
import { loadLegacyBlocks, type LegacyBlockTable } from './legacyBlocks'

/**
 * Parser for MCEdit / Schematica schematics (`.schematic`), the pre-1.13
 * format with numeric block ids. Reference: WorldEdit's MCEditSchematicReader.
 *
 * - `Blocks`: low 8 bits of each block id.
 * - `AddBlocks` (optional): high 4 bits, two blocks per byte. Even indices use
 *   the low nibble, odd indices the high nibble.
 * - `Add` (optional, old Schematica): high 8 bits, one byte per block.
 * - `Data`: metadata (0–15) of each block.
 * - Order: `y·W·L + z·W + x`, the same as `Structure`.
 */

const PROGRESS_STEP = 1 << 20
/** `(id << 4) | meta` with 12-bit ids. */
const LOOKUP_SIZE = 4096 * 16
const UNRESOLVED = -2
const UNKNOWN = -1

export async function parseMcEdit(
  root: NbtCompound,
  onProgress?: ParseProgressCallback,
): Promise<Structure> {
  return parseMcEditWith(root, await loadLegacyBlocks(), onProgress)
}

/** Synchronous core, with the legacy table passed in (used by tests). */
export function parseMcEditWith(
  root: NbtCompound,
  table: LegacyBlockTable,
  onProgress?: ParseProgressCallback,
): Structure {
  const materials = getString(root, 'Materials')
  if (materials !== 'Alpha') {
    throw invalid(`Unsupported Materials "${materials}": only Java Edition ("Alpha") is supported`)
  }

  const width = getInteger(root, 'Width')
  const height = getInteger(root, 'Height')
  const length = getInteger(root, 'Length')
  if (width === undefined || height === undefined || length === undefined) {
    throw invalid('Missing Width, Height or Length')
  }
  const size = { x: width & 0xffff, y: height & 0xffff, z: length & 0xffff }
  assertStructureSize(size)
  const volume = size.x * size.y * size.z

  const ids = getByteArray(root, 'Blocks')
  const metas = getByteArray(root, 'Data')
  if (!ids || !metas) throw invalid('Missing Blocks or Data')
  if (ids.length !== volume || metas.length !== volume) {
    throw invalid('Blocks or Data length does not match Width × Height × Length')
  }
  const addBlocks = getByteArray(root, 'AddBlocks')
  const add = getByteArray(root, 'Add')
  const fullAdd = add && add.length === volume ? add : undefined

  const warnings = emptyWarnings()
  warnings.approximateLegacyStates = true
  const palette = new PaletteBuilder()
  // Legacy palettes are small (≤ 1682 known states), so 16 bits always fit.
  const blocks = new Uint16Array(volume)
  const lookup = new Int32Array(LOOKUP_SIZE).fill(UNRESOLVED)

  let nextReport = PROGRESS_STEP
  for (let i = 0; i < volume; i++) {
    let id = ids[i] & 0xff
    if (addBlocks && i >> 1 < addBlocks.length) {
      const packed = addBlocks[i >> 1]
      id |= (i & 1) === 0 ? (packed & 0x0f) << 8 : (packed & 0xf0) << 4
    } else if (fullAdd) {
      id |= (fullAdd[i] & 0x0f) << 8
    }
    const key = (id << 4) | (metas[i] & 0x0f)

    let global = lookup[key]
    if (global === UNRESOLVED) {
      const state = table.resolve(id, metas[i] & 0x0f)
      global = state ? palette.add(state) : UNKNOWN
      lookup[key] = global
    }
    if (global === UNKNOWN) {
      warnings.unknownLegacyBlocks++
      global = 0
    }
    blocks[i] = global

    if (i >= nextReport) {
      onProgress?.(i / volume)
      nextReport = i + PROGRESS_STEP
    }
  }
  onProgress?.(1)

  return finishStructure({
    format: 'schematic',
    formatVersion: null,
    dataVersion: null,
    size,
    palette: palette.states,
    blocks,
    blockEntities: readBlockEntities(getList(root, 'TileEntities')?.items ?? [], size, warnings),
    entities: readEntities(getList(root, 'Entities')?.items ?? [], warnings),
    regions: [{ name: '', min: { x: 0, y: 0, z: 0 }, size }],
    metadata: { name: null, author: null, description: null, createdAt: null, modifiedAt: null },
    warnings,
  })
}

/** Tile entities store `x`, `y`, `z` relative to the schematic. */
function readBlockEntities(
  items: NbtValue[],
  size: Vec3,
  warnings: Structure['warnings'],
): BlockEntity[] {
  const result: BlockEntity[] = []
  for (const item of items) {
    if (!isNbtCompound(item)) {
      warnings.skippedObjects++
      continue
    }
    const x = getInteger(item, 'x')
    const y = getInteger(item, 'y')
    const z = getInteger(item, 'z')
    if (
      x === undefined ||
      y === undefined ||
      z === undefined ||
      x < 0 ||
      y < 0 ||
      z < 0 ||
      x >= size.x ||
      y >= size.y ||
      z >= size.z
    ) {
      warnings.skippedObjects++
      continue
    }
    result.push({ pos: { x, y, z }, id: getString(item, 'id') ?? '', nbt: detachNbt(item) })
  }
  return result
}

/** Entities store `Pos` (three doubles) relative to the schematic. */
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
    result.push({ pos: { x, y, z }, id: getString(item, 'id') ?? '', nbt: detachNbt(item) })
  }
  return result
}

function invalid(message: string): StructureReadError {
  return new StructureReadError('invalid-structure', message)
}
