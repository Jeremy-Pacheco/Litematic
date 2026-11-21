import type { AssetErrorCode } from '../assets/errors'
import type { AssetPhase, LoadedAssets } from '../assets/loadClientJar'

export type AssetsWorkerRequest = { type: 'load-jar'; file: File }

export type AssetsWorkerResponse =
  | { type: 'phase'; phase: AssetPhase }
  | ({ type: 'done' } & LoadedAssets)
  | { type: 'error'; code: AssetErrorCode; message: string }
