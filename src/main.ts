import { mount } from 'svelte'
import './lib/styles/tokens.css'
import './app.css'
import App from './App.svelte'
import { i18n } from './lib/i18n/i18n.svelte'
import { theme } from './lib/stores/theme.svelte'

// Load saved preferences before the first render.
theme.init()
i18n.init()

const target = document.getElementById('app')
if (!target) throw new Error('Missing #app element in index.html')

const app = mount(App, { target })

export default app
