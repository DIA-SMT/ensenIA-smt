/**
 * Juegos de palabras a partir del material: crucigrama y criptograma.
 *
 * La IA solo propone palabras con pistas y una frase clave; el armado es
 * nuestro y determinístico de verificar: una grilla que no cierra o una
 * letra sin número no llegan nunca a la pantalla.
 *
 * Se guardan YA ARMADOS en library_materials.visual: el estudiante no baja
 * ninguna librería, solo estos datos. El armado (con la librería del
 * crucigrama) está aparte, en lib/armarJuegos: lo usa solo el docente.
 */

export interface PalabraPista { respuesta: string; pista: string }

export interface CeldaCrucigrama {
  letra: string;
  /** Número de la palabra que empieza acá (si empieza alguna). */
  numero?: number;
}

export interface PalabraUbicada {
  numero: number;
  respuesta: string;
  pista: string;
  fila: number;     // 0-based
  col: number;      // 0-based
  direccion: 'horizontal' | 'vertical';
}

export interface Crucigrama {
  tipo: 'crucigrama';
  titulo: string;
  filas: number;
  columnas: number;
  /** null = casillero negro (no se usa). */
  celdas: (CeldaCrucigrama | null)[][];
  palabras: PalabraUbicada[];
}

export interface Criptograma {
  tipo: 'criptograma';
  titulo: string;
  /** La frase ya normalizada (mayúsculas, sin tildes, con Ñ). */
  frase: string;
  pista: string;
  /** letra → número */
  clave: Record<string, number>;
  /** Letras que se muestran resueltas de entrada, para poder arrancar. */
  reveladas: string[];
}

export type JuegoPalabras = Crucigrama | Criptograma;

export const ALFABETO = 'ABCDEFGHIJKLMNÑOPQRSTUVWXYZ'.split('');

/** "Vacilación" → "VACILACION"; la Ñ se respeta (es otra letra, no una N con tilde). */
export function normalizarLetras(texto: string): string {
  // Se parte por la Ñ para que el NFD no la desarme en N + virgulilla
  return texto
    .toUpperCase()
    .split('Ñ')
    .map(parte => parte.normalize('NFD').replace(/[̀-ͯ]/g, ''))
    .join('Ñ');
}

/** Solo letras: para respuestas del crucigrama. */
export const soloLetras = (texto: string) => normalizarLetras(texto).replace(/[^A-ZÑ]/g, '');

/** ¿Lo que escribió el estudiante en este casillero está bien? */
export const letraCorrecta = (esperada: string, escrita: string) =>
  soloLetras(escrita).slice(0, 1) === esperada;

/** Valida lo que viene guardado (o de la IA) antes de mostrarlo. */
export function esJuego(v: unknown): v is JuegoPalabras {
  if (!v || typeof v !== 'object') return false;
  const j = v as Partial<JuegoPalabras>;
  if (j.tipo === 'crucigrama') {
    const c = j as Partial<Crucigrama>;
    return Array.isArray(c.celdas) && Array.isArray(c.palabras) && c.palabras.length > 0
      && typeof c.filas === 'number' && typeof c.columnas === 'number';
  }
  if (j.tipo === 'criptograma') {
    const c = j as Partial<Criptograma>;
    return typeof c.frase === 'string' && !!c.clave && typeof c.clave === 'object' && Array.isArray(c.reveladas);
  }
  return false;
}

/** Texto para buscar y para la IA. NO lleva las respuestas: lo pueden ver los chicos. */
export function juegoATexto(j: JuegoPalabras): string {
  if (j.tipo === 'crucigrama') {
    const h = j.palabras.filter(p => p.direccion === 'horizontal').map(p => `${p.numero}. ${p.pista} (${p.respuesta.length})`);
    const v = j.palabras.filter(p => p.direccion === 'vertical').map(p => `${p.numero}. ${p.pista} (${p.respuesta.length})`);
    return [`Crucigrama: ${j.titulo}`, '', 'Horizontales:', ...h, '', 'Verticales:', ...v].join('\n');
  }
  return [`Criptograma: ${j.titulo}`, '', `Pista: ${j.pista}`, 'Cada número es una letra. Descubrí la frase.'].join('\n');
}
