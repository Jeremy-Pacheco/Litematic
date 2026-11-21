/**
 * Open source projects LitematicViewer is built on, shown in the credits
 * dialog. The full license texts of everything bundled are generated at build
 * time into `licenses.txt` (scripts/third-party-licenses.mjs).
 */
export interface Credit {
  /** Key under `credits.roles` with what the project does here. */
  id: 'deepslate' | 'three' | 'fflate' | 'svelte' | 'minecraftData'
  name: string
  author: string
  license: string
  url: string
}

export const CREDITS: readonly Credit[] = [
  {
    id: 'deepslate',
    name: 'Deepslate',
    author: 'Misode',
    license: 'MIT',
    url: 'https://github.com/misode/deepslate',
  },
  {
    id: 'three',
    name: 'Three.js',
    author: 'mrdoob and contributors',
    license: 'MIT',
    url: 'https://threejs.org',
  },
  {
    id: 'fflate',
    name: 'fflate',
    author: 'Arjun Barrett',
    license: 'MIT',
    url: 'https://github.com/101arrowz/fflate',
  },
  {
    id: 'svelte',
    name: 'Svelte',
    author: 'Svelte contributors',
    license: 'MIT',
    url: 'https://svelte.dev',
  },
  {
    id: 'minecraftData',
    name: 'minecraft-data',
    author: 'PrismarineJS',
    license: 'MIT',
    url: 'https://github.com/PrismarineJS/minecraft-data',
  },
]

export const REPOSITORY_URL = 'https://github.com/Jeremy-Pacheco/Litematic'
