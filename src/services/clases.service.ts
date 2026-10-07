/**
 * Clases armadas: lo que el docente prepara de un tema (diapositivas, juego,
 * diagrama, apunte, tarea) y manda al curso de una vez (migración 056).
 *
 * La fila solo agrupa ids. Lo que cada estudiante puede ver de cada pieza lo
 * siguen decidiendo las reglas del material y de la actividad.
 */

import { supabase, unwrap } from './_helpers';
import { updateMaterial } from './documents.service';
import { createActivity } from './activities.service';
import { getSharedMaterialsForStudent } from './library.service';
import { haySenial } from '../lib/conexion';
import { archivosDe, guardarArchivos } from '../lib/archivosOffline';
import { bajarYa } from '../lib/pantallas';
import type { ActivityQuestion } from '../types';

export interface ClaseEnviada {
  id: string;
  teacherId: string;
  subjectId: string;
  subjectName: string;
  courseId: string;
  courseName: string;
  classId: string | null;
  titulo: string;
  materialIds: string[];
  activityId: string | null;
  enviadaAt: string;
}

/** La tarea de la clase, todavía sin publicar: se publica al enviar. */
export interface TareaDeClase {
  titulo: string;
  consigna: string;
  preguntas: ActivityQuestion[];
  /** yyyy-mm-dd; vence ese día a las 23:59 */
  vence?: string | null;
  puntos?: number | null;
}

/**
 * Manda la clase al curso: comparte los materiales, publica la tarea y deja
 * la clase agrupada. Tira Error con un mensaje para mostrar.
 */
export async function enviarClase(c: {
  teacherId: string;
  schoolId: string;
  subjectId: string;
  courseId: string;
  classId?: string | null;
  unitId?: string | null;
  titulo: string;
  materialIds: string[];
  tarea?: TareaDeClase | null;
}): Promise<ClaseEnviada> {
  if (c.materialIds.length === 0 && !c.tarea) throw new Error('No hay nada para enviar.');

  // 1) Los materiales, compartidos con el curso
  const compartidos = await Promise.allSettled(
    c.materialIds.map(id => updateMaterial(id, { isSharedWithStudents: true })),
  );
  if (compartidos.some(r => r.status === 'rejected')) {
    throw new Error('No se pudieron compartir todos los materiales. Probá de nuevo.');
  }

  // 2) La tarea, publicada
  let activityId: string | null = null;
  if (c.tarea) {
    const act = await createActivity({
      title: c.tarea.titulo,
      description: `De la clase "${c.titulo}"`,
      contentMd: c.tarea.consigna,
      questions: c.tarea.preguntas,
      subjectId: c.subjectId,
      courseId: c.courseId,
      teacherId: c.teacherId,
      schoolId: c.schoolId,
      unitId: c.unitId ?? null,
      classId: c.classId ?? null,
      sourceTool: 'act',
      dueDate: c.tarea.vence ? new Date(c.tarea.vence + 'T23:59:00').toISOString() : null,
      points: c.tarea.puntos ?? null,
    });
    activityId = act.id;
  }

  // 3) La clase, agrupada
  const { data, error } = await supabase
    .from('clases_enviadas')
    .insert({
      teacher_id: c.teacherId,
      school_id: c.schoolId,
      subject_id: c.subjectId,
      course_id: c.courseId,
      class_id: c.classId ?? null,
      titulo: c.titulo.slice(0, 200),
      material_ids: c.materialIds,
      activity_id: activityId,
    })
    .select('*, subjects(name), courses(name)')
    .single();
  if (error || !data) {
    // Lo importante ya llegó: los materiales están compartidos y la tarea publicada
    throw new Error('Se compartió todo, pero no se pudo agrupar como clase. Los chicos lo ven igual en sus materiales y actividades.');
  }
  return mapClase(data);
}

/**
 * Las últimas clases enviadas. La RLS decide cuáles: las propias (docente),
 * las de la escuela (dirección) o las del curso (estudiante).
 */
export async function getClasesEnviadas(limite = 20): Promise<ClaseEnviada[]> {
  const data = unwrap(
    await supabase
      .from('clases_enviadas')
      .select('*, subjects(name), courses(name)')
      .order('enviada_at', { ascending: false })
      .limit(limite),
  );
  return data.map(mapClase);
}

function mapClase(row: {
  id: string; teacher_id: string; subject_id: string; course_id: string; class_id: string | null;
  titulo: string; material_ids: string[]; activity_id: string | null; enviada_at: string;
  subjects?: { name: string } | null; courses?: { name: string } | null;
}): ClaseEnviada {
  return {
    id: row.id,
    teacherId: row.teacher_id,
    subjectId: row.subject_id,
    subjectName: row.subjects?.name ?? '',
    courseId: row.course_id,
    courseName: row.courses?.name ?? '',
    classId: row.class_id,
    titulo: row.titulo,
    materialIds: row.material_ids ?? [],
    activityId: row.activity_id,
    enviadaAt: row.enviada_at,
  };
}

/**
 * Para el celular del estudiante: con señal, deja guardadas las últimas
 * clases que le mandaron, para abrirlas aunque después no haya conexión.
 *
 * Pide lo mismo que Mis materiales al abrirse (el service worker guarda la
 * respuesta por la dirección exacta) y baja los archivos de las dos últimas
 * clases. Poco y solo si hace falta: son datos del celular de un chico.
 */
export async function guardarClasesParaSinSenial(): Promise<void> {
  const conexion = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
  if (!haySenial() || conexion?.saveData) return;
  const [clases, materiales] = await Promise.all([
    getClasesEnviadas(10),
    getSharedMaterialsForStudent(),
  ]);
  if (clases.length === 0) return;
  bajarYa(['/mi-biblioteca']).catch(() => {});
  const ids = new Set(clases.slice(0, 2).flatMap(c => c.materialIds));
  const rutas = archivosDe(materiales.filter(m => ids.has(m.id))).slice(0, 10);
  await guardarArchivos(rutas);
}
