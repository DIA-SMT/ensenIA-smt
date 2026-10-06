/**
 * SMT EstudIA — Cola offline
 *
 * Los chicos muchas veces no tienen datos, y en el aula el wifi va y viene:
 * se trabaja sin conexión y la app manda todo sola cuando aparece señal.
 * Cada escritura que puede hacerse sin conexión pasa por acá:
 *
 *   - con señal → va directo al servidor
 *   - sin señal (o falla de red) → se guarda en este equipo (localStorage)
 *     y se reintenta al volver la señal, al abrir la app y cada 30 s.
 *
 * Del estudiante: avance y entrega de actividades, huellas, check-ins y
 * prácticas. Del docente: asistencia, notas del trimestre en borrador,
 * notas de las evaluaciones, boletín y observaciones (publicar notas sí
 * necesita señal: les avisa a las familias).
 *
 * Lo que el SERVIDOR rechaza (permisos, validación) no se reintenta, pero
 * tampoco se tira en silencio: queda en "no se pudo guardar", con el
 * motivo, hasta que la persona lo descarte o lo reintente.
 *
 * Cada operación lleva a su DUEÑO (el usuario que la hizo) y solo se envía
 * con la sesión de esa persona. En una compu compartida, si Sofía dejó una
 * entrega sin enviar y después entra Nicolás, antes se intentaba mandar lo
 * de Sofía con la sesión de Nicolás: la base lo rechazaba y se perdía. Ahora
 * espera a que Sofía vuelva a entrar en ese dispositivo.
 *
 * Las del docente llevan una CLAVE (qué cosa es: la asistencia de tal curso
 * y día, la nota de tal alumno y trimestre...). Guardar de nuevo lo mismo
 * reemplaza a lo que estaba esperando, y un guardado directo que llega lo
 * deja sin efecto: nunca se manda una versión vieja encima de una nueva.
 */

import {
  saveSubmissionProgress, submitActivity, logActivityEvent,
} from './activities.service';
import { saveCheckin, addObservation } from './wellbeing.service';
import { recordPracticeAttempt } from './practice.service';
import { saveAttendance, type AttendanceEntry } from './attendance.service';
import { saveGrades } from './gradebook.service';
import { upsertGrade } from './libreta.service';
import { guardarEvaluacion, type EvaluacionAGuardar } from './evaluaciones.service';
import { pedirHablarConDocente } from './alerts.service';
import { haySenial, esErrorDeRed, suscribirConexion } from '../lib/conexion';
import type {
  ActivityAnswer, ActivityEventType, CheckinFeeling, CheckinMoment, PracticeAttempt, ObservationCategory,
} from '../types';

const QUEUE_KEY = 'ensenia_offline_queue_v1';
const RECHAZADAS_KEY = 'estudia_no_guardadas_v1';
const FLUSH_INTERVAL_MS = 30_000;

/** Una nota del trimestre, tal como la manda la libreta (siempre en borrador). */
export interface FilaNotaPendiente {
  studentId: string;
  grade: number | null;
  suggestedGrade: number | null;
  suggestedFrom: number;
  teacherNote?: string | null;
}

export type FilaBoletinPendiente = Parameters<typeof upsertGrade>[0];

type OpEstudiante =
  | { kind: 'progress'; submissionId: string; updates: { answers?: Record<string, ActivityAnswer>; responseText?: string; timeSpentSeconds?: number } }
  | { kind: 'submit'; submissionId: string; activityId: string; payload: { answers: Record<string, ActivityAnswer>; responseText?: string; timeSpentSeconds: number } }
  | { kind: 'event'; activityId: string; studentId: string; eventType: ActivityEventType; metadata: Record<string, unknown> }
  | { kind: 'checkin'; studentId: string; activityId: string | null; moment: CheckinMoment; feeling: CheckinFeeling; comment?: string }
  | { kind: 'practice'; studentId: string; materialId: string; score: number; total: number }
  | { kind: 'hablar'; teacherId: string | null; motivo: string; descripcion: string };

type OpDocente =
  | { kind: 'asistencia'; clave: string; descripcion: string; courseId: string; subjectId: string; fecha: string; entries: AttendanceEntry[]; note?: string }
  | { kind: 'notas'; clave: string; descripcion: string; subjectId: string; courseId: string; termId: string; rows: FilaNotaPendiente[] }
  | { kind: 'boletin'; clave: string; descripcion: string; fila: FilaBoletinPendiente }
  | { kind: 'observacion'; clave: string; descripcion: string; id: string; studentId: string; teacherId: string; subjectId: string | null; category: ObservationCategory; note: string }
  | { kind: 'evaluacion'; clave: string; descripcion: string; evaluacion: EvaluacionAGuardar };

type Op = OpEstudiante | OpDocente;
type QueuedOp = Op & { ts: number; owner?: string };
type KindDocente = OpDocente['kind'];

/** Lo que el servidor no aceptó: se muestra hasta que se descarte o se reintente. */
export interface NoGuardada {
  ts: number;
  descripcion: string;
  motivo: string;
}
type Rechazada = { op: QueuedOp; motivo: string };

type Listener = (pending: number, syncing: boolean, noGuardadas: number) => void;

let queue: QueuedOp[] = leer(QUEUE_KEY);
let rechazadas: Rechazada[] = leer(RECHAZADAS_KEY);
let duenio: string | null = null;
let listeners: Listener[] = [];
let flushing = false;
let started = false;

function leer<T>(clave: string): T[] {
  try {
    return JSON.parse(localStorage.getItem(clave) ?? '[]');
  } catch {
    return [];
  }
}

function persist() {
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
    localStorage.setItem(RECHAZADAS_KEY, JSON.stringify(rechazadas));
  } catch { /* storage lleno: seguimos en memoria */ }
}

/** Las de la persona con sesión abierta (o viejas, de antes de tener dueño). */
function esMia(op: QueuedOp): boolean {
  return !!duenio && (!op.owner || op.owner === duenio);
}

function misPendientes(): number {
  return queue.filter(esMia).length;
}

function misRechazadas(): Rechazada[] {
  return rechazadas.filter(r => esMia(r.op));
}

function notify(syncing = false) {
  const n = misPendientes();
  const r = misRechazadas().length;
  listeners.forEach(l => l(n, syncing, r));
}

/** Lo llama AuthContext cuando se sabe quién entró (o null al salir). */
export function setDuenioCola(userId: string | null): void {
  duenio = userId;
  notify();
  if (userId) flush();
}

async function run(op: QueuedOp): Promise<void> {
  switch (op.kind) {
    case 'progress':
      return saveSubmissionProgress(op.submissionId, op.updates);
    case 'submit':
      return submitActivity(op.submissionId, op.payload);
    case 'checkin':
      return saveCheckin({
        studentId: op.studentId,
        activityId: op.activityId,
        moment: op.moment,
        feeling: op.feeling,
        comment: op.comment,
      });
    case 'practice':
      await recordPracticeAttempt({
        studentId: op.studentId,
        materialId: op.materialId,
        score: op.score,
        total: op.total,
      });
      return;
    case 'event':
      return logActivityEvent(op.activityId, op.studentId, op.eventType, {
        ...op.metadata,
        offline_ts: new Date(op.ts).toISOString(), // momento real del evento
      });
    case 'hablar':
      return pedirHablarConDocente(op.teacherId, op.motivo);
    case 'asistencia':
      return saveAttendance({
        courseId: op.courseId, subjectId: op.subjectId, takenOn: op.fecha, note: op.note, entries: op.entries,
      });
    case 'notas':
      return saveGrades({
        subjectId: op.subjectId, courseId: op.courseId, termId: op.termId, status: 'borrador', rows: op.rows,
      });
    case 'boletin':
      return upsertGrade(op.fila);
    case 'evaluacion':
      return guardarEvaluacion(op.evaluacion);
    case 'observacion':
      return addObservation({
        id: op.id, studentId: op.studentId, teacherId: op.teacherId,
        subjectId: op.subjectId, category: op.category, note: op.note,
      });
  }
}

const DESCRIPCION_ESTUDIANTE: Record<OpEstudiante['kind'], string> = {
  progress: 'Avance de una actividad',
  submit: 'Entrega de una actividad',
  event: 'Registro de actividad',
  checkin: 'Cómo te sentiste',
  practice: 'Una práctica',
  hablar: 'Pedido para hablar con un docente',
};

function describir(op: QueuedOp): string {
  return 'descripcion' in op ? op.descripcion : DESCRIPCION_ESTUDIANTE[op.kind];
}

/** El motivo, en palabras de la escuela (los de la base vienen en inglés técnico). */
function motivoDe(err: unknown): string {
  const e = err as { code?: string; message?: string } | null;
  const msg = e?.message ?? String(err);
  if (e?.code === '42501' || /row-level security|permission denied/i.test(msg)) {
    return 'El servidor no lo aceptó: puede que ya no tengas esa materia o ese curso.';
  }
  if (e?.code === '23503') return 'El servidor no lo aceptó: el alumno o la materia ya no están.';
  if (e?.code === '23514' || e?.code === '22P02') return 'El servidor no lo aceptó: hay un dato inválido.';
  return msg;
}

/** Compacta la cola: solo importa el ÚLTIMO progress por submission. */
function compact() {
  const lastProgressIdx = new Map<string, number>();
  queue.forEach((op, i) => {
    if (op.kind === 'progress') lastProgressIdx.set(op.submissionId, i);
  });
  queue = queue.filter((op, i) => op.kind !== 'progress' || lastProgressIdx.get(op.submissionId) === i);
}

/** Guardar de nuevo lo mismo reemplaza a lo que estaba esperando. */
function sacarMismaClave(clave: string) {
  queue = queue.filter(op => !(esMia(op) && 'clave' in op && op.clave === clave));
}

export function enqueue(op: Op) {
  if ('clave' in op) sacarMismaClave(op.clave);
  queue.push({ ...op, ts: Date.now(), owner: duenio ?? undefined } as QueuedOp);
  compact();
  persist();
  notify();
}

export async function flush(): Promise<void> {
  if (flushing || misPendientes() === 0) return;
  if (!haySenial()) return;
  flushing = true;
  notify(true);
  try {
    // En orden, solo las de quien tiene la sesión: las de otra persona se
    // quedan en la cola hasta que esa persona vuelva a entrar.
    let op: QueuedOp | undefined;
    while ((op = queue.find(esMia))) {
      const actual = op;
      const sacar = () => { queue = queue.filter(x => x !== actual); };
      try {
        await run(actual);
        sacar();
        persist();
        notify(true);
      } catch (err) {
        if (esErrorDeRed(err)) {
          // seguimos sin red: reintento más tarde
          break;
        }
        // El servidor no lo aceptó: sale de la cola y queda a la vista
        console.error('No se pudo guardar lo pendiente:', err);
        sacar();
        rechazadas.push({ op: actual, motivo: motivoDe(err) });
        persist();
        notify(true);
      }
    }
  } finally {
    flushing = false;
    notify(false);
  }
}

// ── Lo que no se pudo guardar ──

export function noGuardadas(): NoGuardada[] {
  return misRechazadas().map(r => ({ ts: r.op.ts, descripcion: describir(r.op), motivo: r.motivo }));
}

export function descartarNoGuardada(ts: number): void {
  rechazadas = rechazadas.filter(r => !(esMia(r.op) && r.op.ts === ts));
  persist();
  notify();
}

/** Vuelve a la cola (por si era un problema que ya se resolvió, como un permiso). */
export function reintentarNoGuardada(ts: number): void {
  const r = rechazadas.find(x => esMia(x.op) && x.op.ts === ts);
  if (!r) return;
  rechazadas = rechazadas.filter(x => x !== r);
  queue.push(r.op);
  persist();
  notify();
  void flush();
}

// ── Escrituras resilientes del estudiante: directo si hay red, a la cola si no ──

export async function saveProgressResilient(
  submissionId: string,
  updates: { answers?: Record<string, ActivityAnswer>; responseText?: string; timeSpentSeconds?: number },
): Promise<void> {
  if (!haySenial()) {
    enqueue({ kind: 'progress', submissionId, updates });
    return;
  }
  try {
    await saveSubmissionProgress(submissionId, updates);
  } catch (err) {
    if (esErrorDeRed(err)) enqueue({ kind: 'progress', submissionId, updates });
    else throw err;
  }
}

/** @returns true si quedó encolada para sincronizar después */
export async function submitResilient(
  submissionId: string,
  activityId: string,
  payload: { answers: Record<string, ActivityAnswer>; responseText?: string; timeSpentSeconds: number },
): Promise<boolean> {
  if (!haySenial()) {
    enqueue({ kind: 'submit', submissionId, activityId, payload });
    return true;
  }
  try {
    await submitActivity(submissionId, payload);
    return false;
  } catch (err) {
    if (esErrorDeRed(err)) {
      enqueue({ kind: 'submit', submissionId, activityId, payload });
      return true;
    }
    throw err;
  }
}

export function logEventResilient(
  activityId: string,
  studentId: string,
  eventType: ActivityEventType,
  metadata: Record<string, unknown> = {},
): void {
  if (!haySenial()) {
    enqueue({ kind: 'event', activityId, studentId, eventType, metadata });
    return;
  }
  // logActivityEvent ya es fire-and-forget con manejo de errores;
  // si falla por red lo encolamos para no perder la huella.
  logActivityEvent(activityId, studentId, eventType, metadata)
    .catch(() => enqueue({ kind: 'event', activityId, studentId, eventType, metadata }));
}

export function saveCheckinResilient(c: {
  studentId: string;
  activityId: string | null;
  moment: CheckinMoment;
  feeling: CheckinFeeling;
  comment?: string;
}): void {
  if (!haySenial()) {
    enqueue({ kind: 'checkin', ...c });
    return;
  }
  saveCheckin(c).catch(err => {
    if (esErrorDeRed(err)) enqueue({ kind: 'checkin', ...c });
    else console.error('checkin:', err);
  });
}

/**
 * Registra un intento de práctica.
 * @returns el intento con el XP real (calculado por el trigger), o null si
 * quedó encolado para sincronizar cuando vuelva la conexión.
 */
export async function recordPracticeAttemptResilient(input: {
  studentId: string;
  materialId: string;
  score: number;
  total: number;
}): Promise<PracticeAttempt | null> {
  if (!haySenial()) {
    enqueue({ kind: 'practice', ...input });
    return null;
  }
  try {
    return await recordPracticeAttempt(input);
  } catch (err) {
    if (esErrorDeRed(err)) {
      enqueue({ kind: 'practice', ...input });
      return null;
    }
    throw err;
  }
}

/** "Quiero hablar con un docente": sin señal queda guardado y se envía solo. */
export async function pedirHablarResiliente(teacherId: string | null, motivo: string, descripcion: string): Promise<'enviado' | 'pendiente'> {
  if (!haySenial()) {
    enqueue({ kind: 'hablar', teacherId, motivo, descripcion });
    return 'pendiente';
  }
  try {
    await pedirHablarConDocente(teacherId, motivo);
    return 'enviado';
  } catch (err) {
    if (esErrorDeRed(err)) {
      enqueue({ kind: 'hablar', teacherId, motivo, descripcion });
      return 'pendiente';
    }
    throw err;
  }
}

// ── Escrituras resilientes del docente ──

/** 'enviado': ya está en el servidor. 'pendiente': quedó en este equipo y se manda sola. */
export type ResultadoGuardado = 'enviado' | 'pendiente';

async function guardarDocente(op: OpDocente, enviar: () => Promise<void>): Promise<ResultadoGuardado> {
  if (!haySenial()) {
    enqueue(op);
    return 'pendiente';
  }
  try {
    await enviar();
    // Lo que estaba esperando con la misma clave quedó viejo
    sacarMismaClave(op.clave);
    persist();
    notify();
    return 'enviado';
  } catch (err) {
    if (esErrorDeRed(err)) {
      enqueue(op);
      return 'pendiente';
    }
    throw err;
  }
}

export const claveAsistencia = (courseId: string, subjectId: string, fecha: string) =>
  `asistencia|${courseId}|${subjectId}|${fecha}`;
export const claveNotas = (subjectId: string, courseId: string, termId: string) =>
  `notas|${subjectId}|${courseId}|${termId}`;
export const claveBoletin = (f: { studentId: string; subjectId: string; schoolYear: number; term: number }) =>
  `boletin|${f.studentId}|${f.subjectId}|${f.schoolYear}|${f.term}`;
export const claveEvaluacion = (id: string) => `evaluacion|${id}`;

/** Una evaluación con todas sus notas (el id lo elige la app: reintentar no la duplica). */
export function guardarEvaluacionResiliente(e: EvaluacionAGuardar, descripcion: string): Promise<ResultadoGuardado> {
  return guardarDocente({ kind: 'evaluacion', clave: claveEvaluacion(e.id), descripcion, evaluacion: e }, () => guardarEvaluacion(e));
}

export function guardarAsistenciaResiliente(input: {
  courseId: string; subjectId: string; fecha: string; entries: AttendanceEntry[]; note?: string; descripcion: string;
}): Promise<ResultadoGuardado> {
  const op: OpDocente = { kind: 'asistencia', clave: claveAsistencia(input.courseId, input.subjectId, input.fecha), ...input };
  return guardarDocente(op, () => saveAttendance({
    courseId: input.courseId, subjectId: input.subjectId, takenOn: input.fecha, note: input.note, entries: input.entries,
  }));
}

/** Notas del trimestre en BORRADOR. Publicar va directo (necesita señal). */
export function guardarNotasBorradorResiliente(input: {
  subjectId: string; courseId: string; termId: string; rows: FilaNotaPendiente[]; descripcion: string;
}): Promise<ResultadoGuardado> {
  const op: OpDocente = { kind: 'notas', clave: claveNotas(input.subjectId, input.courseId, input.termId), ...input };
  return guardarDocente(op, () => saveGrades({
    subjectId: input.subjectId, courseId: input.courseId, termId: input.termId, status: 'borrador', rows: input.rows,
  }));
}

export function guardarBoletinResiliente(fila: FilaBoletinPendiente, descripcion: string): Promise<ResultadoGuardado> {
  return guardarDocente({ kind: 'boletin', clave: claveBoletin(fila), descripcion, fila }, () => upsertGrade(fila));
}

export function guardarObservacionResiliente(o: {
  studentId: string; teacherId: string; subjectId: string | null; category: ObservationCategory; note: string; descripcion: string;
}): Promise<ResultadoGuardado> {
  // El id se elige acá: si el envío llega pero la respuesta se pierde,
  // reintentar no la duplica.
  const id = crypto.randomUUID();
  const op: OpDocente = { kind: 'observacion', clave: `observacion|${id}`, id, ...o };
  return guardarDocente(op, () => addObservation({
    id, studentId: o.studentId, teacherId: o.teacherId, subjectId: o.subjectId, category: o.category, note: o.note,
  }));
}

/** Algo se guardó directo por otro camino (publicar notas): lo que esperaba con esa clave ya no va. */
export function olvidarPendiente(clave: string): void {
  sacarMismaClave(clave);
  persist();
  notify();
}

/** Lo del docente que está esperando en este equipo, para mostrarlo en pantalla. */
export function pendientesDe<K extends KindDocente>(kind: K): Extract<QueuedOp, { kind: K }>[] {
  return queue.filter((op): op is Extract<QueuedOp, { kind: K }> => esMia(op) && op.kind === kind);
}

/** ¿Hay una entrega esperando sincronizarse para esta actividad? */
export function hasPendingSubmit(activityId: string): boolean {
  return queue.some(op => esMia(op) && op.kind === 'submit' && op.activityId === activityId);
}

export function pendingCount(): number {
  return misPendientes();
}

export function subscribe(listener: Listener): () => void {
  listeners.push(listener);
  listener(misPendientes(), flushing, misRechazadas().length);
  return () => { listeners = listeners.filter(l => l !== listener); };
}

/** Llamar una sola vez al montar la app. */
export function startOfflineSync(): void {
  if (started) return;
  started = true;
  // Volvió la señal (el equipo, o el sondeo de lib/supabase.ts): a mandar
  suscribirConexion(() => { if (haySenial()) void flush(); });
  setInterval(() => { void flush(); }, FLUSH_INTERVAL_MS);
  // por si quedaron cosas de la última sesión
  setTimeout(() => { void flush(); }, 3000);
}
