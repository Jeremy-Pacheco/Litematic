/**
 * Reasons a game assets archive cannot be loaded. Each code has a translated
 * message (`assets.errors.<code>`).
 */
export const ASSET_ERROR_CODES = [
  'not-zip',
  'corrupt-zip',
  'unsafe-archive',
  'too-large',
  'not-client-jar',
  'not-resource-pack',
  'storage-failed',
  'read-failed',
  'cancelled',
] as const

export type AssetErrorCode = (typeof ASSET_ERROR_CODES)[number]

export class AssetError extends Error {
  readonly code: AssetErrorCode

  constructor(code: AssetErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options)
    this.name = 'AssetError'
    this.code = code
  }
}

/** Normalizes anything thrown while loading assets into an `AssetError`. */
export function toAssetError(error: unknown): AssetError {
  if (error instanceof AssetError) return error
  if (error instanceof DOMException && error.name === 'AbortError') {
    return new AssetError('cancelled', 'Loading was cancelled', { cause: error })
  }
  const message = error instanceof Error ? error.message : String(error)
  return new AssetError('read-failed', message, { cause: error })
}
