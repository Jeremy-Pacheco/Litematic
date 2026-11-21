import type { PackMeta } from '../assets/assetCache'
import type { AssetErrorCode } from '../assets/errors'
import type { AssetPhase, LoadedAssets } from '../assets/loadClientJar'

export type AssetsWorkerRequest =
  { type: 'load-jar'; file: File } | { type: 'load-pack'; file: File; gameFormat: number | null }

export type AssetsWorkerResponse =
  | { type: 'phase'; phase: AssetPhase }
  | ({ type: 'done' } & LoadedAssets)
  | { type: 'pack-done'; meta: PackMeta }
  | { type: 'error'; code: AssetErrorCode; message: string }
