/**
 * SMT EstudIA — Migue para repasar un tema (079)
 *
 * El docente abre el repaso desde el tema; los estudiantes del curso
 * conversan con Migue como tutor de ese tema. El docente no lee las charlas:
 * ve cuántos lo usaron y un resumen de lo que les costó, sin nombres y solo
 * desde tres estudiantes.
 */

import { supabase } from '../lib/supabase';

export interface TutorTema {
  abierto: boolean;
  consigna: string | null;
  resumen: string | null;
  resumenAt: string | null;
  resumenEstudiantes: number | null;
}

const sinLa079 = (code?: string) => code === '42P01' || code === 'PGRST205' || code === 'PGRST202' || code === '42883';

/** El repaso de ese tema (null si nunca se abrió, o si falta la 079). */
export async function getTutorDelTema(classId: string): Promise<TutorTema | null> {
  const { data, error } = await supabase
    .from('tutor_temas' as never)
    .select('abierto, consigna, resumen, resumen_at, resumen_estudiantes')
    .eq('class_id', classId)
    .maybeSingle();
  if (error) {
    if (sinLa079(error.code)) return null;
    throw error;
  }
  const r = data as { abierto: boolean; consigna: string | null; resumen: string | null; resumen_at: string | null; resumen_estudiantes: number | null } | null;
  return r ? { abierto: r.abierto, consigna: r.consigna, resumen: r.resumen, resumenAt: r.resumen_at, resumenEstudiantes: r.resumen_estudiantes } : null;
}

/** Abre, cierra o cambia la consigna del repaso. */
export async function guardarTutor(classId: string, cambios: { abierto: boolean; consigna: string | null }, existe: boolean): Promise<void> {
  const consigna = cambios.consigna?.trim() ? cambios.consigna.trim().slice(0, 600) : null;
  const { error } = existe
    ? await supabase.from('tutor_temas' as never)
      .update({ abierto: cambios.abierto, consigna, updated_at: new Date().toISOString() } as never)
      .eq('class_id', classId)
    : await supabase.from('tutor_temas' as never)
      .insert({ class_id: classId, abierto: cambios.abierto, consigna } as never);
  if (error) {
    if (sinLa079(error.code)) throw new Error('Falta correr la migración 079_migue_por_tema.sql.');
    throw error;
  }
}

/** Cuántos estudiantes lo usaron y cuántos mensajes mandaron (solo números). */
export async function getUsoTutor(classId: string): Promise<{ estudiantes: number; mensajes: number; ultimo: string | null }> {
  const { data, error } = await supabase.rpc('uso_tutor' as never, { p_class: classId } as never);
  if (error) {
    if (sinLa079(error.code)) return { estudiantes: 0, mensajes: 0, ultimo: null };
    throw error;
  }
  const r = (Array.isArray(data) ? data[0] : data) as { estudiantes: number; mensajes: number; ultimo: string | null } | null;
  return { estudiantes: r?.estudiantes ?? 0, mensajes: r?.mensajes ?? 0, ultimo: r?.ultimo ?? null };
}

/** Lo que les costó: lo arma Migue (sin nombres, desde tres estudiantes). */
export async function pedirResumenTutor(classId: string): Promise<{ resumen: string | null; estudiantes: number; mensajes: number; minimo: number }> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error('No hay sesión activa.');
  const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/migue`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
    body: JSON.stringify({ accion: 'resumen_tutor', tema: classId }),
  });
  const json = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(json.error || `No se pudo armar el resumen (${resp.status}).`);
  return { resumen: json.resumen ?? null, estudiantes: json.estudiantes ?? 0, mensajes: json.mensajes ?? 0, minimo: json.minimo ?? 3 };
}

export interface TutorAbierto {
  classId: string;
  titulo: string;
  unidad: string | null;
  materia: string;
  consigna: string | null;
  yaEmpezo: boolean;
}

/** Estudiante: los repasos abiertos de sus materias. */
export async function getTutoresAbiertos(): Promise<TutorAbierto[]> {
  const { data, error } = await supabase.rpc('tutores_abiertos' as never);
  if (error) {
    if (sinLa079(error.code)) return [];
    throw error;
  }
  return ((data ?? []) as Record<string, unknown>[]).map(r => ({
    classId: String(r.class_id),
    titulo: String(r.titulo),
    unidad: (r.unidad as string | null) ?? null,
    materia: String(r.materia),
    consigna: (r.consigna as string | null) ?? null,
    yaEmpezo: Boolean(r.ya_empezo),
  }));
}
