import { zipSync, type Zippable } from 'fflate'
import { describe, expect, it } from 'vitest'
import { AssetError } from '../../src/lib/assets/errors'
import { isSafeEntryName, isZip, readZip } from '../../src/lib/assets/zipReader'

const text = (s: string) => new TextEncoder().encode(s)
const acceptAll = () => true

function expectCode(fn: () => unknown, code: string): void {
  try {
    fn()
  } catch (error) {
    expect(error).toBeInstanceOf(AssetError)
    expect((error as AssetError).code).toBe(code)
    return
  }
  throw new Error('Expected an AssetError')
}

/** Finds every central-directory and local header and overwrites the uncompressed size. */
function patchDeclaredSize(zip: Uint8Array, size: number): Uint8Array {
  const out = zip.slice()
  const view = new DataView(out.buffer)
  for (let i = 0; i + 4 <= out.length; i++) {
    const signature = view.getUint32(i, true)
    if (signature === 0x02014b50) view.setUint32(i + 24, size, true) // central directory
    if (signature === 0x04034b50) view.setUint32(i + 22, size, true) // local header
  }
  return out
}

describe('isSafeEntryName', () => {
  it('accepts normal relative paths and directories', () => {
    expect(isSafeEntryName('assets/minecraft/textures/block/stone.png')).toBe(true)
    expect(isSafeEntryName('assets/')).toBe(true)
    expect(isSafeEntryName('version.json')).toBe(true)
  })

  it('rejects traversal, absolute and ambiguous paths (Zip Slip)', () => {
    for (const name of [
      '../evil.png',
      'assets/../../evil.png',
      'assets/./x.png',
      '/etc/passwd',
      'C:/Windows/x',
      'c:evil',
      'assets\\..\\evil',
      'assets//x.png',
      'bad\u0000name',
      'tab\tname',
      '',
    ]) {
      expect(isSafeEntryName(name), JSON.stringify(name)).toBe(false)
    }
  })
})

describe('readZip', () => {
  const zip = zipSync({
    'keep/a.json': text('{"a":1}'),
    'keep/b.png': new Uint8Array([1, 2, 3]),
    'skip/c.txt': text('no'),
  })

  it('recognizes ZIP data by its signature', () => {
    expect(isZip(zip)).toBe(true)
    expect(isZip(text('hello'))).toBe(false)
  })

  it('extracts only accepted entries', () => {
    const files = readZip(zip, { accept: (name) => name.startsWith('keep/') })
    expect([...files.keys()].sort()).toEqual(['keep/a.json', 'keep/b.png'])
    expect(new TextDecoder().decode(files.get('keep/a.json'))).toBe('{"a":1}')
  })

  it('rejects data that is not a ZIP', () => {
    expectCode(() => readZip(text('not a zip'), { accept: acceptAll }), 'not-zip')
  })

  it('rejects the whole archive if any entry name is unsafe, even unrequested ones', () => {
    const evil = zipSync({ 'ok.json': text('{}'), '../evil.json': text('{}') } as Zippable)
    expectCode(() => readZip(evil, { accept: (n) => n === 'ok.json' }), 'unsafe-archive')
  })

  it('limits the number of entries', () => {
    const many: Zippable = {}
    for (let i = 0; i < 20; i++) many[`f${i}.json`] = text('{}')
    expectCode(
      () => readZip(zipSync(many), { accept: acceptAll, limits: { maxEntries: 10 } }),
      'too-large',
    )
  })

  it('limits the size of one entry before decompressing it', () => {
    const big = zipSync({ 'big.png': new Uint8Array(2000).fill(7) }, { level: 0 })
    expectCode(
      () => readZip(big, { accept: acceptAll, limits: { maxEntryBytes: 1000 } }),
      'too-large',
    )
  })

  it('rejects ZIP bombs by compression ratio', () => {
    // 4 MB of zeros compresses to a few KB (ratio > 1000:1).
    const bomb = zipSync({ 'bomb.png': new Uint8Array(4 * 1024 * 1024) }, { level: 9 })
    expect(bomb.length).toBeLessThan(10_000)
    expectCode(() => readZip(bomb, { accept: acceptAll }), 'too-large')
  })

  it('limits the total extracted size', () => {
    const files: Zippable = {}
    for (let i = 0; i < 5; i++) files[`f${i}.png`] = new Uint8Array(300).fill(i)
    const archive = zipSync(files, { level: 0 })
    expectCode(
      () => readZip(archive, { accept: acceptAll, limits: { maxTotalBytes: 1000 } }),
      'too-large',
    )
  })

  it('detects entries whose real size differs from the declared one', () => {
    const archive = zipSync({ 'a.json': text('{"lie":"0123456789012345678901234567890"}') })
    const lying = patchDeclaredSize(archive, 5)
    expectCode(() => readZip(lying, { accept: acceptAll }), 'corrupt-zip')
  })

  it('reports truncated archives', () => {
    const archive = zipSync({ 'a.json': text('{"x":1}'.repeat(100)) })
    expectCode(
      () => readZip(archive.subarray(0, archive.length - 30), { accept: acceptAll }),
      'corrupt-zip',
    )
  })

  it('detects altered data with the CRC-32', () => {
    // Stored (uncompressed) entry: the data starts after the 30-byte local header and the name.
    const archive = zipSync({ 'a.json': text('{"x":1}') }, { level: 0 })
    const altered = archive.slice()
    altered[30 + 'a.json'.length + 2] ^= 0x01
    expectCode(() => readZip(altered, { accept: acceptAll }), 'corrupt-zip')
  })
})
