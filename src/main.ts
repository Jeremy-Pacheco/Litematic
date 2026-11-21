import { mount } from 'svelte'
import './lib/styles/tokens.css'
import './app.css'
import App from './App.svelte'
import { i18n } from './lib/i18n/i18n.svelte'
import { assets } from './lib/stores/assets.svelte'
import { layers } from './lib/stores/layers.svelte'
import { theme } from './lib/stores/theme.svelte'
import { viewer } from './lib/stores/viewer.svelte'

// Load saved preferences before the first render.
theme.init()
i18n.init()
// Restores cached game assets in the background; the app works without them.
void assets.init()
viewer.init()
layers.init()

const target = document.getElementById('app')
if (!target) throw new Error('Missing #app element in index.html')

const app = mount(App, { target })

export default app
