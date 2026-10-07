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
import { getStudentByUserId, getEnrollmentsByStudent } from './activities.service';
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

/** Las palabras de lo que se escribió, plegadas. */
export function palabrasDe(consulta: string): string[] {
  return plegar(consulta).split(/\s+/).filter(Boolean);
}

/**
 * ¿Una palabra buscada está en el índice? Tolera la terminación: "fisica"
 * encuentra "Físico-Química" y "matematicas" encuentra "Matemática". Así
 * se busca: nadie escribe el nombre exacto.
 */
export function contienePalabra(indice: string, palabra: string): boolean {
  return indice.includes(palabra) || (palabra.length >= 4 && indice.includes(palabra.slice(0, -1)));
}

/** ¿El texto tiene todas las palabras buscadas, en cualquier orden y sin tildes? */
export function coincideBusqueda(texto: string, consulta: string): boolean {
  const indice = plegar(texto);
  return palabrasDe(consulta).every(p => contienePalabra(indice, p));
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
  materias = null;
}

export interface MateriaBuscable {
  subjectId: string;
  nombre: string;
  curso: string;
}

let materias: { clave: string; lista: Promise<MateriaBuscable[]> } | null = null;

/** Estudiante: sus materias, para ir directo a cada una (/materia/:id). */
export function materiasBuscables(user: User): Promise<MateriaBuscable[]> {
  if (user.role !== 'estudiante') return Promise.resolve([]);
  const clave = user.id;
  if (materias?.clave === clave) return materias.lista;
  // Las mismas funciones que Mi escuela: con la copia sin conexión también anda
  const lista = getStudentByUserId(user.id)
    .then(st => (st ? getEnrollmentsByStudent(st.id) : []))
    .then(enr => enr
      .map(e => ({ subjectId: e.subjectId, nombre: e.subjectName ?? 'Materia', curso: e.courseName ?? '' }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre)));
  lista.catch(() => { if (materias?.clave === clave) materias = null; });
  materias = { clave, lista };
  return lista;
}
