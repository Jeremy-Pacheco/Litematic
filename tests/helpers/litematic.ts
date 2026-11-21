/**
 * Test-only builder for `.litematic` files. The packing is a direct port of
 * `LitematicaBitArray.setAt` from Litematica's Java source, using BigInt, so
 * it is independent from the 32-bit decoder under test.
 */
import { NbtType } from '../../src/lib/types/nbt'
import { compound, double, int, list, long, longArray, str, type Tag } from './nbt'

const MASK64 = (1n << 64n) - 1n

/** Port of LitematicaBitArray(bits, size) + setAt for every value. */
export function packLitematica(values: ArrayLike<number>, bits: number): bigint[] {
  const longs = new Array<bigint>(Math.ceil((values.length * bits) / 64)).fill(0n)
  const maxEntry = (1n << BigInt(bits)) - 1n
  for (let index = 0; index < values.length; index++) {
    const value = BigInt(values[index]) & maxEntry
    const startOffset = BigInt(index) * BigInt(bits)
    const startArr = Number(startOffset >> 6n)
    const endArr = Number(((BigInt(index) + 1n) * BigInt(bits) - 1n) >> 6n)
    const startBit = startOffset & 0x3fn
    longs[startArr] = ((longs[startArr] & ~(maxEntry << startBit)) | (value << startBit)) & MASK64
    if (startArr !== endArr) {
      const endOffset = 64n - startBit
      const j1 = BigInt(bits) - endOffset
      longs[endArr] = (((longs[endArr] >> j1) << j1) | (value >> endOffset)) & MASK64
    }
  }
  // NBT stores signed longs.
  return longs.map((v) => BigInt.asIntN(64, v))
}

export interface RegionSpec {
  position: [number, number, number]
  size: [number, number, number]
  /** Palette entries: `name` or `[name, {prop: value}]`. Index 0 should be air. */
  palette: (string | [string, Record<string, string>])[]
  /** Palette index per block, in Y-Z-X order of the absolute size. */
  blocks: ArrayLike<number>
  tileEntities?: Tag[]
  entities?: Tag[]
  /** Override the computed bits (to build corrupt files). */
  bits?: number
  /** Drop longs from the end (to build corrupt files). */
  truncateLongs?: number
}

export function region(spec: RegionSpec): Tag {
  const bits = spec.bits ?? Math.max(2, 32 - Math.clz32(spec.palette.length - 1))
  const packed = packLitematica(spec.blocks, bits)
  const longs = spec.truncateLongs ? packed.slice(0, packed.length - spec.truncateLongs) : packed
  const xyz = ([x, y, z]: [number, number, number]) => compound({ x: int(x), y: int(y), z: int(z) })
  return compound({
    Position: xyz(spec.position),
    Size: xyz(spec.size),
    BlockStatePalette: list(
      NbtType.Compound,
      spec.palette.map((entry) => {
        const [name, props] = typeof entry === 'string' ? [entry, null] : entry
        return compound({
          Name: str(name),
          ...(props
            ? {
                Properties: compound(
                  Object.fromEntries(Object.entries(props).map(([k, v]) => [k, str(v)])),
                ),
              }
            : {}),
        })
      }),
    ),
    BlockStates: longArray(longs),
    TileEntities: list(
      spec.tileEntities?.length ? NbtType.Compound : NbtType.End,
      spec.tileEntities ?? [],
    ),
    Entities: list(spec.entities?.length ? NbtType.Compound : NbtType.End, spec.entities ?? []),
    PendingBlockTicks: list(NbtType.End, []),
  })
}

export function litematicRoot(
  regions: Record<string, Tag>,
  options: { version?: number; dataVersion?: number; metadata?: Record<string, Tag> } = {},
): Record<string, Tag> {
  return {
    MinecraftDataVersion: int(options.dataVersion ?? 4325),
    Version: int(options.version ?? 7),
    SubVersion: int(1),
    Metadata: compound({
      Name: str('Test'),
      Author: str('tester'),
      Description: str(''),
      TimeCreated: long(1_700_000_000_000n),
      TimeModified: long(1_700_000_100_000n),
      EnclosingSize: compound({ x: int(0), y: int(0), z: int(0) }),
      ...options.metadata,
    }),
    Regions: compound(regions),
  }
}

export function entity(id: string, pos: [number, number, number]): Tag {
  return compound({ id: str(id), Pos: list(NbtType.Double, pos.map(double)) })
}

export function tileEntity(
  id: string,
  pos: [number, number, number],
  extra: Record<string, Tag> = {},
): Tag {
  return compound({ id: str(id), x: int(pos[0]), y: int(pos[1]), z: int(pos[2]), ...extra })
}
