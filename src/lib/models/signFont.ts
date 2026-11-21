/**
 * The game's bitmap font, read from the game files (`assets/<ns>/font/*.json`
 * and `textures/font/*.png`) to draw sign text as in Minecraft. Built in the
 * models worker, which has the files; the result travels to the viewer with
 * the baked models.
 *
 * Supported providers: `bitmap` (glyph sheets), `space` (advances) and
 * `reference` (includes). `unihex` (GNU Unifont, not inside the jar) and
 * `ttf` are skipped: characters without a glyph are drawn with a system font.
 */

/** RGBA pixels of a glyph sheet. */
export interface FontSheet {
  width: number
  height: number
  pixels: Uint8ClampedArray
}

/** One character: where it is in its sheet and how it is laid out, in font pixels. */
export interface Glyph {
  /** Index in `SignFont.sheets`, or -1 for a glyph that draws nothing (space). */
  sheet: number
  /** Source cell in the sheet, in sheet pixels. */
  x: number
  y: number
  width: number
  height: number
  /** Font pixels per sheet pixel (a provider's `height` / cell height). */
  scale: number
  /** Font pixels from the top of the glyph to the baseline. */
  ascent: number
  /** Horizontal advance in font pixels. */
  advance: number
}

export interface SignFont {
  sheets: FontSheet[]
  /** Glyphs by code point. */
  glyphs: Map<number, Glyph>
}

/** Decodes a PNG into RGBA pixels (`createImageBitmap` in the worker; injectable for tests). */
export type DecodePng = (bytes: Uint8Array) => Promise<FontSheet>

interface BitmapProvider {
  type: 'bitmap'
  file: string
  ascent: number
  height: number
  chars: string[]
}

interface SpaceProvider {
  type: 'space'
  advances: Record<string, number>
}

type Provider = BitmapProvider | SpaceProvider

/** Font options of the default font (filters keep providers meant for them). */
const OPTIONS: Readonly<Record<string, boolean>> = { uniform: false, jp: false }
/** Deepest chain of `reference` providers followed. */
const MAX_DEPTH = 8
/** Largest glyph sheet accepted (side, in pixels). */
const MAX_SHEET_SIDE = 4096

function fontPath(id: string): string {
  const [namespace, path] = id.includes(':') ? id.split(':', 2) : ['minecraft', id]
  return `assets/${namespace}/font/${path}.json`
}

function texturePath(id: string): string {
  const [namespace, path] = id.includes(':') ? id.split(':', 2) : ['minecraft', id]
  return `assets/${namespace}/textures/${path}`
}

/**
 * The bitmap and space providers of a font, in lookup order (the first one
 * that has a character wins), following references.
 */
export function fontProviders(
  readJson: (path: string) => unknown,
  id = 'minecraft:default',
  depth = 0,
  seen = new Set<string>(),
): Provider[] {
  if (depth > MAX_DEPTH || seen.has(id)) return []
  seen.add(id)
  const json = readJson(fontPath(id)) as { providers?: unknown } | null
  if (!json || !Array.isArray(json.providers)) return []
  const out: Provider[] = []
  for (const raw of json.providers as Record<string, unknown>[]) {
    if (!raw || typeof raw !== 'object' || !passesFilter(raw.filter)) continue
    if (raw.type === 'reference' && typeof raw.id === 'string') {
      out.push(...fontProviders(readJson, raw.id, depth + 1, seen))
    } else if (
      raw.type === 'bitmap' &&
      typeof raw.file === 'string' &&
      Array.isArray(raw.chars) &&
      raw.chars.every((row) => typeof row === 'string')
    ) {
      out.push({
        type: 'bitmap',
        file: raw.file,
        ascent: typeof raw.ascent === 'number' ? raw.ascent : 0,
        height: typeof raw.height === 'number' ? raw.height : 8,
        chars: raw.chars as string[],
      })
    } else if (raw.type === 'space' && raw.advances && typeof raw.advances === 'object') {
      out.push({ type: 'space', advances: raw.advances as Record<string, number> })
    }
  }
  return out
}

function passesFilter(filter: unknown): boolean {
  if (!filter || typeof filter !== 'object') return true
  return Object.entries(filter).every(([key, value]) => (OPTIONS[key] ?? false) === value)
}

/**
 * Builds the default font from the game files, or `null` when they have no
 * font (assets extracted before fonts were read).
 */
export async function buildSignFont(
  files: ReadonlyMap<string, Uint8Array>,
  decode: DecodePng,
): Promise<SignFont | null> {
  const decoder = new TextDecoder()
  const readJson = (path: string): unknown => {
    const bytes = files.get(path)
    if (!bytes) return null
    try {
      return JSON.parse(decoder.decode(bytes))
    } catch {
      return null
    }
  }
  const providers = fontProviders(readJson)
  if (providers.length === 0) return null

  const sheets: FontSheet[] = []
  const glyphs = new Map<number, Glyph>()
  const define = (code: number, glyph: Glyph) => {
    if (!glyphs.has(code)) glyphs.set(code, glyph)
  }
  for (const provider of providers) {
    if (provider.type === 'space') {
      for (const [char, advance] of Object.entries(provider.advances)) {
        const code = char.codePointAt(0)
        if (code === undefined || typeof advance !== 'number') continue
        define(code, { sheet: -1, x: 0, y: 0, width: 0, height: 0, scale: 1, ascent: 0, advance })
      }
      continue
    }
    const bytes = files.get(texturePath(provider.file))
    if (!bytes) continue
    let sheet: FontSheet
    try {
      sheet = await decode(bytes)
    } catch {
      continue
    }
    if (sheet.width > MAX_SHEET_SIDE || sheet.height > MAX_SHEET_SIDE) continue
    const rows = provider.chars.map((row) => Array.from(row))
    const columns = rows[0]?.length ?? 0
    if (columns === 0) continue
    const cellW = Math.floor(sheet.width / columns)
    const cellH = Math.floor(sheet.height / rows.length)
    if (cellW === 0 || cellH === 0) continue
    const index = sheets.push(sheet) - 1
    const scale = provider.height / cellH
    rows.forEach((row, r) => {
      row.forEach((char, c) => {
        const code = char.codePointAt(0)!
        // Empty cells and the space (an empty cell too) are not glyphs.
        if (code === 0 || code === 0x20 || glyphs.has(code)) return
        const x = c * cellW
        const y = r * cellH
        const width = glyphWidth(sheet, x, y, cellW, cellH)
        define(code, {
          sheet: index,
          x,
          y,
          width,
          height: cellH,
          scale,
          ascent: provider.ascent,
          // As the game: the drawn width rounded, plus one pixel of spacing.
          advance: Math.floor(0.5 + width * scale) + 1,
        })
      })
    })
  }
  if (glyphs.size === 0) return null
  // The space comes from a `space` provider; old fonts left it to the game.
  if (!glyphs.has(0x20)) {
    glyphs.set(0x20, {
      sheet: -1,
      x: 0,
      y: 0,
      width: 0,
      height: 0,
      scale: 1,
      ascent: 0,
      advance: 4,
    })
  }
  return { sheets, glyphs }
}

/** PNG → RGBA pixels with `createImageBitmap` and an `OffscreenCanvas` (worker or page). */
export async function decodePngWithCanvas(bytes: Uint8Array): Promise<FontSheet> {
  const bitmap = await createImageBitmap(new Blob([bytes as BlobPart], { type: 'image/png' }))
  try {
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('2D canvas is not available')
    ctx.drawImage(bitmap, 0, 0)
    const { data } = ctx.getImageData(0, 0, bitmap.width, bitmap.height)
    return { width: bitmap.width, height: bitmap.height, pixels: data }
  } finally {
    bitmap.close()
  }
}

/** Columns up to the last one with a visible pixel (the game's glyph width). */
function glyphWidth(sheet: FontSheet, x0: number, y0: number, w: number, h: number): number {
  for (let x = w - 1; x >= 0; x--) {
    for (let y = 0; y < h; y++) {
      if (sheet.pixels[((y0 + y) * sheet.width + x0 + x) * 4 + 3] > 0) return x + 1
    }
  }
  return 0
}

/** Glyphs of a line with their x position, in font pixels. */
export interface LineLayout {
  glyphs: { glyph: Glyph; x: number }[]
  width: number
}

/**
 * Lays out one line of text, or `null` when the font lacks a character (the
 * line is then drawn with a system font, not with gaps).
 */
export function layoutLine(text: string, font: SignFont): LineLayout | null {
  const glyphs: LineLayout['glyphs'] = []
  let x = 0
  for (const char of text) {
    const glyph = font.glyphs.get(char.codePointAt(0)!)
    if (!glyph) return null
    glyphs.push({ glyph, x })
    x += glyph.advance
  }
  return { glyphs, width: x }
}

/** Buffers to transfer (not copy) with the font. */
export function fontTransferables(font: SignFont | null): ArrayBuffer[] {
  return font ? font.sheets.map((s) => s.pixels.buffer as ArrayBuffer) : []
}
