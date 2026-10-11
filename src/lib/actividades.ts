/**
 * Lo común de actividades, trabajos prácticos y evaluaciones de la app
 * (063): los nombres, y las cuentas de puntos por parte que la base
 * también hace (cuidar_actividad, corregir_respuestas).
 */

import type { ActivityQuestion, TipoActividad } from '../types';

export const TIPOS_ACTIVIDAD: Record<TipoActividad, { label: string; corto: string; emoji: string }> = {
  actividad: { label: 'Actividad', corto: 'Actividad', emoji: '💻' },
  tp: { label: 'Trabajo práctico', corto: 'TP', emoji: '📂' },
  evaluacion: { label: 'Evaluación', corto: 'Evaluación', emoji: '📝' },
};

/** Total de una actividad corregida por partes (la base exige que sea entero). */
export const sumaDePuntos = (qs: ActivityQuestion[]) =>
  qs.reduce((s, q) => s + (typeof q.points === 'number' ? q.points : 0), 0);

/** Enteros o con medio punto, de 0 a 100: lo mismo que acepta la base. */
export const puntoValido = (n: number) => Number.isFinite(n) && n >= 0 && n <= 100 && Number.isInteger(n * 2);

/** "2,5" o "2.5" → 2.5; vacío → null; lo que no es número → NaN */
export function leerPuntos(v: string): number | null {
  const t = v.trim().replace(',', '.');
  if (t === '') return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : NaN;
}

export const puntosATexto = (n: number | null | undefined) =>
  n === null || n === undefined ? '' : String(n).replace('.', ',');

/**
 * Un id que no se repite: ni con las partes que están ni con una que se
 * borró recién (si no, la parte nueva heredaría lo tipeado en la vieja).
 */
export function idDeParteNueva(qs: ActivityQuestion[]): string {
  const usados = new Set(qs.map(q => q.id));
  let id = '';
  do { id = `p${Math.random().toString(36).slice(2, 8)}`; } while (usados.has(id));
  return id;
}

/**
 * Reparte un total entre las partes, en enteros y medios puntos, sin pasarse.
 * Las de desarrollo pesan el doble que las de opción múltiple.
 */
export function repartirPuntos(qs: ActivityQuestion[], total = 10): ActivityQuestion[] {
  if (qs.length === 0) return qs;
  const pesos = qs.map(q => (q.type === 'open' ? 2 : 1));
  const sumaPesos = pesos.reduce((a, b) => a + b, 0);
  const crudos = pesos.map(p => Math.floor((p / sumaPesos) * total * 2) / 2);
  let resto = Math.round((total - crudos.reduce((a, b) => a + b, 0)) * 2) / 2;
  // Lo que sobra va de a medio punto, empezando por las de desarrollo
  const orden = qs.map((_, i) => i).sort((a, b) => pesos[b] - pesos[a]);
  for (let k = 0; resto > 0; k = (k + 1) % orden.length) {
    crudos[orden[k]] += 0.5;
    resto -= 0.5;
  }
  return qs.map((q, i) => ({ ...q, points: crudos[i] }));
}

/** Lo tipeado → puntajes válidos; null si alguno está mal (con el número de parte). */
export function leerPuntajes(
  partes: ActivityQuestion[], textos: Record<string, string>,
): { puntajes: Record<string, number>; mala: number | null } {
  const puntajes: Record<string, number> = {};
  for (const [i, q] of partes.entries()) {
    const n = leerPuntos(textos[q.id] ?? '');
    if (n === null) continue;
    const tope = typeof q.points === 'number' ? q.points : 0;
    if (Number.isNaN(n) || n < 0 || n > tope) return { puntajes, mala: i + 1 };
    puntajes[q.id] = n;
  }
  return { puntajes, mala: null };
}

export const sumaPuntajes = (p: Record<string, number>) =>
  Math.round(Object.values(p).reduce((a, b) => a + b, 0) * 100) / 100;

/** ¿Tienen puntaje todas las partes que valen puntos? Recién ahí la suma es la nota. */
export const partesCompletas = (partes: ActivityQuestion[], p: Record<string, number>) =>
  partes.every(q => typeof q.points !== 'number' || typeof p[q.id] === 'number');
