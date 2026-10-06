/**
 * Diseños visuales de las presentaciones.
 *
 * Una sola definición para el visor en pantalla, la clase en vivo y el
 * PowerPoint: los colores salen de acá (como variables CSS en la pantalla,
 * como hex en el .pptx). El diseño no lo elige la IA: lo elige el docente
 * y la plataforma lo aplica, así que se puede cambiar sin volver a generar.
 *
 * Todos los pares texto/fondo pasan 4.5:1 (los títulos, 7:1): se proyectan
 * en aulas con mucha luz.
 */

import type { CSSProperties } from 'react';

export type DisenoId = 'institucional' | 'pizarra' | 'moderno' | 'calido' | 'minimal' | 'contraste';

export interface Diseno {
  id: DisenoId;
  nombre: string;
  descripcion: string;
  /** Sin '#': así lo pide pptxgenjs */
  fondo: string;
  titulo: string;
  cuerpo: string;
  acento: string;
  /** Diapositivas de "Pregunta al grupo" */
  preguntaFondo: string;
  preguntaAcento: string;
  preguntaTitulo: string;
  /** Portada */
  portadaFondo: string;
  portadaTexto: string;
  pie: string;
}

export const DISENOS: Diseno[] = [
  {
    id: 'institucional', nombre: 'Institucional', descripcion: 'Blanco y azul municipal. Sobrio, para cualquier tema.',
    fondo: 'FFFFFF', titulo: '0F172A', cuerpo: '334155', acento: '0166FF',
    preguntaFondo: 'FFF9E6', preguntaAcento: 'B45309', preguntaTitulo: '92400E',
    portadaFondo: '0B3D91', portadaTexto: 'FFFFFF', pie: '64748B',
  },
  {
    id: 'pizarra', nombre: 'Pizarra', descripcion: 'Verde de pizarrón con tiza. Cercano, de aula.',
    fondo: '1F3B2D', titulo: 'FFFFFF', cuerpo: 'E7EFE9', acento: 'F4DC00',
    preguntaFondo: '2B4A39', preguntaAcento: 'F4DC00', preguntaTitulo: 'FFF5A3',
    portadaFondo: '152A20', portadaTexto: 'FFFFFF', pie: 'B9CCBF',
  },
  {
    id: 'moderno', nombre: 'Moderno', descripcion: 'Fondo oscuro con acentos violeta. Luce bien proyectado.',
    fondo: '111827', titulo: 'FFFFFF', cuerpo: 'D1D5DB', acento: 'A5B4FC',
    preguntaFondo: '1E1B4B', preguntaAcento: 'FCD34D', preguntaTitulo: 'FDE68A',
    portadaFondo: '0B0F1A', portadaTexto: 'FFFFFF', pie: '9CA3AF',
  },
  {
    id: 'calido', nombre: 'Cálido', descripcion: 'Crema y terracota. Amable, para lengua o sociales.',
    fondo: 'FFF8EC', titulo: '431407', cuerpo: '57351C', acento: 'C2410C',
    preguntaFondo: 'FDEBD0', preguntaAcento: '9A3412', preguntaTitulo: '7C2D12',
    portadaFondo: '7C2D12', portadaTexto: 'FFF8EC', pie: '8A6A4F',
  },
  {
    id: 'minimal', nombre: 'Minimal', descripcion: 'Blanco y negro, mucho aire. Que hable el contenido.',
    fondo: 'FFFFFF', titulo: '111111', cuerpo: '333333', acento: '111111',
    preguntaFondo: 'F3F4F6', preguntaAcento: '111111', preguntaTitulo: '111111',
    portadaFondo: 'FFFFFF', portadaTexto: '111111', pie: '6B7280',
  },
  {
    id: 'contraste', nombre: 'Alto contraste', descripcion: 'Negro y amarillo, letra grande. Para baja visión o aulas con mucha luz.',
    fondo: '000000', titulo: 'FFFF00', cuerpo: 'FFFFFF', acento: 'FFFF00',
    preguntaFondo: '000000', preguntaAcento: '00FFFF', preguntaTitulo: '00FFFF',
    portadaFondo: '000000', portadaTexto: 'FFFF00', pie: 'FFFFFF',
  },
];

export const DISENO_PREDETERMINADO: DisenoId = 'institucional';

export function disenoDe(id: string | null | undefined): Diseno {
  return DISENOS.find(d => d.id === id) ?? DISENOS[0];
}

/** Variables CSS para dibujar una diapositiva con este diseño. */
export function varsDiseno(d: Diseno, pregunta = false): CSSProperties {
  return {
    '--d-fondo': `#${pregunta ? d.preguntaFondo : d.fondo}`,
    '--d-titulo': `#${pregunta ? d.preguntaTitulo : d.titulo}`,
    '--d-cuerpo': `#${d.cuerpo}`,
    '--d-acento': `#${pregunta ? d.preguntaAcento : d.acento}`,
    '--d-pie': `#${d.pie}`,
  } as CSSProperties;
}

/**
 * El diseño queda anotado en el texto de la presentación, para que viaje con
 * ella (al guardarla en la biblioteca, al proyectarla en vivo):
 *   <!-- diseño: pizarra -->
 * En el pedido a la IA va como "Diseño visual elegido: Pizarra".
 */
const MARCA = /<!--\s*dise(?:ñ|n)o:\s*([a-z-]+)\s*-->/i;
const EN_PEDIDO = /Dise(?:ñ|n)o visual elegido:\s*([A-Za-zÁÉÍÓÚáéíóúñ ]+?)\s*(?:[(.—\n]|$)/;

export function disenoEnTexto(texto: string | null | undefined): DisenoId | null {
  if (!texto) return null;
  const marca = MARCA.exec(texto);
  if (marca) return DISENOS.find(d => d.id === marca[1].toLowerCase())?.id ?? null;
  const pedido = EN_PEDIDO.exec(texto);
  if (pedido) {
    const nombre = pedido[1].trim().toLowerCase();
    return DISENOS.find(d => d.nombre.toLowerCase() === nombre)?.id ?? null;
  }
  return null;
}

export function marcarDiseno(texto: string, id: DisenoId): string {
  const sin = texto.replace(MARCA, '').replace(/^\s*\n/, '');
  return `<!-- diseño: ${id} -->\n${sin}`;
}
