/**
 * ENSEÑIA SMT — Cola offline
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
 */

import {
  saveSubmissionProgress, submitActivity, logActivityEvent,
} from './activities.service';
import { saveCheckin } from './wellbeing.service';
import type { ActivityAnswer, ActivityEventType, CheckinFeeling, CheckinMoment } from '../types';

const QUEUE_KEY = 'ensenia_offline_queue_v1';
const FLUSH_INTERVAL_MS = 30_000;

type QueuedOp =
  | { kind: 'progress'; submissionId: string; updates: { answers?: Record<string, ActivityAnswer>; responseText?: string; timeSpentSeconds?: number }; ts: number }
  | { kind: 'submit'; submissionId: string; activityId: string; payload: { answers: Record<string, ActivityAnswer>; responseText?: string; autoScore?: number | null; timeSpentSeconds: number }; ts: number }
  | { kind: 'event'; activityId: string; studentId: string; eventType: ActivityEventType; metadata: Record<string, unknown>; ts: number }
  | { kind: 'checkin'; studentId: string; activityId: string | null; moment: CheckinMoment; feeling: CheckinFeeling; comment?: string; ts: number };

type Listener = (pending: number, syncing: boolean) => void;

let queue: QueuedOp[] = load();
let listeners: Listener[] = [];
let flushing = false;
let started = false;

function load(): QueuedOp[] {
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

function notify(syncing = false) {
  listeners.forEach(l => l(queue.length, syncing));
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
  queue.push({ ...op, ts: Date.now() } as QueuedOp);
  compact();
  persist();
  notify();
}

export async function flush(): Promise<void> {
  if (flushing || queue.length === 0) return;
  if (typeof navigator !== 'undefined' && !navigator.onLine) return;
  flushing = true;
  notify(true);
  try {
    while (queue.length > 0) {
      const op = queue[0];
      try {
        await run(op);
        queue.shift();
        persist();
        notify(true);
      } catch (err) {
        if (isNetworkError(err)) {
          // seguimos sin red: reintento más tarde
          break;
        }
        // error del servidor: descartamos esta operación y seguimos
        console.error('Operación offline descartada por error del servidor:', err);
        queue.shift();
        persist();
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

/** ¿Hay una entrega esperando sincronizarse para esta actividad? */
export function hasPendingSubmit(activityId: string): boolean {
  return queue.some(op => op.kind === 'submit' && op.activityId === activityId);
}

export function pendingCount(): number {
  return queue.length;
}

export function subscribe(listener: Listener): () => void {
  listeners.push(listener);
  listener(queue.length, flushing);
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
