import { readStorage, writeStorage } from '../utils/storage'

/**
 * The user's choice about optional cookies (only analytics). Storing this
 * choice is strictly necessary, so it needs no consent itself.
 *
 * The choice is asked again after `MAX_AGE_MS` (the Spanish data protection
 * authority recommends renewing consent at least every 24 months) and when
 * `CONSENT_VERSION` changes (e.g. a new kind of cookie is added).
 */

const STORAGE_KEY = 'lv:consent'
export const CONSENT_VERSION = 1
export const MAX_AGE_MS = 365 * 24 * 60 * 60 * 1000

export interface ConsentRecord {
  analytics: boolean
  version: number
  /** When the choice was made (ms since epoch). */
  decidedAt: number
}

/** A saved choice that is still valid, or `null` (ask the user). */
export function parseConsent(raw: string | null, now = Date.now()): ConsentRecord | null {
  let data: unknown
  try {
    data = raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
  if (typeof data !== 'object' || data === null) return null
  const v = data as Record<string, unknown>
  if (typeof v.analytics !== 'boolean' || v.version !== CONSENT_VERSION) return null
  if (typeof v.decidedAt !== 'number' || now - v.decidedAt > MAX_AGE_MS || v.decidedAt > now) {
    return null
  }
  return { analytics: v.analytics, version: CONSENT_VERSION, decidedAt: v.decidedAt }
}

class ConsentState {
  /** `null` until the user decides (the banner is shown). */
  record = $state.raw<ConsentRecord | null>(null)
  /** Cookie settings and policy dialog. */
  dialogOpen = $state(false)

  get analytics(): boolean {
    return this.record?.analytics ?? false
  }

  get decided(): boolean {
    return this.record !== null
  }

  init(): void {
    this.record = parseConsent(readStorage(STORAGE_KEY))
  }

  decide(analytics: boolean): void {
    this.record = { analytics, version: CONSENT_VERSION, decidedAt: Date.now() }
    writeStorage(STORAGE_KEY, JSON.stringify(this.record))
  }
}

export const consent = new ConsentState()
