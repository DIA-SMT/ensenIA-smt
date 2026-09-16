import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

/**
 * Service worker: para los que usan la app, no para los que pasan por ella.
 *
 * El modo offline es central para los estudiantes — entran todos los días,
 * muchos sin datos, y necesitan que lo ya visto siga estando. Pero el que
 * escanea el QR de una clase en vivo entra una sola vez, desde el navegador
 * y con los datos que tenga: instalarle un service worker y precachearle
 * ~2,5 MB no le sirve de nada y, con una sala entera escaneando a la vez,
 * es justo el momento en que no querés saturar el wifi.
 *
 * Por eso la ruta /vivo/ queda afuera. El resto de la app lo registra igual.
 */
if ('serviceWorker' in navigator && !location.pathname.startsWith('/vivo/')) {
  window.addEventListener('load', () => {
    // En dev no existe /sw.js: falla y no pasa nada.
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {})
  })
}
