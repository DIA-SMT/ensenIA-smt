/**
 * SMT EstudIA — El mazo estructurado a PowerPoint
 *
 * Dos diferencias con lib/pptx.ts, que exporta el formato viejo:
 *
 * 1. Dibuja las seis láminas. El exportador anterior solo sabía hacer
 *    título + viñetas, así que un mazo entero salía con la misma forma
 *    doce veces. Acá un "destacado" ocupa la lámina, "dos-columnas" se ve
 *    como dos columnas y la pregunta se lee como pregunta.
 *
 * 2. Usa plantillas maestras (defineSlideMaster) en vez de cajas de texto
 *    sueltas. Un .pptx armado con cajas absolutas es editable, pero si el
 *    docente le cambia el tema en PowerPoint el texto no se reacomoda:
 *    quedan los cuadros donde estaban, con los colores viejos. Con
 *    maestras se comporta como una plantilla nativa.
 *
 * El archivo es nuevo a propósito: lib/pptx.ts sigue intacto para los
 * mazos en formato viejo.
 */

import type PptxGenJS from 'pptxgenjs';
import { disenoDe } from './disenos';
import type { Diseno } from './disenos';
import type { Mazo, Diapositiva } from './diapositivas';
import { getSignedUrl } from '../services/documents.service';

/** 16:9 en pulgadas, la medida que entiende pptxgenjs. */
const ANCHO = 13.33;
const ALTO = 7.5;

export interface OpcionesExport {
  subjectName?: string;
  courseName?: string;
  teacherName?: string;
}

/** Los nombres de las maestras, uno por forma de lámina. */
const MAESTRA = {
  portada: 'SMT_PORTADA',
  contenido: 'SMT_CONTENIDO',
  destacado: 'SMT_DESTACADO',
  pregunta: 'SMT_PREGUNTA',
} as const;

function definirMaestras(pptx: PptxGenJS, d: Diseno, pie: string) {
  const pieObjeto = pie
    ? [{ text: { text: `${pie} — SMT EstudIA`, options: { x: 0.7, y: 6.95, w: 11.9, h: 0.4, fontSize: 10, color: d.pie } } }]
    : [];

  pptx.defineSlideMaster({
    title: MAESTRA.portada,
    background: { color: d.portadaFondo },
    objects: [
      { rect: { x: 0, y: ALTO - 0.6, w: ANCHO, h: 0.6, fill: { color: d.acento } } },
    ],
  });

  // La barra lateral de acento es lo que da identidad a la lámina sin
  // robarle lugar al contenido.
  pptx.defineSlideMaster({
    title: MAESTRA.contenido,
    background: { color: d.fondo },
    objects: [
      { rect: { x: 0, y: 0, w: 0.25, h: ALTO, fill: { color: d.acento } } },
      ...pieObjeto,
    ],
  });

  pptx.defineSlideMaster({
    title: MAESTRA.destacado,
    background: { color: d.fondo },
    objects: [
      { rect: { x: 0, y: 0, w: 0.25, h: ALTO, fill: { color: d.acento } } },
      ...pieObjeto,
    ],
  });

  pptx.defineSlideMaster({
    title: MAESTRA.pregunta,
    background: { color: d.preguntaFondo },
    objects: [
      { rect: { x: 0, y: 0, w: 0.25, h: ALTO, fill: { color: d.preguntaAcento } } },
      ...pieObjeto,
    ],
  });
}

/** Título de lámina, arriba a la izquierda. */
function titulo(s: PptxGenJS.Slide, texto: string, color: string) {
  s.addText(texto, {
    x: 0.7, y: 0.45, w: 12, h: 1.1,
    fontSize: 30, bold: true, color, valign: 'middle',
  });
}

function viñetas(s: PptxGenJS.Slide, puntos: string[], d: Diseno, y = 1.8, x = 0.9, w = 11.6, h = 4.9, fontSize = 20) {
  if (puntos.length === 0) return;
  s.addText(
    puntos.map(p => ({
      text: p,
      options: { bullet: { characterCode: '2022', indent: 18 }, breakLine: true },
    })),
    { x, y, w, h, fontSize, color: d.cuerpo, valign: 'top', lineSpacingMultiple: 1.35 },
  );
}

type DiapositivaConImagen = Diapositiva & { imagenData?: string };

function dibujar(pptx: PptxGenJS, dia: DiapositivaConImagen, d: Diseno, esContraste: boolean) {
  const cuerpoBase = esContraste ? 24 : 20;

  switch (dia.tipo) {
    case 'portada': {
      const s = pptx.addSlide({ masterName: MAESTRA.portada });
      s.addText(dia.titulo, {
        x: 0.8, y: 2.2, w: 11.7, h: 2.2,
        fontSize: 40, bold: true, color: d.portadaTexto, align: 'center', valign: 'middle',
      });
      if (dia.puntos.length) {
        s.addText(dia.puntos.join(' · '), {
          x: 0.8, y: 4.4, w: 11.7, h: 0.8, fontSize: 18, color: d.portadaTexto, align: 'center',
        });
      }
      return s;
    }

    case 'destacado': {
      // Una idea sola, centrada y grande: es la lámina donde el docente
      // se detiene. Si va con el mismo cuerpo que las viñetas, se pierde.
      const s = pptx.addSlide({ masterName: MAESTRA.destacado });
      titulo(s, dia.titulo, d.titulo);
      s.addText(dia.destacado ?? '', {
        x: 1.4, y: 2.1, w: 10.6, h: 3.4,
        fontSize: 28, italic: true, color: d.cuerpo, align: 'center', valign: 'middle',
        lineSpacingMultiple: 1.3,
      });
      s.addShape('rect', { x: 1.4, y: 1.95, w: 1.6, h: 0.06, fill: { color: d.acento } });
      return s;
    }

    case 'dos-columnas': {
      const s = pptx.addSlide({ masterName: MAESTRA.contenido });
      titulo(s, dia.titulo, d.titulo);
      const cols = [
        { col: dia.izquierda, x: 0.9 },
        { col: dia.derecha, x: 7.0 },
      ];
      for (const { col, x } of cols) {
        if (!col) continue;
        s.addText(col.titulo, {
          x, y: 1.75, w: 5.4, h: 0.6,
          fontSize: 20, bold: true, color: d.acento, valign: 'middle',
        });
        s.addShape('rect', { x, y: 2.35, w: 5.4, h: 0.04, fill: { color: d.acento } });
        viñetas(s, col.puntos, d, 2.55, x, 5.4, 4.1, esContraste ? 20 : 17);
      }
      return s;
    }

    case 'pregunta': {
      const s = pptx.addSlide({ masterName: MAESTRA.pregunta });
      titulo(s, dia.titulo, d.preguntaTitulo);
      // El estímulo (el verso, la frase, el caso) va antes de las opciones:
      // sin esto la pregunta no se entiende proyectada.
      let y = 1.75;
      if (dia.puntos.length) {
        s.addText(dia.puntos.join('\n'), {
          x: 0.9, y, w: 11.6, h: 1.0,
          fontSize: 22, italic: true, color: d.cuerpo, valign: 'middle',
        });
        y += 1.2;
      }
      (dia.opciones ?? []).forEach((op, i) => {
        s.addText(`${String.fromCharCode(65 + i)})  ${op}`, {
          x: 1.2, y: y + i * 0.85, w: 11, h: 0.75,
          fontSize: esContraste ? 24 : 21, color: d.cuerpo, valign: 'middle',
        });
      });
      return s;
    }

    case 'imagen': {
        const s = pptx.addSlide({ masterName: MAESTRA.contenido });
        titulo(s, dia.titulo, d.titulo);
        // La imagen va embebida en base64: el .pptx tiene que abrirse en la
        // compu del aula sin internet y sin la sesión del docente.
        if (dia.imagenData) {
            s.addImage({
                data: dia.imagenData,
                x: 0.9, y: 1.7, w: 11.6, h: dia.puntos.length ? 4.5 : 5.1,
                sizing: { type: 'contain', w: 11.6, h: dia.puntos.length ? 4.5 : 5.1 },
            });
        }
        if (dia.puntos.length) {
            s.addText(dia.puntos.join(' '), {
                x: 0.9, y: 6.3, w: 11.6, h: 0.6,
                fontSize: 14, italic: true, color: d.pie, align: 'center',
            });
        }
        return s;
    }

    case 'cierre': {
      const s = pptx.addSlide({ masterName: MAESTRA.contenido });
      titulo(s, dia.titulo, d.acento);
      if (dia.imagenData) {
        viñetas(s, dia.puntos, d, 1.9, 0.9, 6.6, 4.6, cuerpoBase + 1);
        s.addImage({
          data: dia.imagenData,
          x: 7.8, y: 1.9, w: 4.7, h: 4.2,
          sizing: { type: 'contain', w: 4.7, h: 4.2 },
        });
      } else {
        viñetas(s, dia.puntos, d, 1.9, 0.9, 11.6, 4.6, cuerpoBase + 2);
      }
      return s;
    }

    default: {
      const s = pptx.addSlide({ masterName: MAESTRA.contenido });
      titulo(s, dia.titulo, d.titulo);
      // Con imagen, el texto se corre a la izquierda y ella ocupa la
      // derecha: es la diapositiva más común de una clase. La imagen
      // acompaña al contenido, no lo reemplaza, así que se lleva menos.
      if (dia.imagenData) {
        viñetas(s, dia.puntos, d, 1.8, 0.9, 6.6, 4.9, cuerpoBase - 1);
        s.addImage({
          data: dia.imagenData,
          x: 7.8, y: 1.8, w: 4.7, h: 4.3,
          sizing: { type: 'contain', w: 4.7, h: 4.3 },
        });
      } else {
        viñetas(s, dia.puntos, d, 1.8, 0.9, 11.6, 4.9, cuerpoBase);
      }
      return s;
    }
  }
}

export async function exportarMazoPptx(mazo: Mazo, opts: OpcionesExport = {}): Promise<void> {
  const { default: PptxGenJS } = await import('pptxgenjs');
  const pptx = new PptxGenJS();

  pptx.defineLayout({ name: 'WIDE', width: ANCHO, height: ALTO });
  pptx.layout = 'WIDE';
  pptx.author = opts.teacherName ?? 'SMT EstudIA';
  pptx.title = mazo.titulo;
  pptx.subject = [opts.subjectName, opts.courseName].filter(Boolean).join(' · ');

  const d = disenoDe(mazo.diseno);
  const pie = [opts.subjectName, opts.courseName].filter(Boolean).join(' · ');
  definirMaestras(pptx, d, pie);

  const esContraste = d.id === 'contraste';

  // Si la IA no abrió con portada, se agrega una: el mazo tiene que
  // arrancar diciendo de qué es.
  if (mazo.diapositivas[0]?.tipo !== 'portada') {
    dibujar(pptx, {
      tipo: 'portada',
      titulo: mazo.titulo,
      puntos: [mazo.subtitulo ?? pie].filter(Boolean),
    }, d, esContraste);
  }

  // Las imagenes se bajan ANTES de dibujar: el .pptx las lleva embebidas,
  // asi se abre en la compu del aula sin internet y sin la sesion del docente.
  const conImagen = await Promise.all(mazo.diapositivas.map(async (dia): Promise<DiapositivaConImagen> => {
    if (!dia.imagen) return dia;
    try {
      const url = await getSignedUrl(dia.imagen.ruta);
      const blob = await (await fetch(url)).blob();
      const data = await new Promise<string>((ok, mal) => {
        const r = new FileReader();
        r.onload = () => ok(String(r.result));
        r.onerror = mal;
        r.readAsDataURL(blob);
      });
      return { ...dia, imagenData: data };
    } catch {
      // Sin la imagen la lamina queda con su titulo: mejor que no exportar.
      return dia;
    }
  }));

  for (const dia of conImagen) {
    const s = dibujar(pptx, dia, d, esContraste);
    // La nota del docente va a las notas del orador: PowerPoint las muestra
    // en su pantalla y no en el proyector.
    if (dia.nota) s.addNotes(dia.nota);
  }

  const nombre = mazo.titulo.replace(/[^\p{L}\p{N} _-]/gu, '').trim().slice(0, 60) || 'presentacion';
  await pptx.writeFile({ fileName: `${nombre}.pptx` });
}
