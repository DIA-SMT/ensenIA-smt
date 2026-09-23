/**
 * SMT EstudIA — Cola offline
 *
 * Los chicos muchas veces no tienen datos: trabajan offline y la app
 * sincroniza sola cuando aparece wifi. Cada operación de escritura del
 * portal del estudiante pasa por acá:
 *
 *   - con conexión → va directo al servidor
 *   - sin conexión (o falla de red) → se encola en localStorage y se
 *     reintenta al volver la conexión, al abrir la app, y cada 30s.
 *
 * Los errores del SERVIDOR (RLS, validación) no se reintentan: esa
 * operación se descarta para no trabar el resto de la cola.
 *
 * Cada operación lleva a su DUEÑO (el usuario que la hizo) y solo se envía
 * con la sesión de esa persona. En una compu compartida, si Sofía dejó una
 * entrega sin enviar y después entra Nicolás, antes se intentaba mandar lo
 * de Sofía con la sesión de Nicolás: la base lo rechazaba y se perdía. Ahora
 * espera a que Sofía vuelva a entrar en ese dispositivo.
 */

import {
  saveSubmissionProgress, submitActivity, logActivityEvent,
} from './activities.service';
import { saveCheckin } from './wellbeing.service';
import { recordPracticeAttempt } from './practice.service';
import type { ActivityAnswer, ActivityEventType, CheckinFeeling, CheckinMoment, PracticeAttempt } from '../types';

const QUEUE_KEY = 'ensenia_offline_queue_v1';
const FLUSH_INTERVAL_MS = 30_000;

type QueuedOp =
  | { kind: 'progress'; submissionId: string; updates: { answers?: Record<string, ActivityAnswer>; responseText?: string; timeSpentSeconds?: number }; ts: number }
  | { kind: 'submit'; submissionId: string; activityId: string; payload: { answers: Record<string, ActivityAnswer>; responseText?: string; autoScore?: number | null; timeSpentSeconds: number }; ts: number }
  | { kind: 'event'; activityId: string; studentId: string; eventType: ActivityEventType; metadata: Record<string, unknown>; ts: number }
  | { kind: 'checkin'; studentId: string; activityId: string | null; moment: CheckinMoment; feeling: CheckinFeeling; comment?: string; ts: number }
  | { kind: 'practice'; studentId: string; materialId: string; score: number; total: number; ts: number };

type QueuedOpConDuenio = QueuedOp & { owner?: string };

type Listener = (pending: number, syncing: boolean) => void;

let queue: QueuedOpConDuenio[] = load();
let duenio: string | null = null;
let listeners: Listener[] = [];
let flushing = false;
let started = false;

function load(): QueuedOpConDuenio[] {
  try {
    return JSON.parse(localStorage.getItem(QUEUE_KEY) ?? '[]');
  } catch {
    return [];
  }
}

function persist() {
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  } catch { /* storage lleno: seguimos en memoria */ }
}

/** Las de la persona con sesión abierta (o viejas, de antes de tener dueño). */
function esMia(op: QueuedOpConDuenio): boolean {
  return !!duenio && (!op.owner || op.owner === duenio);
}

function misPendientes(): number {
  return queue.filter(esMia).length;
}

function notify(syncing = false) {
  const n = misPendientes();
  listeners.forEach(l => l(n, syncing));
}

/** Lo llama AuthContext cuando se sabe quién entró (o null al salir). */
export function setDuenioCola(userId: string | null): void {
  duenio = userId;
  notify();
  if (userId) flush();
}

function isNetworkError(err: unknown): boolean {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return true;
  if (err instanceof TypeError) return true; // fetch: "Failed to fetch"
  const msg = err instanceof Error ? err.message.toLowerCase() : '';
  return msg.includes('fetch') || msg.includes('network') || msg.includes('conexión');
}

async function run(op: QueuedOp): Promise<void> {
  if (op.kind === 'progress') {
    await saveSubmissionProgress(op.submissionId, op.updates);
  } else if (op.kind === 'submit') {
    await submitActivity(op.submissionId, op.payload);
  } else if (op.kind === 'checkin') {
    await saveCheckin({
      studentId: op.studentId,
      activityId: op.activityId,
      moment: op.moment,
      feeling: op.feeling,
      comment: op.comment,
    });
  } else if (op.kind === 'practice') {
    await recordPracticeAttempt({
      studentId: op.studentId,
      materialId: op.materialId,
      score: op.score,
      total: op.total,
    });
  } else {
    await logActivityEvent(op.activityId, op.studentId, op.eventType, {
      ...op.metadata,
      offline_ts: new Date(op.ts).toISOString(), // momento real del evento
    });
  }
}

/** Compacta la cola: solo importa el ÚLTIMO progress por submission. */
function compact() {
  const lastProgressIdx = new Map<string, number>();
  queue.forEach((op, i) => {
    if (op.kind === 'progress') lastProgressIdx.set(op.submissionId, i);
  });
  queue = queue.filter((op, i) => op.kind !== 'progress' || lastProgressIdx.get(op.submissionId) === i);
}

// Omit distributivo: preserva cada variante de la unión discriminada
type DistributiveOmit<T, K extends keyof T> = T extends unknown ? Omit<T, K> : never;
type QueuedOpInput = DistributiveOmit<QueuedOp, 'ts'>;

export function enqueue(op: QueuedOpInput) {
  queue.push({ ...op, ts: Date.now(), owner: duenio ?? undefined } as QueuedOpConDuenio);
  compact();
  persist();
  notify();
}

export async function flush(): Promise<void> {
  if (flushing || misPendientes() === 0) return;
  if (typeof navigator !== 'undefined' && !navigator.onLine) return;
  flushing = true;
  notify(true);
  try {
    // En orden, solo las de quien tiene la sesión: las de otra persona se
    // quedan en la cola hasta que esa persona vuelva a entrar.
    let op: QueuedOpConDuenio | undefined;
    while ((op = queue.find(esMia))) {
      const actual = op;
      const sacar = () => { queue = queue.filter(x => x !== actual); persist(); };
      try {
        await run(actual);
        sacar();
        notify(true);
      } catch (err) {
        if (isNetworkError(err)) {
          // seguimos sin red: reintento más tarde
          break;
        }
        // error del servidor: descartamos esta operación y seguimos
        console.error('Operación offline descartada por error del servidor:', err);
        sacar();
      }
    }
  } finally {
    flushing = false;
    notify(false);
  }
}

/** Escrituras resilientes: directo si hay red, a la cola si no. */

export async function saveProgressResilient(
  submissionId: string,
  updates: { answers?: Record<string, ActivityAnswer>; responseText?: string; timeSpentSeconds?: number },
): Promise<void> {
  if (!navigator.onLine) {
    enqueue({ kind: 'progress', submissionId, updates });
    return;
  }
  try {
    await saveSubmissionProgress(submissionId, updates);
  } catch (err) {
    if (isNetworkError(err)) enqueue({ kind: 'progress', submissionId, updates });
    else throw err;
  }
}

/** @returns true si quedó encolada para sincronizar después */
export async function submitResilient(
  submissionId: string,
  activityId: string,
  payload: { answers: Record<string, ActivityAnswer>; responseText?: string; autoScore?: number | null; timeSpentSeconds: number },
): Promise<boolean> {
  if (!navigator.onLine) {
    enqueue({ kind: 'submit', submissionId, activityId, payload });
    return true;
  }
  try {
    await submitActivity(submissionId, payload);
    return false;
  } catch (err) {
    if (isNetworkError(err)) {
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
  if (!navigator.onLine) {
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
  if (!navigator.onLine) {
    enqueue({ kind: 'checkin', ...c });
    return;
  }
  saveCheckin(c).catch(err => {
    if (isNetworkError(err)) enqueue({ kind: 'checkin', ...c });
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
  if (!navigator.onLine) {
    enqueue({ kind: 'practice', ...input });
    return null;
  }
  try {
    return await recordPracticeAttempt(input);
  } catch (err) {
    if (isNetworkError(err)) {
      enqueue({ kind: 'practice', ...input });
      return null;
    }
    throw err;
  }
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
  listener(misPendientes(), flushing);
  return () => { listeners = listeners.filter(l => l !== listener); };
}

/** Llamar una sola vez al montar la app. */
export function startOfflineSync(): void {
  if (started) return;
  started = true;
  window.addEventListener('online', () => { flush(); });
  setInterval(() => { flush(); }, FLUSH_INTERVAL_MS);
  // por si quedaron cosas de la última sesión
  setTimeout(() => { flush(); }, 3000);
}
