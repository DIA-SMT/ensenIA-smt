/**
 * Generación de PDFs en el navegador (jsPDF).
 * Sin servidores ni costos: el docente descarga e imprime,
 * o lo comparte por WhatsApp con las familias.
 *
 * Nota: las fuentes estándar de jsPDF no renderizan emojis,
 * así que en el PDF se omiten (en la app sí se ven).
 */

import { jsPDF } from 'jspdf';
import type { StudyCard } from '../types';

const BG: [number, number, number] = [15, 20, 25];        // --bg-main
const CARD_BG: [number, number, number] = [28, 35, 51];   // --bg-panel
const CYAN: [number, number, number] = [0, 168, 255];
const TEXT: [number, number, number] = [235, 240, 245];
const SUBTLE: [number, number, number] = [160, 174, 192];

function stripEmoji(s: string): string {
  return s.replace(/[\p{Extended_Pictographic}️‍]/gu, '').replace(/\s+/g, ' ').trim();
}

function footer(doc: jsPDF, w: number, h: number, subjectName?: string) {
  doc.setFontSize(9);
  doc.setTextColor(...SUBTLE);
  doc.text(`SMT EstudIA · E.M. Gabriela Mistral${subjectName ? ` · ${subjectName}` : ''}`, w / 2, h - 18, { align: 'center' });
}

/** Aplana una placa v2 (concept/flashcard/quiz) a título + cuerpo imprimibles. */
function flattenCard(card: StudyCard): { emoji: string; title: string; body: string } {
  const kind = card.type ?? 'concept';
  if (kind === 'flashcard') {
    return {
      emoji: card.emoji ?? '🃏',
      title: card.question ?? '',
      body: `Respuesta: ${card.answer ?? ''}`,
    };
  }
  if (kind === 'quiz') {
    const opts = (card.options ?? []).map((o, i) => `${String.fromCharCode(65 + i)}) ${o}`).join('\n');
    const correcta = String.fromCharCode(65 + (card.correct_index ?? 0));
    return {
      emoji: card.emoji ?? '❓',
      title: card.question ?? '',
      body: `${opts}\n\nCorrecta: ${correcta}. ${card.explanation ?? ''}`,
    };
  }
  return { emoji: card.emoji ?? '💡', title: card.title ?? '', body: card.body ?? '' };
}

/** Placas de estudio: una placa por página, formato cuadrado apaisado para leer en el celu. */
export function studyCardsToPdf(rawCards: StudyCard[], title: string, subjectName?: string): void {
  const cards = rawCards.map(flattenCard);
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: [480, 480] });
  const W = 480, H = 480;

  cards.forEach((card, i) => {
    if (i > 0) doc.addPage([480, 480], 'landscape');

    // fondo
    doc.setFillColor(...BG);
    doc.rect(0, 0, W, H, 'F');
    // tarjeta
    doc.setFillColor(...CARD_BG);
    doc.roundedRect(28, 28, W - 56, H - 56, 14, 14, 'F');
    // acento superior
    doc.setFillColor(...CYAN);
    doc.roundedRect(28, 28, W - 56, 6, 3, 3, 'F');

    // contador
    doc.setFontSize(10);
    doc.setTextColor(...SUBTLE);
    doc.text(`${i + 1} / ${cards.length}`, W - 44, 56, { align: 'right' });

    // título
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(22);
    doc.setTextColor(...CYAN);
    const titleLines = doc.splitTextToSize(stripEmoji(card.title), W - 120);
    doc.text(titleLines, 56, 110);

    // cuerpo
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(14);
    doc.setTextColor(...TEXT);
    const bodyLines = doc.splitTextToSize(card.body, W - 120);
    doc.text(bodyLines, 56, 110 + titleLines.length * 26 + 18, { lineHeightFactor: 1.55 });

    footer(doc, W, H, subjectName);
  });

  doc.save(`placas_${title.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w]+/g, '_').slice(0, 50)}.pdf`);
}

/** Texto largo (resumen IA) → PDF A4 simple y legible. */
export function textToPdf(markdown: string, title: string, subjectName?: string): void {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const margin = 56;
  let y = margin;

  const newPageIfNeeded = (needed: number) => {
    if (y + needed > H - 60) {
      footer(doc, W, H, subjectName);
      doc.addPage();
      y = margin;
    }
  };

  // encabezado
  doc.setFillColor(...CYAN);
  doc.rect(0, 0, W, 6, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.setTextColor(20, 20, 20);
  const titleLines = doc.splitTextToSize(stripEmoji(title), W - margin * 2);
  doc.text(titleLines, margin, y + 10);
  y += 10 + titleLines.length * 22 + 14;

  // cuerpo: markdown simplificado línea por línea
  for (const raw of markdown.split('\n')) {
    const line = raw.trimEnd();
    if (!line.trim()) { y += 8; continue; }

    const heading = line.match(/^(#{1,3})\s+(.*)/);
    const bullet = line.match(/^\s*[-*]\s+(.*)/);
    const clean = (s: string) => stripEmoji(s.replace(/\*\*(.+?)\*\*/g, '$1').replace(/\*(.+?)\*/g, '$1'));

    if (heading) {
      newPageIfNeeded(30);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(14);
      doc.setTextColor(0, 95, 163);
      const ls = doc.splitTextToSize(clean(heading[2]), W - margin * 2);
      y += 10;
      doc.text(ls, margin, y);
      y += ls.length * 18 + 4;
    } else if (bullet) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(11.5);
      doc.setTextColor(40, 40, 40);
      const ls = doc.splitTextToSize(clean(bullet[1]), W - margin * 2 - 16);
      newPageIfNeeded(ls.length * 16);
      doc.circle(margin + 3, y - 3.5, 1.6, 'F');
      doc.text(ls, margin + 14, y, { lineHeightFactor: 1.4 });
      y += ls.length * 16 + 4;
    } else {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(11.5);
      doc.setTextColor(40, 40, 40);
      const ls = doc.splitTextToSize(clean(line), W - margin * 2);
      newPageIfNeeded(ls.length * 16);
      doc.text(ls, margin, y, { lineHeightFactor: 1.4 });
      y += ls.length * 16 + 4;
    }
  }

  footer(doc, W, H, subjectName);
  doc.save(`resumen_${title.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w]+/g, '_').slice(0, 50)}.pdf`);
}

/* ══════════════════════════════════════════════
   Libreta digital e informes (migración 015)
   ══════════════════════════════════════════════ */

export interface LibretaRow {
  student: string;
  t1: string; c1: string; a1: string;   // nota, conducta, inasistencias por trimestre
  t2: string; c2: string; a2: string;
  t3: string; c3: string; a3: string;
  promedio: string;
  estado: string;
}

/**
 * Libreta del curso en una materia: una fila por estudiante con los tres
 * trimestres (nota · conducta · inasistencias), promedio y estado anual.
 */
export function libretaToPdf(
  rows: LibretaRow[],
  opts: { subjectName: string; courseName: string; year: number; teacherName: string },
): void {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 40;

  doc.setFillColor(...BG);
  doc.rect(0, 0, W, H, 'F');

  doc.setTextColor(...CYAN);
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text(`Libreta de calificaciones ${opts.year}`, M, 46);
  doc.setTextColor(...TEXT);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'normal');
  doc.text(`${opts.subjectName} · ${opts.courseName} · Docente: ${opts.teacherName}`, M, 64);
  doc.setTextColor(...SUBTLE);
  doc.setFontSize(8.5);
  doc.text('Escala 1-10, se aprueba con 6. Por trimestre: nota · conducta · inasistencias. Documento de demostración.', M, 78);

  const cols = [
    { key: 'student', label: 'Estudiante', w: 170 },
    { key: 't1', label: '1ºT', w: 40 }, { key: 'c1', label: 'Cond.', w: 42 }, { key: 'a1', label: 'Inas.', w: 40 },
    { key: 't2', label: '2ºT', w: 40 }, { key: 'c2', label: 'Cond.', w: 42 }, { key: 'a2', label: 'Inas.', w: 40 },
    { key: 't3', label: '3ºT', w: 40 }, { key: 'c3', label: 'Cond.', w: 42 }, { key: 'a3', label: 'Inas.', w: 40 },
    { key: 'promedio', label: 'Prom.', w: 48 },
    { key: 'estado', label: 'Estado', w: 90 },
  ] as const;

  let y = 100;
  const rowH = 24;

  const drawHead = () => {
    doc.setFillColor(...CARD_BG);
    doc.rect(M, y, cols.reduce((s, c) => s + c.w, 0), rowH, 'F');
    doc.setTextColor(...CYAN);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    let x = M + 6;
    for (const c of cols) { doc.text(c.label, x, y + 16); x += c.w; }
    y += rowH;
  };

  drawHead();
  doc.setFont('helvetica', 'normal');
  rows.forEach((row, i) => {
    if (y > H - 60) {
      footer(doc, W, H, opts.subjectName);
      doc.addPage('a4', 'landscape');
      doc.setFillColor(...BG);
      doc.rect(0, 0, W, H, 'F');
      y = 50;
      drawHead();
      doc.setFont('helvetica', 'normal');
    }
    if (i % 2 === 1) {
      doc.setFillColor(22, 28, 40);
      doc.rect(M, y, cols.reduce((s, c) => s + c.w, 0), rowH, 'F');
    }
    doc.setFontSize(9.5);
    let x = M + 6;
    for (const c of cols) {
      const v = String(row[c.key] ?? '—');
      doc.setTextColor(...(c.key === 'estado' && v === 'Aprobado' ? [52, 211, 153] as [number, number, number]
        : c.key === 'estado' && v !== '—' && v !== 'Incompleto' ? [251, 191, 36] as [number, number, number]
        : TEXT));
      doc.text(v.slice(0, c.key === 'student' ? 32 : 12), x, y + 16);
      x += c.w;
    }
    y += rowH;
  });

  footer(doc, W, H, opts.subjectName);
  doc.save(`libreta-${opts.courseName.replace(/\s+/g, '')}-${opts.subjectName.replace(/\s+/g, '')}-${opts.year}.pdf`);
}

/**
 * Informe de actividad de un estudiante: resumen numérico + línea de
 * tiempo de todo lo que hizo (por materia o global).
 */
export function informeToPdf(
  studentName: string,
  scope: string,
  stats: { label: string; value: string }[],
  timeline: { date: string; label: string; subjectName: string | null }[],
): void {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 44;

  doc.setFillColor(...BG);
  doc.rect(0, 0, W, H, 'F');

  doc.setTextColor(...CYAN);
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text(`Informe de actividad — ${stripEmoji(studentName)}`, M, 50);
  doc.setTextColor(...SUBTLE);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(`${scope} · generado el ${new Date().toLocaleDateString('es-AR')} · Documento de demostración`, M, 66);

  // Resumen en fila de tarjetas
  let x = M;
  const cardW = (W - M * 2 - (stats.length - 1) * 8) / stats.length;
  for (const s of stats) {
    doc.setFillColor(...CARD_BG);
    doc.roundedRect(x, 82, cardW, 46, 6, 6, 'F');
    doc.setTextColor(...CYAN);
    doc.setFontSize(15);
    doc.setFont('helvetica', 'bold');
    doc.text(s.value, x + cardW / 2, 103, { align: 'center' });
    doc.setTextColor(...SUBTLE);
    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'normal');
    doc.text(stripEmoji(s.label).slice(0, 22), x + cardW / 2, 118, { align: 'center' });
    x += cardW + 8;
  }

  let y = 152;
  doc.setFontSize(9.5);
  for (const ev of timeline) {
    if (y > H - 56) {
      footer(doc, W, H);
      doc.addPage();
      doc.setFillColor(...BG);
      doc.rect(0, 0, W, H, 'F');
      y = 50;
    }
    const d = new Date(ev.date);
    doc.setTextColor(...SUBTLE);
    doc.text(d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' }), M, y);
    doc.setTextColor(...TEXT);
    const label = stripEmoji(`${ev.label}${ev.subjectName ? ` (${ev.subjectName})` : ''}`);
    const lines = doc.splitTextToSize(label, W - M * 2 - 50);
    doc.text(lines[0], M + 46, y);
    y += 15;
  }

  footer(doc, W, H);
  doc.save(`informe-${stripEmoji(studentName).replace(/\s+/g, '-').toLowerCase()}.pdf`);
}
