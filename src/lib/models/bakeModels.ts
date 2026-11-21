import type { BlockState } from '../types/structure'
import { buildAtlas } from './atlas'
import { bakePalette, collectTextureIds, type BakedState } from './bakeStates'
import type { BlockRenderData } from './blockEntityRender'
import { GameResources } from './gameResources'
import { buildSignFont, decodePngWithCanvas, fontTransferables, type SignFont } from './signFont'

/** Everything the viewer needs to draw a structure's palette. */
export interface BakedModels {
  /** One entry per palette index. */
  states: BakedState[]
  atlas: { size: number; pixels: Uint8ClampedArray }
  /** Block ids without a model (drawn with the missing texture). */
  missingBlocks: string[]
  /** Textures referenced but absent from the game files. */
  missingTextures: string[]
  /** 1 when textures keep their resolution; 2, 4… when they were reduced to fit the atlas. */
  textureScale: number
  /**
   * The game's font for sign text, when the palette has signs and the game
   * files include it (`null` otherwise: the text uses a system font).
   */
  signFont: SignFont | null
  durationMs: number
}

/**
 * Full bake for a palette: find the textures it uses, build the atlas, then
 * bake every state. Runs in the models worker (needs OffscreenCanvas).
 */
export async function bakeModels(
  palette: readonly BlockState[],
  files: ReadonlyMap<string, Uint8Array>,
  data: readonly (BlockRenderData | null)[] = [],
): Promise<BakedModels> {
  const start = performance.now()
  const resources = new GameResources(files)
  const atlas = await buildAtlas(collectTextureIds(palette, resources, data), resources)
  const { states, missingBlocks } = bakePalette(palette, resources, atlas, data)
  // Every kind of sign (standing, wall, hanging) ends in `_sign`.
  const hasSigns = palette.some((state) => state.name.endsWith('_sign'))
  return {
    states,
    atlas: { size: atlas.size, pixels: atlas.pixels },
    missingBlocks,
    missingTextures: atlas.missingTextures,
    textureScale: atlas.scale,
    signFont: hasSigns ? await buildSignFont(files, decodePngWithCanvas) : null,
    durationMs: Math.round(performance.now() - start),
  }
}

/** Buffers to transfer (not copy) when posting baked models between threads. */
export function bakedTransferables(models: BakedModels): ArrayBuffer[] {
  const buffers: ArrayBuffer[] = [
    models.atlas.pixels.buffer as ArrayBuffer,
    ...fontTransferables(models.signFont),
  ]
  for (const state of models.states) {
    const parts = [state.geometry, state.fluidGeometry ?? [], state.fluidFull ?? []]
    for (const groups of parts.flat()) {
      for (const g of groups) {
        if (g) {
          buffers.push(
            g.positions.buffer as ArrayBuffer,
            g.uvs.buffer as ArrayBuffer,
            g.colors.buffer as ArrayBuffer,
            g.normals.buffer as ArrayBuffer,
          )
        }
      }
    }
  }
  return buffers
}
