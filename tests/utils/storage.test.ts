import { describe, expect, it } from 'vitest'
import { readStorage, writeStorage } from '../../src/lib/utils/storage'

/** In-memory Storage implementation for tests. */
function memoryStorage(): Storage {
  const data = new Map<string, string>()
  return {
    get length() {
      return data.size
    },
    clear: () => data.clear(),
    getItem: (key) => data.get(key) ?? null,
    key: (index) => [...data.keys()][index] ?? null,
    removeItem: (key) => void data.delete(key),
    setItem: (key, value) => void data.set(key, value),
  }
}

/** Storage that throws on every access, like blocked site data. */
function brokenStorage(): Storage {
  const fail = () => {
    throw new DOMException('Access denied', 'SecurityError')
  }
  return { length: 0, clear: fail, getItem: fail, key: fail, removeItem: fail, setItem: fail }
}

describe('storage', () => {
  it('writes and reads values', () => {
    const storage = memoryStorage()
    expect(writeStorage('k', 'v', storage)).toBe(true)
    expect(readStorage('k', storage)).toBe('v')
  })

  it('returns null for missing keys', () => {
    expect(readStorage('missing', memoryStorage())).toBeNull()
  })

  it('does not throw when storage fails', () => {
    const storage = brokenStorage()
    expect(readStorage('k', storage)).toBeNull()
    expect(writeStorage('k', 'v', storage)).toBe(false)
  })

  it('handles unavailable storage', () => {
    expect(readStorage('k', null)).toBeNull()
    expect(writeStorage('k', 'v', null)).toBe(false)
  })
})
