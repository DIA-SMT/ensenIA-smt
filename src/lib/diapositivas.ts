/**
 * SMT EstudIA — Las diapositivas como datos
 *
 * Hasta acá un mazo era el Markdown que escupió el chat, y para mostrarlo
 * había que reconstruir la estructura con expresiones regulares
 * (lib/presentation.ts: 228 líneas de patrones, con el comentario honesto
 * de que "la IA se toma libertades"). Cada variante nueva que inventa el
 * modelo es un parche más.
 *
 * Acá el mazo es una estructura. La IA la devuelve ya armada contra un
 * JSON Schema —el mismo camino que ya usan las placas de estudio y la
 * importación de programas— y de este lado no se adivina nada.
 *
 * Este archivo no importa nada de presentation.ts ni de pptx.ts a
 * propósito: esos están en obra. La conversión desde el formato viejo
 * recibe la forma por parámetro, no el tipo.
 */

import type { DisenoId } from './disenos';

// ══════════════════════════════════════
// El mazo
// ══════════════════════════════════════

/**
 * Tipo de lámina. Hoy todo se dibuja como "puntos" —de ahí que diez
 * diapositivas seguidas se vean iguales—, pero el dato viaja desde ahora
 * para que la etapa de diseño visual no tenga que volver a migrar nada.
 */
export type TipoLamina =
  | 'portada'
  | 'puntos'
  | 'destacado'
  | 'dos-columnas'
  | 'pregunta'
  | 'imagen'
  | 'cierre';

export const TIPOS_LAMINA: TipoLamina[] = [
  'portada', 'puntos', 'destacado', 'dos-columnas', 'pregunta', 'imagen', 'cierre',
];

export interface Columna {
  titulo: string;
  puntos: string[];
}

export interface Imagen {
  /** Ruta dentro del bucket "library". La URL firmada se pide al mostrarla:
      guardar la URL seria guardar algo que caduca en una hora. */
  ruta: string;
  /** Texto alternativo. Sin esto la lamina no sirve con lector de pantalla. */
  alt: string;
}

export interface Diapositiva {
  tipo: TipoLamina;
  titulo: string;
  /** portada: subtítulo · puntos/cierre: las viñetas · otros: vacío. */
  puntos: string[];
  /** destacado: la frase grande que ocupa la lámina. */
  destacado?: string;
  /** dos-columnas: qué va de cada lado. */
  izquierda?: Columna;
  derecha?: Columna;
  /** pregunta: las opciones, sin la letra (la pone el visor). */
  opciones?: string[];
  /** pregunta: índice de la correcta, o null si es de opinión. */
  correcta?: number | null;
  /** Imagen de la lámina. La sube el docente. */
  imagen?: Imagen;
  /** Notas del orador. Nunca se le muestran al curso. */
  nota?: string;
}

export interface Mazo {
  titulo: string;
  subtitulo?: string;
  diseno?: DisenoId;
  diapositivas: Diapositiva[];
}

// ══════════════════════════════════════
// Validación
// ══════════════════════════════════════

const texto = (v: unknown, max = 400): string =>
  typeof v === 'string' ? v.trim().slice(0, max) : '';

const lista = (v: unknown, max = 12): string[] =>
  Array.isArray(v) ? v.map(x => texto(x)).filter(Boolean).slice(0, max) : [];

function columna(v: unknown): Columna | undefined {
  if (!v || typeof v !== 'object') return undefined;
  const o = v as Record<string, unknown>;
  const c = { titulo: texto(o.titulo, 120), puntos: lista(o.puntos, 8) };
  return c.titulo || c.puntos.length ? c : undefined;
}

/**
 * Deja una diapositiva utilizable venga como venga.
 *
 * El structured output garantiza la forma, no el criterio: el modelo
 * puede marcar "dos-columnas" y mandar una sola, o "pregunta" sin
 * opciones. Antes que mostrar una lámina rota, se degrada a puntos.
 */
export function normalizarDiapositiva(v: unknown): Diapositiva | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;

  const titulo = texto(o.titulo, 160);
  const puntos = lista(o.puntos);
  const destacado = texto(o.destacado, 300) || undefined;
  const izquierda = columna(o.izquierda);
  const derecha = columna(o.derecha);
  const opciones = lista(o.opciones, 6);
  const nota = texto(o.nota, 600) || undefined;

  const img = o.imagen as Record<string, unknown> | undefined;
  const imagen = img && typeof img === 'object' && texto(img.ruta, 400)
    ? { ruta: texto(img.ruta, 400), alt: texto(img.alt, 200) }
    : undefined;

  let tipo: TipoLamina = TIPOS_LAMINA.includes(o.tipo as TipoLamina)
    ? (o.tipo as TipoLamina)
    : 'puntos';

  // Degradaciones: el tipo promete algo que el contenido no trae.
  if (tipo === 'dos-columnas' && !(izquierda && derecha)) tipo = 'puntos';
  if (tipo === 'destacado' && !destacado) tipo = 'puntos';
  if (tipo === 'pregunta' && opciones.length < 2) tipo = 'puntos';
  // Una lámina de imagen sin imagen es una lámina en blanco.
  if (tipo === 'imagen' && !imagen) tipo = 'puntos';

  // Una lámina sin nada que mostrar no va.
  const tieneCuerpo = puntos.length || destacado || izquierda || opciones.length || imagen;
  if (!titulo && !tieneCuerpo) return null;

  const correctaCruda = typeof o.correcta === 'number' ? o.correcta : null;
  const correcta = tipo === 'pregunta' && correctaCruda !== null
    && correctaCruda >= 0 && correctaCruda < opciones.length
    ? correctaCruda
    : null;

  return {
    tipo,
    titulo: titulo || 'Sin título',
    puntos,
    ...(destacado && tipo === 'destacado' ? { destacado } : {}),
    ...(tipo === 'dos-columnas' ? { izquierda, derecha } : {}),
    ...(tipo === 'pregunta' ? { opciones, correcta } : {}),
    ...(imagen ? { imagen } : {}),
    ...(nota ? { nota } : {}),
  };
}

export function normalizarMazo(v: unknown): Mazo | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  const diapositivas = Array.isArray(o.diapositivas)
    ? o.diapositivas.map(normalizarDiapositiva).filter((d): d is Diapositiva => d !== null)
    : [];
  if (diapositivas.length === 0) return null;
  return {
    titulo: texto(o.titulo, 200) || 'Presentación',
    ...(texto(o.subtitulo, 200) ? { subtitulo: texto(o.subtitulo, 200) } : {}),
    ...(typeof o.diseno === 'string' ? { diseno: o.diseno as DisenoId } : {}),
    diapositivas,
  };
}

/** ¿Lo que salió de la base es un mazo que podemos usar? */
export function esMazo(v: unknown): v is Mazo {
  return normalizarMazo(v) !== null;
}

// ══════════════════════════════════════
// Puentes con lo que ya existe
// ══════════════════════════════════════

/** La forma que devuelve el parser viejo (lib/presentation.ts). */
export interface MazoLegado {
  title: string;
  subtitle?: string;
  diseno?: string;
  slides: { title: string; bullets: string[]; note?: string; portada?: boolean }[];
}

/**
 * Convierte un mazo del formato viejo al nuevo, sin perder nada.
 *
 * Los mazos que ya están guardados siguen siendo Markdown: se leen con el
 * parser de siempre y se convierten acá. Recién cuando alguien los edita
 * se guardan como JSON. Nadie tiene que migrar nada a mano.
 */
export function desdeLegado(pres: MazoLegado): Mazo {
  const diapositivas = pres.slides.map((s, i): Diapositiva => {
    // El formato viejo marcaba las preguntas por el título ("🙋 Pregunta al
    // grupo") y las opciones venían como viñetas "A) ...".
    const esPregunta = /pregunta/i.test(s.title);
    const opciones = esPregunta
      ? s.bullets.filter(b => /^[a-dA-D][)\].]\s/.test(b)).map(b => b.replace(/^[a-dA-D][)\].]\s*/, ''))
      : [];

    if (esPregunta && opciones.length >= 2) {
      return {
        tipo: 'pregunta',
        titulo: s.title,
        puntos: s.bullets.filter(b => !/^[a-dA-D][)\].]\s/.test(b)),
        opciones,
        correcta: null,
        ...(s.note ? { nota: s.note } : {}),
      };
    }

    return {
      tipo: s.portada || i === 0 ? 'portada' : 'puntos',
      titulo: s.title,
      puntos: s.bullets,
      ...(s.note ? { nota: s.note } : {}),
    };
  });

  // Si la primera no era portada de verdad, que no quede marcada como tal.
  if (diapositivas[0]?.tipo === 'portada' && !pres.slides[0]?.portada) {
    const primera = pres.slides[0];
    const pareceTitulo = primera && primera.bullets.length <= 2;
    if (!pareceTitulo) diapositivas[0].tipo = 'puntos';
  }

  return {
    titulo: pres.title,
    ...(pres.subtitle ? { subtitulo: pres.subtitle } : {}),
    ...(pres.diseno ? { diseno: pres.diseno as DisenoId } : {}),
    diapositivas,
  };
}

/**
 * El mazo en texto corrido.
 *
 * La biblioteca busca "por título, tag o contenido" sobre extracted_text.
 * Si el mazo viviera solo en JSON, las presentaciones dejarían de
 * aparecer en los resultados: por eso al guardar se escriben las dos
 * cosas, el JSON como fuente de verdad y esto para que se encuentre.
 */
export function aTextoPlano(mazo: Mazo): string {
  const partes: string[] = [mazo.titulo];
  if (mazo.subtitulo) partes.push(mazo.subtitulo);

  mazo.diapositivas.forEach((d, i) => {
    partes.push(`\nDiapositiva ${i + 1}: ${d.titulo}`);
    if (d.destacado) partes.push(d.destacado);
    d.puntos.forEach(p => partes.push(`- ${p}`));
    for (const col of [d.izquierda, d.derecha]) {
      if (!col) continue;
      partes.push(col.titulo);
      col.puntos.forEach(p => partes.push(`- ${p}`));
    }
    d.opciones?.forEach((o, j) => partes.push(`${String.fromCharCode(65 + j)}) ${o}`));
    if (d.imagen?.alt) partes.push(d.imagen.alt);
    // Las notas del docente NO van: este texto lo usan las herramientas de
    // los estudiantes (quiz, guía, "Explicámelo fácil") y la clase en vivo.
  });

  return partes.join('\n');
}
