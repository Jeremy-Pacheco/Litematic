#!/usr/bin/env node
/**
 * Writes dist/licenses.txt with the license of every third-party package
 * that ends up in the published app, as their licenses (MIT, BSD…) require.
 *
 * The list is not maintained by hand: the build runs with hidden source maps,
 * this script reads which packages the bundled code comes from, writes their
 * notices, and deletes the source maps so they are not published. Data that
 * is not an npm package (the legacy block table) is added from its own notice.
 *
 * Fails when a bundled package has no license information, so the app is
 * never published without a notice.
 *
 * Usage (after `vite build --sourcemap hidden`): node scripts/third-party-licenses.mjs
 */
import { existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = process.cwd()
const DIST = join(ROOT, 'dist')
const ASSETS = join(DIST, 'assets')

/** Data bundled without being an npm dependency. */
const EXTRA = [
  {
    name: 'minecraft-data (legacy block table)',
    version: 'see src/lib/data/legacyBlocks.json',
    license: 'MIT',
    source: 'https://github.com/PrismarineJS/minecraft-data',
    text: readFileSync(join(ROOT, 'src/lib/data/LICENSE-minecraft-data.txt'), 'utf8'),
  },
]

function bundledPackages() {
  const maps = readdirSync(ASSETS).filter((f) => f.endsWith('.map'))
  if (maps.length === 0)
    throw new Error('No source maps in dist/assets: build with --sourcemap hidden')
  const names = new Set()
  for (const map of maps) {
    const { sources = [] } = JSON.parse(readFileSync(join(ASSETS, map), 'utf8'))
    for (const source of sources) {
      // …/node_modules/.pnpm/<pkg>@<v>/node_modules/<name>/… or …/node_modules/<name>/…
      const match = /node_modules\/(?!\.pnpm\/)((?:@[^/]+\/)?[^/]+)\//.exec(
        source.replaceAll('\\', '/').replace(/^.*node_modules\/\.pnpm\/[^/]+\//, ''),
      )
      if (match) names.add(match[1])
    }
  }
  return { names: [...names].sort(), maps }
}

function packageDir(name) {
  for (const dir of [
    join(ROOT, 'node_modules', name),
    join(ROOT, 'node_modules/.pnpm/node_modules', name),
  ]) {
    if (existsSync(join(dir, 'package.json'))) return dir
  }
  throw new Error(`Cannot find the package directory of ${name}`)
}

function describe(name) {
  const dir = packageDir(name)
  const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'))
  const file = readdirSync(dir).find((f) => /^(licen[cs]e|copying)(\..*)?$/i.test(f))
  const license = typeof pkg.license === 'string' ? pkg.license : pkg.license?.type
  if (!file && !license) throw new Error(`${name} has no license information`)
  const repo = typeof pkg.repository === 'string' ? pkg.repository : pkg.repository?.url
  return {
    name,
    version: pkg.version,
    license: license ?? 'see text',
    source: (pkg.homepage ?? repo ?? '').replace(/^git\+/, ''),
    text: file
      ? readFileSync(join(dir, file), 'utf8')
      : `License: ${license} (the package ships no license file).`,
  }
}

const { names, maps } = bundledPackages()
const entries = [...names.map(describe), ...EXTRA]
const rule = '-'.repeat(78)
const body = entries
  .map((e) => {
    const head = [rule, `${e.name} ${e.version}`, `License: ${e.license}`]
    if (e.source) head.push(`Source: ${e.source}`)
    return [...head, '', e.text.trim()].join('\n')
  })
  .join('\n\n')

writeFileSync(
  join(DIST, 'licenses.txt'),
  `LitematicViewer — third-party software\n\nLitematicViewer includes the following open source software. Their licenses\nrequire their copyright notices to be kept with copies of the software.\n\n${body}\n`,
)
for (const map of maps) rmSync(join(ASSETS, map))
console.log(
  `licenses.txt: ${entries.length} entries (${names.join(', ')}); ${maps.length} source maps removed`,
)
