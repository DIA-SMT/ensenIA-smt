/**
 * ENSEÑIA SMT — Orientación vocacional (020)
 *
 * No es un test que "da" una carrera. Junta lo que al estudiante le
 * interesa, lo que él mismo escribe, y deja una devolución para
 * conversar con el equipo de orientación. Por eso el resultado es texto
 * y no un puntaje, y por eso compartirlo con la escuela lo decide él.
 */

import { supabase } from './_helpers';
import type { VocationalProfile } from '../types';

export interface VocationalArea {
  key: string;
  nombre: string;
  descripcion: string;
}

/**
 * Seis áreas pensadas para la secundaria pública argentina: nombres que
 * un chico de 15 reconoce, no categorías de manual.
 */
export const AREAS: VocationalArea[] = [
  { key: 'social', nombre: 'Trabajar con gente',
    descripcion: 'Enseñar, cuidar, acompañar, escuchar, resolver conflictos.' },
  { key: 'tecnica', nombre: 'Armar y arreglar cosas',
    descripcion: 'Entender cómo funciona algo, construirlo, repararlo, mejorarlo.' },
  { key: 'analitica', nombre: 'Investigar y entender por qué',
    descripcion: 'Preguntas, datos, experimentos, problemas que tienen vuelta.' },
  { key: 'creativa', nombre: 'Crear y contar',
    descripcion: 'Escribir, dibujar, filmar, tocar, diseñar, inventar.' },
  { key: 'organizativa', nombre: 'Organizar y coordinar',
    descripcion: 'Planificar, llevar cuentas, poner orden, que las cosas salgan.' },
  { key: 'naturaleza', nombre: 'Naturaleza y salud',
    descripcion: 'Animales, plantas, ambiente, el cuerpo, la salud de la gente.' },
];

export interface VocationalItem {
  id: string;
  area: string;
  texto: string;
}

/** Tres afirmaciones por área: suficientes para orientar, cortas para terminarlas. */
export const ITEMS: VocationalItem[] = [
  { id: 's1', area: 'social', texto: 'Me sale explicarle algo a alguien hasta que lo entiende.' },
  { id: 's2', area: 'social', texto: 'Cuando hay un problema entre compañeros, termino metiéndome a ayudar.' },
  { id: 's3', area: 'social', texto: 'Me gusta trabajar en grupo más que solo.' },

  { id: 't1', area: 'tecnica', texto: 'Si algo se rompe, lo abro para ver qué tiene adentro.' },
  { id: 't2', area: 'tecnica', texto: 'Disfruto armar cosas con las manos o con herramientas.' },
  { id: 't3', area: 'tecnica', texto: 'Me interesa cómo funcionan las máquinas, los motores o las computadoras.' },

  { id: 'a1', area: 'analitica', texto: 'Un problema difícil me da ganas de seguir hasta resolverlo.' },
  { id: 'a2', area: 'analitica', texto: 'Me gusta buscar información y comparar de dónde sale cada dato.' },
  { id: 'a3', area: 'analitica', texto: 'Prefiero entender por qué pasa algo antes que aprenderlo de memoria.' },

  { id: 'c1', area: 'creativa', texto: 'Se me ocurren ideas y tengo ganas de hacerlas.' },
  { id: 'c2', area: 'creativa', texto: 'Escribo, dibujo, filmo, toco o diseño por gusto, sin que me lo pidan.' },
  { id: 'c3', area: 'creativa', texto: 'Me importa que lo que hago quede lindo, no solo que funcione.' },

  { id: 'o1', area: 'organizativa', texto: 'Me sale organizar al grupo cuando hay que entregar algo.' },
  { id: 'o2', area: 'organizativa', texto: 'Llevo mis cosas ordenadas y me molesta el desorden.' },
  { id: 'o3', area: 'organizativa', texto: 'Me gusta planificar antes de arrancar.' },

  { id: 'n1', area: 'naturaleza', texto: 'Me interesan los animales, las plantas o el cuidado del ambiente.' },
  { id: 'n2', area: 'naturaleza', texto: 'Me llama la atención cómo funciona el cuerpo humano.' },
  { id: 'n3', area: 'naturaleza', texto: 'Me imagino trabajando al aire libre más que en una oficina.' },
];

function mapProfile(row: any): VocationalProfile {
  return {
    studentId: row.student_id,
    schoolId: row.school_id,
    answers: (row.answers ?? {}) as Record<string, number>,
    topAreas: row.top_areas ?? [],
    ownWords: row.own_words ?? null,
    summary: row.summary ?? null,
    sharedWithSchool: row.shared_with_school,
    updatedAt: row.updated_at,
  };
}

/**
 * Promedia por área y devuelve las que quedaron arriba. Empata a favor
 * del orden de AREAS solo para que el resultado sea estable, no porque
 * una valga más.
 */
export function calcularAreas(answers: Record<string, number>): string[] {
  const suma = new Map<string, { total: number; n: number }>();
  for (const item of ITEMS) {
    const v = answers[item.id];
    if (typeof v !== 'number') continue;
    const acc = suma.get(item.area) ?? { total: 0, n: 0 };
    acc.total += v;
    acc.n += 1;
    suma.set(item.area, acc);
  }
  return [...suma.entries()]
    .filter(([, a]) => a.n > 0)
    .map(([area, a]) => ({ area, prom: a.total / a.n }))
    .sort((x, y) => y.prom - x.prom)
    .slice(0, 3)
    .map(x => x.area);
}

export async function getMyProfile(studentId: string): Promise<VocationalProfile | null> {
  const { data, error } = await supabase
    .from('vocational_profiles')
    .select('*')
    .eq('student_id', studentId)
    .maybeSingle();
  if (error) throw error;
  return data ? mapProfile(data) : null;
}

export async function saveMyProfile(p: {
  studentId: string;
  schoolId: string;
  existe: boolean;
  answers: Record<string, number>;
  topAreas: string[];
  ownWords: string;
  summary: string | null;
  sharedWithSchool: boolean;
}): Promise<void> {
  const campos = {
    answers: p.answers,
    top_areas: p.topAreas,
    own_words: p.ownWords.trim() || null,
    summary: p.summary,
    shared_with_school: p.sharedWithSchool,
  };

  if (p.existe) {
    const { data, error } = await supabase
      .from('vocational_profiles')
      .update(campos)
      .eq('student_id', p.studentId)
      .select('student_id');
    if (error) throw error;
    if (!data || data.length === 0) throw new Error('No se pudo guardar tu perfil.');
    return;
  }

  const { error } = await supabase.from('vocational_profiles').insert({
    student_id: p.studentId,
    school_id: p.schoolId,
    ...campos,
  });
  if (error) throw error;
}

/**
 * ¿Las respuestas dibujan una preferencia, o el chico contestó parejo?
 * Sin esto, quien marca "Nada" a las 18 recibe tres áreas rankeadas con
 * la misma seguridad que quien tiene un perfil clarísimo — y encima son
 * siempre las tres primeras del listado, o sea puro artefacto del orden.
 */
export function hayPreferenciaClara(answers: Record<string, number>): boolean {
  const suma = new Map<string, { total: number; n: number }>();
  for (const item of ITEMS) {
    const v = answers[item.id];
    if (typeof v !== 'number') continue;
    const acc = suma.get(item.area) ?? { total: 0, n: 0 };
    acc.total += v;
    acc.n += 1;
    suma.set(item.area, acc);
  }
  const proms = [...suma.values()].filter(a => a.n > 0).map(a => a.total / a.n);
  if (proms.length < 2) return false;
  // Al menos un punto de la escala de 5 entre lo que más y lo que menos
  // le tira. Menos que eso no distingue nada.
  return Math.max(...proms) - Math.min(...proms) >= 1;
}

/** Devolución en texto a partir de las áreas que quedaron arriba. */
export function armarDevolucion(topAreas: string[], preferenciaClara = true): string {
  if (!preferenciaClara) {
    return [
      'Contestaste bastante parejo en todas las áreas, así que por ahora no se dibuja ' +
      'una preferencia clara. **Eso es completamente normal a tu edad** y no significa ' +
      'que no tengas intereses.',
      '',
      'Dos cosas que suelen ayudar más que un cuestionario: pensar en qué materia se te ' +
      'pasa rápido la hora, y charlarlo con el equipo de orientación de la escuela, que ' +
      'para eso está.',
      '',
      'Podés rehacerlo más adelante: las respuestas cambian, y está bien que cambien.',
    ].join('\n');
  }

  if (topAreas.length === 0) return '';
  const nombres = topAreas
    .map(k => AREAS.find(a => a.key === k)?.nombre)
    .filter(Boolean) as string[];

  const caminos: Record<string, string> = {
    social: 'docencia, trabajo social, psicología, enfermería, recursos humanos',
    tecnica: 'técnicas (electromecánica, electrónica, informática), ingenierías, oficios especializados',
    analitica: 'ciencias exactas y naturales, economía, programación, investigación',
    creativa: 'comunicación, diseño, audiovisual, música, letras, publicidad',
    organizativa: 'administración, contabilidad, logística, gestión, derecho',
    naturaleza: 'agronomía, veterinaria, biología, ciencias ambientales, salud',
  };

  const sugeridos = topAreas
    .map(k => caminos[k])
    .filter(Boolean)
    .join('; ');

  return [
    `Lo que más te tira: **${nombres.join('**, **')}**.`,
    '',
    `Por ahí andan caminos como ${sugeridos}.`,
    '',
    'Esto no te dice qué estudiar: es un punto de partida para conversarlo. ' +
    'Muchas personas combinan dos de estas áreas y ahí aparece lo interesante. ' +
    'Si te cierra, compartilo con la escuela y pedí una charla con el equipo de orientación.',
  ].join('\n');
}
