/**
 * Las lecturas de texto que están corriendo (un escaneo largo tarda: se lee
 * de a tandas con IA). Viven acá y no en una pantalla: al subir desde un
 * tema la app vuelve al tema y la lectura sigue; Mis materiales y el tema
 * muestran por dónde va, y no se puede arrancar otra del mismo material
 * (pagaría la IA dos veces).
 *
 * Mientras haya alguna, cerrar la pestaña pide confirmación: la lectura
 * corre en esta pestaña y se cortaría.
 */

const enCurso = new Map<string, string>();
const avisos = new Set<() => void>();
let instantanea: ReadonlyMap<string, string> = new Map();

const frenarCierre = (e: BeforeUnloadEvent) => { e.preventDefault(); };

function avisar() {
  instantanea = new Map(enCurso);
  if (enCurso.size > 0) window.addEventListener('beforeunload', frenarCierre);
  else window.removeEventListener('beforeunload', frenarCierre);
  avisos.forEach(fn => fn());
}

/** Empieza una lectura. false si ya había una de ese material. */
export function empezarLectura(materialId: string): boolean {
  if (enCurso.has(materialId)) return false;
  enCurso.set(materialId, 'Leyendo texto...');
  avisar();
  return true;
}

export function avanceDeLectura(materialId: string, mensaje: string) {
  if (!enCurso.has(materialId)) return;
  enCurso.set(materialId, mensaje);
  avisar();
}

export function terminarLectura(materialId: string) {
  if (enCurso.delete(materialId)) avisar();
}

/** Para useSyncExternalStore: material → por dónde va */
export function suscribirLecturas(fn: () => void): () => void {
  avisos.add(fn);
  return () => { avisos.delete(fn); };
}
export const lecturasActuales = (): ReadonlyMap<string, string> => instantanea;
