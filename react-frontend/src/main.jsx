import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

// Las pantallas y exceljs/jspdf se descargan por partes (code splitting). Tras un
// deploy, los archivos de la versión anterior dejan de existir: si una pestaña
// abierta desde antes intenta cargar uno, se recarga para tomar la versión nueva.
// Una sola recarga cada 10 s: si el archivo sigue faltando, se muestra el error
// en vez de recargar en bucle.
const CHUNK_RELOAD_KEY = 'chunkReloadAt'
window.addEventListener('vite:preloadError', (event) => {
  try {
    const lastReload = Number(sessionStorage.getItem(CHUNK_RELOAD_KEY) || 0)
    if (Date.now() - lastReload < 10000) return
    sessionStorage.setItem(CHUNK_RELOAD_KEY, String(Date.now()))
  } catch {
    return
  }
  event.preventDefault()
  window.location.reload()
})

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
