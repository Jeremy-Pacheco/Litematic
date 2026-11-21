const REPLACEMENT = 0xfffd
const CHUNK = 8192

/**
 * Decodes Java "modified UTF-8", the string encoding of NBT.
 *
 * Differences from standard UTF-8 that `TextDecoder` does not handle:
 * - NUL is written as the two bytes `C0 80`.
 * - Characters outside the BMP are written as two 3-byte surrogates (CESU-8).
 *
 * Standard 4-byte sequences are also accepted, since some third-party tools
 * write them. Malformed bytes become U+FFFD instead of failing the whole file.
 */
export function decodeModifiedUtf8(bytes: Uint8Array, start: number, length: number): string {
  const end = start + length

  // Fast path: plain ASCII, by far the most common case (block ids, keys).
  let ascii = true
  for (let i = start; i < end; i++) {
    if (bytes[i] >= 0x80) {
      ascii = false
      break
    }
  }
  if (ascii) return fromCodeUnits(bytes.subarray(start, end))

  const units: number[] = []
  let i = start
  while (i < end) {
    const a = bytes[i]
    if (a < 0x80) {
      units.push(a)
      i += 1
    } else if ((a & 0xe0) === 0xc0 && i + 1 < end && (bytes[i + 1] & 0xc0) === 0x80) {
      units.push(((a & 0x1f) << 6) | (bytes[i + 1] & 0x3f))
      i += 2
    } else if (
      (a & 0xf0) === 0xe0 &&
      i + 2 < end &&
      (bytes[i + 1] & 0xc0) === 0x80 &&
      (bytes[i + 2] & 0xc0) === 0x80
    ) {
      // Also yields lone surrogate halves, which pair up into one character.
      units.push(((a & 0x0f) << 12) | ((bytes[i + 1] & 0x3f) << 6) | (bytes[i + 2] & 0x3f))
      i += 3
    } else if (
      (a & 0xf8) === 0xf0 &&
      i + 3 < end &&
      (bytes[i + 1] & 0xc0) === 0x80 &&
      (bytes[i + 2] & 0xc0) === 0x80 &&
      (bytes[i + 3] & 0xc0) === 0x80
    ) {
      const codePoint =
        ((a & 0x07) << 18) |
        ((bytes[i + 1] & 0x3f) << 12) |
        ((bytes[i + 2] & 0x3f) << 6) |
        (bytes[i + 3] & 0x3f)
      const offset = codePoint - 0x10000
      units.push(0xd800 + (offset >> 10), 0xdc00 + (offset & 0x3ff))
      i += 4
    } else {
      units.push(REPLACEMENT)
      i += 1
    }
  }
  return fromCodeUnits(units)
}

function fromCodeUnits(units: ArrayLike<number>): string {
  let result = ''
  for (let i = 0; i < units.length; i += CHUNK) {
    const slice = Array.prototype.slice.call(units, i, i + CHUNK) as number[]
    result += String.fromCharCode(...slice)
  }
  return result
}
