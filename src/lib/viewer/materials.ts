import {
  DataTexture,
  DoubleSide,
  MeshBasicMaterial,
  NearestFilter,
  RGBAFormat,
  SRGBColorSpace,
  type Material,
} from 'three'
import { RenderLayer } from '../models/renderLayer'

/**
 * Atlas texture as Minecraft shows it: nearest-neighbour sampling (crisp
 * pixels), no mipmaps (they would blend neighbouring textures of the atlas).
 * UVs have v pointing down, matching the pixel rows, so no flip is needed.
 */
export function createAtlasTexture(pixels: Uint8ClampedArray, size: number): DataTexture {
  const texture = new DataTexture(pixels, size, size, RGBAFormat)
  texture.magFilter = NearestFilter
  texture.minFilter = NearestFilter
  texture.generateMipmaps = false
  texture.flipY = false
  texture.colorSpace = SRGBColorSpace
  texture.needsUpdate = true
  return texture
}

/**
 * One material per render layer. Lighting is baked into vertex colors
 * (Minecraft's fixed per-face shading and biome tints), so the materials are
 * unlit and cheap. Faces are double-sided because some models (cross plants,
 * panes) are meant to be seen from both sides.
 */
export function createLayerMaterials(texture: DataTexture): Material[] {
  const base = { map: texture, vertexColors: true, side: DoubleSide } as const
  const materials: Material[] = []
  materials[RenderLayer.Opaque] = new MeshBasicMaterial({ ...base })
  materials[RenderLayer.Cutout] = new MeshBasicMaterial({ ...base, alphaTest: 0.5 })
  materials[RenderLayer.Translucent] = new MeshBasicMaterial({
    ...base,
    transparent: true,
    depthWrite: false,
    // Three draws transparent double-sided materials twice (back, then front)
    // by default; water and stained glass do not need it.
    forceSinglePass: true,
  })
  return materials
}

/** Draw order: opaque, then cutout, then translucent. */
export const LAYER_RENDER_ORDER: Readonly<Record<RenderLayer, number>> = {
  [RenderLayer.Opaque]: 0,
  [RenderLayer.Cutout]: 1,
  [RenderLayer.Translucent]: 2,
}
