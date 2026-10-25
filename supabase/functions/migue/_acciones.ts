/**
 * Los botones que Migue le puede ofrecer al docente (UX docente, 25/10/2026).
 *
 * Migue no navega ni crea nada: al final de la respuesta deja marcas como
 * [[accion:armar_actividad|un pedido corto]] y acá se convierten en botones
 * con la ruta armada del lado del servidor, con los ids del contexto que se
 * leyó con los permisos del docente. Una marca que no está en esta lista, o
 * que necesita un tema que no hay, se descarta.
 */

import type { ContextoResuelto } from './_contexto.ts';

interface Accion {
  etiqueta: string;
  /** Necesita un tema en el contexto */
  conTema?: boolean;
  ruta: (c: ContextoResuelto | null, pedido: string) => string;
}

const enc = encodeURIComponent;

const ACCIONES: Record<string, Accion> = {
  armar_actividad: {
    etiqueta: 'Armar la actividad', conTema: true,
    ruta: (c, pedido) => `/actividades/nueva?tema=${c!.temaId}${pedido ? `&pedido=${enc(pedido)}` : ''}`,
  },
  armar_evaluacion: {
    etiqueta: 'Armar la evaluación', conTema: true,
    ruta: (c, pedido) => `/actividades/nueva?tipo=evaluacion&tema=${c!.temaId}${pedido ? `&pedido=${enc(pedido)}` : ''}`,
  },
  presentacion: {
    etiqueta: 'Armar la presentación', conTema: true,
    ruta: c => `/ia-lab?clase=${c!.temaId}&herramienta=pres`,
  },
  clase_en_vivo: {
    etiqueta: 'Dar el tema en vivo', conTema: true,
    ruta: c => `/clase-en-vivo?tema=${c!.temaId}`,
  },
  subir_material: {
    etiqueta: 'Subir material al tema', conTema: true,
    ruta: c => `/biblioteca?subir=archivo&tema=${c!.temaId}&volver=${enc(`/tema/${c!.temaId}`)}`,
  },
  abrir_tema: {
    etiqueta: 'Ir al tema', conTema: true,
    ruta: c => `/tema/${c!.temaId}`,
  },
  planificacion: { etiqueta: 'Ir a mi planificación', ruta: () => '/planificacion' },
  horario: { etiqueta: 'Cargar mi horario', ruta: () => '/agenda' },
  seguimiento: { etiqueta: 'Ver el seguimiento', ruta: () => '/seguimiento' },
  biblioteca: { etiqueta: 'Ir a mis materiales', ruta: () => '/biblioteca' },
  clase_en_vivo_sin_tema: { etiqueta: 'Abrir la clase en vivo', ruta: () => '/clase-en-vivo' },
};

/** Para el prompt (parte fija, con caché): qué marcas existen y cuándo usarlas */
export const GUIA_ACCIONES = `## Botones que podés ofrecer
Si lo que respondiste se hace en la app, terminá con una o dos marcas (nunca más), cada
una sola en su línea, al final de todo. La app las muestra como botones; no las expliques
ni las nombres en el texto.
- [[accion:armar_actividad|pedido]]: armar una actividad, TP o tarea del tema. Después de
  la barra, en menos de 200 caracteres, lo que tiene que pedir (por ejemplo "5 preguntas
  de opción múltiple sobre fracciones equivalentes, con una de desarrollo").
- [[accion:armar_evaluacion|pedido]]: lo mismo, pero una evaluación.
- [[accion:presentacion]]: armar la presentación del tema.
- [[accion:clase_en_vivo]]: dar el tema en la clase en vivo (con sus preguntas preparadas).
- [[accion:subir_material]]: subir o escanear material para el tema.
- [[accion:abrir_tema]]: ir al tema (si no lo está mirando).
- [[accion:planificacion]], [[accion:horario]], [[accion:seguimiento]], [[accion:biblioteca]],
  [[accion:clase_en_vivo_sin_tema]]: ir a esa parte de la app.
Las que dicen "del tema" solo si en "Lo que está mirando ahora" hay un tema (o algo de un
tema). Si la respuesta es una charla o una idea, no pongas ninguna.`;

const MARCA = /\[\[accion:([a-z_]+)(?:\|([^\]]{0,300}))?\]\]/g;

/** Las marcas de la respuesta, convertidas en botones (como mucho dos, sin repetir) */
export function accionesDe(texto: string, c: ContextoResuelto | null): { clave: string; etiqueta: string; ruta: string }[] {
  const salida: { clave: string; etiqueta: string; ruta: string }[] = [];
  for (const m of texto.matchAll(MARCA)) {
    const clave = m[1];
    const a = ACCIONES[clave];
    if (!a || salida.some(x => x.clave === clave)) continue;
    if (a.conTema && !c?.temaId) continue;
    const pedido = (m[2] ?? '').replace(/\s+/g, ' ').trim().slice(0, 300);
    salida.push({ clave, etiqueta: a.etiqueta, ruta: a.ruta(c, pedido) });
    if (salida.length === 2) break;
  }
  return salida;
}

/** El texto sin las marcas (lo que se guarda en la conversación) */
export function sinMarcas(texto: string): string {
  return texto.replace(/\[\[accion:[^\]]*\]\]\s*/g, '').replace(/\[\[[^\]]*$/, '').trimEnd();
}
