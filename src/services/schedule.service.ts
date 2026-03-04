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
