import { describe, expect, it } from 'vitest'
import { analyticsCookieNames, measurementId } from '../../src/lib/analytics/googleAnalytics'
import { CONSENT_VERSION, MAX_AGE_MS, parseConsent } from '../../src/lib/stores/consent.svelte'

const now = Date.UTC(2026, 10, 21)
const saved = (value: object) =>
  JSON.stringify({ version: CONSENT_VERSION, decidedAt: now, ...value })

describe('parseConsent', () => {
  it('keeps a valid, recent choice', () => {
    expect(parseConsent(saved({ analytics: true }), now)).toEqual({
      analytics: true,
      version: CONSENT_VERSION,
      decidedAt: now,
    })
    expect(parseConsent(saved({ analytics: false }), now)?.analytics).toBe(false)
  })

  it('asks again when there is no choice, it is invalid, old or from another version', () => {
    expect(parseConsent(null, now)).toBeNull()
    expect(parseConsent('not json', now)).toBeNull()
    expect(parseConsent(saved({ analytics: 'yes' }), now)).toBeNull()
    expect(parseConsent(saved({ analytics: true, version: 0 }), now)).toBeNull()
    expect(parseConsent(saved({ analytics: true }), now + MAX_AGE_MS + 1)).toBeNull()
    // A date in the future is not trusted either.
    expect(parseConsent(saved({ analytics: true, decidedAt: now + 1000 }), now)).toBeNull()
  })
})

describe('Google Analytics helpers', () => {
  it('accepts only GA4 measurement ids', () => {
    expect(measurementId('G-2HCPQYS1MT')).toBe('G-2HCPQYS1MT')
    expect(measurementId(undefined)).toBeNull()
    expect(measurementId('UA-12345-1')).toBeNull()
    expect(measurementId('G-<script>')).toBeNull()
  })

  it('finds the analytics cookies to delete and leaves the rest', () => {
    const cookies = '_ga=GA1.1.1; theme=dark; _ga_2HCPQYS1MT=GS1.1.2; _gid=x; other=1'
    expect(analyticsCookieNames('G-2HCPQYS1MT', cookies)).toEqual(['_ga', '_ga_2HCPQYS1MT'])
  })
})
