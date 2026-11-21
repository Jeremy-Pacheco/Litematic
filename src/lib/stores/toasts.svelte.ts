import type { MessageKey, MessageParams } from '../i18n/translate'

export type ToastKind = 'info' | 'success' | 'error'

/**
 * Text stored as a message key, not as a translated string, so visible toasts
 * follow a language change.
 */
export interface TranslatableText {
  key: MessageKey
  params?: MessageParams
}

export interface Toast {
  id: number
  kind: ToastKind
  title: TranslatableText
  message?: TranslatableText
}

export interface ToastOptions {
  kind?: ToastKind
  title: TranslatableText
  message?: TranslatableText
  /** Milliseconds before it closes on its own. `0` keeps it until dismissed. */
  duration?: number
}

/** Default lifetime per kind. Errors stay longer so they can be read. */
export const TOAST_DURATIONS: Readonly<Record<ToastKind, number>> = {
  info: 5000,
  success: 4000,
  error: 8000,
}

/** Maximum toasts shown at once; the oldest is dropped first. */
export const MAX_TOASTS = 4

/** Queue of in-app notifications (replaces browser `alert()`). */
export class ToastQueue {
  items = $state<Toast[]>([])

  #nextId = 1
  // Internal bookkeeping only; the UI never reads it, so it must not be reactive.
  // eslint-disable-next-line svelte/prefer-svelte-reactivity
  #timers = new Map<number, ReturnType<typeof setTimeout>>()

  /** Shows a toast and returns its id. */
  push({ kind = 'info', title, message, duration }: ToastOptions): number {
    const id = this.#nextId++
    const next = [...this.items, { id, kind, title, message }]
    const dropped = next.slice(0, Math.max(0, next.length - MAX_TOASTS))
    for (const toast of dropped) this.#clearTimer(toast.id)
    this.items = next.slice(-MAX_TOASTS)

    const lifetime = duration ?? TOAST_DURATIONS[kind]
    if (lifetime > 0) {
      this.#timers.set(
        id,
        setTimeout(() => this.dismiss(id), lifetime),
      )
    }
    return id
  }

  dismiss(id: number): void {
    this.#clearTimer(id)
    this.items = this.items.filter((toast) => toast.id !== id)
  }

  clear(): void {
    for (const id of this.#timers.keys()) this.#clearTimer(id)
    this.items = []
  }

  #clearTimer(id: number): void {
    const timer = this.#timers.get(id)
    if (timer !== undefined) clearTimeout(timer)
    this.#timers.delete(id)
  }
}

export const toasts = new ToastQueue()
