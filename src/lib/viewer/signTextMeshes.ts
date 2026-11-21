import {
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  FrontSide,
  LinearFilter,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  NearestFilter,
  SRGBColorSpace,
  Vector3,
  type Plane,
} from 'three'
import { layoutLine, type SignFont } from '../models/signFont'
import { blockIndex, type Structure, type Vec3 } from '../types/structure'
import {
  SIGN_TEXT,
  signOutlineColor,
  signPlacement,
  signTextColor,
  signTextOf,
  type SignPlacement,
  type SignSide,
} from './signText'

/**
 * Draws the text of signs: each side with text becomes a tile of a canvas
 * page (128 tiles of 256 × 128 px per 2048 px page) and a quad just in front
 * of the board, placed with the same transform as the board that was drawn.
 * One mesh and one texture per page, so hundreds of signs cost a few draw
 * calls. The materials share the layer clipping planes.
 *
 * With the game's font (`SignFont`) the text is drawn pixel by pixel at the
 * game's text scale; without it, or for a line with characters the font
 * lacks, with a system font.
 */

const TILE_W = 256
const TILE_H = 128
const PAGE = 2048
const TILES_PER_PAGE = (PAGE / TILE_W) * (PAGE / TILE_H)
/** Sides drawn at most (4 pages, 64 MB of textures). */
export const MAX_SIGN_SIDES = TILES_PER_PAGE * 4
/** Text sits this far (1/16 block units) in front of the board. */
const LIFT = 0.05

export interface SignTextResult {
  meshes: Mesh[]
  /** Sides with text that were drawn / left out by the limit. */
  drawn: number
  skipped: number
}

/** How a side's text maps onto its tile. */
interface TileLayout {
  /** Canvas pixels per font pixel, across and down (they differ when the board is not 2 : 1). */
  kx: number
  ky: number
  lineHeight: number
  maxWidth: number
}

interface Face {
  side: SignSide
  corners: [number, number, number][]
  layout: TileLayout
}

/** Font pixels from the top of a line to the baseline (the default font's ascent). */
const BASELINE = 7
/** Room above and below a line in the scratch canvas, for accents and descenders. */
const LINE_MARGIN = 4

/**
 * `specialModels[i]`: palette state `i` was drawn by Deepslate's special
 * renderers (see `BakedState.specialModel`), which places sign boards
 * differently from the game's models. `font`: the game's font, if loaded.
 */
export function buildSignTextMeshes(
  structure: Pick<Structure, 'size' | 'palette' | 'blocks' | 'blockEntities'>,
  clippingPlanes: Plane[],
  specialModels: readonly boolean[] = [],
  font: SignFont | null = null,
): SignTextResult {
  const faces: Face[] = []
  for (const entity of structure.blockEntities) {
    const text = signTextOf(entity.id, entity.nbt)
    if (!text) continue
    const { x, y, z } = entity.pos
    const { size } = structure
    if (x < 0 || y < 0 || z < 0 || x >= size.x || y >= size.y || z >= size.z) continue
    const stateIndex = structure.blocks[blockIndex(size, x, y, z)]
    const state = structure.palette[stateIndex]
    const placement = state ? signPlacement(state, specialModels[stateIndex] ?? false) : null
    if (!placement) continue
    const layout = tileLayout(placement)
    for (const [side, back] of [
      [text.front, false],
      [text.back, true],
    ] as const) {
      if (side) faces.push({ side, corners: signTextCorners(entity.pos, placement, back), layout })
    }
  }

  const drawn = Math.min(faces.length, MAX_SIGN_SIDES)
  const meshes: Mesh[] = []
  const glyphs = drawn > 0 && font ? new GlyphPainter(font) : null
  for (let start = 0; start < drawn; start += TILES_PER_PAGE) {
    const page = faces.slice(start, Math.min(drawn, start + TILES_PER_PAGE))
    meshes.push(pageMesh(page, clippingPlanes, glyphs))
  }
  return { meshes, drawn, skipped: faces.length - drawn }
}

/** The tile covers the whole board: font pixels follow from the game's text scale. */
export function tileLayout({ kind, board }: SignPlacement): TileLayout {
  const { pxPerBlock, lineHeight, maxWidth } = SIGN_TEXT[kind]
  const widthBlocks = ((board.x1 - board.x0) * board.scale) / 16
  const heightBlocks = ((board.y1 - board.y0) * board.scale) / 16
  return {
    kx: TILE_W / (widthBlocks * pxPerBlock),
    ky: TILE_H / (heightBlocks * pxPerBlock),
    lineHeight,
    maxWidth,
  }
}

/**
 * Corners of the text quad of one side of a sign, in world space: just in
 * front of that face of the board, ordered top-left, top-right,
 * bottom-right, bottom-left as seen by someone reading that side.
 */
export function signTextCorners(
  pos: Vec3,
  { board, angle }: SignPlacement,
  back: boolean,
): [number, number, number][] {
  const matrix = new Matrix4()
    .makeTranslation(pos.x, pos.y, pos.z)
    .multiply(new Matrix4().makeScale(1 / 16, 1 / 16, 1 / 16))
    .multiply(new Matrix4().makeTranslation(8, 8, 8))
    .multiply(new Matrix4().makeRotationY(angle))
    .multiply(new Matrix4().makeScale(board.scale, board.scale, board.scale))
    .multiply(new Matrix4().makeTranslation(-8, -8, -8))
  const faceZ = back ? board.back : board.front
  const otherZ = back ? board.front : board.back
  // The face looks away from the other one; seen from there, +x is on the
  // left of a face looking towards −z and on the right of one towards +z.
  const outward = Math.sign(faceZ - otherZ)
  const z = faceZ + outward * LIFT
  const [left, right] = outward < 0 ? [board.x1, board.x0] : [board.x0, board.x1]
  const corner = new Vector3()
  return [
    [left, board.y1],
    [right, board.y1],
    [right, board.y0],
    [left, board.y0],
  ].map(([qx, qy]) => {
    corner.set(qx, qy, z).applyMatrix4(matrix)
    return [corner.x, corner.y, corner.z]
  })
}

function pageMesh(faces: Face[], clippingPlanes: Plane[], glyphs: GlyphPainter | null): Mesh {
  const canvas = document.createElement('canvas')
  canvas.width = PAGE
  canvas.height = PAGE
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('2D canvas is not available')

  const positions = new Float32Array(faces.length * 12)
  const uvs = new Float32Array(faces.length * 8)
  const indices = new Uint32Array(faces.length * 6)
  const columns = PAGE / TILE_W

  faces.forEach((face, i) => {
    const tx = (i % columns) * TILE_W
    const ty = Math.floor(i / columns) * TILE_H
    drawTile(ctx, face, tx, ty, glyphs)
    face.corners.forEach((corner, k) => positions.set(corner, (i * 4 + k) * 3))
    // v = 0 at the top of the canvas (the texture is not flipped).
    const u0 = tx / PAGE
    const u1 = (tx + TILE_W) / PAGE
    const v0 = ty / PAGE
    const v1 = (ty + TILE_H) / PAGE
    uvs.set([u0, v0, u1, v0, u1, v1, u0, v1], i * 8)
    const base = i * 4
    indices.set([base, base + 2, base + 1, base, base + 3, base + 2], i * 6)
  })

  const texture = new CanvasTexture(canvas)
  texture.flipY = false
  texture.colorSpace = SRGBColorSpace
  texture.minFilter = LinearFilter
  // Up close, the game's font keeps its square pixels.
  if (glyphs) texture.magFilter = NearestFilter
  texture.generateMipmaps = false

  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(positions, 3))
  geometry.setAttribute('uv', new BufferAttribute(uvs, 2))
  geometry.setIndex(new BufferAttribute(indices, 1))
  geometry.computeBoundingSphere()

  const material = new MeshBasicMaterial({
    map: texture,
    transparent: true,
    alphaTest: 0.05,
    side: FrontSide,
    clippingPlanes,
  })
  const mesh = new Mesh(geometry, material)
  mesh.renderOrder = 1.5
  mesh.matrixAutoUpdate = false
  mesh.userData.signText = true
  return mesh
}

/**
 * Four lines centred on the tile, at the game's line height; a line wider
 * than the game allows is shrunk horizontally.
 */
function drawTile(
  ctx: CanvasRenderingContext2D,
  { side, layout }: Face,
  x: number,
  y: number,
  glyphs: GlyphPainter | null,
): void {
  const { ky, lineHeight } = layout
  const top = y + (TILE_H - 4 * lineHeight * ky) / 2
  side.lines.forEach((line, i) => {
    if (!line) return
    const lineTop = top + i * lineHeight * ky
    if (!glyphs?.draw(ctx, line, side, layout, x + TILE_W / 2, lineTop)) {
      drawSystemLine(ctx, line, side, layout, x + TILE_W / 2, lineTop)
    }
  })
}

/** A line in a system font, for when the game's font is missing or lacks a character. */
function drawSystemLine(
  ctx: CanvasRenderingContext2D,
  line: string,
  side: SignSide,
  { kx, ky, lineHeight, maxWidth }: TileLayout,
  centerX: number,
  lineTop: number,
): void {
  ctx.save()
  // Letters about as tall as the game's (8 of the 10 pixels of a line).
  ctx.font = `600 ${Math.round(lineHeight * 0.8 * ky)}px system-ui, sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  // Font pixels are kx × ky canvas pixels: scale x so letters keep their shape.
  const stretch = kx / ky
  const width = ctx.measureText(line).width * stretch
  const max = maxWidth * kx
  ctx.translate(centerX, lineTop + (lineHeight * ky) / 2)
  ctx.scale(width > max ? (stretch * max) / width : stretch, 1)
  if (side.glowing) {
    ctx.lineWidth = 2 * ky
    ctx.strokeStyle = signOutlineColor(side)
    ctx.strokeText(line, 0, 0)
  }
  ctx.fillStyle = signTextColor(side)
  ctx.fillText(line, 0, 0)
  ctx.restore()
}

/**
 * Draws lines with the game's bitmap font: the glyphs of a line are copied
 * at 1 font pixel each into a scratch canvas, tinted, and scaled onto the
 * tile without smoothing. Glowing text gets the game's outline (the line in
 * the darker color, one font pixel around it).
 */
class GlyphPainter {
  readonly #font: SignFont
  readonly #sheets: (HTMLCanvasElement | null)[]
  readonly #mask = document.createElement('canvas')
  readonly #tinted = document.createElement('canvas')

  constructor(font: SignFont) {
    this.#font = font
    this.#sheets = font.sheets.map((sheet) => {
      const canvas = document.createElement('canvas')
      canvas.width = sheet.width
      canvas.height = sheet.height
      const ctx = canvas.getContext('2d')
      if (!ctx) return null
      ctx.putImageData(new ImageData(new Uint8ClampedArray(sheet.pixels), sheet.width), 0, 0)
      return canvas
    })
  }

  /** Draws the line, or returns false when the font cannot (missing characters). */
  draw(
    ctx: CanvasRenderingContext2D,
    line: string,
    side: SignSide,
    { kx, ky, lineHeight, maxWidth }: TileLayout,
    centerX: number,
    lineTop: number,
  ): boolean {
    const layout = layoutLine(line, this.#font)
    if (!layout || layout.width === 0) return layout !== null
    const mask = this.#mask
    mask.width = layout.width + 2
    mask.height = lineHeight + 2 * LINE_MARGIN
    const m = mask.getContext('2d')
    if (!m) return false
    m.imageSmoothingEnabled = false
    for (const { glyph, x } of layout.glyphs) {
      const sheet = this.#sheets[glyph.sheet]
      if (!sheet || glyph.width === 0) continue
      m.drawImage(
        sheet,
        glyph.x,
        glyph.y,
        glyph.width,
        glyph.height,
        1 + x,
        LINE_MARGIN + BASELINE - glyph.ascent,
        glyph.width * glyph.scale,
        glyph.height * glyph.scale,
      )
    }
    // The game never draws a line wider than its limit: shrink it if needed.
    const fit = layout.width > maxWidth ? maxWidth / layout.width : 1
    const w = mask.width * kx * fit
    const h = mask.height * ky
    const left = centerX - w / 2
    const topY = lineTop - LINE_MARGIN * ky
    ctx.save()
    ctx.imageSmoothingEnabled = false
    if (side.glowing) {
      const outline = this.#tint(signOutlineColor(side))
      for (const [dx, dy] of OUTLINE_OFFSETS) {
        ctx.drawImage(outline, left + dx * kx * fit, topY + dy * ky, w, h)
      }
    }
    ctx.drawImage(this.#tint(signTextColor(side)), left, topY, w, h)
    ctx.restore()
    return true
  }

  /** The current mask in one color. */
  #tint(color: string): HTMLCanvasElement {
    const out = this.#tinted
    out.width = this.#mask.width
    out.height = this.#mask.height
    const t = out.getContext('2d')!
    t.drawImage(this.#mask, 0, 0)
    t.globalCompositeOperation = 'source-in'
    t.fillStyle = color
    t.fillRect(0, 0, out.width, out.height)
    return out
  }
}

/** The eight neighbours of a pixel, for the glow outline. */
const OUTLINE_OFFSETS = [
  [-1, -1],
  [0, -1],
  [1, -1],
  [-1, 0],
  [1, 0],
  [-1, 1],
  [0, 1],
  [1, 1],
] as const
