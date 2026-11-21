import type { StructureFormat } from '../constants/formats'
import type { NbtCompound } from '../types/nbt'
import { getByteArray, getCompound, getInteger, getString } from './nbt/access'

export interface Dimensions {
  x: number
  y: number
  z: number
}

/** What can be known about a structure file from its NBT, before parsing blocks. */
export interface DetectedFormat {
  format: StructureFormat
  /** Version of the file format itself (Litematica `Version`, Sponge `Version`). */
  formatVersion: number | null
  /** Minecraft data version the file was saved with, if recorded. */
  dataVersion: number | null
  /** Size of the bounding box in blocks, if recorded. */
  dimensions: Dimensions | null
}

/**
 * Identifies the structure format from the content of the NBT root.
 * Returns `null` when the data matches none of the supported formats.
 *
 * - Litematica: `Version`, `Metadata` and `Regions` at the root.
 * - Sponge Schematic v3: everything inside a `Schematic` compound, `Version` 3.
 * - Sponge Schematic v1/v2: `Version`, `Palette` and `BlockData` at the root.
 * - MCEdit / Schematica: `Blocks` and `Data` byte arrays with `Materials`.
 */
export function detectFormat(root: NbtCompound): DetectedFormat | null {
  return detectLitematic(root) ?? detectSponge(root) ?? detectMcEdit(root)
}

function detectLitematic(root: NbtCompound): DetectedFormat | null {
  const metadata = getCompound(root, 'Metadata')
  const regions = getCompound(root, 'Regions')
  const version = getInteger(root, 'Version')
  if (!metadata || !regions || version === undefined) return null

  const size = getCompound(metadata, 'EnclosingSize')
  return {
    format: 'litematic',
    formatVersion: version,
    dataVersion: getInteger(root, 'MinecraftDataVersion') ?? null,
    dimensions: size ? readXyz(size, 'x', 'y', 'z', true) : null,
  }
}

function detectSponge(root: NbtCompound): DetectedFormat | null {
  // v3 wraps the content in a "Schematic" compound; v1/v2 store it at the root.
  const body = getCompound(root, 'Schematic') ?? root
  const version = getInteger(body, 'Version')
  if (version === undefined) return null

  const hasV3Blocks = getCompound(body, 'Blocks') !== undefined
  const hasV1V2Blocks =
    getCompound(body, 'Palette') !== undefined && getByteArray(body, 'BlockData') !== undefined
  if (version === 3 ? !hasV3Blocks : !hasV1V2Blocks) return null

  return {
    format: 'schem',
    formatVersion: version,
    dataVersion: getInteger(body, 'DataVersion') ?? null,
    dimensions: readXyz(body, 'Width', 'Height', 'Length', false),
  }
}

function detectMcEdit(root: NbtCompound): DetectedFormat | null {
  if (!getByteArray(root, 'Blocks') || !getByteArray(root, 'Data')) return null
  if (getString(root, 'Materials') === undefined) return null
  return {
    format: 'schematic',
    formatVersion: null,
    dataVersion: null,
    dimensions: readXyz(root, 'Width', 'Height', 'Length', false),
  }
}

/**
 * Reads three size fields. Sponge and MCEdit store them as *unsigned* shorts;
 * Litematica stores signed ints and may use negative sizes for regions.
 */
function readXyz(
  compound: NbtCompound,
  xKey: string,
  yKey: string,
  zKey: string,
  signed: boolean,
): Dimensions | null {
  const values = [xKey, yKey, zKey].map((key) => getInteger(compound, key))
  if (values.some((v) => v === undefined)) return null
  const [x, y, z] = values.map((v) => (signed ? Math.abs(v as number) : (v as number) & 0xffff))
  return { x, y, z }
}
