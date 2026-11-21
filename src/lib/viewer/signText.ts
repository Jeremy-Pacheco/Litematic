import { textOf } from '../utils/textComponent'
import { isNbtCompound, isNbtList, type NbtCompound, type NbtValue } from '../types/nbt'
import type { BlockState } from '../types/structure'

/**
 * Text of signs, read from their block entities, and where it goes on the
 * board Deepslate draws. Pure: drawing the text is done by `signTextMeshes`.
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
 * `minecraft:sign`), in any saved format:
 * - 1.20+: `front_text` / `back_text` with `messages` (JSON strings, or text
 *   components stored as NBT since 1.21.5), `color`, `has_glowing_text`.
 * - older: `Text1`…`Text4` (JSON strings), `Color`, `GlowingText`.
 * Sponge v3 keeps the data under `Data`. Returns `null` without any text.
 */
export function signTextOf(id: string, nbt: NbtCompound): SignText | null {
  if (!/(^|:)sign$/.test(id)) return null
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

export type SignKind = 'standing' | 'wall'

export interface SignPlacement {
  kind: SignKind
  /** Rotation around Y in radians, as Deepslate applies it to the board. */
  angle: number
}

const WALL_ANGLES: Readonly<Record<string, number>> = {
  north: 0,
  west: Math.PI / 2,
  south: Math.PI,
  east: (Math.PI * 3) / 2,
}

/** Board placement for a sign state (hanging signs are not supported). */
export function signPlacement(state: BlockState): SignPlacement | null {
  const name = state.name
  if (name.endsWith('_hanging_sign')) return null
  if (name.endsWith('_wall_sign')) {
    const angle = WALL_ANGLES[state.properties.facing ?? 'south']
    return angle === undefined ? null : { kind: 'wall', angle }
  }
  if (name.endsWith('_sign')) {
    const rotation = Number(state.properties.rotation ?? 0)
    if (!Number.isInteger(rotation) || rotation < 0 || rotation > 15) return null
    return { kind: 'standing', angle: (rotation / 16) * Math.PI * 2 }
  }
  return null
}

/**
 * Board face of a sign in Deepslate's model space (1/16 block, before its
 * transform): x and y span of the board and the z of its front (−z side)
 * and back (+z side) faces.
 */
export const BOARD: Readonly<
  Record<SignKind, { x0: number; x1: number; y0: number; y1: number; front: number; back: number }>
> = {
  standing: { x0: -4, x1: 20, y0: 8, y1: 20, front: 7, back: 9 },
  wall: { x0: -4, x1: 20, y0: 4, y1: 16, front: 17, back: 19 },
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

/** CSS color of a sign side's text. */
export function signTextColor(side: SignSide): string {
  const base = SIGN_COLORS[side.color] ?? 0
  const factor = side.glowing || base === 0 ? 1 : 0.4
  const r = Math.round(((base >> 16) & 0xff) * factor)
  const g = Math.round(((base >> 8) & 0xff) * factor)
  const b = Math.round((base & 0xff) * factor)
  return `rgb(${r} ${g} ${b})`
}
