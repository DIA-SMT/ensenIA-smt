import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { iniciar, volver, quienSoy, salir, leerConfig } from './api/_cidituc'

/**
 * Ingreso con CiDiTuc en desarrollo: las mismas cuatro piezas que en Vercel
 * (api/auth/cidituc/*), servidas por Vite con el mismo código. Lee las
 * variables CIDITUC_* del .env.local (ver .env.example).
 */
function ingresoCiditucEnDesarrollo(mode: string): Plugin {
  return {
    name: 'estudia-cidituc-desarrollo',
    apply: 'serve',
    configureServer(server) {
      const config = leerConfig(loadEnv(mode, process.cwd(), ''))
      server.middlewares.use((req, res, next) => {
        const ruta = (req.url ?? '').split('?')[0]
        if (ruta === '/api/auth/cidituc/login') return iniciar(req, res, config)
        if (ruta === '/auth/cidituc/callback' || ruta === '/api/auth/cidituc/callback') return void volver(req, res, config)
        if (ruta === '/api/auth/cidituc/me') return quienSoy(req, res, config)
        if (ruta === '/api/auth/cidituc/logout') return salir(req, res)
        next()
      })
    },
  }
}

/**
 * Las reglas de la copia sin conexión reconocen el servidor de datos por su
 * dirección. Workbox copia cada regla tal cual adentro del service worker,
 * así que no pueden leer variables: se arma al compilar una expresión fija
 * con el servidor de VITE_SUPABASE_URL (Supabase Cloud o el propio).
 */
function servidorDeDatos(mode: string): string {
  const url = loadEnv(mode, process.cwd(), 'VITE_').VITE_SUPABASE_URL
  const escapar = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  // Sin la variable (no debería pasar al compilar): cualquier proyecto de Supabase Cloud
  return url ? escapar(new URL(url).origin) : 'https://[^/]+\\.supabase\\.co'
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const datos = servidorDeDatos(mode)
  return {
    plugins: [
      react(),
      ingresoCiditucEnDesarrollo(mode),
      VitePWA({
        registerType: 'autoUpdate',
        // Lo registramos a mano en main.tsx: el que entra por el QR de una
        // clase en vivo no tiene que llevarse un service worker ni 2,5 MB
        // de precache. Ver el comentario ahí.
        injectRegister: null,
        includeAssets: [
          'favicon-32.png', 'favicon-96.png', 'apple-touch-icon.png',
          'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png',
          // Los logos de la interfaz (menú, barra, login): sin conexión también
          'isologo.png', 'Logo_SMT_blanco.png',
        ],
        manifest: {
          name: 'SMT EstudIA',
          short_name: 'SMT EstudIA',
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
            // El maskable es su propio archivo: Android recorta los bordes, y
            // reusar el normal le comía las puntas de las hojas del isologo.
            { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          ],
        },
        workbox: {
          navigateFallback: '/index.html',
          // El ingreso con CiDiTuc es del servidor: si el service worker
          // contestara con la app, la vuelta de Derivador nunca llegaría.
          // Y el servidor de datos, que desde el 26/10/2026 también se sirve por
          // este dominio (la red de la Muni no resuelve sslip.io): abrir un
          // archivo de la biblioteca en otra pestaña tiene que traer el archivo.
          navigateFallbackDenylist: [/^\/api\//, /^\/auth\/cidituc\//, /^\/(auth|rest|storage|functions)\/v1\//],
          // Que tome el control de la página ya en la primera visita: si no,
          // lo que se baja en esa visita no queda guardado para usar sin conexión.
          // Con skipWaiting, una versión nueva se activa sin esperar a que se
          // cierren TODAS las pestañas.
          clientsClaim: true,
          skipWaiting: true,
          cleanupOutdatedCaches: true,
          // Al instalarse, el service worker baja SOLO el armazón: la entrada,
          // su CSS y las librerías base. Cada pantalla se baja cuando se abre
          // y queda guardada para usarla sin conexión.
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
              //
              // Las tablas live_* quedan afuera a propósito: son la clase en
              // vivo, y ahí una respuesta cacheada es peor que ninguna. Con el
              // wifi flojo, el timeout de 5s devolvía el conteo viejo y los
              // números quedaban clavados en la pantalla proyectada mientras
              // la sala seguía votando. Sin regla que matchee, van derecho a
              // la red y si no hay conexión fallan, que es lo correcto acá.
              urlPattern: new RegExp(`^${datos}/rest/v1/(?!live_)`),
              handler: 'NetworkFirst',
              options: {
                cacheName: 'supabase-rest',
                networkTimeoutSeconds: 5,
                // "Preparar para el aula" baja varios cientos de respuestas (fichas de
                // todos los alumnos): con 400 se pisaban unas a otras.
                expiration: { maxEntries: 1500, maxAgeSeconds: 60 * 60 * 24 * 14 },
                cacheableResponse: { statuses: [0, 200] },
              },
            },
            // Archivos de la biblioteca. Se piden con un link firmado que trae un
            // token distinto cada vez: se buscan IGNORANDO el token
            // (ignoreSearch), si no la copia guardada no coincidía nunca y sin
            // señal no se veía ninguna imagen. Sin señal, la app pide la
            // dirección sin token (documents.service → urlSinFirma).
            {
              // El podcast se puede rehacer con la misma ruta: red primero,
              // la copia solo sin conexión.
              urlPattern: new RegExp(`^${datos}/storage/v1/[^?]*/podcasts/`),
              handler: 'NetworkFirst',
              options: {
                cacheName: 'supabase-podcasts',
                networkTimeoutSeconds: 6,
                matchOptions: { ignoreSearch: true },
                expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 30 },
                cacheableResponse: { statuses: [0, 200] },
              },
            },
            {
              // El resto (imágenes de láminas, diagramas, PDF) lleva un nombre
              // al azar y no cambia: caché primero.
              urlPattern: new RegExp(`^${datos}/storage/v1/`),
              handler: 'CacheFirst',
              options: {
                cacheName: 'supabase-storage',
                matchOptions: { ignoreSearch: true },
                // "Preparar para el aula" baja las imágenes de todos los mazos, y
                // el estudiante, las de todas sus materias (sin-senial.service):
                // con 250 se desalojaba lo que se acababa de bajar
                expiration: { maxEntries: 500, maxAgeSeconds: 60 * 60 * 24 * 30 },
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
  }
})
