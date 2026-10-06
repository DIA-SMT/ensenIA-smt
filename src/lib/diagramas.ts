/**
 * Diagramas a partir del material: flujograma, ciclo, causa y efecto, mapa
 * mental y línea de tiempo.
 *
 * Igual que con las diapositivas, la IA NO escribe código de Mermaid (se
 * equivoca en la sintaxis y el diagrama no se dibuja): devuelve datos —
 * nodos, conexiones, ramas, eventos— y el código lo armamos acá, con todo el
 * texto escapado. El docente corrige los textos y se vuelve a dibujar.
 *
 * Lo que se guarda para los estudiantes es la imagen (PNG): no bajan Mermaid.
 */

export type VarianteDiagrama = 'flujo' | 'ciclo' | 'causa_efecto' | 'mapa_mental' | 'linea_tiempo';

export const VARIANTES: { id: VarianteDiagrama; etiqueta: string; para: string }[] = [
  { id: 'flujo', etiqueta: 'Flujograma', para: 'Pasos de un proceso, con decisiones' },
  { id: 'ciclo', etiqueta: 'Ciclo', para: 'Algo que se repite: el ciclo del agua, de la vida' },
  { id: 'causa_efecto', etiqueta: 'Causas y efecto', para: 'Qué provocó algo y qué consecuencias tuvo' },
  { id: 'mapa_mental', etiqueta: 'Mapa mental', para: 'Un tema central y sus ideas' },
  { id: 'linea_tiempo', etiqueta: 'Línea de tiempo', para: 'Hechos ordenados por fecha' },
];

export type FormaNodo = 'inicio' | 'proceso' | 'decision' | 'fin';

export interface NodoDiagrama { id: string; texto: string; forma: FormaNodo }
export interface ConexionDiagrama { desde: string; hacia: string; etiqueta: string }
export interface RamaDiagrama { texto: string; hijos: string[] }
export interface EventoDiagrama { fecha: string; texto: string }

export interface Diagrama {
  tipo: 'diagrama';
  variante: VarianteDiagrama;
  titulo: string;
  /** Qué muestra, en una o dos frases: texto alternativo para lectores de pantalla. */
  descripcion: string;
  nodos: NodoDiagrama[];
  conexiones: ConexionDiagrama[];
  ramas: RamaDiagrama[];
  eventos: EventoDiagrama[];
}

const LARGO_TEXTO = 80;
const corto = (s: unknown, max = LARGO_TEXTO) =>
  (typeof s === 'string' ? s : '').replace(/\s+/g, ' ').trim().slice(0, max);

const esVariante = (v: unknown): v is VarianteDiagrama => VARIANTES.some(x => x.id === v);
const esForma = (f: unknown): f is FormaNodo => f === 'inicio' || f === 'proceso' || f === 'decision' || f === 'fin';

/**
 * Valida y acomoda lo que mande la IA (o lo guardado). Devuelve null si no
 * alcanza para dibujar algo con sentido.
 */
export function normalizarDiagrama(crudo: unknown): Diagrama | null {
  if (!crudo || typeof crudo !== 'object') return null;
  const c = crudo as Record<string, unknown>;
  if (!esVariante(c.variante)) return null;
  const variante = c.variante;
  const titulo = corto(c.titulo, 100) || 'Diagrama';
  const descripcion = corto(c.descripcion, 300);

  const arr = (x: unknown) => (Array.isArray(x) ? x : []);

  if (variante === 'mapa_mental') {
    const ramas = arr(c.ramas)
      .map(r => ({
        texto: corto((r as RamaDiagrama)?.texto),
        hijos: arr((r as RamaDiagrama)?.hijos).map(h => corto(h)).filter(Boolean).slice(0, 5),
      }))
      .filter(r => r.texto)
      .slice(0, 7);
    if (ramas.length < 2) return null;
    return { tipo: 'diagrama', variante, titulo, descripcion, nodos: [], conexiones: [], ramas, eventos: [] };
  }

  if (variante === 'linea_tiempo') {
    const eventos = arr(c.eventos)
      .map(e => ({ fecha: corto((e as EventoDiagrama)?.fecha, 30), texto: corto((e as EventoDiagrama)?.texto, 120) }))
      .filter(e => e.fecha && e.texto)
      .slice(0, 10);
    if (eventos.length < 2) return null;
    return { tipo: 'diagrama', variante, titulo, descripcion, nodos: [], conexiones: [], ramas: [], eventos };
  }

  // Flujo, ciclo y causa-efecto: nodos y conexiones
  const vistos = new Set<string>();
  const nodos: NodoDiagrama[] = [];
  for (const n of arr(c.nodos)) {
    const nodo = n as Partial<NodoDiagrama>;
    const id = corto(nodo?.id, 40);
    const texto = corto(nodo?.texto);
    if (!id || !texto || vistos.has(id)) continue;
    vistos.add(id);
    nodos.push({ id, texto, forma: esForma(nodo.forma) ? nodo.forma : 'proceso' });
    if (nodos.length >= 14) break;
  }
  if (nodos.length < 2) return null;
  const conexiones = arr(c.conexiones)
    .map(x => ({
      desde: corto((x as ConexionDiagrama)?.desde, 40),
      hacia: corto((x as ConexionDiagrama)?.hacia, 40),
      etiqueta: corto((x as ConexionDiagrama)?.etiqueta, 30),
    }))
    // Solo entre nodos que existen y sin conectar un nodo consigo mismo
    .filter(x => vistos.has(x.desde) && vistos.has(x.hacia) && x.desde !== x.hacia)
    .slice(0, 24);
  if (conexiones.length < 1) return null;
  return { tipo: 'diagrama', variante, titulo, descripcion, nodos, conexiones, ramas: [], eventos: [] };
}

export const esDiagrama = (v: unknown): v is Diagrama =>
  !!v && typeof v === 'object' && (v as Diagrama).tipo === 'diagrama' && normalizarDiagrama(v) !== null;

/**
 * Texto seguro para una etiqueta de Mermaid entre comillas: sin comillas,
 * sin saltos y sin los caracteres que Mermaid interpreta.
 */
const etiqueta = (s: string) => s
  .replace(/"/g, '”')
  .replace(/[<>]/g, ' ')
  .replace(/[\r\n]+/g, ' ')
  .replace(/[`#;]/g, ' ')
  .trim();

/** Mapas mentales y líneas de tiempo no llevan comillas: también sin paréntesis, corchetes ni dos puntos. */
const textoPlanoMermaid = (s: string) => etiqueta(s).replace(/[()[\]{}:]/g, ' ').replace(/\s+/g, ' ').trim();

/** El código de Mermaid del diagrama. */
export function aMermaid(d: Diagrama): string {
  if (d.variante === 'mapa_mental') {
    const lineas = ['mindmap', `  root((${textoPlanoMermaid(d.titulo)}))`];
    for (const r of d.ramas) {
      lineas.push(`    ${textoPlanoMermaid(r.texto)}`);
      for (const h of r.hijos) lineas.push(`      ${textoPlanoMermaid(h)}`);
    }
    return lineas.join('\n');
  }

  if (d.variante === 'linea_tiempo') {
    const lineas = ['timeline', `  title ${textoPlanoMermaid(d.titulo)}`];
    for (const e of d.eventos) lineas.push(`  ${textoPlanoMermaid(e.fecha)} : ${textoPlanoMermaid(e.texto)}`);
    return lineas.join('\n');
  }

  // Ids propios (n1, n2…): los de la IA pueden traer espacios o palabras reservadas
  const idDe = new Map(d.nodos.map((n, i) => [n.id, `n${i + 1}`]));
  const forma = (n: NodoDiagrama) => {
    const t = `"${etiqueta(n.texto)}"`;
    if (n.forma === 'decision') return `{${t}}`;
    if (n.forma === 'inicio' || n.forma === 'fin') return `([${t}])`;
    return `[${t}]`;
  };
  const direccion = d.variante === 'flujo' ? 'TD' : 'LR';
  const lineas = [`flowchart ${direccion}`];
  for (const n of d.nodos) lineas.push(`  ${idDe.get(n.id)}${forma(n)}`);
  for (const c of d.conexiones) {
    const rotulo = c.etiqueta ? `|"${etiqueta(c.etiqueta)}"|` : '';
    lineas.push(`  ${idDe.get(c.desde)} -->${rotulo} ${idDe.get(c.hacia)}`);
  }
  return lineas.join('\n');
}

/**
 * El diagrama en texto: para el lector de pantalla, para buscar en la
 * biblioteca y para que la IA lo use como fuente (placas, quiz).
 */
export function diagramaATexto(d: Diagrama): string {
  const cab = [`${VARIANTES.find(v => v.id === d.variante)?.etiqueta ?? 'Diagrama'}: ${d.titulo}`];
  if (d.descripcion) cab.push(d.descripcion);
  if (d.variante === 'mapa_mental') {
    return [...cab, '', ...d.ramas.flatMap(r => [`- ${r.texto}`, ...r.hijos.map(h => `  - ${h}`)])].join('\n');
  }
  if (d.variante === 'linea_tiempo') {
    return [...cab, '', ...d.eventos.map(e => `- ${e.fecha}: ${e.texto}`)].join('\n');
  }
  const textoDe = new Map(d.nodos.map(n => [n.id, n.texto]));
  return [
    ...cab, '',
    ...d.conexiones.map(c => `- ${textoDe.get(c.desde)} → ${textoDe.get(c.hacia)}${c.etiqueta ? ` (${c.etiqueta})` : ''}`),
  ].join('\n');
}
