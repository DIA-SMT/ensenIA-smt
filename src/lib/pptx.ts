/**
 * EstudIA — Exportación de presentaciones a PowerPoint (.pptx)
 *
 * Convierte una ParsedPresentation en un archivo .pptx real que el
 * docente puede proyectar o retocar. pptxgenjs se carga bajo demanda
 * (dynamic import) para no engordar el bundle inicial.
 */

import { esPortada, type ParsedPresentation } from './presentation';
import { disenoDe } from './disenos';

const esPregunta = (titulo: string) => /pregunta/i.test(titulo);

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
  // Los mismos colores que en la pantalla (lib/disenos)
  const d = disenoDe(pres.diseno);

  // ── Portada ──
  // La IA casi siempre arma su propia portada como diapositiva 1 (tema y
  // curso). Si la hay, esa ES la portada: antes se sumaba otra encima y la
  // presentación arrancaba con el título dos veces.
  const portadaIA = esPortada(pres.slides[0], pres.title) ? pres.slides[0] : null;
  const contenido = portadaIA ? pres.slides.slice(1) : pres.slides;
  const coverTitle = portadaIA?.title || pres.title;
  const coverSubtitle = (portadaIA && portadaIA.bullets.length > 0 ? portadaIA.bullets.join(' · ') : null)
    ?? pres.subtitle ?? (footerParts || null);

  const cover = pptx.addSlide();
  cover.background = { color: d.portadaFondo };
  cover.addShape('rect', { x: 0, y: 6.9, w: 13.33, h: 0.6, fill: { color: d.acento } });
  cover.addText(coverTitle, {
    x: 0.8, y: 2.2, w: 11.7, h: 2.2,
    fontSize: 40, bold: true, color: d.portadaTexto, align: 'center', valign: 'middle',
  });
  if (coverSubtitle) {
    cover.addText(coverSubtitle, {
      x: 0.8, y: 4.4, w: 11.7, h: 0.8,
      fontSize: 18, color: d.portadaTexto, align: 'center',
    });
  }
  cover.addText('Generado con SMT EstudIA', {
    x: 0.8, y: 6.95, w: 11.7, h: 0.5, fontSize: 12, color: d.portadaFondo === d.acento ? d.portadaTexto : d.portadaFondo, align: 'center',
  });
  if (portadaIA?.note) cover.addNotes(portadaIA.note);

  // ── Diapositivas de contenido ──
  for (const slide of contenido) {
    const s = pptx.addSlide();
    const pregunta = esPregunta(slide.title);
    s.background = { color: pregunta ? d.preguntaFondo : d.fondo };
    s.addShape('rect', { x: 0, y: 0, w: 0.25, h: 7.5, fill: { color: pregunta ? d.preguntaAcento : d.acento } });
    s.addText(slide.title, {
      x: 0.7, y: 0.45, w: 12, h: 1.1,
      fontSize: 30, bold: true, color: pregunta ? d.preguntaTitulo : d.titulo, valign: 'middle',
    });

    if (slide.bullets.length > 0) {
      s.addText(
        slide.bullets.map(b => ({
          text: b,
          options: { bullet: { characterCode: '2022', indent: 18 }, breakLine: true },
        })),
        {
          x: 0.9, y: 1.8, w: 11.6, h: 4.9,
          fontSize: d.id === 'contraste' ? 24 : 20, color: d.cuerpo, valign: 'top', lineSpacingMultiple: 1.35,
        },
      );
    }

    if (footerParts) {
      s.addText(`${footerParts} — SMT EstudIA`, {
        x: 0.7, y: 7.0, w: 12, h: 0.4, fontSize: 10, color: d.pie,
      });
    }

    // La nota para el docente va a las notas del orador de PowerPoint.
    if (slide.note) s.addNotes(slide.note);
  }

  const safeName = pres.title.replace(/[^\p{L}\p{N} _-]/gu, '').trim().slice(0, 60) || 'presentacion';
  await pptx.writeFile({ fileName: `${safeName}.pptx` });
}
