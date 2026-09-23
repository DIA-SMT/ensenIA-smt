/**
 * SMT EstudIA — Carga del material didáctico real de las escuelas.
 *
 * Origen: documentos entregados por las dos escuelas municipales
 * (propuestas de clase, secuencias y unidades didácticas, septiembre 2026).
 * Cada unidad y cada clase salió de un documento real: el texto se respeta,
 * solo se estructura para que la plataforma pueda mostrarlo.
 *
 * Idempotente: se puede correr varias veces sin duplicar.
 *
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npx tsx supabase/seed-material-real.ts
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
if (!supabaseUrl || !serviceRoleKey) {
  console.error('Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}
const db = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const PASSWORD = 'demo123';

function slugEmail(first: string, last: string, domain: string): string {
  const clean = (s: string) =>
    s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z]/g, '');
  return clean(first) + '.' + clean(last) + '@' + domain;
}

// ── Helpers idempotentes ──

async function getSchool(shortName: string): Promise<string> {
  const { data, error } = await db.from('schools').select('id').eq('short_name', shortName).single();
  if (error) throw new Error('Escuela ' + shortName + ': ' + error.message);
  return data.id;
}

async function ensureSubject(schoolId: string, name: string, color: string): Promise<string> {
  const { data } = await db.from('subjects').select('id')
    .eq('school_id', schoolId).eq('name', name).maybeSingle();
  if (data) return data.id;
  const { data: created, error } = await db.from('subjects')
    .insert({ name, color, school_id: schoolId }).select('id').single();
  if (error) throw error;
  console.log('  + materia ' + name);
  return created.id;
}

async function ensureCourse(schoolId: string, name: string, year: number, division: string): Promise<string> {
  const { data } = await db.from('courses').select('id')
    .eq('school_id', schoolId).eq('name', name).maybeSingle();
  if (data) return data.id;
  const { data: created, error } = await db.from('courses')
    .insert({ name, year, division, student_count: 0, school_id: schoolId }).select('id').single();
  if (error) throw error;
  console.log('  + curso ' + name);
  return created.id;
}

async function ensureTeacher(schoolId: string, firstName: string, lastName: string, initials: string): Promise<string> {
  const email = slugEmail(firstName, lastName, 'ensenia.edu.ar');
  const { data } = await db.from('profiles').select('id').eq('email', email).maybeSingle();
  if (data) return data.id;
  const { data: created, error } = await db.auth.admin.createUser({
    email, password: PASSWORD, email_confirm: true,
    user_metadata: {
      first_name: firstName, last_name: lastName, role: 'docente',
      school_id: schoolId, avatar_initials: initials,
    },
  });
  if (error) throw new Error(email + ': ' + error.message);
  console.log('  + docente ' + firstName + ' ' + lastName + ' (' + email + ')');
  return created.user.id;
}

async function ensureAssignment(teacherId: string, subjectId: string, courseId: string): Promise<void> {
  const { data } = await db.from('teacher_assignments').select('id')
    .eq('teacher_id', teacherId).eq('subject_id', subjectId).eq('course_id', courseId).maybeSingle();
  if (data) return;
  const { error } = await db.from('teacher_assignments')
    .insert({ teacher_id: teacherId, subject_id: subjectId, course_id: courseId });
  if (error) throw error;
}

async function ensureStudent(
  schoolId: string, courseId: string, firstName: string, lastName: string, initials: string,
): Promise<string> {
  const email = slugEmail(firstName, lastName, 'estudiante.ensenia.edu.ar');
  const { data } = await db.from('students').select('id').eq('email', email).maybeSingle();
  if (data) return data.id;

  const { data: authUser, error: authErr } = await db.auth.admin.createUser({
    email, password: PASSWORD, email_confirm: true,
    user_metadata: {
      first_name: firstName, last_name: lastName, role: 'estudiante',
      school_id: schoolId, avatar_initials: initials,
    },
  });
  if (authErr) throw new Error('auth ' + email + ': ' + authErr.message);

  const { data: st, error } = await db.from('students').insert({
    first_name: firstName, last_name: lastName, avatar_initials: initials,
    course_id: courseId, status: 'good', alerts_count: 0,
    progress: 0, attendance: 0, average: 0,
    school_id: schoolId, user_id: authUser.user.id, email,
  }).select('id').single();
  if (error) throw error;
  return st.id;
}

async function ensureEnrollment(
  studentId: string, subjectId: string, courseId: string, schoolId: string, code: string,
): Promise<void> {
  const { data } = await db.from('enrollments').select('id')
    .eq('student_id', studentId).eq('subject_id', subjectId).eq('course_id', courseId).maybeSingle();
  if (data) return;
  const { error } = await db.from('enrollments').insert({
    student_id: studentId, subject_id: subjectId, course_id: courseId,
    enrollment_code: code, school_id: schoolId,
  });
  if (error) throw error;
}

async function getTerm(schoolId: string, number: number): Promise<string> {
  const { data, error } = await db.from('academic_terms').select('id')
    .eq('school_id', schoolId).eq('year', 2026).eq('number', number).single();
  if (error) throw new Error('Trimestre ' + number + ': ' + error.message);
  return data.id;
}

interface ClaseSeed { title: string; objectives: string[]; content: string }

async function ensureUnit(params: {
  title: string; subjectId: string; courseId: string; teacherId: string;
  termId: string; order: number; clases: ClaseSeed[];
}): Promise<void> {
  const { title, subjectId, courseId, teacherId, termId, order, clases } = params;
  const { data: existing } = await db.from('planning_units').select('id')
    .eq('subject_id', subjectId).eq('course_id', courseId).eq('title', title).maybeSingle();

  let unitId: string;
  if (existing) {
    unitId = existing.id;
    await db.from('planning_units').update({ term_id: termId, sort_order: order }).eq('id', unitId);
  } else {
    const { data: created, error } = await db.from('planning_units').insert({
      title, subject_id: subjectId, course_id: courseId,
      teacher_id: teacherId, sort_order: order, term_id: termId,
    }).select('id').single();
    if (error) throw error;
    unitId = created.id;
  }

  let n = 1;
  for (const c of clases) {
    const { data: ex } = await db.from('planning_classes').select('id')
      .eq('unit_id', unitId).eq('title', c.title).maybeSingle();
    if (ex) {
      await db.from('planning_classes').update({
        objectives: c.objectives, content: c.content, sort_order: n,
      }).eq('id', ex.id);
    } else {
      const { error } = await db.from('planning_classes').insert({
        unit_id: unitId, title: c.title, sort_order: n,
        objectives: c.objectives, content: c.content, is_complete: false,
      });
      if (error) throw error;
    }
    n++;
  }
  console.log('  ✓ ' + title + ' (' + clases.length + ' clases)');
}

async function ensureCriteria(
  schoolId: string, subjectId: string, courseId: string, termId: string, criteria: string,
): Promise<void> {
  const { data } = await db.from('evaluation_criteria').select('id')
    .eq('subject_id', subjectId).eq('course_id', courseId).eq('term_id', termId).maybeSingle();
  if (data) {
    const { error } = await db.from('evaluation_criteria')
      .update({ criteria, is_published: true }).eq('id', data.id);
    if (error) throw error;
    return;
  }
  const { error } = await db.from('evaluation_criteria').insert({
    school_id: schoolId, subject_id: subjectId, course_id: courseId,
    term_id: termId, criteria, is_published: true,
  });
  if (error) throw error;
}

export {
  db, getSchool, ensureSubject, ensureCourse, ensureTeacher, ensureAssignment,
  ensureStudent, ensureEnrollment, getTerm, ensureUnit, ensureCriteria,
};
export type { ClaseSeed };
