/**
 * Evaluar al docente (migración 058): su uso de la app y la devolución
 * anónima de sus estudiantes.
 *
 * Todo pasa por funciones de la base que agregan: nadie (ni dirección ni el
 * docente) lee una devolución con nombre. La devolución por docente se
 * muestra recién con 5 respuestas o más.
 */

import { supabase } from './_helpers';

export type OrigenDevolucion = 'actividad' | 'clase_en_vivo' | 'clase_enviada';

/** El estudiante da su devolución. Devuelve si el comentario sonó a que la está pasando mal. */
export async function darDevolucion(origen: OrigenDevolucion, refId: string, valor: 1 | 2 | 3, comentario?: string): Promise<{ riesgo: boolean }> {
  const { data, error } = await supabase.rpc('dar_devolucion' as never, {
    p_origen: origen, p_ref: refId, p_valor: valor, p_comentario: comentario?.trim() || null,
  } as never);
  if (error) throw new Error('No se pudo guardar tu respuesta. Probá de nuevo.');
  return { riesgo: Boolean((data as { riesgo?: boolean } | null)?.riesgo) };
}

/** ¿Ya respondió sobre esto? (el estudiante ve solo las suyas) */
export async function yaDioDevolucion(origen: OrigenDevolucion, refId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('devoluciones' as never)
    .select('id')
    .eq('origen', origen)
    .eq('ref_id', refId)
    .limit(1);
  if (error) return false;
  return (data as unknown[] | null)?.length ? true : false;
}

export interface DevolucionDocente {
  total: number;
  minimo: number;
  suficiente: boolean;
  valores?: { mucho: number; masOMenos: number; nada: number; promedio: number };
  porGrupo?: { materia: string; curso: string; total: number; promedio: number; mucho: number; nada: number }[];
  comentarios?: string[];
  material: { meSirvio: number; noMeSirvio: number };
  /** emoji → cantidad (👏 💡 😮 🔥 🐢 ❓) */
  enVivo: Record<string, number>;
  clasesEnVivo: number;
}

export async function getDevolucionDocente(teacherId: string, dias = 90): Promise<DevolucionDocente | null> {
  const { data, error } = await supabase.rpc('devolucion_docente' as never, { p_teacher: teacherId, p_dias: dias } as never);
  if (error) throw error;
  if (!data) return null;
  const d = data as unknown as DevolucionDocente;
  return {
    ...d,
    valores: d.valores ? { ...d.valores, promedio: Number(d.valores.promedio) } : undefined,
    porGrupo: d.porGrupo?.map(g => ({ ...g, promedio: Number(g.promedio) })),
  };
}

export interface UsoDocente {
  dias: number;
  materiales: number;
  materialesCompartidos: number;
  actividades: number;
  clasesEnviadas: number;
  clasesEnVivo: number;
  listasAsistencia: number;
  notasTrimestre: number;
  evaluaciones: number;
  corregidas: number;
  sinCorregir: number;
  /** Mediana de horas entre la entrega y la corrección */
  horasParaCorregir: number | null;
  usosIA: number;
  ultimaActividad: string | null;
}

const usoDe = (d: UsoDocente): UsoDocente => ({
  ...d,
  horasParaCorregir: d.horasParaCorregir === null || d.horasParaCorregir === undefined ? null : Number(d.horasParaCorregir),
  usosIA: Number(d.usosIA ?? 0),
});

export async function getUsoDocente(teacherId: string, dias = 30): Promise<UsoDocente | null> {
  const { data, error } = await supabase.rpc('uso_docente' as never, { p_teacher: teacherId, p_dias: dias } as never);
  if (error) throw error;
  return data ? usoDe(data as unknown as UsoDocente) : null;
}

export interface UsoDeUnDocente extends UsoDocente {
  teacherId: string;
  nombre: string;
  devolucion: { total: number; promedio: number | null };
}

/** El equipo entero (solo dirección). */
export async function getUsoDocentes(dias = 30): Promise<UsoDeUnDocente[]> {
  const { data, error } = await supabase.rpc('uso_docentes' as never, { p_dias: dias } as never);
  if (error) throw error;
  return ((data as unknown as UsoDeUnDocente[] | null) ?? []).map(d => ({
    ...usoDe(d),
    teacherId: d.teacherId,
    nombre: d.nombre,
    devolucion: { total: d.devolucion?.total ?? 0, promedio: d.devolucion?.promedio == null ? null : Number(d.devolucion.promedio) },
  }));
}
