import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

if ('serviceWorker' in navigator) {
  const baseUrl = new URL(import.meta.url)
  const swPath = new URL('../sw.js', baseUrl)
  navigator.serviceWorker.register(swPath.href).catch(() => {
    // Service worker registration failed — the app continues to work from the network.
  })
}
