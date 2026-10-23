/**
 * Lo del escáner que necesita el navegador: abrir fotos, pasar de canvas a
 * píxeles y de píxeles a JPEG, y juntar las páginas en un PDF. Las cuentas
 * están en lib/escaner (se prueban sin navegador).
 */

import {
  detectarHoja, enderezar, aplicarFiltro, girar, medidasDeSalida, esquinasDelCuadro, escalarEsquinas, ampliarEsquinas,
  type Imagen, type Esquinas, type Filtro, type Giro,
} from './escaner';

/** Lado largo de la foto que se guarda de cada página: alcanza para 150 ppp y no revienta la memoria */
export const LADO_FOTO = 2600;
/** Lado largo del cuadro en el que se busca la hoja (en cada cuadro de la cámara) */
export const LADO_DETECCION = 320;

/**
 * Sin memoria para otro lienzo, el navegador no da error: getContext devuelve
 * null (en iPhone pasa cuando se acumulan lienzos grandes).
 */
export const SIN_MEMORIA = 'Al equipo no le alcanzó la memoria para procesar la imagen. Cerrá otras pestañas o aplicaciones y probá de nuevo.';

/** jsPDF arma el PDF al final: se baja junto con el escáner, así sin señal igual se puede terminar */
export const cargarJspdf = () => import('jspdf');

/** Una foto (archivo o captura) como imagen del navegador. Respeta la rotación de la cámara (EXIF). */
export function abrirImagen(archivo: Blob): Promise<HTMLImageElement> {
  return new Promise((resolver, rechazar) => {
    const url = URL.createObjectURL(archivo);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolver(img); };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      rechazar(new Error('Este navegador no puede abrir esa foto (puede estar en un formato como HEIC). Sacala con «Sacar foto» o elegí otra.'));
    };
    img.src = url;
  });
}

function lienzo(ancho: number, alto: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = ancho;
  c.height = alto;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  if (!ctx) { soltarLienzo(c); throw new Error(SIN_MEMORIA); }
  return [c, ctx];
}

/**
 * Un lienzo grande ocupa decenas de MB y Safari los libera recién cuando
 * quiere (tiene un tope para todos juntos). Achicarlo a cero los suelta ya.
 */
export function soltarLienzo(c: HTMLCanvasElement) {
  c.width = 0;
  c.height = 0;
}

/**
 * Los píxeles de una imagen o del video, reducidos para que el lado largo no
 * pase de `lado`. Con `reusar`, dibuja en ese lienzo (la cámara lo hace ocho
 * veces por segundo: un lienzo nuevo cada vez llena la memoria de basura).
 */
export function pixeles(fuente: CanvasImageSource, ancho: number, alto: number, lado: number, reusar?: HTMLCanvasElement): Imagen {
  const k = Math.min(1, lado / Math.max(ancho, alto));
  const w = Math.max(1, Math.round(ancho * k)), h = Math.max(1, Math.round(alto * k));
  let ctx: CanvasRenderingContext2D | null;
  if (reusar) {
    if (reusar.width !== w) reusar.width = w;
    if (reusar.height !== h) reusar.height = h;
    ctx = reusar.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error(SIN_MEMORIA);
    ctx.drawImage(fuente, 0, 0, w, h);
    return { data: ctx.getImageData(0, 0, w, h).data, width: w, height: h };
  }
  const [c, propio] = lienzo(w, h);
  propio.drawImage(fuente, 0, 0, w, h);
  const { data } = propio.getImageData(0, 0, w, h);
  soltarLienzo(c);
  return { data, width: w, height: h };
}

export function aJpeg(img: Imagen, calidad: number): Promise<Blob> {
  const [c, ctx] = lienzo(img.width, img.height);
  ctx.putImageData(new ImageData(img.data as Uint8ClampedArray<ArrayBuffer>, img.width, img.height), 0, 0);
  return lienzoAJpeg(c, calidad).finally(() => soltarLienzo(c));
}

export function lienzoAJpeg(c: HTMLCanvasElement, calidad: number): Promise<Blob> {
  return new Promise((resolver, rechazar) => {
    c.toBlob(b => (b ? resolver(b) : rechazar(new Error('No se pudo guardar la imagen.'))), 'image/jpeg', calidad);
  });
}

/** Un cuadro del video (o una foto) guardado como JPEG con el lado largo de LADO_FOTO como mucho */
export async function guardarFoto(fuente: CanvasImageSource, ancho: number, alto: number): Promise<{ blob: Blob; ancho: number; alto: number }> {
  const k = Math.min(1, LADO_FOTO / Math.max(ancho, alto));
  const w = Math.round(ancho * k), h = Math.round(alto * k);
  const [c, ctx] = lienzo(w, h);
  ctx.drawImage(fuente, 0, 0, w, h);
  try {
    return { blob: await lienzoAJpeg(c, 0.9), ancho: w, alto: h };
  } finally {
    soltarLienzo(c);
  }
}

/** Las esquinas de la hoja en una foto, en sus píxeles; si no se encuentra, toda la foto */
export function buscarHoja(fuente: CanvasImageSource, ancho: number, alto: number): { esquinas: Esquinas; encontrada: boolean } {
  const chica = pixeles(fuente, ancho, alto, LADO_DETECCION);
  const e = detectarHoja(chica);
  if (!e) return { esquinas: esquinasDelCuadro(ancho, alto), encontrada: false };
  return { esquinas: ampliarEsquinas(e, ancho / chica.width, alto / chica.height), encontrada: true };
}

export interface PaginaLista {
  blob: Blob;
  ancho: number;
  alto: number;
  miniatura: Blob;
}

// Una pausa para que la pantalla se dibuje entre paso y paso (todo corre en el mismo hilo)
const respirar = () => new Promise(r => setTimeout(r, 0));

/** La página terminada: enderezada, con su filtro y girada, en JPEG (y una miniatura) */
export async function procesarPagina(foto: Blob, esquinas: Esquinas, filtro: Filtro, giro: Giro): Promise<PaginaLista> {
  const img = await abrirImagen(foto);
  const fuente = pixeles(img, img.naturalWidth, img.naturalHeight, LADO_FOTO);
  // Las esquinas están en píxeles de la foto guardada (ya reducida): misma escala
  const k = fuente.width / img.naturalWidth;
  const e = k === 1 ? esquinas : escalarEsquinas(esquinas, k);
  await respirar();
  const { ancho, alto } = medidasDeSalida(e);
  let pagina = enderezar(fuente, e, ancho, alto);
  await respirar();
  pagina = girar(aplicarFiltro(pagina, filtro), giro);
  await respirar();
  // Blanco y negro se comprime mucho mejor: puede ir con menos calidad
  const blob = await aJpeg(pagina, filtro === 'byn' ? 0.6 : 0.72);
  const chica = await reducir(pagina, 280);
  return { blob, ancho: pagina.width, alto: pagina.height, miniatura: await aJpeg(chica, 0.7) };
}

async function reducir(img: Imagen, lado: number): Promise<Imagen> {
  const [c, ctx] = lienzo(img.width, img.height);
  ctx.putImageData(new ImageData(img.data as Uint8ClampedArray<ArrayBuffer>, img.width, img.height), 0, 0);
  try {
    return pixeles(c, img.width, img.height, lado);
  } finally {
    soltarLienzo(c);
  }
}

/**
 * Las páginas en un solo PDF, cada una del tamaño de su hoja (A4 de ancho
 * si es vertical): se imprime y se lee como cualquier PDF escaneado.
 */
export async function armarPdf(paginas: PaginaLista[], titulo: string): Promise<Blob> {
  const { jsPDF } = await cargarJspdf();
  const medida = (p: PaginaLista): [number, number] => {
    const corto = 595.28; // ancho de una A4 en puntos
    return p.alto >= p.ancho ? [corto, corto * p.alto / p.ancho] : [corto * p.ancho / p.alto, corto];
  };
  const [w0, h0] = medida(paginas[0]);
  const doc = new jsPDF({ unit: 'pt', format: [w0, h0], orientation: w0 > h0 ? 'landscape' : 'portrait', compress: true });
  for (let i = 0; i < paginas.length; i++) {
    const [w, h] = medida(paginas[i]);
    if (i > 0) doc.addPage([w, h], w > h ? 'landscape' : 'portrait');
    doc.addImage(new Uint8Array(await paginas[i].blob.arrayBuffer()), 'JPEG', 0, 0, w, h, undefined, 'NONE');
    await respirar();
  }
  doc.setProperties({ title: titulo, creator: 'SMT EstudIA' });
  return doc.output('blob');
}
