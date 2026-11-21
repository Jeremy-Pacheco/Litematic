/**
 * Google Analytics 4, loaded **only after the user accepts** analytics
 * cookies. Before that no Google script runs and no cookie is set.
 *
 * - The measurement id comes from `VITE_GA_ID` (set for production builds in
 *   `.env.production`); without it analytics is off and no banner is shown.
 * - Consent Mode v2: everything starts denied; only `analytics_storage` is
 *   granted on acceptance. Ads storage and personalisation stay denied, and
 *   Google signals are off.
 * - Only page views are measured. Nothing about the user's files (names,
 *   contents) is ever sent.
 * - Withdrawing consent denies storage again, disables the tag and deletes
 *   the `_ga` cookies.
 */

type Gtag = (...args: unknown[]) => void

interface AnalyticsWindow {
  dataLayer?: unknown[]
  gtag?: Gtag
  [key: `ga-disable-${string}`]: boolean | undefined
}

const ID_PATTERN = /^G-[A-Z0-9]{4,20}$/

/** The configured measurement id, or `null` when analytics is not set up. */
export function measurementId(raw: string | undefined = import.meta.env.VITE_GA_ID): string | null {
  return raw && ID_PATTERN.test(raw) ? raw : null
}

let loaded = false

function analyticsWindow(): AnalyticsWindow {
  return window as unknown as AnalyticsWindow
}

/** Loads the tag (once) and grants analytics storage. */
export function enableAnalytics(id: string): void {
  const w = analyticsWindow()
  w[`ga-disable-${id}`] = false
  if (!loaded) {
    loaded = true
    w.dataLayer = w.dataLayer ?? []
    // gtag must push the `arguments` object itself, as Google's snippet does.
    w.gtag = function gtag() {
      // eslint-disable-next-line prefer-rest-params
      w.dataLayer!.push(arguments)
    }
    w.gtag('consent', 'default', {
      ad_storage: 'denied',
      ad_user_data: 'denied',
      ad_personalization: 'denied',
      analytics_storage: 'denied',
    })
    w.gtag('consent', 'update', { analytics_storage: 'granted' })
    w.gtag('js', new Date())
    w.gtag('config', id, {
      allow_google_signals: false,
      allow_ad_personalization_signals: false,
    })
    const script = document.createElement('script')
    script.async = true
    script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`
    document.head.append(script)
  } else {
    w.gtag?.('consent', 'update', { analytics_storage: 'granted' })
  }
}

/** Stops measuring and deletes the analytics cookies. */
export function disableAnalytics(id: string): void {
  const w = analyticsWindow()
  w[`ga-disable-${id}`] = true
  w.gtag?.('consent', 'update', { analytics_storage: 'denied' })
  deleteAnalyticsCookies(id)
}

/** Names of the cookies GA4 sets for a measurement id. */
export function analyticsCookieNames(id: string, cookieHeader: string): string[] {
  const own = `_ga_${id.replace(/^G-/, '')}`
  return cookieHeader
    .split(';')
    .map((part) => part.split('=')[0].trim())
    .filter((name) => name === '_ga' || name === own || name.startsWith('_ga_'))
}

function deleteAnalyticsCookies(id: string): void {
  const host = location.hostname
  // GA sets them on the top-level domain the page can write (.example.com).
  const parts = host.split('.')
  const domains = new Set([host, `.${host}`])
  for (let i = 1; i < parts.length - 1; i++) domains.add(`.${parts.slice(i).join('.')}`)
  for (const name of analyticsCookieNames(id, document.cookie)) {
    for (const domain of domains) {
      document.cookie = `${name}=; Max-Age=0; path=/; domain=${domain}`
    }
    document.cookie = `${name}=; Max-Age=0; path=/`
  }
}
