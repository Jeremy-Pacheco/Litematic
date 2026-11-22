import {
  Box2,
  DataTexture,
  RGBAFormat,
  SRGBColorSpace,
  Vector2,
  type Texture,
  type WebGLRenderer,
} from 'three'
import type { AtlasAnimation, AtlasAnimations } from '../models/atlas'
import { blendAt, TICKS_PER_SECOND } from '../models/textureAnimation'

/**
 * Animates the atlas: as game ticks pass, each animated texture's region of
 * the atlas is overwritten with the frame it should show — or, for textures
 * that interpolate, a blend of the current frame and the next. Only regions
 * whose picture changes are uploaded (a few KB each); meshes and the rest of
 * the atlas are untouched. The scene is redrawn only when something changed,
 * so a structure without animated textures costs nothing.
 */

const TICK_MS = 1000 / TICKS_PER_SECOND
/**
 * How often frames are checked (and the scene redrawn at most): every 2
 * ticks, 10 times per second. Water and lava change every 2 or 3 ticks;
 * flowing water changes every tick but is still shown at its real speed, with
 * half the redraws (each one redraws the whole scene).
 */
const UPDATE_MS = 2 * TICK_MS
/**
 * Blend levels between two frames. A blend only changes the picture when it
 * moves to the next level, so slow animations (prismarine: 15 s per frame)
 * are updated every half second instead of every check.
 */
export const BLEND_LEVELS = 32

/** A top-left corner in the frame sheet. */
export interface FrameCell {
  x: number
  y: number
}

/**
 * Shows an animation's picture: `frame` alone when `t` is 0, otherwise
 * `frame` blended `t` of the way into `next`.
 */
export type ShowFrame = (
  animation: AtlasAnimation,
  frame: FrameCell,
  next: FrameCell,
  t: number,
) => void

/** Which picture each animation shows, and which ones change at a tick. Pure, for tests. */
export class AnimationClock {
  readonly #list: readonly AtlasAnimation[]
  /** Per animation: a key of the picture shown (frame, next and blend level). */
  readonly #shown: (string | null)[]

  constructor(list: readonly AtlasAnimation[]) {
    this.#list = list
    this.#shown = list.map(() => null)
  }

  /** Shows every animation whose picture differs at `tick`; true if any did. */
  advance(tick: number, show: ShowFrame): boolean {
    let changed = false
    this.#list.forEach((animation, i) => {
      const at = blendAt(animation.steps, tick)
      const level =
        animation.interpolate && at.next !== at.frame ? Math.floor(at.t * BLEND_LEVELS) : 0
      const key = level === 0 ? `${at.frame}` : `${at.frame}>${at.next}:${level}`
      if (key === this.#shown[i]) return
      const cell = animation.frames[at.frame]
      const next = animation.frames[at.next]
      if (!cell || !next) return
      show(animation, cell, next, level / BLEND_LEVELS)
      this.#shown[i] = key
      changed = true
    })
    return changed
  }

  /** Forgets what is shown (after the atlas was uploaded again), so the next tick shows everything. */
  reset(): void {
    this.#shown.fill(null)
  }
}

/**
 * Blends two frames of the sheet into `out` (`width × height` RGBA), as the
 * game: each color channel `(1 − t) · a + t · b`; alpha stays the current
 * frame's.
 */
export function blendFrames(
  sheet: { width: number; pixels: Uint8ClampedArray },
  a: FrameCell,
  b: FrameCell,
  width: number,
  height: number,
  t: number,
  out: Uint8ClampedArray,
): void {
  const { width: sheetWidth, pixels } = sheet
  for (let y = 0; y < height; y++) {
    let ia = ((a.y + y) * sheetWidth + a.x) * 4
    let ib = ((b.y + y) * sheetWidth + b.x) * 4
    let o = y * width * 4
    for (let x = 0; x < width; x++, ia += 4, ib += 4, o += 4) {
      out[o] = pixels[ia] + (pixels[ib] - pixels[ia]) * t
      out[o + 1] = pixels[ia + 1] + (pixels[ib + 1] - pixels[ia + 1]) * t
      out[o + 2] = pixels[ia + 2] + (pixels[ib + 2] - pixels[ia + 2]) * t
      out[o + 3] = pixels[ia + 3]
    }
  }
}

/**
 * Runs the animation on a timer (`UPDATE_MS`), while `enabled` and the page
 * is visible. `onChange` asks for a redraw.
 */
export class AtlasAnimator {
  readonly #clock: AnimationClock
  readonly #sheet: DataTexture | null
  readonly #show: ShowFrame
  readonly #onChange: () => void
  readonly #start = performance.now()
  #timer: ReturnType<typeof setInterval> | null = null

  constructor(
    renderer: WebGLRenderer,
    atlas: Texture,
    { sheet, list }: AtlasAnimations,
    onChange: () => void,
  ) {
    this.#clock = new AnimationClock(sheet ? list : [])
    this.#onChange = onChange
    this.#sheet = sheet ? createTexture(sheet.pixels, sheet.width, sheet.height) : null
    const region = new Box2()
    const position = new Vector2()
    // One scratch texture (and its pixels) per blended animation, reused for every blend.
    const blends = new Map<AtlasAnimation, { texture: DataTexture; pixels: Uint8ClampedArray }>()
    this.#show = (animation, frame, next, t) => {
      const { target } = animation
      position.set(target.x, target.y)
      if (t === 0) {
        region.min.set(frame.x, frame.y)
        region.max.set(frame.x + target.width, frame.y + target.height)
        renderer.copyTextureToTexture(this.#sheet!, atlas, region, position)
        return
      }
      let blend = blends.get(animation)
      if (!blend) {
        const pixels = new Uint8ClampedArray(target.width * target.height * 4)
        blend = { texture: createTexture(pixels, target.width, target.height), pixels }
        blends.set(animation, blend)
      }
      blendFrames(sheet!, frame, next, target.width, target.height, t, blend.pixels)
      renderer.copyTextureToTexture(blend.texture, atlas, null, position)
    }
  }

  /** Whether the structure has anything to animate. */
  get animated(): boolean {
    return this.#sheet !== null
  }

  /** Starts or stops the animation; stopping leaves the current frames. */
  setEnabled(enabled: boolean): void {
    if (enabled && this.animated && !this.#timer) {
      this.#timer = setInterval(() => this.#tick(), UPDATE_MS)
      this.#tick()
    } else if (!enabled && this.#timer) {
      clearInterval(this.#timer)
      this.#timer = null
    }
  }

  /** The atlas was uploaded again (lost context): show every frame on the next tick. */
  reset(): void {
    this.#clock.reset()
  }

  dispose(): void {
    this.setEnabled(false)
    this.#sheet?.dispose()
  }

  #tick(): void {
    // A hidden tab draws nothing: no work until it is visible again.
    if (globalThis.document?.visibilityState === 'hidden') return
    const tick = (performance.now() - this.#start) / TICK_MS
    if (this.#clock.advance(tick, this.#show)) this.#onChange()
  }
}

/** Pixels the renderer copies from (never drawn, never uploaded whole). */
function createTexture(pixels: Uint8ClampedArray, width: number, height: number): DataTexture {
  const texture = new DataTexture(pixels, width, height, RGBAFormat)
  texture.flipY = false
  texture.colorSpace = SRGBColorSpace
  texture.generateMipmaps = false
  return texture
}
