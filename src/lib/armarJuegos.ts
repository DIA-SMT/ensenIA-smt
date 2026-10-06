/**
 * Armado del crucigrama y el criptograma. Solo lo usa el docente al generar:
 * está separado de lib/juegos para que el visor de los estudiantes no baje
 * la librería del crucigrama.
 */

import { generateLayout } from 'crossword-layout-generator';
import {
  ALFABETO, normalizarLetras, soloLetras,
  type CeldaCrucigrama, type Crucigrama, type Criptograma, type PalabraPista, type PalabraUbicada,
} from './juegos';

/** Mezcla con una semilla, para poder probar el armado y repetirlo. */
function mezclar<T>(lista: T[], azar: () => number): T[] {
  const copia = [...lista];
  for (let i = copia.length - 1; i > 0; i--) {
    const j = Math.floor(azar() * (i + 1));
    [copia[i], copia[j]] = [copia[j], copia[i]];
  }
  return copia;
}

/** La librería escribe en consola cada puntaje que calcula: se la silencia. */
function sinRuido<T>(fn: () => T): T {
  const log = console.log;
  console.log = () => {};
  try { return fn(); } finally { console.log = log; }
}

/**
 * Arma el crucigrama. Prueba varios órdenes y se queda con el que ubica más
 * palabras en la grilla más chica. Tira Error si no logra cruzar al menos 4.
 */
export function armarCrucigrama(
  titulo: string,
  propuestas: PalabraPista[],
  azar: () => number = Math.random,
): Crucigrama {
  // Respuestas de 3 a 14 letras, sin repetir
  const vistas = new Set<string>();
  const palabras = propuestas
    .map(p => ({ answer: soloLetras(p.respuesta), clue: p.pista.trim() }))
    .filter(p => p.answer.length >= 3 && p.answer.length <= 14 && p.clue && !vistas.has(p.answer) && vistas.add(p.answer));
  if (palabras.length < 4) throw new Error('Hacen falta al menos 4 palabras para armar el crucigrama.');

  type Resultado = { answer: string; clue: string; startx: number; starty: number; orientation: string };
  let mejor: { rows: number; cols: number; result: Resultado[] } | null = null;
  const puntaje = (l: { rows: number; cols: number; result: Resultado[] }) => {
    const ubicadas = l.result.filter(r => r.orientation !== 'none').length;
    // Más palabras primero; a igualdad, la grilla más cuadrada y chica
    return ubicadas * 1000 - l.rows * l.cols - Math.abs(l.rows - l.cols) * 3;
  };
  for (let intento = 0; intento < 12; intento++) {
    const orden = intento === 0 ? palabras : mezclar(palabras, azar);
    const l = sinRuido(() => generateLayout(orden)) as { rows: number; cols: number; result: Resultado[] };
    if (!mejor || puntaje(l) > puntaje(mejor)) mejor = l;
  }
  const ubicadas = mejor!.result.filter(r => r.orientation === 'across' || r.orientation === 'down');
  if (ubicadas.length < 4) throw new Error('No se pudieron cruzar las palabras. Probá de nuevo.');

  const filas = mejor!.rows;
  const columnas = mejor!.cols;
  const celdas: (CeldaCrucigrama | null)[][] = Array.from({ length: filas }, () => Array<CeldaCrucigrama | null>(columnas).fill(null));

  // Numeración clásica: por casillero de inicio, de arriba hacia abajo y de izquierda a derecha
  const inicios = [...new Set(ubicadas.map(u => `${u.starty - 1},${u.startx - 1}`))]
    .map(k => k.split(',').map(Number) as [number, number])
    .sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const numeroDe = new Map(inicios.map(([f, c], i) => [`${f},${c}`, i + 1]));

  const lista: PalabraUbicada[] = ubicadas.map(u => {
    const fila = u.starty - 1;
    const col = u.startx - 1;
    const direccion = u.orientation === 'across' ? 'horizontal' as const : 'vertical' as const;
    [...u.answer].forEach((letra, i) => {
      const f = direccion === 'horizontal' ? fila : fila + i;
      const c = direccion === 'horizontal' ? col + i : col;
      const previa = celdas[f][c];
      if (previa && previa.letra !== letra) throw new Error('El crucigrama salió inconsistente. Probá de nuevo.');
      celdas[f][c] = { letra, ...(previa?.numero ? { numero: previa.numero } : {}) };
    });
    const numero = numeroDe.get(`${fila},${col}`)!;
    celdas[fila][col] = { ...celdas[fila][col]!, numero };
    return { numero, respuesta: u.answer, pista: u.clue, fila, col, direccion };
  }).sort((a, b) => a.numero - b.numero || (a.direccion === 'horizontal' ? -1 : 1));

  return { tipo: 'crucigrama', titulo, filas, columnas, celdas, palabras: lista };
}

/**
 * Arma el criptograma: cada letra de la frase se cambia por un número. Se
 * revelan de entrada 2 o 3 letras (las más repetidas) para poder empezar.
 */
export function armarCriptograma(
  titulo: string,
  fraseOriginal: string,
  pista: string,
  azar: () => number = Math.random,
): Criptograma {
  const frase = normalizarLetras(fraseOriginal).replace(/\s+/g, ' ').trim();
  const letras = [...frase].filter(c => ALFABETO.includes(c));
  const distintas = [...new Set(letras)];
  if (letras.length < 12 || distintas.length < 6) {
    throw new Error('La frase es muy corta para un criptograma. Probá con otra.');
  }
  if (frase.length > 90) throw new Error('La frase es muy larga para un criptograma. Probá con otra más corta.');

  const numeros = mezclar(ALFABETO.map((_, i) => i + 1), azar);
  const clave: Record<string, number> = {};
  ALFABETO.forEach((l, i) => { clave[l] = numeros[i]; });

  const frecuencia = distintas
    .map(l => ({ l, n: letras.filter(x => x === l).length }))
    .sort((a, b) => b.n - a.n || a.l.localeCompare(b.l));
  const reveladas = frecuencia.slice(0, distintas.length >= 12 ? 3 : 2).map(x => x.l);

  return { tipo: 'criptograma', titulo, frase, pista: pista.trim(), clave, reveladas };
}
