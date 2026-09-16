import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // Lo registramos a mano en main.tsx: el que entra por el QR de una
      // clase en vivo no tiene que llevarse un service worker ni 2,5 MB
      // de precache. Ver el comentario ahí.
      injectRegister: null,
      includeAssets: ['vite.svg', 'icons/icon-192.png', 'icons/icon-512.png'],
      manifest: {
        name: 'SMT EstudIA — Aula Municipal',
        short_name: 'SMT EstudIA',
        description: 'Plataforma educativa con IA de la Escuela Municipal Gabriela Mistral. Funciona sin conexión.',
        lang: 'es-AR',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#0F1419',
        theme_color: '#0F1419',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        navigateFallback: '/index.html',
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        // Sin esto, el service worker viejo sigue sirviendo la app anterior
        // hasta que el usuario cierra TODAS las pestañas: se publica una
        // versión nueva y nadie la ve, ni siquiera con Ctrl+Shift+R.
        skipWaiting: true,
        clientsClaim: true,
        cleanupOutdatedCaches: true,
        // Los datos ya vistos quedan disponibles sin conexión:
        runtimeCaching: [
          {
            // Datos (PostgREST): red primero, caché si no hay conexión.
            //
            // Las tablas live_* quedan afuera a propósito: son la clase en
            // vivo, y ahí una respuesta cacheada es peor que ninguna. Con el
            // wifi flojo, el timeout de 5s devolvía el conteo viejo y los
            // números quedaban clavados en la pantalla proyectada mientras
            // la sala seguía votando. Sin regla que matchee, van derecho a
            // la red y si no hay conexión fallan, que es lo correcto acá.
            urlPattern: ({ url }) =>
              url.hostname.endsWith('.supabase.co')
              && url.pathname.startsWith('/rest/v1/')
              && !url.pathname.startsWith('/rest/v1/live_'),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'supabase-rest',
              networkTimeoutSeconds: 5,
              expiration: { maxEntries: 400, maxAgeSeconds: 60 * 60 * 24 * 14 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // Archivos de la biblioteca: caché primero (no cambian)
            urlPattern: ({ url }) => url.hostname.endsWith('.supabase.co') && url.pathname.startsWith('/storage/v1/'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'supabase-storage',
              expiration: { maxEntries: 120, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
  server: {
    host: '0.0.0.0',
  },
})
