/**
 * SMT EstudIA — Pantallas bajo demanda
 *
 * Antes, abrir la app bajaba el código de TODAS las pantallas de TODOS los
 * roles: un estudiante con datos prepagos se llevaba el tablero de dirección,
 * el laboratorio de IA y el generador de PDF. Ahora cada pantalla es un
 * archivo aparte que se baja cuando se abre.
 *
 * Para que igual funcione sin conexión, apenas entra alguien la app anticipa
 * las pantallas de SU rol (ver `anticipar`), salvo en modo ahorro de datos.
 * El service worker las guarda y quedan disponibles offline.
 */

import { lazy, type ComponentType, type LazyExoticComponent } from 'react';

type Cargador = () => Promise<{ default: ComponentType }>;

const CLAVE_RECARGA = 'estudia_recarga_pantalla';

/**
 * Si se publicó una versión nueva mientras la app estaba abierta, el archivo
 * viejo de la pantalla ya no existe en el servidor. Recargar una vez trae la
 * versión nueva; si vuelve a fallar enseguida, el error sube y lo muestra el
 * límite de errores de la pantalla.
 */
function conReintento(cargar: Cargador): Cargador {
  return async () => {
    try {
      return await cargar();
    } catch (err) {
      let ultima = 0;
      try { ultima = Number(sessionStorage.getItem(CLAVE_RECARGA) ?? 0); } catch { /* sin storage */ }
      if (navigator.onLine && Date.now() - ultima > 15_000) {
        try { sessionStorage.setItem(CLAVE_RECARGA, String(Date.now())); } catch { /* sin storage */ }
        window.location.reload();
        return new Promise<never>(() => { /* la página se recarga */ });
      }
      throw err;
    }
  };
}

/** Una entrada por ruta. La clave es el path tal como figura en el router. */
export const cargadores = {
  '/dashboard':           () => import('../pages/Dashboard'),
  '/alerts':              () => import('../pages/Alerts'),
  '/settings':            () => import('../pages/Settings'),
  '/migue':               () => import('../pages/Migue'),
  '/agenda':              () => import('../pages/Agenda'),
  '/ia-lab':              () => import('../pages/IALab'),
  '/actividad-rapida':    () => import('../pages/ActividadRapida'),
  '/students':            () => import('../pages/Students'),
  '/biblioteca':          () => import('../pages/Biblioteca'),
  '/actividades':         () => import('../pages/Actividades'),
  '/actividades/:id':     () => import('../pages/ActividadDetalle'),
  '/libreta':             () => import('../pages/Libreta'),
  '/familias':            () => import('../pages/Familias'),
  '/comunicados-familia': () => import('../pages/ComunicadosFamilia'),
  '/mis-hijos':           () => import('../pages/MisHijos'),
  '/mis-actividades':     () => import('../pages/MisActividades'),
  '/mis-actividades/:id': () => import('../pages/RealizarActividad'),
  '/estudiar':            () => import('../pages/Estudiar'),
  '/mi-biblioteca':       () => import('../pages/MiBiblioteca'),
  '/vocacional':          () => import('../pages/Vocacional'),
  '/docentes':            () => import('../pages/Docentes'),
  '/cursos/:id':          () => import('../pages/CourseDetail'),
  '/comunicaciones':      () => import('../pages/Comunicaciones'),
  '/normativa':           () => import('../pages/Normativa'),
} satisfies Record<string, Cargador>;

export type RutaPantalla = keyof typeof cargadores;

export const Pantalla = Object.fromEntries(
  Object.entries(cargadores).map(([ruta, cargar]) => [ruta, lazy(conReintento(cargar))]),
) as Record<RutaPantalla, LazyExoticComponent<ComponentType>>;

const yaAnticipadas = new Set<RutaPantalla>();

/**
 * Baja en segundo plano las pantallas indicadas, de a una y cuando el
 * navegador está libre, para que después se abran al instante y funcionen
 * sin conexión. No hace nada con las que ya se bajaron.
 */
export function anticipar(rutas: RutaPantalla[]): void {
  const pendientes = rutas.filter(r => !yaAnticipadas.has(r));
  const cuandoHayaTiempo: (fn: () => void) => void =
    'requestIdleCallback' in window
      ? fn => window.requestIdleCallback(() => fn(), { timeout: 4000 })
      : fn => setTimeout(fn, 1200);

  const siguiente = () => {
    const ruta = pendientes.shift();
    if (!ruta) return;
    yaAnticipadas.add(ruta);
    cargadores[ruta]().catch(() => yaAnticipadas.delete(ruta)).finally(() => cuandoHayaTiempo(siguiente));
  };
  cuandoHayaTiempo(siguiente);
}
