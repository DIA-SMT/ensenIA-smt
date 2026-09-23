/**
 * SMT EstudIA — Búsqueda del buscador de la barra superior
 *
 * Trae lo mínimo para encontrar a alguien: id, nombre, apellido y curso.
 * Nada de notas, asistencia ni señales. Se pide una sola vez por sesión, y
 * recién cuando alguien escribe en el buscador; el filtrado es local, así
 * que tipear no gasta datos y "Sofia" encuentra a "Sofía".
 *
 * El docente ve SOLO los estudiantes de sus cursos (filtro explícito además
 * de la RLS). Dirección ve los de su escuela.
 */

import { supabase, unwrap } from './_helpers';
import type { User } from '../types';

export interface EstudianteBuscable {
  id: string;
  nombre: string;
  courseId: string;
  curso: string;
}

export interface CursoBuscable {
  id: string;
  nombre: string;
}

let estudiantes: { clave: string; lista: Promise<EstudianteBuscable[]> } | null = null;
let cursos: { clave: string; lista: Promise<CursoBuscable[]> } | null = null;

/** Minúsculas y sin tildes: "Martínez" y "martinez" son lo mismo. */
export function plegar(texto: string): string {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

export function estudiantesBuscables(user: User): Promise<EstudianteBuscable[]> {
  const cursosDocente = user.subjects?.map(s => s.courseId) ?? [];
  const clave = `${user.id}:${user.role}:${cursosDocente.join(',')}`;
  if (estudiantes?.clave === clave) return estudiantes.lista;

  let consulta = supabase
    .from('students')
    .select('id, first_name, last_name, course_id, courses(name)')
    .order('last_name')
    .limit(1500);

  if (user.role === 'docente') {
    if (cursosDocente.length === 0) return Promise.resolve([]);
    consulta = consulta.in('course_id', cursosDocente);
  } else if (user.role === 'director') {
    consulta = consulta.eq('school_id', user.schoolId);
  } else {
    return Promise.resolve([]);
  }

  const lista = Promise.resolve(consulta).then(r => unwrap(r).map((f: {
    id: string; first_name: string; last_name: string; course_id: string; courses: { name: string } | { name: string }[] | null;
  }) => {
    const curso = Array.isArray(f.courses) ? f.courses[0]?.name : f.courses?.name;
    return { id: f.id, nombre: `${f.first_name} ${f.last_name}`, courseId: f.course_id, curso: curso ?? '' };
  }));
  // Si falla, la próxima vez se reintenta.
  lista.catch(() => { if (estudiantes?.clave === clave) estudiantes = null; });
  estudiantes = { clave, lista };
  return lista;
}

export function cursosBuscables(user: User): Promise<CursoBuscable[]> {
  if (user.role !== 'director') return Promise.resolve([]);
  const clave = `${user.id}:${user.schoolId}`;
  if (cursos?.clave === clave) return cursos.lista;
  const lista = Promise.resolve(supabase
    .from('courses')
    .select('id, name')
    .eq('school_id', user.schoolId)
    .order('year')
    .order('division'))
    .then(r => unwrap(r).map((c: { id: string; name: string }) => ({ id: c.id, nombre: c.name })));
  lista.catch(() => { if (cursos?.clave === clave) cursos = null; });
  cursos = { clave, lista };
  return lista;
}

/** Al cerrar sesión: que lo buscado no quede en memoria para el siguiente. */
export function olvidarBusquedas(): void {
  estudiantes = null;
  cursos = null;
}
