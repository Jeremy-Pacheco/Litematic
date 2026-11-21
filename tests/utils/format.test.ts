import { describe, expect, it } from 'vitest'
import { formatBytes } from '../../src/lib/utils/format'

describe('formatBytes', () => {
  it('keeps plain bytes without decimals', () => {
    expect(formatBytes(0)).toBe('0 B')
    expect(formatBytes(1023)).toBe('1023 B')
  })

  it('uses binary steps between units', () => {
    expect(formatBytes(1024)).toBe('1 KB')
    expect(formatBytes(1536)).toBe('1.5 KB')
    expect(formatBytes(5 * 1024 ** 2)).toBe('5 MB')
    expect(formatBytes(3.25 * 1024 ** 3, 2)).toBe('3.25 GB')
  })

  it('caps at the largest unit', () => {
    expect(formatBytes(2048 * 1024 ** 4)).toBe('2048 TB')
  })

  it('uses the decimal separator of the locale', () => {
    expect(formatBytes(1536, 1, 'es')).toBe('1,5 KB')
    expect(formatBytes(1536, 1, 'en')).toBe('1.5 KB')
  })

  it('never adds thousands separators', () => {
    expect(formatBytes(2048 * 1024 ** 4, 1, 'es')).toBe('2048 TB')
  })

  it('rejects invalid input', () => {
    expect(() => formatBytes(-1)).toThrow(RangeError)
    expect(() => formatBytes(Number.NaN)).toThrow(RangeError)
    expect(() => formatBytes(Number.POSITIVE_INFINITY)).toThrow(RangeError)
  })
})
