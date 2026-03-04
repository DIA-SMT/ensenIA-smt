import { supabase, unwrap } from './_helpers';
import type { Subject, Course } from '../types';

export async function getSubjects(): Promise<Subject[]> {
  const data = unwrap(
    await supabase.from('subjects').select('*').order('name')
  );

  return data.map(mapSubject);
}

export async function getSubjectById(id: string): Promise<Subject | undefined> {
  const { data, error } = await supabase
    .from('subjects')
    .select('*')
    .eq('id', id)
    .single();

  if (error || !data) return undefined;
  return mapSubject(data);
}

export async function getCourses(): Promise<Course[]> {
  const data = unwrap(
    await supabase.from('courses').select('*').order('year').order('division')
  );

  return data.map(mapCourse);
}

export async function getCourseById(id: string): Promise<Course | undefined> {
  const { data, error } = await supabase
    .from('courses')
    .select('*')
    .eq('id', id)
    .single();

  if (error || !data) return undefined;
  return mapCourse(data);
}

function mapSubject(row: any): Subject {
  return {
    id: row.id,
    name: row.name,
    color: row.color,
  };
}

function mapCourse(row: any): Course {
  return {
    id: row.id,
    name: row.name,
    year: row.year,
    division: row.division,
    studentCount: row.student_count,
    schoolId: row.school_id,
  };
}
