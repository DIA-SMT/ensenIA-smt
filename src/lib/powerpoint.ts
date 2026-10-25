/**
 * El texto de un PowerPoint (.pptx), en el equipo y sin IA (069).
 *
 * Un .pptx es un zip: cada diapositiva es un XML con su texto en <a:t>,
 * agrupado en párrafos <a:p>. El ORDEN no es el de los nombres de archivo
 * (slide1, slide2…): si el docente reordenó las diapositivas, el orden real
 * está en presentation.xml. Las notas del orador van aparte y se suman,
 * porque suelen tener lo que el docente dice en clase.
 *
 * Sale en Markdown ("## Diapositiva 1", su texto, "Notas: …"): así se lee
 * en el visor y la IA entiende dónde termina cada una.
 */

type Zip = { file: (nombre: string) => { async: (tipo: 'string') => Promise<string> } | null; files: Record<string, unknown> };

const parser = () => new DOMParser();

/**
 * Los párrafos con texto de un XML de diapositiva (o de notas). Un salto
 * dentro del párrafo (<a:br/>) es un espacio: si no, se pegan las palabras.
 */
function parrafos(xml: string): string[] {
  const doc = parser().parseFromString(xml, 'application/xml');
  return [...doc.getElementsByTagNameNS('*', 'p')]
    .map(p => [...p.getElementsByTagNameNS('*', '*')]
      .map(e => (e.localName === 't' ? e.textContent ?? '' : e.localName === 'br' ? ' ' : ''))
      .join('').replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

/** Una diapositiva oculta (show="0") no se presenta: tampoco se lee */
function oculta(xml: string): boolean {
  return parser().parseFromString(xml, 'application/xml').documentElement?.getAttribute('show') === '0';
}

/** id → destino de un archivo .rels */
function relaciones(xml: string): Map<string, string> {
  const doc = parser().parseFromString(xml, 'application/xml');
  const m = new Map<string, string>();
  for (const r of doc.getElementsByTagNameNS('*', 'Relationship')) {
    const id = r.getAttribute('Id');
    const destino = r.getAttribute('Target');
    if (id && destino) m.set(id, destino);
  }
  return m;
}

/** "slides/slide3.xml" o "../notesSlides/notesSlide2.xml", relativo a una carpeta → ruta dentro del zip */
function resolver(carpeta: string, destino: string): string {
  // Una ruta absoluta ("/ppt/notesSlides/…") es desde la raíz del zip
  if (destino.startsWith('/')) return destino.slice(1);
  const partes = [...carpeta.split('/').filter(Boolean)];
  for (const p of destino.split('/')) {
    if (p === '..') partes.pop();
    else if (p !== '.') partes.push(p);
  }
  return partes.join('/');
}

const numero = (nombre: string) => Number(nombre.match(/(\d+)\.xml$/)?.[1] ?? 0);

/** Las diapositivas en el orden en que se presentan (o por número, si presentation.xml no ayuda) */
async function ordenDeDiapositivas(zip: Zip): Promise<string[]> {
  const porNumero = Object.keys(zip.files)
    .filter(n => /^ppt\/slides\/slide\d+\.xml$/.test(n))
    .sort((a, b) => numero(a) - numero(b));
  try {
    const pres = await zip.file('ppt/presentation.xml')?.async('string');
    const rels = await zip.file('ppt/_rels/presentation.xml.rels')?.async('string');
    if (!pres || !rels) return porNumero;
    const destinos = relaciones(rels);
    const doc = parser().parseFromString(pres, 'application/xml');
    const orden = [...doc.getElementsByTagNameNS('*', 'sldId')]
      .map(s => s.getAttribute('r:id') ?? s.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id'))
      .map(id => (id ? destinos.get(id) : undefined))
      .filter((d): d is string => !!d)
      .map(d => resolver('ppt', d))
      .filter(n => n in zip.files);
    return orden.length ? orden : porNumero;
  } catch {
    return porNumero;
  }
}

/** Las notas del orador de una diapositiva, si tiene */
async function notasDe(zip: Zip, diapositiva: string): Promise<string[]> {
  const carpeta = diapositiva.replace(/\/[^/]+$/, '');
  const relsNombre = `${carpeta}/_rels/${diapositiva.split('/').pop()}.rels`;
  const rels = await zip.file(relsNombre)?.async('string');
  if (!rels) return [];
  const doc = parser().parseFromString(rels, 'application/xml');
  const nota = [...doc.getElementsByTagNameNS('*', 'Relationship')]
    .find(r => (r.getAttribute('Type') ?? '').endsWith('/notesSlide'));
  const destino = nota?.getAttribute('Target');
  if (!destino) return [];
  const xml = await zip.file(resolver(carpeta, destino))?.async('string');
  // El número de diapositiva que trae la página de notas no es texto
  return xml ? parrafos(xml).filter(l => !/^\d+$/.test(l)) : [];
}

/**
 * El texto de todas las diapositivas, en orden. Vacío si no tiene texto
 * (por ejemplo, si cada diapositiva es una imagen).
 */
export async function textoDePowerPoint(archivo: Blob): Promise<string> {
  const { default: JSZip } = await import('jszip');
  const zip = (await JSZip.loadAsync(await archivo.arrayBuffer())) as unknown as Zip;
  const diapositivas = await ordenDeDiapositivas(zip);
  const partes: string[] = [];
  let conTexto = false;
  let n = 0;
  for (const nombre of diapositivas) {
    const xml = await zip.file(nombre)?.async('string');
    if (xml && oculta(xml)) continue;
    const i = n++;
    const texto = xml ? parrafos(xml) : [];
    const notas = await notasDe(zip, nombre).catch(() => []);
    if (texto.length || notas.length) conTexto = true;
    partes.push([
      `## Diapositiva ${i + 1}`,
      texto.join('\n') || '(sin texto)',
      notas.length ? `\nNotas: ${notas.join(' ')}` : '',
    ].filter(Boolean).join('\n'));
  }
  return conTexto ? partes.join('\n\n') : '';
}
