import { beforeAll, describe, expect, it } from 'vitest'
import { readClientJar } from '../../src/lib/assets/minecraftJar'
import {
  buildSignFont,
  fontProviders,
  layoutLine,
  type FontSheet,
  type SignFont,
} from '../../src/lib/models/signFont'
import { decodePng } from '../helpers/png'

const encoder = new TextEncoder()
const json = (value: unknown) => encoder.encode(JSON.stringify(value))

/**
 * A 2 × 1 cell sheet of 4 × 4 px cells: the first glyph is 2 px wide, the
 * second 3 px wide (alpha set in those columns).
 */
function sheet(): FontSheet {
  const width = 8
  const height = 4
  const pixels = new Uint8ClampedArray(width * height * 4)
  const fill = (x: number) => {
    for (let y = 0; y < height; y++) pixels[(y * width + x) * 4 + 3] = 255
  }
  fill(1) // glyph 0: columns 0–1 (last visible column 1)
  fill(6) // glyph 1: columns 4–6 (last visible column 2 of its cell)
  return { width, height, pixels }
}
const fakeDecode = async () => sheet()

function files(entries: Record<string, unknown>): Map<string, Uint8Array> {
  return new Map(
    Object.entries(entries).map(([path, value]) => [
      path,
      value instanceof Uint8Array ? value : json(value),
    ]),
  )
}

describe('fontProviders', () => {
  it('follows references, keeps order and skips providers for other options', () => {
    const read = (path: string) =>
      ({
        'assets/minecraft/font/default.json': {
          providers: [
            { type: 'reference', id: 'minecraft:include/space' },
            { type: 'reference', id: 'minecraft:include/default', filter: { uniform: false } },
            { type: 'reference', id: 'minecraft:include/uniform', filter: { uniform: true } },
            { type: 'unihex', hex_file: 'x.zip' },
          ],
        },
        'assets/minecraft/font/include/space.json': {
          providers: [{ type: 'space', advances: { ' ': 4 } }],
        },
        'assets/minecraft/font/include/default.json': {
          providers: [
            { type: 'bitmap', file: 'minecraft:font/ascii.png', ascent: 7, chars: ['ab'] },
            // A cycle back to the start is ignored.
            { type: 'reference', id: 'minecraft:default' },
          ],
        },
        'assets/minecraft/font/include/uniform.json': {
          providers: [{ type: 'bitmap', file: 'minecraft:font/other.png', chars: ['c'] }],
        },
      })[path] ?? null
    expect(fontProviders(read).map((p) => p.type)).toEqual(['space', 'bitmap'])
    const bitmap = fontProviders(read)[1]
    expect(bitmap).toMatchObject({ file: 'minecraft:font/ascii.png', ascent: 7, height: 8 })
  })

  it('is empty without a font file', () => {
    expect(fontProviders(() => null)).toEqual([])
  })
})

describe('buildSignFont', () => {
  const base = {
    'assets/minecraft/font/default.json': {
      providers: [
        { type: 'space', advances: { ' ': 4 } },
        { type: 'bitmap', file: 'minecraft:font/ascii.png', ascent: 7, chars: ['ab'] },
        // A later provider never replaces a glyph defined before.
        { type: 'bitmap', file: 'minecraft:font/ascii.png', ascent: 3, chars: ['ac'] },
      ],
    },
    'assets/minecraft/textures/font/ascii.png': new Uint8Array([1]),
  }

  it('measures glyphs like the game: last visible column, plus one pixel', async () => {
    const font = (await buildSignFont(files(base), fakeDecode))!
    const a = font.glyphs.get('a'.codePointAt(0)!)!
    expect(a).toMatchObject({ sheet: 0, x: 0, width: 2, scale: 2, ascent: 7, advance: 5 })
    // Cells are 4 px tall and the provider is 8 high: scale 2, advance round(3 × 2) + 1.
    expect(font.glyphs.get('b'.codePointAt(0)!)!.advance).toBe(7)
    expect(font.glyphs.get('c'.codePointAt(0)!)!.ascent).toBe(3)
    expect(font.glyphs.get(0x20)!.advance).toBe(4)
  })

  it('lays out lines, and gives up on characters the font lacks', async () => {
    const font = (await buildSignFont(files(base), fakeDecode))!
    const line = layoutLine('ab a', font)!
    expect(line.glyphs.map((g) => g.x)).toEqual([0, 5, 12, 16])
    expect(line.width).toBe(21)
    expect(layoutLine('aé', font)).toBeNull()
  })

  it('is null without a font, and skips sheets that fail to decode', async () => {
    expect(await buildSignFont(new Map(), fakeDecode)).toBeNull()
    const broken = async () => {
      throw new Error('bad png')
    }
    expect(await buildSignFont(files(base), broken)).toMatchObject({ sheets: [] })
  })
})

interface NodeFs {
  existsSync(path: string): boolean
  readFileSync(path: string): Uint8Array
}
const fs = (
  globalThis as unknown as { process: { getBuiltinModule(id: string): unknown } }
).process.getBuiltinModule('node:fs') as NodeFs
const JAR = 'tests/fixtures/local/client-26.3.jar'

describe.skipIf(!fs.existsSync(JAR))('the font of client.jar 26.3', () => {
  // Read in beforeAll: a skipped suite still runs its body to collect tests.
  let font!: SignFont
  beforeAll(async () => {
    const { files } = readClientJar(new Uint8Array(fs.readFileSync(JAR)))
    font = (await buildSignFont(files, decodePng))!
  })
  const advance = (char: string) => font.glyphs.get(char.codePointAt(0)!)?.advance

  it('is extracted from the jar and has the game widths', () => {
    expect(font.sheets.length).toBeGreaterThanOrEqual(3)
    expect(advance(' ')).toBe(4)
    expect(advance('i')).toBe(2)
    expect(advance('l')).toBe(3)
    expect(advance('!')).toBe(2)
    expect(advance('A')).toBe(6)
    expect(advance('W')).toBe(6)
  })

  it('covers Spanish, Greek and Cyrillic, not CJK (Unifont is not in the jar)', () => {
    expect(layoutLine('¡Señal añadida! ¿Qué?', font)).not.toBeNull()
    expect(layoutLine('Ωμέγα Жук', font)).not.toBeNull()
    expect(layoutLine('中文', font)).toBeNull()
  })

  it('fits "Hola" within the 90 px of a sign line', () => {
    expect(layoutLine('Hola', font)!.width).toBeLessThan(90)
  })
})
