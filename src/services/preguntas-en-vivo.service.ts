/**
 * Preguntas preparadas para la clase en vivo (068): se arman antes, en
 * "Preparar la clase", y en el aula se lanzan con un toque. Son del docente
 * y de un tema; los chicos las ven recién cuando las lanza.
 *
 * También se sugieren las preguntas de las actividades del tema (las de
 * opción múltiple como pregunta con correcta, las abiertas como respuesta
 * libre). Nunca las de una evaluación que todavía no se tomó: lanzarlas en
 * vivo sería adelantarla.
 */

import { supabase, ServiceError } from './_helpers';
import type { LiveActivityConfig, LiveActivityKind } from './live.service';
import type { Activity } from '../types';

export type TipoPreparada = Extract<LiveActivityKind, 'quiz' | 'encuesta' | 'chips' | 'nube' | 'texto'>;

export interface PreguntaEnVivo {
  id: string;
  classId: string;
  kind: TipoPreparada;
  config: LiveActivityConfig;
  orden: number;
  lanzadaAt: string | null;
}

/** Una pregunta que sale de una actividad del tema (no está guardada) */
export interface PreguntaSugerida {
  clave: string;
  classId: string;
  kind: TipoPreparada;
  config: LiveActivityConfig;
  /** "TP: Fracciones equivalentes" */
  origen: string;
}

type Fila = { id: string; class_id: string; kind: TipoPreparada; config: LiveActivityConfig; orden: number; lanzada_at: string | null };

const mapear = (r: Fila): PreguntaEnVivo => ({
  id: r.id, classId: r.class_id, kind: r.kind, config: r.config, orden: r.orden, lanzadaAt: r.lanzada_at,
});

/** Lo que dice la base (los RAISE de la 068 ya vienen redactados) */
function fallo(error: { message?: string; code?: string }, porDefecto: string): ServiceError {
  return new ServiceError(error.code === '22023' && error.message ? error.message : porDefecto, error as never);
}

/** Las preguntas de uno o varios temas, en orden. Sin la 068, ninguna. */
export async function getPreguntasDeTemas(classIds: string[]): Promise<PreguntaEnVivo[]> {
  if (classIds.length === 0) return [];
  const { data, error } = await supabase
    .from('preguntas_en_vivo' as never)
    .select('id, class_id, kind, config, orden, lanzada_at')
    .in('class_id', classIds)
    .order('orden')
    .order('created_at');
  if (error) {
    if (error.code === '42P01' || error.code === 'PGRST205') return [];
    throw fallo(error, 'No se pudieron traer las preguntas preparadas.');
  }
  return ((data ?? []) as unknown as Fila[]).map(mapear);
}

export async function crearPregunta(classId: string, kind: TipoPreparada, config: LiveActivityConfig, orden: number): Promise<PreguntaEnVivo> {
  const { data, error } = await supabase
    .from('preguntas_en_vivo' as never)
    .insert({ class_id: classId, kind, config, orden } as never)
    .select('id, class_id, kind, config, orden, lanzada_at')
    .single();
  if (error) throw fallo(error, 'No se pudo guardar la pregunta.');
  return mapear(data as unknown as Fila);
}

export async function editarPregunta(id: string, kind: TipoPreparada, config: LiveActivityConfig): Promise<void> {
  const { data, error } = await supabase
    .from('preguntas_en_vivo' as never)
    .update({ kind, config } as never)
    .eq('id', id)
    .select('id');
  if (error) throw fallo(error, 'No se pudo guardar la pregunta.');
  if (!data?.length) throw new Error('No se pudo guardar: la pregunta ya no está.');
}

export async function borrarPregunta(id: string): Promise<void> {
  const { error } = await supabase.from('preguntas_en_vivo' as never).delete().eq('id', id);
  if (error) throw fallo(error, 'No se pudo borrar la pregunta.');
}

/** Para marcarla "ya la lanzaste" (si falla, no frena la clase) */
export async function marcarLanzada(id: string): Promise<void> {
  const { error } = await supabase.from('preguntas_en_vivo' as never)
    .update({ lanzada_at: new Date().toISOString() } as never).eq('id', id);
  if (error) console.error('marcarLanzada:', error);
}

const ORIGEN: Record<Activity['tipo'], string> = { actividad: 'Actividad', tp: 'TP', evaluacion: 'Evaluación' };
const LETRAS = 'abcdef';

/**
 * Las preguntas de las actividades de un tema, listas para lanzar. Sin las
 * de una evaluación que no se cerró (se adelantaría), ni las de opción
 * múltiple con más de 6 opciones o sin correcta marcada.
 */
export function sugerenciasDeActividades(actividades: Activity[], classId: string): PreguntaSugerida[] {
  const out: PreguntaSugerida[] = [];
  for (const a of actividades) {
    if (a.tipo === 'evaluacion' && a.status !== 'closed') continue;
    for (const q of a.questions ?? []) {
      const pregunta = (q.prompt ?? '').trim().slice(0, 200);
      if (!pregunta) continue;
      const origen = `${ORIGEN[a.tipo] ?? 'Actividad'}: ${a.title}`;
      if (q.type === 'multiple_choice') {
        const opciones = (q.options ?? []).map(o => o.trim()).filter(Boolean);
        if (opciones.length < 2 || opciones.length > 6 || q.correct_index == null || !opciones[q.correct_index]) continue;
        out.push({
          clave: `${a.id}:${q.id}`, classId, kind: 'quiz', origen,
          config: {
            question: pregunta,
            options: opciones.map((label, i) => ({ id: LETRAS[i], label: label.slice(0, 80) })),
            correctId: LETRAS[q.correct_index],
          },
        });
      } else {
        out.push({ clave: `${a.id}:${q.id}`, classId, kind: 'texto', origen, config: { question: pregunta } });
      }
    }
  }
  return out;
}
