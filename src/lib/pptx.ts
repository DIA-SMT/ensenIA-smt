/**
 * EstudIA — Exportación de presentaciones a PowerPoint (.pptx)
 *
 * Convierte una ParsedPresentation en un archivo .pptx real que el
 * docente puede proyectar o retocar. pptxgenjs se carga bajo demanda
 * (dynamic import) para no engordar el bundle inicial.
 */

import type { ParsedPresentation } from './presentation';

const INDIGO = '4F46E5';
const DARK = '1E1B2E';
const GRAY = '6B7280';
const LIGHT = 'F8F7FC';

export async function exportPresentationPptx(
  pres: ParsedPresentation,
  opts: { subjectName?: string; courseName?: string; teacherName?: string } = {},
): Promise<void> {
  const { default: PptxGenJS } = await import('pptxgenjs');
  const pptx = new PptxGenJS();

  pptx.defineLayout({ name: 'WIDE', width: 13.33, height: 7.5 });
  pptx.layout = 'WIDE';
  pptx.author = opts.teacherName ?? 'SMT EstudIA';
  pptx.title = pres.title;

  const footerParts = [opts.subjectName, opts.courseName].filter(Boolean).join(' · ');

  // ── Portada ──
  const cover = pptx.addSlide();
  cover.background = { color: DARK };
  cover.addShape('rect', { x: 0, y: 6.9, w: 13.33, h: 0.6, fill: { color: INDIGO } });
  cover.addText(pres.title, {
    x: 0.8, y: 2.2, w: 11.7, h: 2.2,
    fontSize: 40, bold: true, color: 'FFFFFF', align: 'center', valign: 'middle',
  });
  if (pres.subtitle || footerParts) {
    cover.addText(pres.subtitle ?? footerParts, {
      x: 0.8, y: 4.4, w: 11.7, h: 0.8,
      fontSize: 18, color: 'C7C3E0', align: 'center',
    });
  }
  cover.addText('Generado con SMT EstudIA', {
    x: 0.8, y: 6.95, w: 11.7, h: 0.5, fontSize: 12, color: 'FFFFFF', align: 'center',
  });

  // ── Diapositivas de contenido ──
  for (const slide of pres.slides) {
    const s = pptx.addSlide();
    s.background = { color: LIGHT };
    s.addShape('rect', { x: 0, y: 0, w: 0.25, h: 7.5, fill: { color: INDIGO } });
    s.addText(slide.title, {
      x: 0.7, y: 0.45, w: 12, h: 1.1,
      fontSize: 30, bold: true, color: DARK, valign: 'middle',
    });

    if (slide.bullets.length > 0) {
      s.addText(
        slide.bullets.map(b => ({
          text: b,
          options: { bullet: { characterCode: '2022', indent: 18 }, breakLine: true },
        })),
        {
          x: 0.9, y: 1.8, w: 11.6, h: 4.9,
          fontSize: 20, color: '374151', valign: 'top', lineSpacingMultiple: 1.35,
        },
      );
    }

    if (footerParts) {
      s.addText(`${footerParts} — SMT EstudIA`, {
        x: 0.7, y: 7.0, w: 12, h: 0.4, fontSize: 10, color: GRAY,
      });
    }

    // La nota para el docente va a las notas del orador de PowerPoint.
    if (slide.note) s.addNotes(slide.note);
  }

  const safeName = pres.title.replace(/[^\p{L}\p{N} _-]/gu, '').trim().slice(0, 60) || 'presentacion';
  await pptx.writeFile({ fileName: `${safeName}.pptx` });
}
