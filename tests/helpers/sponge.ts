/**
 * Test-only builder for Sponge schematics (`.schem`) v1, v2 and v3.
 */
import { NbtType } from '../../src/lib/types/nbt'
import { byteArray, compound, int, intArray, list, short, type Tag } from './nbt'

/** Encodes unsigned varints (7 bits per byte, low group first). */
export function encodeVarints(values: ArrayLike<number>): Uint8Array {
  const out: number[] = []
  for (let i = 0; i < values.length; i++) {
    let v = values[i] >>> 0
    while (v >= 0x80) {
      out.push((v & 0x7f) | 0x80)
      v >>>= 7
    }
    out.push(v)
  }
  return new Uint8Array(out)
}

export interface SpongeSpec {
  version: 1 | 2 | 3
  size: [number, number, number]
  /** Block state text → local index. */
  palette: Record<string, number>
  /** Local index per block, in x + z·W + y·W·L order. */
  blocks: ArrayLike<number>
  dataVersion?: number
  blockEntities?: { pos: [number, number, number]; id: string; data?: Record<string, Tag> }[]
  entities?: { pos: [number, number, number]; id: string; data?: Record<string, Tag> }[]
  metadata?: Record<string, Tag>
  /** Raw bytes to use instead of encoding `blocks` (for corrupt data). */
  rawData?: Uint8Array
}

export function spongeRoot(spec: SpongeSpec): Record<string, Tag> {
  const [w, h, l] = spec.size
  const data = byteArray(spec.rawData ?? encodeVarints(spec.blocks))
  const palette = compound(
    Object.fromEntries(Object.entries(spec.palette).map(([k, v]) => [k, int(v)])),
  )
  const v3 = spec.version === 3

  const blockEntities = (spec.blockEntities ?? []).map(({ pos, id, data: extra = {} }) =>
    v3
      ? compound({ Pos: intArray(pos), Id: { t: 'string', v: id }, Data: compound(extra) })
      : compound({ Pos: intArray(pos), Id: { t: 'string', v: id }, ...extra }),
  )
  const entities = (spec.entities ?? []).map(({ pos, id, data: extra = {} }) => {
    const posTag = list(
      NbtType.Double,
      pos.map((v) => ({ t: 'double', v }) as Tag),
    )
    return v3
      ? compound({ Pos: posTag, Id: { t: 'string', v: id }, Data: compound(extra) })
      : compound({ Pos: posTag, Id: { t: 'string', v: id }, ...extra })
  })
  const listOf = (items: Tag[]) => list(items.length ? NbtType.Compound : NbtType.End, items)

  const fields: Record<string, Tag> = {
    Version: int(spec.version),
    Width: short(w),
    Height: short(h),
    Length: short(l),
    Offset: intArray([0, 0, 0]),
    ...(spec.dataVersion !== undefined ? { DataVersion: int(spec.dataVersion) } : {}),
    ...(spec.metadata ? { Metadata: compound(spec.metadata) } : {}),
  }

  if (v3) {
    return {
      Schematic: compound({
        ...fields,
        Blocks: compound({ Palette: palette, Data: data, BlockEntities: listOf(blockEntities) }),
        Entities: listOf(entities),
      }),
    }
  }
  return {
    ...fields,
    PaletteMax: int(Object.keys(spec.palette).length),
    Palette: palette,
    BlockData: data,
    [spec.version === 1 ? 'TileEntities' : 'BlockEntities']: listOf(blockEntities),
    ...(spec.version === 2 ? { Entities: listOf(entities) } : {}),
  }
}
