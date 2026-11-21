const BYTE_UNITS = ['B', 'KB', 'MB', 'GB', 'TB'] as const

/**
 * Formats a byte count as a human-readable size using binary (1024) steps,
 * e.g. `1536` → `"1.5 KB"` (`"1,5 KB"` in Spanish). Used to display imported
 * file sizes.
 *
 * @param bytes Non-negative, finite number of bytes.
 * @param decimals Maximum number of decimals for units above bytes.
 * @param locale BCP 47 locale used for the decimal separator.
 * @throws {RangeError} If `bytes` is negative or not finite.
 */
export function formatBytes(bytes: number, decimals = 1, locale = 'en'): string {
  if (!Number.isFinite(bytes) || bytes < 0) {
    throw new RangeError(`Invalid byte count: ${bytes}`)
  }

  let value = bytes
  let unitIndex = 0
  while (value >= 1024 && unitIndex < BYTE_UNITS.length - 1) {
    value /= 1024
    unitIndex++
  }

  if (unitIndex === 0) return `${value} B`
  const formatted = new Intl.NumberFormat(locale, {
    maximumFractionDigits: decimals,
    useGrouping: false,
  }).format(value)
  return `${formatted} ${BYTE_UNITS[unitIndex]}`
}
