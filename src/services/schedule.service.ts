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

// ── Armado del horario (dirección y superadmin, migración 043) ──

/** Todo el horario de una escuela. */
export async function getSchoolSchedule(schoolId: string): Promise<ScheduleBlock[]> {
  const data = unwrap(
    await supabase
      .from('schedule_blocks')
      .select('*')
      .eq('school_id', schoolId)
      .order('day_index')
      .order('start_hour')
  );
  return data.map(mapBlock);
}

export interface ClaseHorario {
  teacherId: string;
  subjectId: string;
  courseId: string;
  dayIndex: number;
  /** horas decimales: 8.5 = 8:30 */
  startHour: number;
  /** en horas: 1.33 = 80 minutos */
  duration: number;
  room: string;
}

// Los mensajes de la base (043) ya están escritos para la persona
const mensaje = (error: { message: string; code?: string }) =>
  ['23514', '23P01'].includes(error.code ?? '') ? error.message : 'No se pudo guardar la clase. Probá de nuevo.';

export async function createScheduleBlock(schoolId: string, c: ClaseHorario): Promise<void> {
  const { error } = await supabase.from('schedule_blocks').insert({
    teacher_id: c.teacherId, subject_id: c.subjectId, course_id: c.courseId,
    day_index: c.dayIndex, start_hour: c.startHour, duration: c.duration, room: c.room || null,
    // Los completa el trigger (043); van para cumplir el NOT NULL
    school_id: schoolId, subject_name: '', course_name: '', day_of_week: 'lunes',
  });
  if (error) throw new Error(mensaje(error));
}

export async function updateScheduleBlock(id: string, c: ClaseHorario): Promise<void> {
  const { error } = await supabase.from('schedule_blocks').update({
    teacher_id: c.teacherId, subject_id: c.subjectId, course_id: c.courseId,
    day_index: c.dayIndex, start_hour: c.startHour, duration: c.duration, room: c.room || null,
  }).eq('id', id);
  if (error) throw new Error(mensaje(error));
}

export async function deleteScheduleBlock(id: string): Promise<void> {
  const { error } = await supabase.from('schedule_blocks').delete().eq('id', id);
  if (error) throw new Error('No se pudo borrar la clase.');
}

/** 8.5 → "8:30" */
export function horaTexto(h: number): string {
  const total = Math.round(h * 60);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

/** "08:30" → 8.5 */
export function horaDecimal(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h + (m || 0) / 60;
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
