import { STORAGE_KEYS } from '../constants/storage'
import { readStorage, writeStorage } from '../utils/storage'
import { en } from './locales/en'
import { es } from './locales/es'
import {
  detectLocale,
  isLocale,
  translate,
  type Locale,
  type MessageKey,
  type MessageParams,
  type Messages,
} from './translate'

const MESSAGES: Readonly<Record<Locale, Messages>> = { es, en }

/**
 * Reactive language state.
 *
 * `t()` reads `locale`, so any template or `$derived` that calls it updates
 * automatically when the language changes.
 */
class I18nStore {
  locale = $state<Locale>('es')

  /** Loads the saved language, or detects it from the browser. */
  init(): void {
    const saved = readStorage(STORAGE_KEYS.LOCALE)
    this.locale = isLocale(saved)
      ? saved
      : detectLocale(navigator.languages ?? [navigator.language])
    this.#apply()
  }

  set(locale: Locale): void {
    this.locale = locale
    writeStorage(STORAGE_KEYS.LOCALE, locale)
    this.#apply()
  }

  t = (key: MessageKey, params?: MessageParams): string =>
    translate(MESSAGES[this.locale], key, params)

  #apply(): void {
    document.documentElement.lang = this.locale
  }
}

export const i18n = new I18nStore()
