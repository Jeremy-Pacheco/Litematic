/**
 * Reasons a structure file cannot be read. Each code has a translated message
 * in the i18n files (`import.errors.<code>`).
 */
export const STRUCTURE_ERROR_CODES = [
  'unrecognized-data',
  'corrupt-compression',
  'too-large',
  'invalid-nbt',
  'unknown-format',
  'out-of-memory',
  'read-failed',
  'cancelled',
] as const

export type StructureErrorCode = (typeof STRUCTURE_ERROR_CODES)[number]

export class StructureReadError extends Error {
  readonly code: StructureErrorCode

  constructor(code: StructureErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options)
    this.name = 'StructureReadError'
    this.code = code
  }
}

export function isStructureErrorCode(value: unknown): value is StructureErrorCode {
  return typeof value === 'string' && (STRUCTURE_ERROR_CODES as readonly string[]).includes(value)
}

/**
 * Normalizes anything thrown while reading into a `StructureReadError`, so the
 * UI always receives a known code. Failed allocations surface as `RangeError`
 * ("Array buffer allocation failed", "Invalid array length").
 */
export function toStructureReadError(error: unknown): StructureReadError {
  if (error instanceof StructureReadError) return error
  if (error instanceof DOMException && error.name === 'AbortError') {
    return new StructureReadError('cancelled', 'Reading was cancelled', { cause: error })
  }
  if (error instanceof RangeError && /alloc|array length|memory/i.test(error.message)) {
    return new StructureReadError('out-of-memory', error.message, { cause: error })
  }
  const message = error instanceof Error ? error.message : String(error)
  return new StructureReadError('read-failed', message, { cause: error })
}
