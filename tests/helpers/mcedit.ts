/**
 * Test-only builder for MCEdit / Schematica `.schematic` files.
 */
import { NbtType } from '../../src/lib/types/nbt'
import { byteArray, compound, double, int, list, short, str, type Tag } from './nbt'

export interface McEditSpec {
  size: [number, number, number]
  /** Full numeric id per block (may exceed 255), y·W·L + z·W + x order. */
  ids: ArrayLike<number>
  /** Metadata per block (0–15). Defaults to 0. */
  metas?: ArrayLike<number>
  /** How ids above 255 are stored. */
  highBits?: 'AddBlocks' | 'Add'
  materials?: string
  tileEntities?: { pos: [number, number, number]; id: string; extra?: Record<string, Tag> }[]
  entities?: { pos: [number, number, number]; id: string }[]
}

export function mceditRoot(spec: McEditSpec): Record<string, Tag> {
  const [w, h, l] = spec.size
  const volume = w * h * l
  const low = new Uint8Array(volume)
  const data = new Uint8Array(volume)
  const add = new Uint8Array(volume)
  const addBlocks = new Uint8Array((volume + 1) >> 1)
  let needsHigh = false

  for (let i = 0; i < volume; i++) {
    const id = spec.ids[i]
    low[i] = id & 0xff
    data[i] = spec.metas?.[i] ?? 0
    const high = (id >> 8) & 0x0f
    if (high) needsHigh = true
    add[i] = high
    // Even indices in the low nibble, odd indices in the high nibble.
    addBlocks[i >> 1] |= (i & 1) === 0 ? high : high << 4
  }

  const highBits: Record<string, Tag> = !needsHigh
    ? {}
    : spec.highBits === 'Add'
      ? { Add: byteArray(add) }
      : { AddBlocks: byteArray(addBlocks) }

  const tileEntities = (spec.tileEntities ?? []).map(({ pos, id, extra = {} }) =>
    compound({ id: str(id), x: int(pos[0]), y: int(pos[1]), z: int(pos[2]), ...extra }),
  )
  const entities = (spec.entities ?? []).map(({ pos, id }) =>
    compound({ id: str(id), Pos: list(NbtType.Double, pos.map(double)) }),
  )
  const listOf = (items: Tag[]) => list(items.length ? NbtType.Compound : NbtType.End, items)

  return {
    Width: short(w),
    Height: short(h),
    Length: short(l),
    Materials: str(spec.materials ?? 'Alpha'),
    Blocks: byteArray(low),
    Data: byteArray(data),
    ...highBits,
    TileEntities: listOf(tileEntities),
    Entities: listOf(entities),
  }
}
