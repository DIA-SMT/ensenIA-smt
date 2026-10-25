/**
 * Juegos para repasar (072): cinco juegos cortos para cualquier materia,
 * todos sobre el mismo banco que arma la IA una sola vez por material.
 *
 *  · Unir: cada término con su definición (sirve para fórmulas también).
 *  · Ordenar: los pasos de un proceso o los hechos en el tiempo.
 *  · Clasificar: cada cosa a su grupo.
 *  · Completar: la frase con la palabra que falta.
 *  · Contrarreloj: verdadero o falso, 60 segundos.
 *
 * Se recuerda de memoria (no se relee): es lo que hace que se aprenda. Cada
 * partida se anota como un intento de práctica con su juego y suma XP y racha.
 */

export type ModoPractica = 'quiz' | 'unir' | 'ordenar' | 'clasificar' | 'completar' | 'contrarreloj';
export type ModoJuego = Exclude<ModoPractica, 'quiz'>;

export interface Par { termino: string; definicion: string }
export interface Secuencia { titulo: string; pasos: string[] }
export interface Clasificacion { titulo: string; grupos: { nombre: string; elementos: string[] }[] }
export interface Completar { frase: string; respuesta: string; distractores: string[] }
export interface VerdaderoFalso { afirmacion: string; verdadera: boolean; explicacion: string }

export interface BancoJuegos {
  pares: Par[];
  secuencias: Secuencia[];
  clasificaciones: Clasificacion[];
  completar: Completar[];
  verdadero_falso: VerdaderoFalso[];
}

export const JUEGOS: { modo: ModoJuego; nombre: string; emoji: string; desc: string }[] = [
  { modo: 'unir', nombre: 'Unir', emoji: '🔗', desc: 'Cada término con lo que significa' },
  { modo: 'ordenar', nombre: 'Ordenar', emoji: '🔢', desc: 'Los pasos o los hechos, en orden' },
  { modo: 'clasificar', nombre: 'Clasificar', emoji: '🗂️', desc: 'Cada cosa a su grupo' },
  { modo: 'completar', nombre: 'Completar', emoji: '✏️', desc: 'La palabra que falta' },
  { modo: 'contrarreloj', nombre: 'Contrarreloj', emoji: '⏱️', desc: 'Verdadero o falso, en 60 segundos' },
];

const lista = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const txt = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' ? v as Record<string, unknown> : {});

/**
 * El banco como llegó de la base, con lo mínimo para no romper la pantalla
 * (el servidor ya lo limpió al armarlo; acá solo se cuida la forma).
 */
export function leerBanco(v: unknown): BancoJuegos | null {
  if (!v || typeof v !== 'object') return null;
  const b = obj(v);
  const banco: BancoJuegos = {
    pares: lista(b.pares).map(obj).map(p => ({ termino: txt(p.termino), definicion: txt(p.definicion) })).filter(p => p.termino && p.definicion),
    secuencias: lista(b.secuencias).map(obj).map(s => ({ titulo: txt(s.titulo), pasos: lista(s.pasos).map(txt).filter(Boolean) })).filter(s => s.pasos.length >= 3),
    clasificaciones: lista(b.clasificaciones).map(obj).map(c => ({
      titulo: txt(c.titulo),
      grupos: lista(c.grupos).map(obj).map(g => ({ nombre: txt(g.nombre), elementos: lista(g.elementos).map(txt).filter(Boolean) })).filter(g => g.nombre && g.elementos.length),
    })).filter(c => c.grupos.length >= 2),
    completar: lista(b.completar).map(obj).map(c => ({ frase: txt(c.frase), respuesta: txt(c.respuesta), distractores: lista(c.distractores).map(txt).filter(Boolean) }))
      .filter(c => c.respuesta && c.frase.includes('___') && c.distractores.length >= 2),
    verdadero_falso: lista(b.verdadero_falso).map(obj).filter(x => typeof x.verdadera === 'boolean')
      .map(x => ({ afirmacion: txt(x.afirmacion), verdadera: x.verdadera === true, explicacion: txt(x.explicacion) })).filter(x => x.afirmacion),
  };
  return banco;
}

/** Qué juegos tienen con qué jugarse en este banco */
export function juegoDisponible(b: BancoJuegos, modo: ModoJuego): boolean {
  switch (modo) {
    case 'unir': return b.pares.length >= 4;
    case 'ordenar': return b.secuencias.length > 0;
    case 'clasificar': return b.clasificaciones.length > 0;
    case 'completar': return b.completar.length >= 3;
    case 'contrarreloj': return b.verdadero_falso.length >= 6;
  }
}

/** Una copia en otro orden (Fisher-Yates) */
export function barajar<T>(items: readonly T[]): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Barajado, pero nunca igual al orden correcto (si no, Ordenar sale resuelto) */
export function desordenar<T>(items: readonly T[]): T[] {
  if (items.length < 2) return [...items];
  for (let i = 0; i < 10; i++) {
    const a = barajar(items);
    if (a.some((x, k) => x !== items[k])) return a;
  }
  return [...items.slice(1), items[0]];
}
