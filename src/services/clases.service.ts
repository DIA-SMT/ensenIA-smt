/**
 * Clases armadas: lo que el docente prepara de un tema (diapositivas, juego,
 * diagrama, apunte, tarea) y manda al curso de una vez (migración 056).
 *
 * La fila solo agrupa ids. Lo que cada estudiante puede ver de cada pieza lo
 * siguen decidiendo las reglas del material y de la actividad.
 */

import { supabase, unwrap } from './_helpers';
import { updateMaterial } from './documents.service';
import { createActivity, getActivityForStudent, getMySubmissions, getStudentByUserId } from './activities.service';
import { getSharedMaterialsForStudent } from './library.service';
import { haySenial } from '../lib/conexion';
import { archivosDe, guardarArchivos, puedeGuardarSinConexion, yaGuardado } from '../lib/archivosOffline';
import { bajarYa } from '../lib/pantallas';
import type { ActivityQuestion, LibraryMaterial } from '../types';

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

// ── Sin señal, en el celular del estudiante ──
//
// Lo que se guarda vive dentro de la app (cachés del service worker), no
// como archivo del celular. Se borra al cerrar sesión o si entra otra
// persona en el equipo (AuthContext).

const GUARDADAS_KEY = 'estudia_clases_guardadas';

function leerGuardadas(userId: string): string[] {
  try {
    const g = JSON.parse(localStorage.getItem(GUARDADAS_KEY) ?? 'null') as { userId: string; ids: string[] } | null;
    return g?.userId === userId ? g.ids : [];
  } catch {
    return [];
  }
}

function marcarGuardada(userId: string, claseId: string): void {
  try {
    const ids = [claseId, ...leerGuardadas(userId).filter(id => id !== claseId)].slice(0, 30);
    localStorage.setItem(GUARDADAS_KEY, JSON.stringify({ userId, ids }));
  } catch { /* sin storage: la copia quedó igual, solo no se muestra la marca */ }
}

function rutasDeClase(clase: ClaseEnviada, materiales: LibraryMaterial[], conPdf: boolean): string[] {
  const ids = new Set(clase.materialIds);
  return archivosDe(materiales.filter(m => ids.has(m.id)), { conPdf });
}

/**
 * ¿Esta clase se puede abrir sin señal en este equipo? Se guardó entera
 * alguna vez (marca local) y sus archivos siguen en la copia.
 */
export async function claseGuardada(clase: ClaseEnviada, materiales: LibraryMaterial[], userId: string): Promise<boolean> {
  if (!puedeGuardarSinConexion() || !leerGuardadas(userId).includes(clase.id)) return false;
  const guardados = await Promise.all(rutasDeClase(clase, materiales, true).map(yaGuardado));
  return guardados.every(Boolean);
}

/**
 * Deja la clase lista para abrirla sin señal: lo que piden Mis materiales y
 * la tarea al abrirse (el service worker guarda cada respuesta por su
 * dirección exacta) y los archivos de cada parte. Tira Error con mensaje.
 */
export async function guardarClase(
  clase: ClaseEnviada,
  materiales: LibraryMaterial[],
  userId: string,
  opciones: { conPdf?: boolean } = {},
): Promise<void> {
  if (!puedeGuardarSinConexion()) throw new Error('Este navegador no puede guardar cosas para usar sin conexión.');
  if (!haySenial()) throw new Error('Necesitás señal para guardarla. Probá cuando tengas wifi o datos.');

  await Promise.all([
    bajarYa(['/mi-biblioteca', '/mis-actividades/:id']),
    getClasesEnviadas(10),
    getSharedMaterialsForStudent(),
    // La tarea: lo mismo que pide RealizarActividad al abrirse
    clase.activityId
      ? getStudentByUserId(userId).then(st => Promise.all([
        getActivityForStudent(clase.activityId!),
        st ? getMySubmissions(st.id) : null,
      ]))
      : null,
  ]);

  const { fallaron } = await guardarArchivos(rutasDeClase(clase, materiales, opciones.conPdf ?? true));
  if (fallaron > 0) throw new Error(`No se pudo${fallaron > 1 ? 'ieron' : ''} guardar ${fallaron} archivo${fallaron > 1 ? 's' : ''}. Probá de nuevo con mejor señal.`);
  marcarGuardada(userId, clase.id);
}

/**
 * Automático, al abrir la app con señal: guarda las dos últimas clases que le
 * mandaron. Poco y solo si hace falta: son datos del celular de un chico
 * (sin PDF y nada si el celular tiene el ahorro de datos activado).
 */
export async function guardarClasesParaSinSenial(userId: string): Promise<void> {
  const conexion = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
  if (!haySenial() || conexion?.saveData || !puedeGuardarSinConexion()) return;
  const [clases, materiales] = await Promise.all([getClasesEnviadas(10), getSharedMaterialsForStudent()]);
  for (const clase of clases.slice(0, 2)) {
    if (await claseGuardada(clase, materiales, userId)) continue;
    await guardarClase(clase, materiales, userId, { conPdf: false }).catch(console.error);
  }
}
