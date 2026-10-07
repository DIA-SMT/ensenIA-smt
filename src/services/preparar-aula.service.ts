/**
 * "Preparar para el aula": con señal (en casa, a la noche), baja de una vez
 * todo lo que el docente usa en clase, para que al otro día ande sin
 * conexión. Antes solo andaba sin señal lo que ya se había abierto en ese
 * equipo, y nadie abre cada curso y cada ficha "por las dudas".
 *
 * Cómo funciona: la copia sin conexión la guarda el service worker por la
 * dirección EXACTA de cada pedido (vite.config.ts, caché supabase-rest).
 * Por eso acá se llama a las mismas funciones, con los mismos argumentos,
 * que usa cada pantalla al abrirse: si una pantalla cambia lo que pide,
 * hay que cambiarlo también acá.
 */

import type { User } from '../types';
import { bajarYa } from '../lib/pantallas';
import { getScheduleByTeacher } from './schedule.service';
import { getAlertsByTeacher } from './alerts.service';
import { getRecentAttendance, getAttendanceSession, getAbsencesByStudent, todayISO } from './attendance.service';
import { getActivitiesByTeacher, getEnrolledStudents } from './activities.service';
import { getMaterialsByTeacher } from './library.service';
import { getTeacherTimeline } from './stats.service';
import { getSubjects } from './subjects.service';
import { getStudentsByCourse, getStudentsByTeacher, getWorkByStudent } from './students.service';
import { getTerms, pickCurrentTerm, getGradebook, getPublishedGradesByStudent } from './gradebook.service';
import { getThresholds } from './thresholds.service';
import { getGradesForCourse, getAbsencesByTermForCourse } from './libreta.service';
import { getUnitsForTeacher, getCriteria } from './syllabus.service';
import { getPlanningByTeacher } from './planning.service';
import { getCheckinsByStudent, getObservationsByStudent } from './wellbeing.service';
import { getGuardiansOfStudent } from './guardians.service';
import { getAchievementsByStudent } from './gamification.service';
import { getStudentAwards } from './awards.service';
import { getStudentProgress } from './practice.service';
import { archivosDe, guardarArchivos } from '../lib/archivosOffline';

const PREPARADO_KEY = 'estudia_preparado_aula';

export interface Avance {
  hechos: number;
  total: number;
  etapa: string;
}

export interface ResultadoPreparar {
  /** Pedidos que no se pudieron bajar (lo demás quedó guardado igual). */
  fallaron: number;
  total: number;
}

/** Cuándo se preparó por última vez en este equipo, para esta cuenta. */
export function preparadoEl(userId: string): Date | null {
  try {
    const guardado = JSON.parse(localStorage.getItem(PREPARADO_KEY) ?? 'null') as { userId: string; cuando: string } | null;
    return guardado?.userId === userId ? new Date(guardado.cuando) : null;
  } catch {
    return null;
  }
}

/** Corre las tareas de a pocas: con muchas juntas el wifi de la casa también sufre. */
async function deAPocas(tareas: (() => Promise<unknown>)[], enParalelo: number, alTerminarUna: (ok: boolean) => void) {
  let siguiente = 0;
  const trabajador = async () => {
    while (siguiente < tareas.length) {
      const tarea = tareas[siguiente++];
      let ok = true;
      try { await tarea(); } catch { ok = false; }
      alTerminarUna(ok);
    }
  };
  await Promise.all(Array.from({ length: Math.min(enParalelo, tareas.length) }, trabajador));
}

export async function prepararParaElAula(user: User, alAvanzar: (a: Avance) => void): Promise<ResultadoPreparar> {
  const asignaciones = user.subjects ?? [];
  const cursos = [...new Set(asignaciones.map(a => a.courseId))];
  const anio = new Date().getFullYear();
  const hoy = todayISO();
  let hechos = 0;
  let fallaron = 0;
  let total = 0;
  const contar = (etapa: string) => (ok: boolean) => {
    hechos++;
    if (!ok) fallaron++;
    alAvanzar({ hechos, total, etapa });
  };

  // 1. Las pantallas del docente (el código), para que abran sin señal
  alAvanzar({ hechos: 0, total: 1, etapa: 'Pantallas' });
  await bajarYa(['/hoy', '/asistencia', '/libreta', '/students', '/biblioteca', '/ia-lab', '/mis-clases', '/corregir', '/actividades', '/modulo']);

  // 2. Lo de todos los días: Mi día, Biblioteca, Laboratorio, materias
  const terms = await getTerms(user.schoolId, anio).catch(() => []);
  const trimestre = pickCurrentTerm(terms);
  const generales: (() => Promise<unknown>)[] = [
    () => getScheduleByTeacher(user.id),
    () => getAlertsByTeacher(user.id),
    () => getRecentAttendance(user.id, 20),
    () => getActivitiesByTeacher(user.id),
    () => getMaterialsByTeacher(user.id),
    () => getTeacherTimeline(user.id, 10),
    () => getSubjects(),
    () => getSubjects(user.schoolId),
    () => getThresholds(user.schoolId),
    () => getPlanningByTeacher(user.id),
    () => getStudentsByTeacher(cursos),
  ];

  // 3. Cada materia y curso: pasar lista, libreta, boletín y temario
  const porAsignacion: (() => Promise<unknown>)[] = asignaciones.flatMap(a => [
    () => getStudentsByCourse(a.courseId),
    () => getAttendanceSession(user.id, a.courseId, a.subjectId, hoy),
    () => getGradesForCourse(a.subjectId, a.courseId, anio),
    () => getAbsencesByTermForCourse(a.courseId, anio),
    () => getUnitsForTeacher(user.id, a.subjectId, a.courseId),
    ...(trimestre ? [
      () => getCriteria(a.subjectId, a.courseId, trimestre.id),
      () => getEnrolledStudents(a.subjectId, a.courseId).then(students => getGradebook({
        subjectId: a.subjectId, courseId: a.courseId, term: trimestre, students, teacherId: user.id,
      })),
    ] : []),
  ]);

  total = generales.length + porAsignacion.length;
  await deAPocas([...generales, ...porAsignacion], 4, contar('Cursos, libretas y temario'));

  // 4. La ficha de cada alumno (lo que se ve al abrirla)
  const alumnos = await getStudentsByTeacher(cursos).catch(() => []);
  const fichas: (() => Promise<unknown>)[] = alumnos.flatMap(s => [
    () => getPublishedGradesByStudent(s.id),
    () => getCheckinsByStudent(s.id, 40),
    () => getObservationsByStudent(s.id),
    () => getGuardiansOfStudent(s.id),
    () => getWorkByStudent(s.id),
    () => getAbsencesByStudent(s.id),
    () => getAchievementsByStudent(s.id),
    () => getStudentAwards(s.id),
    () => getStudentProgress(s.id),
  ]);
  total += fichas.length;
  await deAPocas(fichas, 4, contar('Fichas de los alumnos'));

  // 5. Los archivos de los materiales: imágenes de las diapositivas,
  //    diagramas y PDF. Sin esto, las láminas se proyectaban sin sus
  //    imágenes. Los más recientes primero, con un tope para no llenar el equipo.
  const materiales = await getMaterialsByTeacher(user.id).catch(() => []);
  const rutas = archivosDe(materiales, { conPdf: true }).slice(0, 120);
  if (rutas.length) {
    const base = hechos;
    total += rutas.length;
    const r = await guardarArchivos(rutas, n => alAvanzar({ hechos: base + n, total, etapa: 'Imágenes y archivos de tus clases' }));
    hechos = base + rutas.length;
    fallaron += r.fallaron;
  }

  try {
    localStorage.setItem(PREPARADO_KEY, JSON.stringify({ userId: user.id, cuando: new Date().toISOString() }));
  } catch { /* sin storage: no se recuerda cuándo, lo bajado quedó igual */ }
  return { fallaron, total };
}
