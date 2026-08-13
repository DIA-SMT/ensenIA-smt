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
  doc.text(`ENSEÑIA · E.M. Gabriela Mistral${subjectName ? ` · ${subjectName}` : ''}`, w / 2, h - 18, { align: 'center' });
}

/** Placas de estudio: una placa por página, formato cuadrado apaisado para leer en el celu. */
export function studyCardsToPdf(cards: StudyCard[], title: string, subjectName?: string): void {
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
