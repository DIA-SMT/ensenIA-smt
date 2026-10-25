/**
 * Achicar un material que no entra, en el equipo del docente (sin servidor):
 * - PDF: cada página pasa a imagen (se ve igual, pesa mucho menos). Si el
 *   PDF tenía texto (uno exportado de Word, de una web), ese texto se lee
 *   ANTES de achicarlo y se guarda: la IA lo usa sin gastar en leerlo.
 * - Foto: más chica y en JPEG (WebP y otros formatos el depósito no los acepta).
 * - Word y PowerPoint: las imágenes de adentro, más chicas. El texto no se toca.
 *
 * El límite lo pone la lectura con IA de un escaneo (process-document, ~11 MB).
 */

// Lo pesado (abrir y guardar imágenes) se baja recién al achicar: la Biblioteca
// solo necesita saber si hay que hacerlo
const navegador = () => import('./escanerNavegador');

/**
 * Lo más pesado que se puede subir. Lo pone la lectura con IA de un escaneo:
 * process-document recibe el PDF en base64 (4 caracteres cada 3 bytes) y
 * corta en 15.000.000 de caracteres, o sea 11.250.000 bytes. Con un margen.
 * (11 MiB, lo de antes, son 11.534.336: se subían y la IA no los leía.)
 */
export const LIMITE_SUBIDA = 11_000_000;
// Formatos de foto que acepta el depósito (bucket "library")
const FOTOS_ACEPTADAS = ['image/jpeg', 'image/png'];
const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const PPTX = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
// Una página de texto real tiene cientos de letras; un escaneo, ninguna
const LETRAS_POR_PAGINA = 200;

export interface Comprimido {
  archivo: File;
  /** El texto del PDF original, si lo tenía (el achicado ya no lo trae) */
  texto?: string;
}

/** Cuenta en qué va. Si devuelve false, se deja de achicar (la persona cerró o eligió otro archivo). */
export type AlAvanzar = (mensaje: string) => boolean | void;

export class AchicadoCancelado extends Error {
  constructor() { super('Se dejó de achicar.'); }
}

/** Un problema que el docente puede resolver: su mensaje se muestra tal cual (los demás, no) */
export class NoSePudoAchicar extends Error {}

/** Si hay que pasarlo por acá antes de subirlo: pesa de más o es una foto en un formato que no se acepta */
export function hayQueAchicar(f: File): boolean {
  return f.size > LIMITE_SUBIDA || (f.type.startsWith('image/') && !FOTOS_ACEPTADAS.includes(f.type));
}

export async function achicar(f: File, alAvanzarDe: AlAvanzar = () => {}): Promise<Comprimido> {
  // En un celular achicar cuesta: si nadie espera el resultado, se corta en el próximo paso
  const alAvanzar = (mensaje: string) => { if (alAvanzarDe(mensaje) === false) throw new AchicadoCancelado(); };
  if (f.type === 'application/pdf') return achicarPdf(f, alAvanzar);
  if (f.type.startsWith('image/')) return { archivo: await achicarFoto(f) };
  if (f.type === DOCX) return { archivo: await achicarOffice(f, OFFICE.word, alAvanzar) };
  if (f.type === PPTX) return { archivo: await achicarOffice(f, OFFICE.powerpoint, alAvanzar) };
  throw new NoSePudoAchicar('Este formato no se puede achicar acá.');
}

const sinExtension = (nombre: string) => nombre.replace(/\.[^.]+$/, '');
const mb = (b: number) => `${(b / 1024 / 1024).toFixed(1).replace('.', ',')} MB`;

// ── Foto ──

async function achicarFoto(f: File): Promise<File> {
  const { abrirImagen, lienzoAJpeg, soltarLienzo, SIN_MEMORIA } = await navegador();
  let img: HTMLImageElement;
  try { img = await abrirImagen(f); } catch (err) { throw new NoSePudoAchicar((err as Error).message); }
  const nombre = `${sinExtension(f.name)}.jpg`;
  for (const lado of [2400, 2000, 1600, 1200]) {
    for (const calidad of [0.82, 0.68]) {
      const k = Math.min(1, lado / Math.max(img.naturalWidth, img.naturalHeight));
      const c = document.createElement('canvas');
      c.width = Math.round(img.naturalWidth * k);
      c.height = Math.round(img.naturalHeight * k);
      const ctx = c.getContext('2d');
      if (!ctx) throw new NoSePudoAchicar(SIN_MEMORIA);
      // Las partes transparentes de un PNG, blancas (en JPEG serían negras)
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, c.width, c.height);
      ctx.drawImage(img, 0, 0, c.width, c.height);
      const blob = await lienzoAJpeg(c, calidad).finally(() => soltarLienzo(c));
      if (blob.size <= LIMITE_SUBIDA) return new File([blob], nombre, { type: 'image/jpeg' });
    }
  }
  throw new NoSePudoAchicar('La foto no baja de 11 MB.');
}

// ── PDF ──

// De más nítido a más liviano: se usa el primero en el que entran todas las páginas
const PASOS = [
  { ppp: 150, calidad: 0.72 },
  { ppp: 120, calidad: 0.65 },
  { ppp: 100, calidad: 0.6 },
  { ppp: 80, calidad: 0.5 },
];

async function achicarPdf(f: File, alAvanzar: (mensaje: string) => void): Promise<Comprimido> {
  const [{ cargarPdfjs }, { jsPDF }] = await Promise.all([import('../services/documents.service'), import('jspdf')]);
  const pdfjs = await cargarPdfjs();
  alAvanzar('Abriendo el PDF…');
  let doc: DocPdf;
  try {
    doc = await pdfjs.getDocument({ data: new Uint8Array(await f.arrayBuffer()) }).promise;
  } catch (err) {
    if ((err as Error)?.name === 'PasswordException') throw new NoSePudoAchicar('Este PDF tiene contraseña. Abrilo, guardalo sin contraseña y subilo de nuevo.');
    throw new NoSePudoAchicar('No se pudo abrir este PDF: puede estar dañado. Probá abrirlo y guardarlo de nuevo.');
  }
  try {
    const n = doc.numPages;
    if (!n) throw new NoSePudoAchicar('Este PDF no tiene páginas.');

    // 1. El texto, mientras el PDF lo tiene
    alAvanzar('Guardando el texto…');
    const textos: string[] = [];
    for (let i = 1; i <= n; i++) {
      const { items } = await (await doc.getPage(i)).getTextContent();
      textos.push(items.map(it => ('str' in it ? it.str + (it.hasEOL ? '\n' : ' ') : '')).join(''));
    }
    const texto = textos.join('\n\n').replace(/[ \t]+\n/g, '\n').trim();
    const conTexto = texto.replace(/\s/g, '').length >= LETRAS_POR_PAGINA * n;

    // 2. Cada página como imagen. Se prueba con las primeras páginas qué paso
    //    alcanza, para no achicar todo el PDF dos veces.
    const presupuesto = (LIMITE_SUBIDA * 0.95) / n;
    // La muestra, repartida: la primera página (una portada liviana) no alcanza para decidir
    const muestra = [...new Set([1, Math.ceil(n / 2), n])];
    let paso = PASOS.length - 1;
    for (let k = 0; k < PASOS.length; k++) {
      let total = 0;
      alAvanzar('Calculando cuánto achicar…');
      for (const i of muestra) total += (await paginaComoJpeg(doc, i, PASOS[k])).jpeg.length;
      if (total / muestra.length <= presupuesto) { paso = k; break; }
    }

    for (let k = paso; k < PASOS.length; k++) {
      let salida: InstanceType<typeof jsPDF> | null = null;
      for (let i = 1; i <= n; i++) {
        alAvanzar(`Achicando la página ${i} de ${n}…`);
        const { jpeg, ancho, alto } = await paginaComoJpeg(doc, i, PASOS[k]);
        const orientacion = ancho > alto ? 'landscape' : 'portrait';
        if (!salida) salida = new jsPDF({ unit: 'pt', format: [ancho, alto], orientation: orientacion, compress: true });
        else salida.addPage([ancho, alto], orientacion);
        salida.addImage(jpeg, 'JPEG', 0, 0, ancho, alto, undefined, 'NONE');
      }
      salida!.setProperties({ title: sinExtension(f.name), creator: 'SMT EstudIA' });
      const blob = salida!.output('blob');
      if (blob.size <= LIMITE_SUBIDA) {
        return {
          archivo: new File([blob], f.name, { type: 'application/pdf' }),
          texto: conTexto ? texto : undefined,
        };
      }
    }
    throw new NoSePudoAchicar(`Tiene ${n} páginas y ni achicado baja de 11 MB. Dividilo en partes (por ejemplo, por unidad) y subí cada una.`);
  } finally {
    void doc.destroy();
  }
}

type DocPdf = Awaited<ReturnType<Awaited<ReturnType<typeof import('../services/documents.service').cargarPdfjs>>['getDocument']>['promise']>;

/** Una tanda de páginas de un PDF, como PDF aparte (para leerlo con IA de a partes) */
export interface TandaPdf { desde: number; hasta: number; total: number; indice: number; pdf: Blob }

/**
 * Corta un PDF en tandas de `porTanda` páginas, cada una como un PDF chico
 * (las páginas pasan a imagen: es lo que mira la IA al transcribir un
 * escaneo). Así un escaneo largo se lee entero y cada pedido es corto, en
 * vez de uno solo que se corta por tiempo o por largo. Si entra en una
 * tanda, sale el mismo archivo, sin tocarlo.
 */
export async function* tandasDePdf(f: Blob, porTanda: number): AsyncGenerator<TandaPdf> {
  const [{ cargarPdfjs }, { jsPDF }] = await Promise.all([import('../services/documents.service'), import('jspdf')]);
  const pdfjs = await cargarPdfjs();
  const doc: DocPdf = await pdfjs.getDocument({ data: new Uint8Array(await f.arrayBuffer()) }).promise;
  try {
    const n = doc.numPages;
    if (n <= porTanda) {
      yield { desde: 1, hasta: n, total: n, indice: 1, pdf: f };
      return;
    }
    let indice = 0;
    for (let desde = 1; desde <= n; desde += porTanda) {
      const hasta = Math.min(n, desde + porTanda - 1);
      let salida: InstanceType<typeof jsPDF> | null = null;
      for (let i = desde; i <= hasta; i++) {
        // 150 ppp: se lee bien la letra chica de una fotocopia
        const { jpeg, ancho, alto } = await paginaComoJpeg(doc, i, { ppp: 150, calidad: 0.8 });
        const orientacion = ancho > alto ? 'landscape' : 'portrait';
        if (!salida) salida = new jsPDF({ unit: 'pt', format: [ancho, alto], orientation: orientacion, compress: true });
        else salida.addPage([ancho, alto], orientacion);
        salida.addImage(jpeg, 'JPEG', 0, 0, ancho, alto, undefined, 'NONE');
      }
      yield { desde, hasta, total: n, indice: ++indice, pdf: salida!.output('blob') };
    }
  } finally {
    void doc.destroy();
  }
}

/** Una página dibujada a `ppp` puntos por pulgada, en JPEG; ancho y alto en puntos (los del PDF) */
async function paginaComoJpeg(doc: DocPdf, i: number, paso: { ppp: number; calidad: number }) {
  const pagina = await doc.getPage(i);
  const base = pagina.getViewport({ scale: 1 });
  // Una hoja enorme (un plano, un póster) no puede dar un lienzo gigante
  const escala = Math.min(paso.ppp / 72, 2400 / Math.max(base.width, base.height));
  const viewport = pagina.getViewport({ scale: escala });
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.floor(viewport.width));
  c.height = Math.max(1, Math.floor(viewport.height));
  const { lienzoAJpeg, soltarLienzo, SIN_MEMORIA } = await navegador();
  const ctx = c.getContext('2d');
  if (!ctx) throw new NoSePudoAchicar(SIN_MEMORIA);
  let blob: Blob;
  try {
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, c.width, c.height);
    await pagina.render({ canvas: c, viewport }).promise;
    blob = await lienzoAJpeg(c, paso.calidad);
  } finally {
    soltarLienzo(c);
    pagina.cleanup();
  }
  return { jpeg: new Uint8Array(await blob.arrayBuffer()), ancho: base.width, alto: base.height };
}

// ── Word y PowerPoint: zips con las imágenes en una carpeta "media" ──

const OFFICE = {
  word: { nombre: 'Word', el: 'este Word', media: /^word\/media\/.+\.(jpe?g|png)$/i, tipo: DOCX, comoPdf: 'Archivo → Guardar como → PDF' },
  powerpoint: { nombre: 'PowerPoint', el: 'este PowerPoint', media: /^ppt\/media\/.+\.(jpe?g|png)$/i, tipo: PPTX, comoPdf: 'Archivo → Exportar → PDF' },
};

async function achicarOffice(f: File, o: typeof OFFICE.word, alAvanzar: (mensaje: string) => void): Promise<File> {
  const { default: JSZip } = await import('jszip');
  alAvanzar(`Abriendo el ${o.nombre}…`);
  let zip: InstanceType<typeof JSZip>;
  try { zip = await JSZip.loadAsync(await f.arrayBuffer()); } catch { throw new NoSePudoAchicar(`No se pudo abrir ${o.el}: puede estar dañado. Probá abrirlo y guardarlo de nuevo.`); }
  const { abrirImagen, soltarLienzo } = await navegador();
  const imagenes = Object.values(zip.files).filter(e => !e.dir && o.media.test(e.name));
  let hechas = 0;
  for (const entrada of imagenes) {
    alAvanzar(`Achicando las imágenes (${++hechas} de ${imagenes.length})…`);
    const original = await entrada.async('arraybuffer');
    if (original.byteLength < 150 * 1024) continue;
    const png = /\.png$/i.test(entrada.name);
    // Mismo nombre y mismo tipo: el Word (o el PowerPoint) no se entera del cambio
    const tipo = png ? 'image/png' : 'image/jpeg';
    let img: HTMLImageElement;
    try { img = await abrirImagen(new Blob([original], { type: tipo })); } catch { continue; }
    const k = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement('canvas');
    c.width = Math.round(img.naturalWidth * k);
    c.height = Math.round(img.naturalHeight * k);
    const ctx = c.getContext('2d');
    if (!ctx) { soltarLienzo(c); continue; }
    ctx.drawImage(img, 0, 0, c.width, c.height);
    const nueva = await new Promise<Blob | null>(r => c.toBlob(r, tipo, png ? undefined : 0.75));
    soltarLienzo(c);
    if (nueva && nueva.size < original.byteLength) zip.file(entrada.name, await nueva.arrayBuffer());
  }
  alAvanzar(`Armando el ${o.nombre}…`);
  const blob = await zip.generateAsync({ type: 'blob', mimeType: o.tipo, compression: 'DEFLATE', compressionOptions: { level: 6 } });
  if (blob.size > LIMITE_SUBIDA) {
    throw new NoSePudoAchicar(`Achicado sigue pesando ${mb(blob.size)}. Guardalo como PDF (${o.comoPdf}) y subí el PDF: ese sí se puede achicar más.`);
  }
  return new File([blob], f.name, { type: o.tipo });
}
