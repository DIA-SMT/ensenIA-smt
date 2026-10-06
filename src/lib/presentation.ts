/**
 * EstudIA — Parser de presentaciones generadas por IA
 *
 * La IA devuelve las diapositivas en Markdown. Hay dos formatos en uso, y
 * la IA además se toma libertades, así que se aceptan los dos con variantes:
 *
 *   ## Diapositiva 1: Título            **Diapositiva 1: (Título)**
 *   - punto                             - punto
 *   > Nota para el docente: ...         - *Nota para el docente: ...*
 *
 * (también "### Diapositiva 1 — Título", "**Diapositiva 1:** Título",
 * "Diapositiva 1" con el título en la línea siguiente, separadores "---",
 * "Notas para el docente", "Nota:", etc.)
 *
 * Acá lo convertimos a una estructura navegable para el visor en pantalla,
 * la clase en vivo y la exportación a PowerPoint.
 */

import type { LibraryMaterial } from '../types';
import { disenoEnTexto, type DisenoId } from './disenos';

export interface SlideData {
  title: string;
  bullets: string[];
  note?: string;
  /** La IA la marcó como portada ("Portada", "Título: ..."). */
  portada?: boolean;
}

export interface ParsedPresentation {
  title: string;
  subtitle?: string;
  slides: SlideData[];
  /** Diseño visual elegido por el docente (marca "<!-- diseño: x -->" en el texto). */
  diseno?: DisenoId;
}

/** Etiqueta con la que se guardan las diapositivas en la biblioteca. */
export const TAG_PRESENTACION = 'presentacion';

// "Diapositiva 3: Título", "Diapositiva 3 — Título", "Diapositiva 3" (sin título),
// "🎬 Diapositiva 3. Título", "Slide 3: Título".
const SLIDE_HEADER = /^(?:[^\p{L}\p{N}]{0,4}\s*)?(?:diapositiva|slide|l[aá]mina)\s*(?:n[°º.]?\s*)?(\d{1,2})\s*(?:[:.\-–—)|]\s*(.*)|\((.*)\)\s*)?$/iu;
const NOTE_PREFIX = /^(?:[^\p{L}]{0,4}\s*)?notas?(?:\s+(?:para|del|de\s+la|al)\s+(?:el\s+|la\s+)?(?:docente|profe(?:sor(?:a)?)?|orador(?:a)?))?(?:\s*\([^)]*\))?\s*[:.\-–—]\s*/iu;
const HR = /^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/;
// Cercos de código: la línea "```" no es contenido
const CERCO = /^\s*(?:```|~~~)/;
// Una portada con nombre genérico: "Portada", "Título", "Diapositiva de título"…
const PORTADA = /^(?:portada|car[aá]tula|t[ií]tulo(?:\s+de\s+la\s+presentaci[oó]n)?|diapositiva\s+de\s+t[ií]tulo|presentaci[oó]n|inicio)$/i;
const PORTADA_CON_TITULO = /^(?:portada|car[aá]tula|t[ií]tulo)\s*[:\-–—]\s*(.+)$/i;

/** Saca marcas de markdown (#, *, >, `, _) dejando el texto plano. */
function stripMd(line: string): string {
  return line
    .trim()
    .replace(/^#{1,6}\s*/, '')
    .replace(/^>\s*/, '')
    .replace(/^[-*•+]\s+/, '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/__(.+?)__/g, '$1')
    .replace(/(^|\s)_(.+?)_(?=\s|$|[.,;:!?])/g, '$1$2')
    .replace(/`(.+?)`/g, '$1')
    // Asteriscos sueltos que quedan de una negrita cortada ("**Diapositiva 1:** ...")
    .replace(/^\*+\s*|\s*\*+$/g, '')
    .trim();
}

/** "(Título)" → "Título"; saca puntuación de los bordes. */
function limpiarTitulo(t: string): string {
  let s = t.trim().replace(/^[:.\-–—]\s*/, '').trim();
  if (/^\(.*\)$/.test(s)) s = s.slice(1, -1).trim();
  if (/^\[.*\]$/.test(s)) s = s.slice(1, -1).trim();
  return s.replace(/[:\s]+$/, '').trim();
}

const normalizar = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

interface Analisis {
  pres: ParsedPresentation | null;
  /** Líneas con texto antes de la primera diapositiva. */
  preambulo: number;
}

function analizar(mdOriginal: string): Analisis {
  // Los comentarios HTML (la marca del diseño) no son contenido
  const md = mdOriginal.replace(/<!--[\s\S]*?-->/g, '');
  const lines = md.replace(/\r\n?/g, '\n').split('\n');
  const slides: SlideData[] = [];
  let current: SlideData | null = null;
  let collectingNote = false;
  // Tras un "---" sin diapositiva nueva detrás: suele ser el cierre de la IA
  // ("¿Querés que ajuste algo?"), que no va dentro de la última diapositiva.
  let trasSeparador = false;
  let encabezadoPrevio = '';
  const preambulo: string[] = [];

  for (const raw of lines) {
    if (CERCO.test(raw)) continue;
    if (HR.test(raw)) {
      collectingNote = false;
      if (current) trasSeparador = true;
      continue;
    }
    const clean = stripMd(raw);
    if (!clean) {
      collectingNote = false;
      continue;
    }

    const header = clean.match(SLIDE_HEADER);
    if (header) {
      if (current) slides.push(current);
      current = { title: limpiarTitulo(header[2] ?? header[3] ?? ''), bullets: [] };
      collectingNote = false;
      trasSeparador = false;
      continue;
    }

    if (!current) {
      // Texto antes de la primera diapositiva: título general y subtítulo.
      preambulo.push(clean);
      if (!encabezadoPrevio && /^\s*#{1,3}\s/.test(raw)) encabezadoPrevio = clean;
      continue;
    }
    if (trasSeparador) continue;

    if (NOTE_PREFIX.test(clean)) {
      const nota = clean.replace(NOTE_PREFIX, '').trim();
      current.note = current.note ? `${current.note} ${nota}`.trim() : nota;
      collectingNote = true;
      continue;
    }

    const esBullet = /^\s*([-*•+]|\d+[.)]|[A-Da-d]\))\s+/.test(raw);
    if (collectingNote && !esBullet) {
      current.note = `${current.note} ${clean}`.trim();
      continue;
    }
    collectingNote = false;

    // La primera línea "suelta" de una diapositiva sin título la usa como título.
    if (!current.title) {
      current.title = limpiarTitulo(clean);
      continue;
    }

    current.bullets.push(clean);
  }
  if (current) slides.push(current);

  // Diapositivas vacías (un "Diapositiva 4" sin nada): no suman
  const utiles = slides.filter(s => s.title || s.bullets.length > 0);
  utiles.forEach((s, i) => {
    const conTitulo = s.title.match(PORTADA_CON_TITULO);
    if (conTitulo) {
      s.title = limpiarTitulo(conTitulo[1]);
      if (i === 0) s.portada = true;
    } else if (PORTADA.test(s.title) && s.bullets.length > 0) {
      // "Diapositiva 1: Portada" + "- Los volcanes": el título es la primera línea
      s.title = s.bullets.shift() ?? s.title;
      if (i === 0) s.portada = true;
    }
    if (!s.title) s.title = s.bullets.shift() ?? '';
  });
  if (utiles.length < 2) return { pres: null, preambulo: preambulo.length };

  // Título del mazo: el encabezado de antes de las diapositivas; si no hay,
  // el de la primera diapositiva.
  const primera = utiles[0];
  const title = encabezadoPrevio || primera.title || 'Presentación';
  const subtitulo = encabezadoPrevio ? preambulo.find(l => l !== encabezadoPrevio && l.length <= 120) : undefined;

  return {
    pres: { title: title.replace(/^presentaci[oó]n\s*:\s*/i, '').trim() || title, subtitle: subtitulo, slides: utiles },
    preambulo: preambulo.length,
  };
}

export function parsePresentation(md: string): ParsedPresentation | null {
  if (!md) return null;
  const pres = analizar(md).pres;
  if (!pres) return null;
  const diseno = disenoEnTexto(md);
  return diseno ? { ...pres, diseno } : pres;
}

/**
 * ¿La primera diapositiva es la portada? (la que pone la IA con el tema y el
 * curso). Sirve para no sumar otra portada encima al exportar.
 */
export function esPortada(slide: SlideData | undefined, deckTitle: string): boolean {
  if (!slide) return false;
  if (slide.portada || PORTADA.test(slide.title)) return true;
  // Una diapositiva con contenido no es una portada, aunque se llame parecido
  if (slide.bullets.length > 3) return false;
  const t = normalizar(slide.title);
  const d = normalizar(deckTitle);
  return Boolean(t) && (t === d || (slide.bullets.length <= 2 && d.length > 3 && (t.includes(d) || d.includes(t))));
}

type MaterialConTexto = Pick<LibraryMaterial, 'tags' | 'extractedText'>;

/**
 * ¿El material son diapositivas? Las guardadas desde el Laboratorio llevan
 * la etiqueta; las demás (o las que llegan sin etiquetas, como en la clase
 * en vivo) se reconocen si el texto se lee como diapositivas y no es un
 * documento largo que tiene unas diapositivas en el medio.
 */
export function esPresentacion(material: MaterialConTexto | null | undefined): boolean {
  return deckDe(material) !== null;
}

/** Las diapositivas del material, o null si no es una presentación. */
export function deckDe(material: MaterialConTexto | null | undefined): ParsedPresentation | null {
  const texto = material?.extractedText;
  if (!texto) return null;
  // Atajo barato: un PDF largo sin "Diapositiva N" no se analiza entero
  if (!/(?:diapositiva|slide|l[aá]mina)\s*(?:n[°º.]?\s*)?\d/i.test(texto)) return null;
  const { pres, preambulo } = analizar(texto);
  if (!pres) return null;
  const diseno = disenoEnTexto(texto);
  const conDiseno = diseno ? { ...pres, diseno } : pres;
  if ((material.tags ?? []).includes(TAG_PRESENTACION)) return conDiseno;
  // Sin etiqueta: poco texto antes de la primera diapositiva y al menos tres
  return preambulo <= 3 && pres.slides.length >= 3 ? conDiseno : null;
}
