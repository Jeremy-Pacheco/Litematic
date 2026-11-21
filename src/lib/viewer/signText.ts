import { textOf } from '../utils/textComponent'
import { isNbtCompound, isNbtList, type NbtCompound, type NbtValue } from '../types/nbt'
import type { BlockState } from '../types/structure'

/**
 * Text of signs, read from their block entities, and where it goes on the
 * board that was drawn (the game's model or Deepslate's). Pure: drawing the
 * text is done by `signTextMeshes`.
 */

export interface SignSide {
  /** Always 4 lines (empty strings for blank lines). */
  lines: string[]
  /** Dye color name of the text. */
  color: string
  glowing: boolean
}

export interface SignText {
  front: SignSide | null
  back: SignSide | null
}

/** Longest line kept (the game fits about 15 wide characters). */
const MAX_LINE = 90

/**
 * Text of a sign block entity (standing and wall signs share the id
 * `minecraft:sign`, hanging ones `minecraft:hanging_sign`), in any saved format:
 * - 1.20+: `front_text` / `back_text` with `messages` (JSON strings, or text
 *   components stored as NBT since 1.21.5), `color`, `has_glowing_text`.
 * - older: `Text1`…`Text4` (JSON strings), `Color`, `GlowingText`.
 * Sponge v3 keeps the data under `Data`. Returns `null` without any text.
 */
export function signTextOf(id: string, nbt: NbtCompound): SignText | null {
  // `Sign` before 1.11 (e.g. in `.schematic` files), `minecraft:sign` after.
  if (!/(^|:)(hanging_)?sign$/i.test(id)) return null
  const data = isNbtCompound(nbt.get('Data')) ? (nbt.get('Data') as NbtCompound) : nbt
  let front: SignSide | null
  let back: SignSide | null = null
  const frontText = data.get('front_text')
  if (isNbtCompound(frontText)) {
    front = side(frontText)
    const backText = data.get('back_text')
    back = isNbtCompound(backText) ? side(backText) : null
  } else {
    const lines = ['Text1', 'Text2', 'Text3', 'Text4'].map((key) => message(data.get(key)))
    const color = data.get('Color')
    front = withText({
      lines,
      color: typeof color === 'string' ? color : 'black',
      glowing: data.get('GlowingText') === 1,
    })
  }
  return front || back ? { front, back } : null
}

function side(compound: NbtCompound): SignSide | null {
  const messages = compound.get('messages')
  const lines = [0, 1, 2, 3].map((i) => (isNbtList(messages) ? message(messages.items[i]) : ''))
  const color = compound.get('color')
  return withText({
    lines,
    color: typeof color === 'string' ? color : 'black',
    glowing: compound.get('has_glowing_text') === 1,
  })
}

function withText(sign: SignSide): SignSide | null {
  return sign.lines.some((line) => line.trim() !== '') ? sign : null
}

/** Plain text of one line: a JSON text component, plain text or an NBT component. */
export function message(value: NbtValue | undefined): string {
  let text = ''
  if (typeof value === 'string') {
    try {
      text = textOf(JSON.parse(value))
    } catch {
      text = value
    }
  } else if (value !== undefined && (isNbtCompound(value) || isNbtList(value))) {
    text = textOf(toPlain(value))
  }
  // eslint-disable-next-line no-control-regex
  return text.replace(/[\u0000-\u001f\u007f]/g, '').slice(0, MAX_LINE)
}

/** NBT compound or list as plain JSON-like values (only what text components use). */
function toPlain(value: NbtValue, depth = 0): unknown {
  if (depth > 16) return null
  if (isNbtCompound(value)) {
    return Object.fromEntries([...value].map(([k, v]) => [k, toPlain(v, depth + 1)]))
  }
  if (isNbtList(value)) return value.items.map((item) => toPlain(item, depth + 1))
  return typeof value === 'string' || typeof value === 'number' ? value : null
}

export type SignKind = 'standing' | 'wall' | 'hanging' | 'wall_hanging'

/**
 * Board of a sign model, in 1/16 block units before the placement transform:
 * x and y span, and the z of the face showing the front text and of the one
 * showing the back text.
 */
export interface SignBoard {
  x0: number
  x1: number
  y0: number
  y1: number
  front: number
  back: number
  /** Scale around the block centre (Deepslate draws standing and wall signs at 2/3). */
  scale: number
}

export interface SignPlacement {
  kind: SignKind
  board: SignBoard
  /** Rotation around the vertical axis through the block centre, in radians. */
  angle: number
}

/**
 * Boards of the game's JSON models (26.x): the unrotated variant, whose
 * front faces south (+z) — the side a sign with `rotation=0` or
 * `facing=south` shows its front text on.
 */
const GAME_BOARDS: Readonly<Record<SignKind, SignBoard>> = {
  standing: { x0: 0, x1: 16, y0: 28 / 3, y1: 52 / 3, front: 26 / 3, back: 22 / 3, scale: 1 },
  wall: { x0: 0, x1: 16, y0: 13 / 3, y1: 37 / 3, front: 5 / 3, back: 1 / 3, scale: 1 },
  hanging: { x0: 1, x1: 15, y0: 0, y1: 10, front: 9, back: 7, scale: 1 },
  wall_hanging: { x0: 1, x1: 15, y0: 0, y1: 10, front: 9, back: 7, scale: 1 },
}

/**
 * Boards Deepslate's special renderers draw (game files without sign
 * models, before 26.x). Their front faces north (−z) before rotation, except
 * the hanging sign's, whose two faces look the same.
 */
const DEEPSLATE_BOARDS: Readonly<Record<SignKind, SignBoard>> = {
  standing: { x0: -4, x1: 20, y0: 8, y1: 20, front: 7, back: 9, scale: 2 / 3 },
  wall: { x0: -4, x1: 20, y0: 4, y1: 16, front: 17, back: 19, scale: 2 / 3 },
  hanging: { x0: 1, x1: 15, y0: 0, y1: 10, front: 9, back: 7, scale: 1 },
  wall_hanging: { x0: 1, x1: 15, y0: 0, y1: 10, front: 7, back: 9, scale: 1 },
}

/** `facing` → rotation: the game's blockstates turn clockwise from south. */
const GAME_FACING: Readonly<Record<string, number>> = {
  south: 0,
  west: -Math.PI / 2,
  north: Math.PI,
  east: Math.PI / 2,
}
/** `facing` → rotation as Deepslate applies it, from north. */
const DEEPSLATE_FACING: Readonly<Record<string, number>> = {
  north: 0,
  west: Math.PI / 2,
  south: Math.PI,
  east: (Math.PI * 3) / 2,
}

export function signKind(name: string): SignKind | null {
  if (name.endsWith('_wall_hanging_sign')) return 'wall_hanging'
  if (name.endsWith('_hanging_sign')) return 'hanging'
  if (name.endsWith('_wall_sign')) return 'wall'
  if (name.endsWith('_sign')) return 'standing'
  return null
}

/**
 * Board placement for a sign state. `specialModel`: the sign was drawn by
 * Deepslate (no JSON model in the game files), whose boards sit elsewhere and
 * turn the other way.
 */
export function signPlacement(state: BlockState, specialModel = false): SignPlacement | null {
  const kind = signKind(state.name)
  if (!kind) return null
  const board = (specialModel ? DEEPSLATE_BOARDS : GAME_BOARDS)[kind]
  if (kind === 'wall' || kind === 'wall_hanging') {
    const angle = (specialModel ? DEEPSLATE_FACING : GAME_FACING)[
      state.properties.facing ?? 'south'
    ]
    return angle === undefined ? null : { kind, board, angle }
  }
  const rotation = Number(state.properties.rotation ?? 0)
  if (!Number.isInteger(rotation) || rotation < 0 || rotation > 15) return null
  // The game turns clockwise (seen from above), Deepslate the other way.
  const angle = (rotation / 16) * Math.PI * 2
  return { kind, board, angle: specialModel ? angle : -angle }
}

/** Text colors of signs (the game darkens them unless the text glows). */
export const SIGN_COLORS: Readonly<Record<string, number>> = {
  white: 0xffffff,
  orange: 0xff681f,
  magenta: 0xff00ff,
  light_blue: 0x9ac0cd,
  yellow: 0xffff00,
  lime: 0xbfff00,
  pink: 0xff69b4,
  gray: 0x808080,
  light_gray: 0xd3d3d3,
  cyan: 0x00ffff,
  purple: 0xa020f0,
  blue: 0x0000ff,
  brown: 0x8b4513,
  green: 0x00ff00,
  red: 0xff0000,
  black: 0x000000,
}

/**
 * Text layout of each kind of sign, as the game draws it: font pixels per
 * block (the text scale), height of a line and widest line, in font pixels.
 */
export const SIGN_TEXT: Readonly<
  Record<SignKind, { pxPerBlock: number; lineHeight: number; maxWidth: number }>
> = {
  standing: { pxPerBlock: 96, lineHeight: 10, maxWidth: 90 },
  wall: { pxPerBlock: 96, lineHeight: 10, maxWidth: 90 },
  hanging: { pxPerBlock: 64 / 0.9, lineHeight: 9, maxWidth: 60 },
  wall_hanging: { pxPerBlock: 64 / 0.9, lineHeight: 9, maxWidth: 60 },
}

function rgb(color: number, factor: number): string {
  const r = Math.round(((color >> 16) & 0xff) * factor)
  const g = Math.round(((color >> 8) & 0xff) * factor)
  const b = Math.round((color & 0xff) * factor)
  return `rgb(${r} ${g} ${b})`
}

/** The game's darkened text color (text without glow, and the glow outline). */
const DARKEN = 0.4
/** Outline of glowing black text (the game's 0xF0EBCC). */
const BLACK_GLOW_OUTLINE = 0xf0ebcc

/** CSS color of a sign side's text. */
export function signTextColor(side: SignSide): string {
  const base = SIGN_COLORS[side.color] ?? 0
  return rgb(base, side.glowing || base === 0 ? 1 : DARKEN)
}

/** CSS color of the outline of glowing text. */
export function signOutlineColor(side: SignSide): string {
  const base = SIGN_COLORS[side.color] ?? 0
  return base === 0 ? rgb(BLACK_GLOW_OUTLINE, 1) : rgb(base, DARKEN)
}
