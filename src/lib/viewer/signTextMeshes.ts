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
import { blockIndex, type Structure, type Vec3 } from '../types/structure'
import {
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
  corners: [number, number, number][]
  /** Width / height of the board, to draw the text without stretching it. */
  aspect: number
}

/**
 * `specialModels[i]`: palette state `i` was drawn by Deepslate's special
 * renderers (see `BakedState.specialModel`), which places sign boards
 * differently from the game's models.
 */
export function buildSignTextMeshes(
  structure: Pick<Structure, 'size' | 'palette' | 'blocks' | 'blockEntities'>,
  clippingPlanes: Plane[],
  specialModels: readonly boolean[] = [],
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
    const { board } = placement
    const aspect = (board.x1 - board.x0) / (board.y1 - board.y0)
    for (const [side, back] of [
      [text.front, false],
      [text.back, true],
    ] as const) {
      if (side) faces.push({ side, corners: signTextCorners(entity.pos, placement, back), aspect })
    }
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

  faces.forEach((face, i) => {
    const tx = (i % columns) * TILE_W
    const ty = Math.floor(i / columns) * TILE_H
    drawTile(ctx, face.side, tx, ty, TILE_W / TILE_H / face.aspect)
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
 * Four centred lines, shrunk horizontally when a line is too wide.
 * `stretch`: horizontal scale that makes up for a board narrower than the
 * 2 : 1 tile (hanging signs), so the letters keep their shape.
 */
function drawTile(
  ctx: CanvasRenderingContext2D,
  side: SignSide,
  x: number,
  y: number,
  stretch: number,
): void {
  const lineHeight = TILE_H / 4.4
  ctx.save()
  ctx.font = `600 ${Math.round(lineHeight * 0.8)}px system-ui, sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  const color = signTextColor(side)
  side.lines.forEach((line, i) => {
    if (!line) return
    const cy = y + TILE_H * 0.08 + lineHeight * (i + 0.5)
    const width = ctx.measureText(line).width * stretch
    const max = TILE_W * 0.92
    ctx.save()
    ctx.translate(x + TILE_W / 2, cy)
    ctx.scale(width > max ? (stretch * max) / width : stretch, 1)
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
