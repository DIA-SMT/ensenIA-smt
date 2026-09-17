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
    // Si ya había uno controlando, esta pestaña se está sirviendo del
    // caché viejo: cuando el nuevo tome el control hay que recargar o
    // seguís viendo la versión anterior aunque el deploy ya esté hecho.
    // Es la diferencia entre "lo arreglé" y "lo arreglé pero no lo ves".
    const habiaViejo = !!navigator.serviceWorker.controller
    let recargado = false

    // En dev no existe /sw.js: falla y no pasa nada.
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {})

    navigator.serviceWorker.addEventListener('controllerchange', () => {
      // En la primera visita no hay nada viejo que descartar, y recargar
      // ahí sería un parpadeo gratis.
      if (!habiaViejo || recargado) return
      recargado = true
      location.reload()
    })
  })
}
