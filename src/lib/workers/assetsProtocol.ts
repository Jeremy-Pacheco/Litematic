import type { AssetErrorCode } from '../assets/errors'
import type { AssetPhase, LoadedAssets } from '../assets/loadClientJar'
import type { LoadedPack } from '../assets/loadResourcePack'

export type AssetsWorkerRequest =
  { type: 'load-jar'; file: File } | { type: 'load-pack'; file: File; gameFormat: number | null }

export type AssetsWorkerResponse =
  | { type: 'phase'; phase: AssetPhase }
  | ({ type: 'done' } & LoadedAssets)
  | ({ type: 'pack-done' } & LoadedPack)
  | { type: 'error'; code: AssetErrorCode; message: string }
