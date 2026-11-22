/**
 * Animated textures as the game defines them: a vertical strip of square
 * frames plus a `.png.mcmeta` with the order and duration of each frame.
 * Pure helpers, shared by the atlas builder (worker) and the viewer.
 *
 * ```json
 * { "animation": { "frametime": 2, "frames": [0, 1, { "index": 2, "time": 5 }] } }
 * ```
 */

/** One step of an animation: which frame, and for how many game ticks (20 per second). */
export interface AnimationStep {
  frame: number
  ticks: number
}

/** Game ticks per second. */
export const TICKS_PER_SECOND = 20

/**
 * The steps of an animation from its `.mcmeta` JSON, given how many frames
 * the strip has. Defaults as in the game: every frame in order, 1 tick each.
 * Invalid entries are skipped; `null` when nothing would animate.
 */
export function animationSteps(mcmeta: unknown, frameCount: number): AnimationStep[] | null {
  const animation = (mcmeta as { animation?: unknown } | null)?.animation
  if (!animation || typeof animation !== 'object' || frameCount < 2) return null
  const { frametime, frames } = animation as { frametime?: unknown; frames?: unknown }
  const defaultTicks = positiveInteger(frametime) ?? 1
  const steps: AnimationStep[] = []
  if (Array.isArray(frames)) {
    for (const entry of frames) {
      const frame = typeof entry === 'number' ? entry : (entry as { index?: unknown })?.index
      const ticks =
        typeof entry === 'object' && entry !== null
          ? (positiveInteger((entry as { time?: unknown }).time) ?? defaultTicks)
          : defaultTicks
      if (Number.isInteger(frame) && (frame as number) >= 0 && (frame as number) < frameCount) {
        steps.push({ frame: frame as number, ticks })
      }
    }
  } else {
    for (let frame = 0; frame < frameCount; frame++) steps.push({ frame, ticks: defaultTicks })
  }
  return new Set(steps.map((s) => s.frame)).size > 1 ? steps : null
}

function positiveInteger(value: unknown): number | null {
  return Number.isInteger(value) && (value as number) > 0 ? (value as number) : null
}

/** Total length of an animation in ticks. */
export function animationLength(steps: readonly AnimationStep[]): number {
  return steps.reduce((sum, s) => sum + s.ticks, 0)
}

/** The frame shown at a given game tick (the animation loops). */
export function frameAt(steps: readonly AnimationStep[], tick: number): number {
  return blendAt(steps, tick).frame
}

/** Whether an animation blends each frame into the next (`"interpolate": true`). */
export function animationInterpolates(mcmeta: unknown): boolean {
  const animation = (mcmeta as { animation?: { interpolate?: unknown } } | null)?.animation
  return animation?.interpolate === true
}

/**
 * Where an animation is at a game tick: the current frame, the next one and
 * how far it has blended into it (0–1, in whole ticks, as the game's
 * interpolation advances once per tick).
 */
export function blendAt(
  steps: readonly AnimationStep[],
  tick: number,
): { frame: number; next: number; t: number } {
  const length = animationLength(steps)
  let rest = ((Math.floor(tick) % length) + length) % length
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i]
    if (rest < step.ticks) {
      return { frame: step.frame, next: steps[(i + 1) % steps.length].frame, t: rest / step.ticks }
    }
    rest -= step.ticks
  }
  return { frame: steps[0].frame, next: steps[1 % steps.length].frame, t: 0 }
}
