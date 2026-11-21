/** Items per stack and per shulker box. */
export const DEFAULT_STACK = 64
export const SHULKER_SLOTS = 27

/**
 * Stack size of an item placed as a block. Most stack to 64; the exceptions
 * that can appear in a structure are listed here.
 */
export function stackSize(item: string): number {
  const id = item.startsWith('minecraft:') ? item.slice('minecraft:'.length) : item
  if (
    id.endsWith('_bed') ||
    id.endsWith('_bucket') ||
    id.endsWith('shulker_box') ||
    id === 'cake'
  ) {
    return 1
  }
  if (
    id.endsWith('_sign') ||
    id.endsWith('_banner') ||
    id === 'armor_stand' ||
    id === 'snowball' ||
    id === 'ender_pearl' ||
    id === 'egg'
  ) {
    return 16
  }
  return DEFAULT_STACK
}

export interface StackBreakdown {
  /** Full stacks. */
  stacks: number
  /** Items left over after the full stacks. */
  remainder: number
  /** Shulker boxes needed to carry everything (fractional). */
  shulkerBoxes: number
}

export function stackBreakdown(count: number, size: number): StackBreakdown {
  return {
    stacks: Math.floor(count / size),
    remainder: count % size,
    shulkerBoxes: count / (size * SHULKER_SLOTS),
  }
}
