import type { AssetSources } from '../assets/assetSource'
import type { BakedModels } from '../models/bakeModels'
import type { BlockRenderData } from '../models/blockEntityRender'
import type { BlockState } from '../types/structure'

export type ModelsWorkerRequest = {
  type: 'bake'
  palette: BlockState[]
  /** Render data per palette index (banner patterns…). */
  data: (BlockRenderData | null)[]
  /** Game files and pack the page keeps in memory (storage refused), or nulls. */
  memory: AssetSources['memory']
}

export type ModelsErrorCode = 'no-assets' | 'bake-failed'

export type ModelsWorkerResponse =
  { type: 'done'; models: BakedModels } | { type: 'error'; code: ModelsErrorCode; message: string }
