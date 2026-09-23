import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'inline',
      includeAssets: ['vite.svg', 'icons/icon-192.png', 'icons/icon-512.png'],
      manifest: {
        name: 'SMT EstudIA',
        short_name: 'EstudIA',
        description: 'Plataforma educativa de las escuelas municipales de San Miguel de Tucumán. Funciona sin conexión.',
        lang: 'es-AR',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#FFFFFF',
        theme_color: '#FFFFFF',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        navigateFallback: '/index.html',
        // Que tome el control de la página ya en la primera visita: si no,
        // lo que se baja en esa visita no queda guardado para usar sin conexión.
        clientsClaim: true,
        skipWaiting: true,
        // Al instalarse, el service worker baja SOLO el armazón: la entrada,
        // su CSS y las librerías base. Antes precargaba todo (2,3 MB), incluido
        // el generador de PDF y el lector de Word, que un estudiante no usa
        // nunca. Cada pantalla se baja cuando se abre (o cuando la app la
        // anticipa según el rol) y queda guardada para usarla sin conexión.
        globPatterns: [
          'index.html', '*.svg', 'icons/*.png',
          'assets/entry-*.js', 'assets/index-*.css', 'assets/vendor-*.js',
        ],
        runtimeCaching: [
          {
            // Pantallas y librerías bajo demanda: los nombres llevan hash,
            // no cambian nunca, así que la copia local alcanza.
            urlPattern: ({ url, sameOrigin }) => sameOrigin && url.pathname.startsWith('/assets/'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'app-pantallas',
              expiration: { maxEntries: 150, maxAgeSeconds: 60 * 60 * 24 * 60 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // Datos (PostgREST): red primero, caché si no hay conexión.
            // Se borra al cerrar sesión y cuando entra otra persona en el
            // mismo dispositivo (ver AuthContext).
            urlPattern: ({ url }) => url.hostname.endsWith('.supabase.co') && url.pathname.startsWith('/rest/v1/'),
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
  build: {
    rollupOptions: {
      output: {
        // Nombres estables para que el precache sepa qué es armazón.
        entryFileNames: 'assets/entry-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        // React y Supabase cambian poco: en su propio archivo, el navegador
        // los conserva entre versiones de la app.
        manualChunks(id) {
          if (/node_modules[\\/](react|react-dom|react-router|react-router-dom|scheduler)[\\/]/.test(id)) return 'vendor-react';
          if (/node_modules[\\/]@supabase[\\/]/.test(id)) return 'vendor-supabase';
          return undefined;
        },
      },
    },
  },
  server: {
    host: '0.0.0.0',
    // Respetar PORT si viene del entorno: permite levantar el dev server
    // en otro puerto cuando el 5173 está ocupado.
    ...(process.env.PORT ? { port: Number(process.env.PORT) } : {}),
  },
})
