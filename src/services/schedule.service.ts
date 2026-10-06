import { supabase, unwrap } from './_helpers';
import type { ScheduleBlock } from '../types';

export async function getScheduleByTeacher(teacherId: string): Promise<ScheduleBlock[]> {
  const data = unwrap(
    await supabase
      .from('schedule_blocks')
      .select('*')
      .eq('teacher_id', teacherId)
      .order('day_index')
      .order('start_hour')
  );

  return data.map(mapBlock);
}

export async function getTodaySchedule(teacherId: string, dayIndex: number): Promise<ScheduleBlock[]> {
  const data = unwrap(
    await supabase
      .from('schedule_blocks')
      .select('*')
      .eq('teacher_id', teacherId)
      .eq('day_index', dayIndex)
      .order('start_hour')
  );

  return data.map(mapBlock);
}

export async function getNextClass(teacherId: string, dayIndex: number, currentHour: number): Promise<ScheduleBlock | undefined> {
  const { data } = await supabase
    .from('schedule_blocks')
    .select('*')
    .eq('teacher_id', teacherId)
    .eq('day_index', dayIndex)
    .gte('start_hour', currentHour)
    .order('start_hour')
    .limit(1);

  if (!data || data.length === 0) return undefined;
  return mapBlock(data[0]);
}

export async function getAllScheduleBlocks(teacherIds: string[]): Promise<ScheduleBlock[]> {
  if (teacherIds.length === 0) return [];

  const data = unwrap(
    await supabase
      .from('schedule_blocks')
      .select('*')
      .in('teacher_id', teacherIds)
      .order('day_index')
      .order('start_hour')
  );

  return data.map(mapBlock);
}

function mapBlock(row: any): ScheduleBlock {
  return {
    id: row.id,
    teacherId: row.teacher_id,
    subjectId: row.subject_id,
    subjectName: row.subject_name,
    courseId: row.course_id,
    courseName: row.course_name,
    dayOfWeek: row.day_of_week,
    dayIndex: row.day_index,
    startHour: Number(row.start_hour),
    duration: Number(row.duration),
    room: row.room ?? '',
    colorClass: row.color_class,
    studentCount: row.student_count,
  };
}

// ── Escritura: el docente carga su propio horario (migración 044) ──
// subject_name, course_name, student_count y day_of_week los completa un
// trigger desde las tablas reales: lo que se mande acá en esos campos se pisa.

const DIAS = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes'] as const;

export interface BloqueNuevo {
  teacherId: string;
  schoolId: string;
  subjectId: string;
  courseId: string;
  /** 0 = lunes … 4 = viernes */
  dayIndex: number;
  /** En horas: 13.5 = 13:30 */
  startHour: number;
  /** En horas: 1.33 ≈ 80 minutos */
  duration: number;
  room?: string;
  colorClass?: string;
}

function aFila(b: BloqueNuevo) {
  return {
    teacher_id: b.teacherId,
    school_id: b.schoolId,
    subject_id: b.subjectId,
    course_id: b.courseId,
    subject_name: '',
    course_name: '',
    day_of_week: DIAS[b.dayIndex],
    day_index: b.dayIndex,
    start_hour: Math.round(b.startHour * 100) / 100,
    duration: Math.round(b.duration * 100) / 100,
    room: b.room?.trim() || null,
    color_class: b.colorClass ?? 'blue',
  };
}

/** Crea uno o varios bloques (la misma clase en varios días). */
export async function crearBloques(bloques: BloqueNuevo[]): Promise<ScheduleBlock[]> {
  const data = unwrap(await supabase.from('schedule_blocks').insert(bloques.map(aFila)).select('*'));
  return data.map(mapBlock);
}

export async function actualizarBloque(id: string, b: BloqueNuevo): Promise<ScheduleBlock> {
  const data = unwrap(await supabase.from('schedule_blocks').update(aFila(b)).eq('id', id).select('*').single());
  return mapBlock(data);
}

export async function borrarBloque(id: string): Promise<void> {
  const { error } = await supabase.from('schedule_blocks').delete().eq('id', id);
  if (error) throw error;
}
