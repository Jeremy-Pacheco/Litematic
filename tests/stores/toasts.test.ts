import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MAX_TOASTS, TOAST_DURATIONS, ToastQueue } from '../../src/lib/stores/toasts.svelte'

const title = { key: 'import.open' } as const

describe('ToastQueue', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('adds toasts with unique ids and info as default kind', () => {
    const queue = new ToastQueue()
    const a = queue.push({ title })
    const b = queue.push({ title, kind: 'error' })
    expect(a).not.toBe(b)
    expect(queue.items.map((t) => t.kind)).toEqual(['info', 'error'])
  })

  it('dismisses a toast by id', () => {
    const queue = new ToastQueue()
    const id = queue.push({ title })
    queue.dismiss(id)
    expect(queue.items).toHaveLength(0)
  })

  it('closes on its own after the default duration of its kind', () => {
    const queue = new ToastQueue()
    queue.push({ title, kind: 'success' })
    vi.advanceTimersByTime(TOAST_DURATIONS.success - 1)
    expect(queue.items).toHaveLength(1)
    vi.advanceTimersByTime(1)
    expect(queue.items).toHaveLength(0)
  })

  it('keeps toasts with duration 0 until dismissed', () => {
    const queue = new ToastQueue()
    queue.push({ title, duration: 0 })
    vi.advanceTimersByTime(60_000)
    expect(queue.items).toHaveLength(1)
  })

  it(`shows at most ${MAX_TOASTS} toasts, dropping the oldest`, () => {
    const queue = new ToastQueue()
    const ids = Array.from({ length: MAX_TOASTS + 2 }, () => queue.push({ title, duration: 0 }))
    expect(queue.items.map((t) => t.id)).toEqual(ids.slice(-MAX_TOASTS))
  })

  it('clears every toast and its timer', () => {
    const queue = new ToastQueue()
    queue.push({ title })
    queue.push({ title })
    queue.clear()
    expect(queue.items).toHaveLength(0)
    expect(vi.getTimerCount()).toBe(0)
  })
})
