/**
 * Todo lo de mis materias, listo para usar sin señal (fase 3).
 *
 * Muchos chicos no tienen datos, y con el wifi de la escuela o el de la
 * casa de un amigo alcanza para bajar todo de una vez. Antes andaba sin
 * señal solo lo que ya se había abierto en ese celular, y las dos últimas
 * clases enviadas.
 *
 * Cómo funciona (igual que "Preparar para el aula" del docente): el service
 * worker guarda cada respuesta por su dirección EXACTA (vite.config.ts,
 * caché supabase-rest). Por eso acá se llama a las mismas funciones, con los
 * mismos argumentos, que usa cada pantalla del estudiante al abrirse. Si una
 * pantalla cambia lo que pide, hay que cambiarlo también acá.
 *
 * Datos del celular de un chico:
 *  · Solo, al abrir la app con señal: los datos (actividades, entregas,
 *    materiales, notas, temario), que son livianos. Con wifi cada media
 *    hora; con datos móviles cada tres horas. Con ahorro de datos, nada.
 *  · Las imágenes y los PDF, solos solo con wifi. Si no, cuando el alumno
 *    toca "Bajar todo" (y antes se le avisa que usa datos).
 */

import type { LibraryMaterial, User } from '../types';
import { bajarYa } from '../lib/pantallas';
import { deAPocas } from '../lib/deAPocas';
import { haySenial } from '../lib/conexion';
import { ESTADO_SIN_SENIAL_KEY, generacionSinSenial } from '../lib/sinSenialEstado';
import { archivosDe, guardarArchivos, puedeGuardarSinConexion, yaGuardado } from '../lib/archivosOffline';
import {
  getStudentByUserId, getEnrollmentsByStudent, getActivitiesForStudent, getMySubmissions, getActivityForStudent,
} from './activities.service';
import { getSharedMaterialsForStudent } from './library.service';
import { getClasesEnviadas, marcarClasesBajadas } from './clases.service';
import { getTerms, pickCurrentTerm, getPublishedGradesByStudent } from './gradebook.service';
import { getThresholds } from './thresholds.service';
import { getEvaluacionesDelTrimestre, getNotasDelAlumno } from './evaluaciones.service';
import { getAchievementsByStudent, getMyMaterialReactions } from './gamification.service';
import { getCheckinsByStudent } from './wellbeing.service';
import { getCommunicationsBySchool } from './communications.service';
import { getSyllabusForTerm } from './syllabus.service';
import { getPublishedRecordings } from './recordings.service';
import { getMisDocentes } from './alerts.service';

const CADA_CON_WIFI_MS = 30 * 60 * 1000;
const CADA_CON_DATOS_MS = 3 * 60 * 60 * 1000;
/** Por corrida, para no llenar el celular de una (el resto, en la próxima) */
const ARCHIVOS_POR_VEZ = 150;

export interface EstadoSinSenial {
  userId: string;
  /** ISO: la última vez que se bajó todo */
  cuando: string;
  actividades: number;
  materiales: number;
  /** Archivos (imágenes y PDF) que todavía no están en el celular */
  archivosFaltan: number;
  /** Lo que pesan los PDF que faltan, en bytes (de las imágenes no se sabe) */
  pdfBytes: number;
  /** Pedidos o archivos que no se pudieron bajar esta vez */
  fallaron: number;
}

export interface AvanceSinSenial {
  hechos: number;
  total: number;
}

type Conexion = { saveData?: boolean; type?: string };
const conexion = () => (navigator as Navigator & { connection?: Conexion }).connection;

/** ¿Wifi o cable, sin ahorro de datos? Solo ahí se bajan los archivos solos. */
export function conWifi(): boolean {
  const c = conexion();
  return !!c && !c.saveData && (c.type === 'wifi' || c.type === 'ethernet');
}

/** ¿El navegador dice qué conexión hay? (iOS y las computadoras, no) */
export function sabeSiHayWifi(): boolean {
  return typeof conexion()?.type === 'string';
}

export function estadoSinSenial(userId: string): EstadoSinSenial | null {
  try {
    const e = JSON.parse(localStorage.getItem(ESTADO_SIN_SENIAL_KEY) ?? 'null') as EstadoSinSenial | null;
    return e?.userId === userId && typeof e.archivosFaltan === 'number' ? e : null;
  } catch {
    return null;
  }
}

const oyentes = new Set<(e: EstadoSinSenial) => void>();

/** Para que la pantalla muestre el estado apenas termina (también lo automático). */
export function alCambiarEstado(oyente: (e: EstadoSinSenial) => void): () => void {
  oyentes.add(oyente);
  return () => { oyentes.delete(oyente); };
}

function guardarEstado(e: EstadoSinSenial): void {
  try { localStorage.setItem(ESTADO_SIN_SENIAL_KEY, JSON.stringify(e)); } catch { /* sin storage: lo bajado quedó igual */ }
  for (const oyente of oyentes) oyente(e);
}

/** Los archivos de estos materiales que todavía no están en este equipo. */
async function archivosQueFaltan(materiales: LibraryMaterial[]): Promise<string[]> {
  const rutas = archivosDe(materiales, { conPdf: true });
  const guardados = await Promise.all(rutas.map(yaGuardado));
  return rutas.filter((_, i) => !guardados[i]);
}

let enCurso: Promise<EstadoSinSenial> | null = null;

/**
 * Baja todo. `conArchivos`: también imágenes y PDF (con wifi, o porque el
 * alumno lo pidió). Tira Error con mensaje si no se puede.
 *
 * Si ya hay una corriendo (la automática), espera a que termine y corre
 * otra con estas opciones: el botón pide más que lo automático.
 */
export function prepararSinSenial(
  user: User,
  opciones: { conArchivos: boolean },
  alAvanzar?: (a: AvanceSinSenial) => void,
): Promise<EstadoSinSenial> {
  if (enCurso) {
    const previa = enCurso;
    return previa.catch(() => undefined).then(() => prepararSinSenial(user, opciones, alAvanzar));
  }
  const generacion = generacionSinSenial();
  const sigueSiendoSuya = () => generacion === generacionSinSenial();

  enCurso = (async () => {
    if (!haySenial()) throw new Error('Necesitás señal para bajarlo. Probá cuando tengas wifi o datos.');
    if (!puedeGuardarSinConexion()) throw new Error('Este navegador no puede guardar cosas para usar sin conexión.');

    let hechos = 0;
    let fallaron = 0;
    let total = 1;
    const contar = (ok: boolean) => { hechos++; if (!ok) fallaron++; alAvanzar?.({ hechos, total }); };

    // 1. Las pantallas (el código), para que abran sin señal
    await bajarYa(['/mis-actividades', '/mis-actividades/:id', '/mi-biblioteca', '/materia/:id']);

    // 2. Lo que piden Mis actividades, Mi biblioteca y Mi materia al abrirse
    const st = await getStudentByUserId(user.id);
    if (!st) throw new Error('No encontramos tu ficha de estudiante.');
    const anio = new Date().getFullYear();
    const [inscripciones, actividades, materiales, trimestres, notasPublicadas] = await Promise.all([
      getEnrollmentsByStudent(st.id),
      getActivitiesForStudent(),
      getSharedMaterialsForStudent(),
      getTerms(user.schoolId, anio).catch(() => []),
      getPublishedGradesByStudent(st.id).catch(() => []),
    ]);
    const trimestre = pickCurrentTerm(trimestres);
    const materias = [...new Map(inscripciones.map(e => [`${e.subjectId}|${e.courseId}`, e])).values()];
    const cursos = [...new Set(inscripciones.map(e => e.courseId))];
    // El año de las notas, con la misma cuenta que GradesPanel
    const anioNotas = Math.max(
      new Date().getFullYear() - (new Date().getMonth() < 2 ? 1 : 0),
      ...notasPublicadas.map(x => x.termYear ?? 0),
    );

    const tareas: (() => Promise<unknown>)[] = [
      () => getMySubmissions(st.id),
      () => getThresholds(user.schoolId),
      () => getClasesEnviadas(1),
      () => getClasesEnviadas(10),
      () => getMyMaterialReactions(st.id),
      () => getAchievementsByStudent(st.id),
      () => getCheckinsByStudent(st.id, 60),
      () => getCommunicationsBySchool(user.schoolId),
      () => getMisDocentes(),
      // Mis notas (GradesPanel) y el temario con sus grabaciones (SyllabusPanel)
      () => getNotasDelAlumno(st.id, anioNotas),
      () => getPublishedRecordings(),
      ...cursos.map(c => () => getPublishedRecordings(c)),
      ...trimestres.map(t => () => getSyllabusForTerm(t.id)),
      // Cada actividad, como la pide al abrirse (con su consigna y sus partes)
      ...actividades.map(a => () => getActivityForStudent(a.id)),
      // Mi materia: las evaluaciones que vienen
      ...(trimestre ? materias.map(m => () => getEvaluacionesDelTrimestre(m.subjectId, m.courseId, trimestre.id)) : []),
    ];
    total = tareas.length;
    alAvanzar?.({ hechos, total });
    await deAPocas(tareas, 3, contar);

    // 3. Los archivos que falten (los ya guardados no cuentan para el tope)
    let faltan = await archivosQueFaltan(materiales);
    if (opciones.conArchivos && faltan.length && sigueSiendoSuya()) {
      const estaVez = faltan.slice(0, ARCHIVOS_POR_VEZ);
      const base = hechos;
      total += estaVez.length;
      const r = await guardarArchivos(estaVez, n => alAvanzar?.({ hechos: base + n, total }));
      hechos = base + estaVez.length;
      fallaron += r.fallaron;
      faltan = await archivosQueFaltan(materiales);
    }

    const pdfQueFaltan = new Set(faltan);
    const estado: EstadoSinSenial = {
      userId: user.id,
      cuando: new Date().toISOString(),
      actividades: actividades.length,
      materiales: materiales.length,
      archivosFaltan: faltan.length,
      pdfBytes: materiales
        .filter(m => m.fileType === 'pdf' && m.storagePath && pdfQueFaltan.has(m.storagePath))
        .reduce((s, m) => s + (m.fileSizeBytes ?? 0), 0),
      fallaron,
    };
    // Si mientras tanto se cerró la sesión, no queda nada a nombre de quien se fue
    if (!sigueSiendoSuya()) throw new Error('Se cerró la sesión.');
    // Las clases enviadas con todo adentro quedan marcadas como guardadas
    await marcarClasesBajadas(user.id, materiales).catch(() => undefined);
    guardarEstado(estado);
    return estado;
  })().finally(() => { enCurso = null; });
  return enCurso;
}

/**
 * Lo automático: al abrir la app (o al volver la señal), si pasó un rato
 * desde la última vez. Calladito: si falla, queda para la próxima.
 */
export function prepararSinSenialSolo(user: User, ahorroDeDatos: boolean): void {
  if (user.role !== 'estudiante' || !haySenial() || !puedeGuardarSinConexion()) return;
  if (ahorroDeDatos || conexion()?.saveData) return;
  const wifi = conWifi();
  const e = estadoSinSenial(user.id);
  if (e && Date.now() - new Date(e.cuando).getTime() < (wifi ? CADA_CON_WIFI_MS : CADA_CON_DATOS_MS)) return;
  prepararSinSenial(user, { conArchivos: wifi }).catch(err => {
    console.warn('No se pudo dejar todo listo para usar sin señal:', err);
  });
}
