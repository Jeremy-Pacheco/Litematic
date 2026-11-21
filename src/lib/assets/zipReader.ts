import { unzipSync, type UnzipFileInfo } from 'fflate'
import { AssetError } from './errors'

/**
 * Safe extraction of selected entries from an untrusted ZIP archive (client
 * jars now, resource packs later).
 *
 * Nothing is written to disk, but entry names become lookup keys, so they are
 * validated anyway (no `..`, absolute paths, backslashes or control
 * characters). Size limits are enforced on the declared sizes **before**
 * decompressing, and the real size is checked afterwards, so a ZIP bomb cannot
 * make the browser allocate unbounded memory.
 */

export interface ZipLimits {
  /** Maximum number of entries in the archive (all of them, not only extracted). */
  maxEntries: number
  /** Maximum uncompressed size of one extracted entry. */
  maxEntryBytes: number
  /** Maximum uncompressed size of all extracted entries together. */
  maxTotalBytes: number
  /** Maximum uncompressed/compressed ratio of one extracted entry. */
  maxRatio: number
}

export const DEFAULT_ZIP_LIMITS: Readonly<ZipLimits> = {
  maxEntries: 100_000,
  maxEntryBytes: 16 * 1024 * 1024,
  maxTotalBytes: 256 * 1024 * 1024,
  maxRatio: 100,
}

export interface ZipReadOptions {
  /** Decides which entries are decompressed. Directories are never passed. */
  accept: (name: string) => boolean
  limits?: Partial<ZipLimits>
}

/** True if the data starts with a ZIP local file header (`PK\x03\x04`). */
export function isZip(data: Uint8Array): boolean {
  return (
    data.length >= 4 && data[0] === 0x50 && data[1] === 0x4b && data[2] === 0x03 && data[3] === 0x04
  )
}

/**
 * Checks an entry name: relative, forward slashes, no empty, `.` or `..`
 * segments, no control characters.
 */
export function isSafeEntryName(name: string): boolean {
  if (name.length === 0 || name.length > 512) return false
  if (name.startsWith('/') || name.includes('\\') || /^[a-zA-Z]:/.test(name)) return false
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(name)) return false
  const segments = name.endsWith('/') ? name.slice(0, -1).split('/') : name.split('/')
  return segments.every((s) => s !== '' && s !== '.' && s !== '..')
}

/**
 * Extracts the accepted entries.
 *
 * @throws {AssetError} `not-zip`, `unsafe-archive`, `too-large`, `corrupt-zip`.
 */
export function readZip(data: Uint8Array, options: ZipReadOptions): Map<string, Uint8Array> {
  if (!isZip(data)) throw new AssetError('not-zip', 'The file is not a ZIP archive')
  const limits = { ...DEFAULT_ZIP_LIMITS, ...options.limits }

  let entries = 0
  let totalBytes = 0
  const declared = new Map<string, number>()

  const filter = (file: UnzipFileInfo): boolean => {
    entries++
    if (entries > limits.maxEntries) {
      throw new AssetError('too-large', `More than ${limits.maxEntries} entries`)
    }
    if (!isSafeEntryName(file.name)) {
      throw new AssetError('unsafe-archive', `Unsafe entry name: ${JSON.stringify(file.name)}`)
    }
    if (file.name.endsWith('/') || !options.accept(file.name)) return false

    if (file.originalSize > limits.maxEntryBytes) {
      throw new AssetError('too-large', `${file.name} is larger than ${limits.maxEntryBytes} bytes`)
    }
    if (file.size > 0 && file.originalSize / file.size > limits.maxRatio) {
      throw new AssetError('too-large', `${file.name} has a suspicious compression ratio`)
    }
    totalBytes += file.originalSize
    if (totalBytes > limits.maxTotalBytes) {
      throw new AssetError('too-large', `Extracted data exceeds ${limits.maxTotalBytes} bytes`)
    }
    declared.set(file.name, file.originalSize)
    return true
  }

  let files: Record<string, Uint8Array>
  try {
    files = unzipSync(data, { filter })
  } catch (error) {
    if (error instanceof AssetError) throw error
    throw new AssetError('corrupt-zip', 'The archive is damaged or uses an unsupported format', {
      cause: error,
    })
  }

  // fflate decompresses into a buffer of the declared size and silently
  // truncates larger content, so integrity is checked with the CRC-32 stored
  // in the central directory (this also catches corrupted data).
  const crcs = readCentralCrcs(data)
  const result = new Map<string, Uint8Array>()
  for (const [name, content] of Object.entries(files)) {
    if (content.length !== declared.get(name) || crc32(content) !== crcs.get(name)) {
      throw new AssetError('corrupt-zip', `${name} is damaged or its declared size is wrong`)
    }
    result.set(name, content)
  }
  return result
}

/** Entry name → CRC-32, read from the central directory. */
function readCentralCrcs(data: Uint8Array): Map<string, number> {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength)
  let eocd = -1
  for (let i = data.length - 22; i >= Math.max(0, data.length - 22 - 0xffff); i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i
      break
    }
  }
  if (eocd < 0) throw new AssetError('corrupt-zip', 'End of central directory not found')
  const count = view.getUint16(eocd + 10, true)
  let offset = view.getUint32(eocd + 16, true)
  const crcs = new Map<string, number>()
  for (let i = 0; i < count; i++) {
    if (offset + 46 > data.length || view.getUint32(offset, true) !== 0x02014b50) {
      throw new AssetError('corrupt-zip', 'Invalid central directory')
    }
    const flags = view.getUint16(offset + 8, true)
    const crc = view.getUint32(offset + 16, true)
    const nameLength = view.getUint16(offset + 28, true)
    const extraLength = view.getUint16(offset + 30, true)
    const commentLength = view.getUint16(offset + 32, true)
    const nameBytes = data.subarray(offset + 46, offset + 46 + nameLength)
    // Same decoding as fflate: UTF-8 when flag bit 11 is set, Latin-1 otherwise.
    const name =
      flags & 0x800 ? new TextDecoder().decode(nameBytes) : String.fromCharCode(...nameBytes)
    crcs.set(name, crc)
    offset += 46 + nameLength + extraLength + commentLength
  }
  return crcs
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  return table
})()

/** CRC-32 (ZIP polynomial). */
export function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff
  for (let i = 0; i < bytes.length; i++) crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}
