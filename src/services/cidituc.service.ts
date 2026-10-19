/**
 * Ingreso con CiDiTuc, del lado de la app (el servidor está en api/_cidituc.ts).
 *
 * El botón lleva a /api/auth/cidituc/login, que manda a Derivador. A la
 * vuelta, el servidor deja la sesión de EstudIA en una cookie que solo él
 * puede leer y manda a /login?cidituc=listo; acá se la pide UNA vez y se la
 * da a supabase-js: desde ahí es una sesión como cualquier otra.
 */

import { supabase } from '../lib/supabase';
import { marcarEquipoPersonal } from '../lib/equipoPersonal';

export const URL_INGRESO_CIDITUC = '/api/auth/cidituc/login';

/** "Es mi equipo" se marca antes de irse a CiDiTuc y se aplica a la vuelta */
const EQUIPO_KEY = 'estudia_cidituc_equipo';

export function antesDeIrACidituc(equipoPersonal: boolean): void {
  try { sessionStorage.setItem(EQUIPO_KEY, equipoPersonal ? '1' : '0'); } catch { /* sin storage: queda sin marcar */ }
}

/** Lo que el servidor puede contestar en ?cidituc_error= */
const ERRORES: Record<string, string> = {
  estado: 'La solicitud de acceso venció o no coincide. Volvé a tocar "Ingresar con CiDiTuc".',
  token: 'CiDiTuc no confirmó tu ingreso. Volvé a intentar.',
  validacion: 'No pudimos comprobar tu ingreso con CiDiTuc (problema de conexión con la Municipalidad). Probá de nuevo en un rato.',
  no_existe: 'No encontramos tu cuenta en EstudIA. Pedile a la dirección de tu escuela que te dé de alta con tu DNI.',
  superadmin: 'Esta cuenta entra con su usuario y contraseña.',
  servidor: 'No pudimos abrir tu sesión. Probá de nuevo en un rato.',
  config: 'El ingreso con CiDiTuc todavía no está disponible. Entrá con tu usuario y contraseña.',
};

export function mensajeDeErrorCidituc(codigo: string | null): string | null {
  if (!codigo) return null;
  return ERRORES[codigo] ?? ERRORES.servidor;
}

/** Toma la sesión que dejó el servidor y se la da a supabase-js */
export async function tomarSesionCidituc(): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const r = await fetch('/api/auth/cidituc/me?entregar=1', { credentials: 'same-origin', cache: 'no-store' });
    const cuerpo = await r.json().catch(() => null) as {
      sesion?: { access_token: string; refresh_token: string } | null;
    } | null;
    if (!r.ok || !cuerpo?.sesion?.access_token || !cuerpo.sesion.refresh_token) {
      return { ok: false, error: 'El ingreso con CiDiTuc venció antes de terminar. Volvé a intentar.' };
    }
    const { data, error } = await supabase.auth.setSession({
      access_token: cuerpo.sesion.access_token,
      refresh_token: cuerpo.sesion.refresh_token,
    });
    if (error || !data.user) return { ok: false, error: ERRORES.servidor };

    let equipo = false;
    try { equipo = sessionStorage.getItem(EQUIPO_KEY) === '1'; sessionStorage.removeItem(EQUIPO_KEY); } catch { /* noop */ }
    marcarEquipoPersonal(data.user.id, equipo);
    return { ok: true };
  } catch {
    return { ok: false, error: 'Sin conexión. Conectate a una red para entrar.' };
  }
}

/** Al cerrar sesión: que el servidor borre también las cookies de CiDiTuc */
export function cerrarSesionCidituc(): void {
  fetch('/api/auth/cidituc/logout', { method: 'POST', credentials: 'same-origin', keepalive: true })
    .catch(() => { /* sin conexión o sin ingreso con CiDiTuc: no hay nada que borrar */ });
}
