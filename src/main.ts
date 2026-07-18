import './lib/polyfills' // must run before any EPUB is parsed (older Safari)
import { mount } from 'svelte'
import './app.css'
import App from './App.svelte'

const target = document.getElementById('app')
if (!target) throw new Error('READ.html: #app mount point missing')

mount(App, { target })
