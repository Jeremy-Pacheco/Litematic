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
import { frameAt, TICKS_PER_SECOND } from '../models/textureAnimation'

/**
 * Animates the atlas: as game ticks pass, each animated texture's region of
 * the atlas is overwritten with the frame it should show. Only regions whose
 * frame changes are copied (a few KB each, `copyTextureToTexture`); meshes
 * and the rest of the atlas are untouched. The scene is redrawn only when
 * something changed, so a structure without animated textures costs nothing.
 */

const TICK_MS = 1000 / TICKS_PER_SECOND
/**
 * How often frames are checked (and the scene redrawn at most): every 2
 * ticks, 10 times per second. Water and lava change every 2 or 3 ticks;
 * flowing water changes every tick but is still shown at its real speed, with
 * half the redraws (each one redraws the whole scene).
 */
const UPDATE_MS = 2 * TICK_MS

/** Copies frame `frame` of an animation over its atlas region. */
export type CopyFrame = (animation: AtlasAnimation, frame: { x: number; y: number }) => void

/** Which frame each animation shows, and which ones change at a tick. Pure, for tests. */
export class AnimationClock {
  readonly #list: readonly AtlasAnimation[]
  readonly #shown: number[]

  constructor(list: readonly AtlasAnimation[]) {
    this.#list = list
    this.#shown = list.map(() => -1)
  }

  /** Copies every animation whose frame differs at `tick`; true if any did. */
  advance(tick: number, copy: CopyFrame): boolean {
    let changed = false
    this.#list.forEach((animation, i) => {
      const frame = frameAt(animation.steps, tick)
      if (frame === this.#shown[i]) return
      const cell = animation.frames[frame]
      if (!cell) return
      copy(animation, cell)
      this.#shown[i] = frame
      changed = true
    })
    return changed
  }

  /** Forgets what is shown (after the atlas was uploaded again), so the next tick copies everything. */
  reset(): void {
    this.#shown.fill(-1)
  }
}

/**
 * Runs the animation on a timer (`UPDATE_MS`), while `enabled` and the page
 * is visible. `onChange` asks for a redraw.
 */
export class AtlasAnimator {
  readonly #clock: AnimationClock
  readonly #sheet: DataTexture | null
  readonly #copy: CopyFrame
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
    this.#sheet = sheet ? createSheetTexture(sheet) : null
    const region = new Box2()
    const position = new Vector2()
    this.#copy = (animation, cell) => {
      const { target } = animation
      region.min.set(cell.x, cell.y)
      region.max.set(cell.x + target.width, cell.y + target.height)
      position.set(target.x, target.y)
      renderer.copyTextureToTexture(this.#sheet!, atlas, region, position)
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

  /** The atlas was uploaded again (lost context): copy every frame on the next tick. */
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
    if (this.#clock.advance(tick, this.#copy)) this.#onChange()
  }
}

/** The frame sheet as a texture the renderer copies from (it never draws it). */
function createSheetTexture({
  width,
  height,
  pixels,
}: NonNullable<AtlasAnimations['sheet']>): DataTexture {
  const texture = new DataTexture(pixels, width, height, RGBAFormat)
  texture.flipY = false
  texture.colorSpace = SRGBColorSpace
  texture.generateMipmaps = false
  return texture
}
