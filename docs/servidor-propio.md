# Servidor propio: cómo se trabaja después de la mudanza

El backend de SMT EstudIA (base de datos, cuentas, archivos y las funciones de
`supabase/functions`) pasa de Supabase Cloud a un **Supabase propio** en un
servidor del equipo. La app (las pantallas) sigue en Vercel, igual que hoy.

> La dirección del servidor y cómo entrar están en una guía privada: pedísela
> a Matías. **Nada de eso va en este repo**, que es público: ni direcciones de
> servidores, ni claves, ni archivos `.env` (están ignorados).

## Qué cambia y qué no

| | Hasta el corte | Después del corte |
|---|---|---|
| Pantallas (React) | push → merge a `main` → Vercel | **igual** |
| SQL / migraciones | SQL Editor de Supabase Cloud | `bin/correr-sql` en el servidor (o se lo pasás a Matías). **El SQL Editor de Cloud ya no sirve:** lo que se corra ahí no le llega a la app |
| Funciones | `supabase functions deploy` | `bin/desplegar-funciones` con la carpeta `supabase/functions` del repo. **Se despliega lo que está en `main`** |
| Claves de las funciones | Secrets de Supabase Cloud | un archivo solo en el servidor |
| Ver tablas | Dashboard de Supabase | Studio del servidor, por túnel SSH |

## Reglas

- **Las migraciones siguen en `supabase/migrations`**, numeradas, con su consulta
  de verificación al final. Se corren a mano, como siempre.
- **Todo lo que se despliega sale del repo.** Una función que esté desplegada
  pero no subida al repo se pierde en el próximo despliegue.
- **El día del corte nadie corre SQL ni despliega funciones** hasta que se avise
  que terminó: el corte copia todo de Cloud en ese momento.

## Detalles técnicos (para quien mantenga el servidor)

- Supabase self-hosted con Docker *rootless* (sin tocar el firewall del
  servidor, que es compartido), recortado a lo que usa la app: base, auth,
  rest, storage, funciones y la puerta de entrada. Sin realtime ni imgproxy.
- La app no tiene escrita la dirección de Supabase: sale de `VITE_SUPABASE_URL`,
  también para el modo sin conexión (ver `vite.config.ts`). La sesión se guarda
  con un nombre fijo (`src/lib/supabase.ts`), así un cambio de servidor no deja
  a nadie afuera.
- Para probar la app contra el servidor propio: `npm run dev -- --mode vps`
  (lee `.env.vps.local`, que no va al repo).
- La copia de Cloud al servidor propio se ensayó entera: los permisos tienen
  que quedar **idénticos** a los de Cloud. Una restauración común deja permisos
  de más (los "default privileges" del Supabase nuevo), y el procedimiento del
  corte los corrige y lo comprueba con una huella antes de seguir.
