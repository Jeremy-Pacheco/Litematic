import { describe, expect, it } from 'vitest'
import { detectFormat } from '../../src/lib/parsers/detectFormat'
import { readNbt } from '../../src/lib/parsers/nbt/NbtReader'
import { NbtType } from '../../src/lib/types/nbt'
import {
  byteArray,
  compound,
  encodeNbt,
  int,
  intArray,
  list,
  longArray,
  short,
  str,
  type Tag,
} from '../helpers/nbt'

const detect = (root: Record<string, Tag>) => detectFormat(readNbt(encodeNbt(root)).root)

describe('detectFormat', () => {
  it('detects Litematica, using absolute enclosing size', () => {
    const result = detect({
      Version: int(6),
      MinecraftDataVersion: int(3953),
      Metadata: compound({
        Name: str('House'),
        EnclosingSize: compound({ x: int(48), y: int(-32), z: int(61) }),
      }),
      Regions: compound({ main: compound({ BlockStates: longArray([0n]) }) }),
    })
    expect(result).toEqual({
      format: 'litematic',
      formatVersion: 6,
      dataVersion: 3953,
      dimensions: { x: 48, y: 32, z: 61 },
    })
  })

  it('detects Sponge v3 inside the Schematic compound', () => {
    const result = detect({
      Schematic: compound({
        Version: int(3),
        DataVersion: int(3700),
        Width: short(10),
        Height: short(20),
        Length: short(30),
        Blocks: compound({ Palette: compound({}), Data: byteArray(new Int8Array(0)) }),
      }),
    })
    expect(result).toEqual({
      format: 'schem',
      formatVersion: 3,
      dataVersion: 3700,
      dimensions: { x: 10, y: 20, z: 30 },
    })
  })

  it('detects Sponge v2 and reads sizes as unsigned shorts', () => {
    const result = detect({
      Version: int(2),
      DataVersion: int(2586),
      Width: short(-1), // 65535 when read as unsigned
      Height: short(256),
      Length: short(-32768), // 32768
      Palette: compound({ 'minecraft:air': int(0) }),
      BlockData: byteArray(new Int8Array(0)),
    })
    expect(result?.format).toBe('schem')
    expect(result?.formatVersion).toBe(2)
    expect(result?.dimensions).toEqual({ x: 65535, y: 256, z: 32768 })
  })

  it('detects Sponge v1, which has no DataVersion', () => {
    const result = detect({
      Version: int(1),
      Width: short(1),
      Height: short(1),
      Length: short(1),
      Palette: compound({}),
      BlockData: byteArray(new Int8Array(1)),
    })
    expect(result).toMatchObject({ format: 'schem', formatVersion: 1, dataVersion: null })
  })

  it('detects MCEdit / Schematica', () => {
    const result = detect({
      Width: short(4),
      Height: short(5),
      Length: short(6),
      Materials: str('Alpha'),
      Blocks: byteArray(new Int8Array(120)),
      Data: byteArray(new Int8Array(120)),
      TileEntities: list(NbtType.End, []),
    })
    expect(result).toEqual({
      format: 'schematic',
      formatVersion: null,
      dataVersion: null,
      dimensions: { x: 4, y: 5, z: 6 },
    })
  })

  it('returns null for other NBT files', () => {
    expect(detect({})).toBeNull()
    // A vanilla structure (.nbt) is valid NBT but not a supported format.
    expect(
      detect({ size: list(NbtType.Int, [int(1), int(1), int(1)]), palette: list(NbtType.End, []) }),
    ).toBeNull()
    // Sponge v3 marker without its Blocks container.
    expect(detect({ Schematic: compound({ Version: int(3) }) })).toBeNull()
  })

  it('does not trust a field of the wrong type', () => {
    expect(detect({ Version: str('6'), Metadata: compound({}), Regions: compound({}) })).toBeNull()
    expect(
      detect({ Blocks: intArray([1]), Data: byteArray(new Int8Array(1)), Materials: str('Alpha') }),
    ).toBeNull()
  })
})
