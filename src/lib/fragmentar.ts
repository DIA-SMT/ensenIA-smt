/**
 * Parte un documento largo (una ley, los NAP, un lineamiento de ESI) en
 * fragmentos para la Biblioteca de referencia.
 *
 * La IA no lee el documento entero: busca fragmentos y los cita. Por eso
 * cada fragmento tiene que entenderse solo (un artículo, un NAP, una
 * sección) y llevar en `seccion` de dónde sale ("Capítulo II · Artículo 5",
 * "Matemática · 1° año · Números y operaciones").
 *
 * Qué hace, en orden:
 *  1. Limpia: une palabras cortadas con guion al final del renglón, saca
 *     números de página y los encabezados o pies que se repiten en cada
 *     página (se queda con la primera aparición).
 *  2. Reconoce títulos: markdown (#), "Artículo 5", "Capítulo II", "Eje 2",
 *     "NAP", "En relación con…", secciones numeradas cortas ("2.1 Alcance"),
 *     renglones cortos en MAYÚSCULAS, áreas ("Matemática") y años ("1° año").
 *  3. Junta los renglones partidos de un mismo párrafo (los PDF cortan
 *     cada línea) y los ítems de lista con su continuación.
 *  4. Arma fragmentos de hasta ~2500 caracteres sin mezclar secciones; un
 *     párrafo más largo se parte entre oraciones.
 *  5. En los NAP, cada ítem de una lista es un fragmento propio (así un
 *     docente lo puede vincular a un tema de su planificación), y la frase
 *     que presenta la lista ("…promuevan en los alumnos:") no se repite
 *     como fragmento.
 *
 * Es una función pura: se prueba sin navegador ni base.
 */

export interface FragmentoBorrador {
  seccion: string | null;
  texto: string;
}

export interface OpcionesFragmentar {
  /** Tipo de documento: con 'nap', cada ítem de lista es un fragmento. */
  tipo?: string;
  /** Tope blando por fragmento (la base acepta hasta 6000). */
  maxCaracteres?: number;
  /** Áreas del documento: se reconocen como título y, si es una sola, van en la sección. */
  areas?: string[];
  /** Años del documento: si el texto no los nombra, van en la sección. */
  anios?: number[];
}

export const MAX_FRAGMENTO = 2500;
/** Lo que acepta la base por fragmento. */
export const MAX_FRAGMENTO_BASE = 6000;

// ── Reconocer renglones ──

const VINETA = /^(?:[•·▪●◦‣○■□➢►✓✔*]|[-–—](?=\s))\s*/;
const ITEM_LETRA = /^\(?[a-zñ]\)\s+/i;
const ITEM_NUMERO = /^\d{1,2}[.)-]\s+/;
const MARKDOWN = /^(#{1,6})\s+(.+?)\s*#*$/;
const NEGRITA_SOLA = /^\*\*(.{2,120})\*\*:?$/;
const ARTICULO = /^(?:ART[IÍ]CULO|Art[ií]culo|ART\.|Art\.)\s*(\d+)\s*([°º]|bis|ter)?\s*([.:\-–—)]*)\s*(.*)$/;
const DIVISION = /^(CAP[IÍ]TULO|Cap[ií]tulo|T[IÍ]TULO|T[ií]tulo|SECCI[OÓ]N|Secci[oó]n|ANEXO|Anexo|PARTE|Parte|LIBRO|Libro)\b\s*([\dIVXLC]+\b|[ÚU]NICO|[ÚU]nico)?\s*[.:\-–—]*\s*(.*)$/;
const EJE = /^(?:EJE|Eje)\b\s*(N[°º]\s*)?([\dIVX]+)?\s*([.:\-–—]*)\s*(.*)$/;
const NAP_TITULO = /^NAP\b/;
const EN_RELACION = /^en\s+relaci[oó]n\s+(?:con|a)\s+/i;
const SECCION_NUMERADA = /^(\d{1,2}(?:\.\d{1,2}){0,3})\.?\s+(\S.*)$/;

const NUMERO_PAGINA = [
  /^[-–—]?\s*\d{1,4}\s*[-–—]?$/,
  /^p[áa]g(?:ina|\.)?\s*\d+(?:\s*(?:de|\/)\s*\d+)?$/i,
  /^\d+\s*(?:de|\/)\s*\d+$/,
];

const ORDINALES: [string, number][] = [
  ['primer', 1], ['primero', 1], ['segundo', 2], ['tercer', 3], ['tercero', 3],
  ['cuarto', 4], ['quinto', 5], ['sexto', 6], ['septimo', 7],
];

/** Áreas que se reconocen como título (además de las del documento). */
const AREAS_CONOCIDAS = [
  'Matemática', 'Lengua y Literatura', 'Lengua', 'Prácticas del Lenguaje', 'Literatura',
  'Ciencias Sociales', 'Ciencias Naturales', 'Historia', 'Geografía', 'Biología',
  'Físico-Química', 'Fisicoquímica', 'Física', 'Química', 'Educación Física',
  'Educación Artística', 'Artes Visuales', 'Música', 'Teatro', 'Danza',
  'Educación Tecnológica', 'Tecnología', 'Formación Ética y Ciudadana',
  'Construcción de Ciudadanía', 'Lenguas Extranjeras', 'Lengua Extranjera', 'Inglés',
  'Filosofía', 'Economía', 'Educación Digital', 'Programación y Robótica',
  'Educación Sexual Integral',
];

const SIGLAS = new Set(['ESI', 'NAP', 'NAPS', 'CFE', 'TIC', 'TICS', 'ONU', 'UNESCO', 'INET', 'ETP', 'CABA', 'EGB', 'MERCOSUR', 'II', 'III', 'IV', 'VI', 'VII', 'VIII', 'IX', 'XI', 'XII']);

const ABREVIATURAS = new Set([
  'art', 'arts', 'inc', 'res', 'dr', 'dra', 'sr', 'sra', 'sres', 'nro', 'núm', 'num', 'n', 'nº', 'n°',
  'pág', 'pag', 'cap', 'cfr', 'ej', 'etc', 'p', 'pp', 'lic', 'prof', 'ing', 'aprox', 'dec', 'disp', 'vs',
]);

function normalizar(t: string): string {
  return t.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
}

function esMayusculas(t: string): boolean {
  const letras = t.replace(/[^\p{L}]/gu, '');
  return letras.length >= 4 && letras === letras.toUpperCase() && letras !== letras.toLowerCase();
}

/** "EN RELACIÓN CON LOS NÚMEROS" → "En relación con los números", sin romper siglas. */
function desmayusculizar(t: string): string {
  if (!esMayusculas(t)) return t;
  const bajo = t.split(/(\s+)/).map(p => (SIGLAS.has(p.replace(/[^\p{L}]/gu, '')) ? p : p.toLowerCase())).join('');
  return bajo.charAt(0).toUpperCase() + bajo.slice(1);
}

/** "1° año", "Primer año", "1° y 2° AÑO" → [1] / [1, 2]; null si no nombra un año. */
function aniosDeTitulo(t: string): number[] | null {
  const n = normalizar(t);
  if (!/\banos?\b/.test(n)) return null;
  const anios = new Set<number>();
  for (const m of n.matchAll(/\b([1-7])\s*(?:o|er|ero|do|to|ro|vo|mo|no)?\b/g)) anios.add(Number(m[1]));
  for (const [palabra, num] of ORDINALES) {
    if (new RegExp(`\\b${palabra}\\b`).test(n)) anios.add(num);
  }
  return anios.size > 0 ? [...anios].sort((a, b) => a - b) : null;
}

function etiquetaAnios(anios: number[]): string {
  if (anios.length === 1) return `${anios[0]}° año`;
  return `${anios.slice(0, -1).map(a => `${a}°`).join(', ')} y ${anios[anios.length - 1]}° año`;
}

/** El área que nombra un título corto, o null. */
function areaDeTitulo(t: string, areas: string[]): string | null {
  const n = normalizar(t);
  if (!n || n.length > 70) return null;
  for (const a of areas) {
    const na = normalizar(a);
    if (na && (n === na || n.startsWith(`${na} `))) return a;
  }
  return null;
}

/** Lo que queda de un título al sacarle área, año y palabras de relleno. */
function restoDeTitulo(t: string, area: string | null): string {
  let n = normalizar(t);
  if (area) n = n.replace(normalizar(area), ' ');
  n = n
    .replace(/\b(?:[1-7]|primer|primero|segundo|tercer|tercero|cuarto|quinto|sexto|septimo)\s*(?:o|er|ero|do|to|ro|vo|mo|no)?\b/g, ' ')
    .replace(/\b(?:anos?|y|ciclo|basico|orientado|nap|nucleos de aprendizajes prioritarios|educacion secundaria|secundaria|nivel)\b/g, ' ');
  return n.replace(/\s+/g, ' ').trim();
}

/** "En relación con los números y las operaciones" → "Números y las operaciones". */
function limpiarEje(t: string): string {
  const s = desmayusculizar(t).replace(EN_RELACION, '').replace(/^(?:el|la|los|las)\s+/i, '').replace(/[:.]+$/, '').trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

type Renglon =
  | { k: 'titulo'; nivel: number; texto: string; division?: boolean; mayus?: boolean }
  | { k: 'area'; area: string; anios: number[] | null }
  | { k: 'anio'; anios: number[] }
  | { k: 'item'; texto: string }
  | { k: 'texto'; texto: string }
  | { k: 'blanco' };

interface Contexto {
  nap: boolean;
  /** Más largas primero: "Lengua y Literatura" antes que "Lengua". */
  areas: string[];
}

/** Qué es un renglón ya limpio. Puede dar dos (título + el texto que sigue en el mismo renglón). */
function clasificar(linea: string, ctx: Contexto): Renglon[] {
  let m = linea.match(MARKDOWN);
  if (m) return [tituloOMeta(m[2].replace(/\*\*/g, '').trim(), Math.min(m[1].length + 1, 6), ctx)];

  m = linea.match(NEGRITA_SOLA);
  if (m) return [tituloOMeta(m[1].trim(), 3, ctx)];

  m = linea.match(ARTICULO);
  // "Artículo 5 de la Ley…" dentro de un párrafo no es un artículo nuevo
  if (m && (m[3] || !m[4] || /^[\p{Lu}"«(]/u.test(m[4]))) {
    const sufijo = m[2] && !/[°º]/.test(m[2]) ? ` ${m[2]}` : '';
    const titulo: Renglon = { k: 'titulo', nivel: 5, texto: `Artículo ${m[1]}${sufijo}` };
    const resto = m[4].trim();
    return resto ? [titulo, { k: 'texto', texto: resto }] : [titulo];
  }

  m = linea.match(DIVISION);
  if (m && linea.length <= 140 && (m[2] || esMayusculas(linea))) {
    const tipo = m[1].charAt(0).toUpperCase() + m[1].slice(1).toLowerCase();
    const nivel = /^(libro|parte|t[ií]tulo|anexo)/i.test(tipo) ? 2 : 3;
    const nombre = [tipo, m[2]?.toUpperCase()].filter(Boolean).join(' ');
    const resto = m[3] ? desmayusculizar(m[3].trim()) : '';
    return [{ k: 'titulo', nivel, texto: resto ? `${nombre}: ${resto}` : nombre, division: !resto }];
  }

  m = linea.match(EJE);
  if (m && linea.length <= 140 && (m[2] || m[3] || esMayusculas(linea) || (linea.length <= 80 && !/[.;,]$/.test(linea)))) {
    return [{ k: 'titulo', nivel: 4, texto: desmayusculizar(linea.replace(/[:.]+$/, '')) }];
  }

  if (NAP_TITULO.test(linea) && linea.length <= 120) {
    return [tituloOMeta(desmayusculizar(linea), 3, ctx)];
  }

  if (EN_RELACION.test(linea) && linea.length <= 160) {
    return [{ k: 'titulo', nivel: 4, texto: limpiarEje(linea) }];
  }

  // Ítems de lista: viñeta, "a)"
  if (VINETA.test(linea)) {
    const texto = linea.replace(VINETA, '').trim();
    return texto ? [{ k: 'item', texto }] : [];
  }
  if (ITEM_LETRA.test(linea)) return [{ k: 'item', texto: linea }];

  // Áreas y años solos en su renglón
  if (linea.length <= 70 && !/[.;,]$/.test(linea)) {
    const meta = metaDeTitulo(linea, ctx);
    if (meta) return [meta];
  }

  // "2.1 Alcance": sección numerada corta. Larga o con punto final, es un ítem.
  m = linea.match(SECCION_NUMERADA);
  if (m) {
    const itemNap = ctx.nap && ITEM_NUMERO.test(linea) && !esMayusculas(m[2]);
    const corta = m[2].length <= 90 && !/[.;,]$/.test(m[2]);
    if (!itemNap && corta && /^[\p{Lu}¿¡"«(]/u.test(m[2])) {
      const nivel = Math.min(6, 2 + m[1].split('.').filter(Boolean).length);
      return [{ k: 'titulo', nivel, texto: `${m[1]} ${desmayusculizar(m[2])}` }];
    }
    if (ITEM_NUMERO.test(linea)) return [{ k: 'item', texto: linea.replace(ITEM_NUMERO, '').trim() }];
  }

  // Renglón corto en MAYÚSCULAS: título
  if (esMayusculas(linea) && linea.length <= 100 && !/[,;]$/.test(linea)) {
    return [{ k: 'titulo', nivel: 3, texto: desmayusculizar(linea.replace(/[:.]+$/, '')), mayus: true }];
  }

  return [{ k: 'texto', texto: linea }];
}

/** Un título que en realidad es solo un área o un año ("MATEMÁTICA", "1° AÑO", "Lengua – 2° año"). */
function metaDeTitulo(t: string, ctx: Contexto): Renglon | null {
  const area = areaDeTitulo(t, ctx.areas);
  const anios = aniosDeTitulo(t);
  if (!area && !anios) return null;
  if (restoDeTitulo(t, area).length > 12) return null;
  if (area) return { k: 'area', area, anios };
  return anios ? { k: 'anio', anios } : null;
}

function tituloOMeta(texto: string, nivel: number, ctx: Contexto): Renglon {
  return metaDeTitulo(texto, ctx)
    ?? { k: 'titulo', nivel, texto: EN_RELACION.test(texto) ? limpiarEje(texto) : desmayusculizar(texto) };
}

/** Renglones que forman parte de la estructura: nunca se descartan por repetidos. */
function esEstructural(linea: string): boolean {
  return MARKDOWN.test(linea) || ARTICULO.test(linea) || EJE.test(linea)
    || EN_RELACION.test(linea) || VINETA.test(linea) || ITEM_LETRA.test(linea)
    || (linea.length <= 70 && aniosDeTitulo(linea) !== null);
}

/** Texto crudo → renglones (sin espacios de más, con las palabras cortadas unidas). */
export function limpiarTexto(crudo: string): string[] {
  const texto = crudo
    .replace(/\r\n?/g, '\n')
    .replace(/[\u00a0\u2007\u202f]/g, ' ')
    .replace(/\u00ad/g, '')
    .replace(/\f/g, '\n\n')
    // pala-\nbra → palabra (corte de renglón de los PDF)
    .replace(/(\p{Ll})-\n[ \t]*(\p{Ll})/gu, '$1$2');

  const lineas = texto.split('\n').map(l => l.replace(/[ \t]+/g, ' ').trim());

  // Una viñeta sola en su renglón va con el renglón siguiente
  const unidas: string[] = [];
  for (let i = 0; i < lineas.length; i++) {
    const l = lineas[i];
    if (/^[•·▪●◦‣○■□➢►✓✔-]$/.test(l) && i + 1 < lineas.length && lineas[i + 1]) {
      unidas.push(`• ${lineas[i + 1]}`);
      i++;
    } else {
      unidas.push(l);
    }
  }
  return unidas;
}

/** Saca números de página y encabezados/pies repetidos (se queda con el primero). */
function sacarRelleno(lineas: string[], ctx: Contexto): string[] {
  const veces = new Map<string, number>();
  const clave = (l: string) => normalizar(l).replace(/\d+/g, '#');
  for (const l of lineas) {
    if (!l || l.length > 120) continue;
    const k = clave(l);
    veces.set(k, (veces.get(k) ?? 0) + 1);
  }
  const vistas = new Set<string>();
  const salida: string[] = [];
  for (const l of lineas) {
    if (!l) { salida.push(''); continue; }
    if (NUMERO_PAGINA.some(r => r.test(l))) continue;
    // Solo signos (líneas de guiones, puntos de un índice)
    if (!/[\p{L}\p{N}]/u.test(l)) continue;
    if (l.length <= 120 && !esEstructural(l)) {
      const k = clave(l);
      if ((veces.get(k) ?? 0) >= 3) {
        // Encabezado o pie de página. Si es un título (un área, un renglón
        // en mayúsculas) se queda la primera vez; si es texto, ninguna.
        const titulo = esMayusculas(l) || metaDeTitulo(l, ctx) !== null;
        if (!titulo || vistas.has(k)) continue;
        vistas.add(k);
      }
    }
    salida.push(l);
  }
  return salida;
}

// ── Partir texto largo ──

/** Oraciones de un texto, sin cortar en "Art. 5", "Res. CFE" ni "J. Pérez". */
export function oraciones(texto: string): string[] {
  const salida: string[] = [];
  let desde = 0;
  const fin = /[.!?;]["»”)]?\s+(?=[\p{Lu}¿¡"«(\d•])/gu;
  for (const m of texto.matchAll(fin)) {
    const idx = m.index ?? 0;
    const corte = idx + m[0].length;
    const ultima = (texto.slice(desde, idx + 1).match(/(\S+)\.$/)?.[1] ?? '').toLowerCase();
    // Abreviatura, inicial o número de inciso ("1. ")
    if (ABREVIATURAS.has(ultima) || /^\p{L}$/u.test(ultima) || /^\d{1,3}$/.test(ultima)) continue;
    salida.push(texto.slice(desde, corte).trim());
    desde = corte;
  }
  const resto = texto.slice(desde).trim();
  if (resto) salida.push(resto);
  return salida.filter(Boolean);
}

/** Parte un texto en pedazos de hasta `max` caracteres, entre oraciones. */
export function partirPorOraciones(texto: string, max = MAX_FRAGMENTO): string[] {
  const limpio = texto.trim();
  if (limpio.length <= max) return limpio ? [limpio] : [];
  const pedazos: string[] = [];
  let actual = '';
  const cerrar = () => { if (actual.trim()) pedazos.push(actual.trim()); actual = ''; };
  // Primero entre párrafos; dentro de cada párrafo, entre oraciones
  const unidades = limpio.split(/\n{2,}/).flatMap((p, i) => {
    const ors = oraciones(p);
    return ors.map((o, j) => ({ texto: o, nuevoParrafo: i > 0 && j === 0 }));
  });
  for (const { texto: o, nuevoParrafo } of unidades) {
    // Una oración más larga que el tope (tablas, listas sin puntos): se corta en un espacio
    if (o.length > max) {
      cerrar();
      let resto = o;
      while (resto.length > max) {
        let corte = resto.lastIndexOf(' ', max);
        if (corte < max * 0.5) corte = max;
        pedazos.push(resto.slice(0, corte).trim());
        resto = resto.slice(corte).trim();
      }
      actual = resto;
      continue;
    }
    const sep = nuevoParrafo ? '\n\n' : ' ';
    if (actual && actual.length + sep.length + o.length > max) cerrar();
    actual = actual ? `${actual}${sep}${o}` : o;
  }
  cerrar();
  return pedazos;
}

/** Parte un texto en dos partes parecidas, entre oraciones. null si es una sola oración. */
export function partirEnDos(texto: string): [string, string] | null {
  const ors = oraciones(texto.trim());
  if (ors.length < 2) return null;
  const total = ors.reduce((n, o) => n + o.length + 1, 0);
  let acumulado = 0;
  let mejor = 1;
  let mejorDif = Infinity;
  for (let i = 1; i < ors.length; i++) {
    acumulado += ors[i - 1].length + 1;
    const dif = Math.abs(total / 2 - acumulado);
    if (dif < mejorDif) { mejorDif = dif; mejor = i; }
  }
  return [ors.slice(0, mejor).join(' '), ors.slice(mejor).join(' ')];
}

// ── Armar los fragmentos ──

interface Titulo { nivel: number; texto: string; division?: boolean }

/** Bloques de una sección: párrafos (renglones unidos) e ítems de lista. */
interface Bloque { k: 'parrafo' | 'item'; texto: string }

export function fragmentar(crudo: string, opciones: OpcionesFragmentar = {}): FragmentoBorrador[] {
  const max = Math.max(200, Math.min(opciones.maxCaracteres ?? MAX_FRAGMENTO, MAX_FRAGMENTO_BASE));
  const nap = opciones.tipo === 'nap';
  const areasDoc = (opciones.areas ?? []).map(a => a.trim()).filter(Boolean);
  const ctx: Contexto = {
    nap,
    areas: [...new Set([...areasDoc, ...AREAS_CONOCIDAS])].sort((a, b) => b.length - a.length),
  };
  const aniosDoc = [...new Set(opciones.anios ?? [])].sort((a, b) => a - b);

  const renglones = sacarRelleno(limpiarTexto(crudo), ctx)
    .flatMap<Renglon>(l => (l ? clasificar(l, ctx) : [{ k: 'blanco' }]));

  const fragmentos: FragmentoBorrador[] = [];
  const pila: Titulo[] = [];
  // Área y año en curso: van aparte de la pila porque un documento puede
  // ordenar por área y después año, o al revés.
  // Lo cargado en el formulario sirve de punto de partida solo en NAP y
  // diseños curriculares; en una ley no aporta a la sección.
  const curricular = nap || opciones.tipo === 'diseno_curricular';
  let area: string | null = curricular && areasDoc.length === 1 ? areasDoc[0] : null;
  let anios: number[] | null = curricular && aniosDoc.length >= 1 && aniosDoc.length <= 2 ? aniosDoc : null;
  let bloques: Bloque[] = [];

  const seccionActual = (): string | null => {
    const meta = [area, anios ? etiquetaAnios(anios) : null].filter(Boolean) as string[];
    // NAP: área · año · eje. Otros: área · año (si hay) y los dos títulos más cercanos.
    const titulos = pila.map(t => t.texto).slice(nap ? -1 : -2);
    const partes = [...meta, ...titulos];
    if (partes.length === 0) return null;
    const s = partes.join(' · ');
    return s.length > 200 ? `${s.slice(0, 197)}…` : s;
  };

  const emitir = (texto: string, seccion: string | null) => {
    for (const p of partirPorOraciones(texto, max)) fragmentos.push({ seccion, texto: p });
  };

  /** Vuelca los bloques acumulados de la sección actual. */
  const volcar = () => {
    if (bloques.length === 0) return;
    const seccion = seccionActual();
    let actual = '';
    const cerrar = () => { if (actual) emitir(actual, seccion); actual = ''; };
    bloques.forEach((b, i) => {
      if (nap && b.k === 'item') {
        // Cada NAP, un fragmento
        cerrar();
        emitir(b.texto, seccion);
        return;
      }
      if (nap && b.k === 'parrafo' && /:$/.test(b.texto) && b.texto.length <= 300 && (i === bloques.length - 1 || bloques[i + 1].k === 'item')) {
        // "La escuela ofrecerá situaciones de enseñanza que promuevan…:" presenta la lista, no es un aprendizaje
        return;
      }
      const pieza = b.k === 'item' ? `• ${b.texto}` : b.texto;
      const sep = b.k === 'item' && bloques[i - 1]?.k === 'item' ? '\n' : '\n\n';
      if (pieza.length > max) {
        cerrar();
        emitir(pieza, seccion);
        return;
      }
      if (actual && actual.length + sep.length + pieza.length > max) cerrar();
      actual = actual ? `${actual}${sep}${pieza}` : pieza;
    });
    cerrar();
    bloques = [];
  };

  // El párrafo o ítem que puede seguir en el renglón siguiente
  let abierto: Bloque | null = null;
  // El último renglón fue un "CAPÍTULO I" sin nombre: el título siguiente en mayúsculas es su nombre
  let pegable = false;

  for (const r of renglones) {
    if (r.k === 'blanco') {
      abierto = null;
      continue;
    }
    const eraPegable = pegable;
    pegable = false;

    switch (r.k) {
      case 'area':
        volcar();
        abierto = null;
        area = r.area;
        if (r.anios) anios = r.anios;
        // Los ejes y secciones del área anterior no siguen
        pila.length = 0;
        break;
      case 'anio':
        volcar();
        abierto = null;
        anios = r.anios;
        pila.length = 0;
        break;
      case 'titulo': {
        const arriba = pila[pila.length - 1];
        // "CAPÍTULO I" + "DISPOSICIONES GENERALES" en el renglón siguiente: un solo título
        if (r.mayus && eraPegable && arriba?.division) {
          arriba.texto = `${arriba.texto}: ${r.texto}`;
          arriba.division = false;
          break;
        }
        volcar();
        abierto = null;
        // Un título del mismo nivel o más alto cierra los anteriores
        while (pila.length > 0 && pila[pila.length - 1].nivel >= r.nivel) pila.pop();
        pila.push({ nivel: r.nivel, texto: r.texto, division: r.division });
        pegable = Boolean(r.division);
        break;
      }
      case 'item':
        abierto = { k: 'item', texto: r.texto };
        bloques.push(abierto);
        break;
      case 'texto': {
        // Sigue el párrafo o ítem anterior si este no terminó en punto, o si
        // el renglón arranca en minúscula (es la misma oración partida).
        const sigue = abierto !== null && (!/[.!?:]["»”)]?$/.test(abierto.texto) || /^[\p{Ll},;)]/u.test(r.texto));
        if (abierto && sigue) {
          abierto.texto = `${abierto.texto} ${r.texto}`;
        } else {
          abierto = { k: 'parrafo', texto: r.texto };
          bloques.push(abierto);
        }
        break;
      }
    }
  }
  volcar();

  return fragmentos.filter(f => f.texto.trim().length > 0);
}
