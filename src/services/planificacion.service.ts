/**
 * El año armado (migración 062): encuentros del horario fijo, días sin
 * clase, importar el programa de una vez con fechas y la memoria del
 * docente.
 *
 * Todo lo decide la base: qué materia y curso da cada docente, qué días no
 * hay clase y cómo se reparten los temas. El reparto es por reglas, sin IA.
 */

import { supabase } from './_helpers';
import type { ImportedProgram } from '../types';

function mensajeDe(error: { message?: string } | null, porDefecto: string): string {
  const m = error?.message ?? '';
  return m && !/permission|violates|function|syntax|relation|column/i.test(m) ? m : porDefecto;
}

/** Hoy en Argentina, AAAA-MM-DD */
export function hoyISO(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' });
}

/** "2027-03-02" → "mar 2/3" */
export function fechaCorta(iso: string): string {
  const d = new Date(iso + 'T12:00');
  return d.toLocaleDateString('es-AR', { weekday: 'short', day: 'numeric', month: 'numeric' });
}

// ── Encuentros ──

export interface Encuentro {
  fecha: string;
  minutos: number;
  trimestre: number;
}

/** Los días de clase del año de esta materia y curso, según el horario fijo del docente. */
export async function getEncuentros(subjectId: string, courseId: string, anio: number): Promise<Encuentro[]> {
  const { data, error } = await supabase.rpc('fechas_de_clase' as never, {
    p_subject: subjectId, p_course: courseId, p_anio: anio,
  } as never);
  if (error) throw new Error(mensajeDe(error, 'No se pudieron calcular las fechas de clase.'));
  return (data ?? []) as unknown as Encuentro[];
}

export interface Reparto {
  clases: number;
  encuentros: number;
  desde?: string;
  hasta?: string;
  masClasesQueEncuentros?: boolean;
  error?: string;
  /** Al importar: ya había fechas ese año y no se pisaron */
  pendiente?: boolean;
}

/** Reparte los temas que faltan dar en los encuentros desde una fecha (por defecto, hoy). */
export async function reacomodar(subjectId: string, courseId: string, anio: number, desde?: string): Promise<Reparto> {
  const { data, error } = await supabase.rpc('reacomodar_planificacion' as never, {
    p_subject: subjectId, p_course: courseId, p_anio: anio, p_desde: desde ?? null,
  } as never);
  if (error) throw new Error(mensajeDe(error, 'No se pudieron reacomodar las fechas.'));
  return data as unknown as Reparto;
}

export interface ResultadoImportar {
  unidades: number;
  clases: number;
  repetidas: number;
  fechas: Reparto;
}

/** Crea unidades y temas de una vez (todo o nada) y reparte las fechas. */
export async function importarPrograma(params: {
  subjectId: string; courseId: string; programa: ImportedProgram; unidadesElegidas: number[];
  anio: number; desde?: string;
}): Promise<ResultadoImportar> {
  const unidades = params.unidadesElegidas.map(i => params.programa.units[i]).filter(Boolean).map(u => ({
    titulo: u.title,
    clases: u.classes.map(c => ({ titulo: c.title, objetivos: c.objectives ?? [] })),
  }));
  const { data, error } = await supabase.rpc('importar_programa' as never, {
    p_subject: params.subjectId, p_course: params.courseId, p_unidades: unidades,
    p_anio: params.anio, p_desde: params.desde ?? null,
  } as never);
  if (error) throw new Error(mensajeDe(error, 'No se pudo crear la planificación. No quedó nada a medias: probá de nuevo.'));
  return data as unknown as ResultadoImportar;
}

// ── Días sin clase (dirección) ──

export type TipoDiaSinClase = 'feriado' | 'receso' | 'jornada' | 'escuela';

export const ETIQUETA_DIA: Record<TipoDiaSinClase, string> = {
  feriado: 'Feriado',
  receso: 'Receso',
  jornada: 'Jornada',
  escuela: 'De la escuela',
};

export interface DiaSinClase {
  id: string;
  desde: string;
  hasta: string;
  motivo: string;
  tipo: TipoDiaSinClase;
}

export async function getDiasSinClase(schoolId: string, anio: number): Promise<DiaSinClase[]> {
  const { data, error } = await supabase
    .from('dias_sin_clase' as never)
    .select('id, desde, hasta, motivo, tipo')
    .eq('school_id', schoolId)
    .gte('hasta', `${anio}-01-01`)
    .lte('desde', `${anio}-12-31`)
    .order('desde');
  if (error) throw new Error('No se pudieron traer los días sin clase.');
  return (data ?? []) as unknown as DiaSinClase[];
}

export async function agregarDiaSinClase(schoolId: string, dia: Omit<DiaSinClase, 'id'>): Promise<void> {
  if (dia.motivo.trim().length < 2) throw new Error('Escribí el motivo (por ejemplo, "Receso invernal").');
  if (dia.hasta < dia.desde) throw new Error('"Hasta" no puede ser antes que "desde".');
  const { error } = await supabase.from('dias_sin_clase' as never).insert({
    school_id: schoolId, desde: dia.desde, hasta: dia.hasta, motivo: dia.motivo.trim(), tipo: dia.tipo,
  } as never);
  if (error) {
    if (error.code === '23505') throw new Error('Ese día ya está cargado con el mismo motivo.');
    if (error.code === '23514') throw new Error('Revisá las fechas: "hasta" no puede ser antes que "desde", ni más de dos meses después.');
    throw new Error('No se pudo guardar el día sin clase.');
  }
}

export async function borrarDiaSinClase(id: string): Promise<void> {
  const { error } = await supabase.from('dias_sin_clase' as never).delete().eq('id', id);
  if (error) throw new Error('No se pudo borrar.');
}

/** Fechas de un trimestre (la dirección de la escuela; lo controla la RLS de la 024). */
export async function actualizarTrimestre(id: string, startsOn: string, endsOn: string): Promise<void> {
  if (endsOn < startsOn) throw new Error('El trimestre no puede terminar antes de empezar.');
  const { data, error } = await supabase.from('academic_terms')
    .update({ starts_on: startsOn, ends_on: endsOn }).eq('id', id).select('id');
  if (error) throw new Error('No se pudieron guardar las fechas del trimestre.');
  if (!data?.length) throw new Error('Solo la dirección de la escuela cambia los trimestres.');
}

/** Carga los feriados nacionales del año (los que caen en día de semana). Devuelve cuántos agregó. */
export async function cargarFeriadosNacionales(schoolId: string, anio: number): Promise<number> {
  const { data, error } = await supabase.rpc('cargar_feriados_nacionales' as never, {
    p_school: schoolId, p_anio: anio,
  } as never);
  if (error) throw new Error(mensajeDe(error, 'No se pudieron cargar los feriados.'));
  return Number(data ?? 0);
}

// ── Memoria del docente ──

export type TipoNotaDocente = 'formato' | 'prefiere' | 'evita' | 'grupo' | 'trabajo';

export const ETIQUETA_NOTA_DOCENTE: Record<TipoNotaDocente, string> = {
  formato: 'Cómo querés los materiales',
  prefiere: 'Tu enfoque',
  evita: 'Lo que corregís',
  grupo: 'Cómo es el curso',
  trabajo: 'Lo que ya trabajaste',
};

export interface NotaDocente {
  id: string;
  materia: string | null;
  curso: string | null;
  tipo: TipoNotaDocente;
  texto: string;
  ultimaVez: string;
}

export async function getEstadoMemoriaDocente(): Promise<{ activa: boolean; items: number }> {
  const { data, error } = await supabase.rpc('memoria_docente_estado' as never);
  if (error) throw new Error(mensajeDe(error, 'No se pudo consultar la memoria.'));
  return data as unknown as { activa: boolean; items: number };
}

export async function cambiarMemoriaDocente(activa: boolean): Promise<{ activa: boolean; items: number }> {
  const { data, error } = await supabase.rpc('cambiar_memoria_docente' as never, { p_activa: activa } as never);
  if (error) throw new Error(mensajeDe(error, 'No se pudo cambiar.'));
  return data as unknown as { activa: boolean; items: number };
}

export async function getNotasDocente(): Promise<NotaDocente[]> {
  const { data, error } = await supabase
    .from('memoria_docente' as never)
    .select('id, materia, curso, tipo, texto, ultima_vez')
    .order('materia', { ascending: true, nullsFirst: true })
    .order('ultima_vez', { ascending: false });
  if (error) throw new Error('No se pudo traer lo que recuerda la IA.');
  return ((data ?? []) as unknown as {
    id: string; materia: string | null; curso: string | null; tipo: TipoNotaDocente; texto: string; ultima_vez: string;
  }[]).map(n => ({ id: n.id, materia: n.materia, curso: n.curso, tipo: n.tipo, texto: n.texto, ultimaVez: n.ultima_vez }));
}

export async function borrarNotaDocente(id: string): Promise<void> {
  const { error } = await supabase.from('memoria_docente' as never).delete().eq('id', id);
  if (error) throw new Error('No se pudo borrar.');
}
