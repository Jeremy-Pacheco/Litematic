#!/usr/bin/env node
/**
 * Regenerates src/lib/data/legacyBlocks.json from PrismarineJS/minecraft-data
 * (MIT), pinned to a fixed commit so the output is reproducible.
 *
 * The source maps pre-1.13 numeric block ids ("id:meta") to flattened block
 * state strings. Only the "blocks" section is kept.
 *
 * Usage: node scripts/update-legacy-blocks.mjs
 */
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const COMMIT = '11fed0c9126d8a4f9a72ee4809f66d996f503688'
const SOURCE = `https://raw.githubusercontent.com/PrismarineJS/minecraft-data/${COMMIT}/data/pc/common/legacy.json`
const OUTPUT = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'src',
  'lib',
  'data',
  'legacyBlocks.json',
)

const response = await fetch(SOURCE)
if (!response.ok) throw new Error(`Download failed: HTTP ${response.status}`)
const legacy = await response.json()

const blocks = legacy.blocks
if (!blocks || typeof blocks !== 'object') throw new Error('Unexpected format: no "blocks" section')

// Validate and sort numerically by id, then meta, for stable diffs.
const KEY = /^(\d+):(\d+)$/
const entries = Object.entries(blocks).map(([key, value]) => {
  const match = KEY.exec(key)
  if (!match || typeof value !== 'string') throw new Error(`Unexpected entry ${key}: ${value}`)
  return [Number(match[1]), Number(match[2]), value]
})
entries.sort((a, b) => a[0] - b[0] || a[1] - b[1])

const output = {
  source: `PrismarineJS/minecraft-data@${COMMIT} data/pc/common/legacy.json (MIT)`,
  blocks: Object.fromEntries(entries.map(([id, meta, value]) => [`${id}:${meta}`, value])),
}
writeFileSync(OUTPUT, JSON.stringify(output, null, 0) + '\n')
console.log(`Wrote ${entries.length} block mappings to ${OUTPUT}`)
