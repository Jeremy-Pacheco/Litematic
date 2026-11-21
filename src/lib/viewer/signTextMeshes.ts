import {
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  FrontSide,
  LinearFilter,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  SRGBColorSpace,
  Vector3,
  type Plane,
} from 'three'
import { blockIndex, type Structure } from '../types/structure'
import {
  BOARD,
  signPlacement,
  signTextColor,
  signTextOf,
  type SignPlacement,
  type SignSide,
} from './signText'

/**
 * Draws the text of signs: each side with text becomes a tile of a canvas
 * page (128 tiles of 256 × 128 px per 2048 px page) and a quad just in front
 * of the board, placed with the same transform Deepslate uses for the board.
 * One mesh and one texture per page, so hundreds of signs cost a few draw
 * calls. The materials share the layer clipping planes.
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

interface Face {
  side: SignSide
  matrix: Matrix4
  placement: SignPlacement
  back: boolean
}

export function buildSignTextMeshes(
  structure: Pick<Structure, 'size' | 'palette' | 'blocks' | 'blockEntities'>,
  clippingPlanes: Plane[],
): SignTextResult {
  const faces: Face[] = []
  for (const entity of structure.blockEntities) {
    const text = signTextOf(entity.id, entity.nbt)
    if (!text) continue
    const { x, y, z } = entity.pos
    const { size } = structure
    if (x < 0 || y < 0 || z < 0 || x >= size.x || y >= size.y || z >= size.z) continue
    const state = structure.palette[structure.blocks[blockIndex(size, x, y, z)]]
    const placement = state ? signPlacement(state) : null
    if (!placement) continue
    const matrix = boardMatrix(x, y, z, placement.angle)
    if (text.front) faces.push({ side: text.front, matrix, placement, back: false })
    if (text.back) faces.push({ side: text.back, matrix, placement, back: true })
  }

  const drawn = Math.min(faces.length, MAX_SIGN_SIDES)
  const meshes: Mesh[] = []
  for (let start = 0; start < drawn; start += TILES_PER_PAGE) {
    meshes.push(
      pageMesh(faces.slice(start, Math.min(drawn, start + TILES_PER_PAGE)), clippingPlanes),
    )
  }
  return { meshes, drawn, skipped: faces.length - drawn }
}

/** Deepslate's board transform (1/16 units) followed by the block position. */
function boardMatrix(x: number, y: number, z: number, angle: number): Matrix4 {
  return new Matrix4()
    .makeTranslation(x, y, z)
    .multiply(new Matrix4().makeScale(1 / 16, 1 / 16, 1 / 16))
    .multiply(new Matrix4().makeTranslation(8, 8, 8))
    .multiply(new Matrix4().makeRotationY(angle))
    .multiply(new Matrix4().makeScale(2 / 3, 2 / 3, 2 / 3))
    .multiply(new Matrix4().makeTranslation(-8, -8, -8))
}

function pageMesh(faces: Face[], clippingPlanes: Plane[]): Mesh {
  const canvas = document.createElement('canvas')
  canvas.width = PAGE
  canvas.height = PAGE
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('2D canvas is not available')

  const positions = new Float32Array(faces.length * 12)
  const uvs = new Float32Array(faces.length * 8)
  const indices = new Uint32Array(faces.length * 6)
  const columns = PAGE / TILE_W
  const corner = new Vector3()

  faces.forEach((face, i) => {
    const tx = (i % columns) * TILE_W
    const ty = Math.floor(i / columns) * TILE_H
    drawTile(ctx, face.side, tx, ty)

    const board = BOARD[face.placement.kind]
    // Front text faces −z (seen from the front), back text faces +z; the
    // corners go left → right as seen by the viewer of each side.
    const z = face.back ? board.back + LIFT : board.front - LIFT
    const [left, right] = face.back ? [board.x0, board.x1] : [board.x1, board.x0]
    const quad = [
      [left, board.y1],
      [right, board.y1],
      [right, board.y0],
      [left, board.y0],
    ]
    quad.forEach(([qx, qy], k) => {
      corner.set(qx, qy, z).applyMatrix4(face.matrix)
      positions.set([corner.x, corner.y, corner.z], (i * 4 + k) * 3)
    })
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

/** Four centred lines, shrunk horizontally when a line is too wide. */
function drawTile(ctx: CanvasRenderingContext2D, side: SignSide, x: number, y: number): void {
  const lineHeight = TILE_H / 4.4
  ctx.save()
  ctx.font = `600 ${Math.round(lineHeight * 0.8)}px system-ui, sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  const color = signTextColor(side)
  side.lines.forEach((line, i) => {
    if (!line) return
    const cy = y + TILE_H * 0.08 + lineHeight * (i + 0.5)
    const width = ctx.measureText(line).width
    const max = TILE_W * 0.92
    ctx.save()
    ctx.translate(x + TILE_W / 2, cy)
    if (width > max) ctx.scale(max / width, 1)
    if (side.glowing) {
      // Glowing text: an outline in a darker shade, as in the game.
      ctx.lineWidth = 4
      ctx.strokeStyle = 'rgb(0 0 0 / 0.55)'
      ctx.strokeText(line, 0, 0)
    }
    ctx.fillStyle = color
    ctx.fillText(line, 0, 0)
    ctx.restore()
  })
  ctx.restore()
}
