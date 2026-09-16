/**
 * EstudIA — Parser de presentaciones generadas por IA
 *
 * La IA devuelve las diapositivas en Markdown con el formato
 * "Diapositiva N: Título" + bullets + "Nota para el docente: ...".
 * Acá lo convertimos a una estructura navegable para el visor
 * en pantalla y la exportación a PowerPoint.
 */

export interface SlideData {
  title: string;
  bullets: string[];
  note?: string;
}

export interface ParsedPresentation {
  title: string;
  subtitle?: string;
  slides: SlideData[];
}

const SLIDE_HEADER = /^diapositiva\s*(\d+)\s*[:.\-–]\s*(.*)$/i;
const NOTE_PREFIX = /^nota\s+para\s+el\s+docente\s*[:.\-–]\s*/i;

/** Saca marcas de markdown (#, *, >, `, _) dejando el texto plano. */
function stripMd(line: string): string {
  return line
    .replace(/^#{1,6}\s*/, '')
    .replace(/^>\s*/, '')
    .replace(/^[-*•]\s+/, '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/__(.+?)__/g, '$1')
    .replace(/_(.+?)_/g, '$1')
    .replace(/`(.+?)`/g, '$1')
    .trim();
}

/** ¿La línea original era un bullet de lista? */
function isBulletLine(raw: string): boolean {
  return /^\s*[-*•]\s+/.test(raw) || /^\s*[A-D]\)\s+/.test(raw.trim());
}

export function parsePresentation(md: string): ParsedPresentation | null {
  const lines = md.split('\n');
  const slides: SlideData[] = [];
  let current: SlideData | null = null;
  let collectingNote = false;
  let preTitle = '';
  let preSubtitle = '';

  for (const raw of lines) {
    const clean = stripMd(raw);
    if (!clean) {
      collectingNote = false;
      continue;
    }

    const header = clean.match(SLIDE_HEADER);
    if (header) {
      if (current) slides.push(current);
      current = { title: header[2].trim(), bullets: [] };
      collectingNote = false;
      continue;
    }

    if (!current) {
      // Texto antes de la primera diapositiva: título general y subtítulo.
      if (!preTitle) preTitle = clean;
      else if (!preSubtitle) preSubtitle = clean;
      continue;
    }

    if (NOTE_PREFIX.test(clean)) {
      current.note = clean.replace(NOTE_PREFIX, '').trim();
      collectingNote = true;
      continue;
    }

    if (collectingNote && !isBulletLine(raw)) {
      current.note = `${current.note} ${clean}`.trim();
      continue;
    }
    collectingNote = false;

    // La primera línea "suelta" de una diapositiva sin título la usa como título.
    if (!current.title) {
      current.title = clean;
      continue;
    }

    current.bullets.push(clean);
  }
  if (current) slides.push(current);

  if (slides.length < 2) return null;

  return {
    title: preTitle || slides[0].title || 'Presentación',
    subtitle: preSubtitle || undefined,
    slides,
  };
}
