/**
 * ¿Hay señal de verdad?
 *
 * navigator.onLine dice si el equipo está conectado a una red, no si esa
 * red tiene internet: con el wifi de la escuela conectado pero sin salida
 * sigue en true, y la app se quedaba esperando para siempre. Acá se suma
 * lo que ven los pedidos al servidor (lib/supabase.ts): si uno falla por
 * red o no responde a tiempo, quedamos "sin señal" hasta que otro
 * responda. Los pedidos se siguen haciendo igual: así se nota cuando vuelve.
 */

let fallaDeRed = false;
const oyentes = new Set<() => void>();

const avisar = () => oyentes.forEach(o => o());

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => { fallaDeRed = false; avisar(); });
  window.addEventListener('offline', avisar);
}

export function haySenial(): boolean {
  return (typeof navigator === 'undefined' || navigator.onLine) && !fallaDeRed;
}

/** Un pedido falló por red o no respondió a tiempo. */
export function marcarFallaDeRed(): void {
  if (fallaDeRed) return;
  fallaDeRed = true;
  avisar();
}

/** Un pedido tuvo respuesta del servidor (aunque sea un error): hay señal. */
export function marcarRespuesta(): void {
  if (!fallaDeRed) return;
  fallaDeRed = false;
  avisar();
}

export function suscribirConexion(oyente: () => void): () => void {
  oyentes.add(oyente);
  return () => { oyentes.delete(oyente); };
}

/**
 * ¿Este error es por falta de señal (y conviene guardar para después) o
 * lo rechazó el servidor? Los errores de Supabase llegan de varias formas:
 * TypeError del navegador, el objeto de PostgREST ("TypeError: Failed to
 * fetch", status 0) o un Error nuestro con ese mensaje adentro.
 */
export function esErrorDeRed(err: unknown): boolean {
  if (!haySenial()) return true;
  if (err instanceof TypeError) return true;
  const e = err as { name?: string; message?: string; pgError?: { message?: string } } | null;
  if (e?.name === 'AuthRetryableFetchError' || e?.name === 'AbortError') return true;
  const msg = `${e?.message ?? ''} ${e?.pgError?.message ?? ''}`.toLowerCase();
  return /failed to fetch|networkerror|load failed|network request failed|no respondió a tiempo|typeerror/.test(msg);
}
