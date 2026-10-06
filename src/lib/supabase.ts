import { createClient, type Session } from '@supabase/supabase-js';
import type { Database } from '../types/database';
import { haySenial, marcarFallaDeRed, marcarRespuesta } from './conexion';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

/**
 * Los pedidos de datos tienen un tope: con el wifi conectado pero sin
 * internet, el navegador puede esperar minutos antes de rendirse y la
 * pantalla queda girando. Las funciones (la IA tarda) y las subidas de
 * archivos no lo tienen.
 */
const ESPERA_MAXIMA_DATOS_MS = 20_000;

/**
 * Solo en desarrollo: con localStorage.estudia_simular_sin_red = '1' la app
 * hace como si no hubiera internet (para probar el modo sin conexión sin
 * cortar el wifi). En producción no existe.
 */
const simularSinRed = (): boolean => {
  if (!import.meta.env.DEV) return false;
  try { return localStorage.getItem('estudia_simular_sin_red') === '1'; } catch { return false; }
};

async function fetchConSenial(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  if (simularSinRed()) {
    marcarFallaDeRed();
    throw new TypeError('Failed to fetch (sin red simulada)');
  }
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  const metodo = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase();
  // Las lecturas de datos y archivos las puede responder la copia del
  // service worker: que lleguen no prueba que haya señal.
  const puedeSerCopia = metodo === 'GET' && (url.includes('/rest/v1/') || url.includes('/storage/v1/'));
  const conTope = url.includes('/rest/v1/');
  const control = conTope ? new AbortController() : null;
  let vencido = false;
  const timer = control ? setTimeout(() => { vencido = true; control.abort(); }, ESPERA_MAXIMA_DATOS_MS) : undefined;
  // Si quien llama ya trae su propia señal de cancelar, se respeta
  const cancelarDeAfuera = () => control?.abort();
  if (init?.signal?.aborted) cancelarDeAfuera();
  init?.signal?.addEventListener('abort', cancelarDeAfuera, { once: true });
  try {
    const res = await fetch(input, control ? { ...init, signal: control.signal } : init);
    if (!puedeSerCopia) marcarRespuesta();
    return res;
  } catch (err) {
    if (vencido) {
      marcarFallaDeRed();
      throw new TypeError('La red no respondió a tiempo');
    }
    if (err instanceof TypeError) marcarFallaDeRed();
    throw err;
  } finally {
    clearTimeout(timer);
    init?.signal?.removeEventListener('abort', cancelarDeAfuera);
  }
}

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  global: { fetch: fetchConSenial },
});

/**
 * Una pregunta mínima al servidor que nunca sale de la copia guardada:
 * dice si volvió la señal (o si el wifi conectado de verdad tiene salida).
 * Corre al abrir, al volver a la app, cuando el equipo dice que volvió la
 * red y, mientras no haya señal, cada 20 segundos.
 */
async function sondearSenial(): Promise<void> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return;
  if (simularSinRed()) { marcarFallaDeRed(); return; }
  const control = new AbortController();
  const timer = setTimeout(() => control.abort(), 6_000);
  try {
    await fetch(`${supabaseUrl}/auth/v1/health`, {
      headers: { apikey: supabaseAnonKey }, cache: 'no-store', signal: control.signal,
    });
    marcarRespuesta();
  } catch {
    marcarFallaDeRed();
  } finally {
    clearTimeout(timer);
  }
}

if (typeof window !== 'undefined') {
  setTimeout(() => { void sondearSenial(); }, 2_000);
  window.addEventListener('online', () => { void sondearSenial(); });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void sondearSenial();
  });
  setInterval(() => { if (!haySenial()) void sondearSenial(); }, 20_000);
}

/** Donde supabase-js guarda la sesión (su nombre por defecto). */
const CLAVE_SESION = `sb-${new URL(supabaseUrl).hostname.split('.')[0]}-auth-token`;

/**
 * La sesión que quedó guardada en el equipo, sin preguntarle al servidor.
 * supabase-js solo la borra cuando el servidor la rechaza: si sigue acá
 * después de un fallo, el fallo fue de red.
 */
export function sesionGuardada(): Session | null {
  try {
    const s = JSON.parse(localStorage.getItem(CLAVE_SESION) ?? 'null') as Session | null;
    return s?.access_token && s.refresh_token && s.user?.id ? s : null;
  } catch {
    return null;
  }
}

/**
 * Sin señal, la sesión vencida no se puede renovar, y supabase-js lo
 * reintenta unos 25 segundos ANTES de cada pedido: la app quedaba
 * girando aunque tuviera los datos guardados. Sin señal se usa la
 * guardada tal cual (el pedido va a fallar por red igual, y lo responde la
 * copia del service worker); con señal, lo de siempre.
 */
const getSessionDeLaLibreria = supabase.auth.getSession.bind(supabase.auth);
supabase.auth.getSession = (async () => {
  if (!haySenial()) {
    const guardada = sesionGuardada();
    if (guardada) return { data: { session: guardada }, error: null };
  }
  return getSessionDeLaLibreria();
}) as typeof supabase.auth.getSession;
