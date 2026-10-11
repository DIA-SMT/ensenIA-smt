/**
 * Lo que el alumno va respondiendo, guardado en el equipo al instante
 * (fase 3: actividades sin datos).
 *
 * Sin señal, la copia del servidor que guarda el service worker es la de la
 * última vez que hubo conexión: al volver a abrir la actividad mostraba las
 * respuestas viejas, y el siguiente autoguardado pisaba lo que estaba
 * esperando en la cola. El borrador es la versión del equipo; manda sobre
 * la del servidor salvo que la del servidor sea más nueva (la escribió el
 * alumno desde otro equipo) o ya esté entregada.
 *
 * Vive en localStorage como la cola sin conexión, con la misma regla: es
 * del alumno y de esa actividad, y se borra al entregar.
 */

import type { ActivityAnswer, ActivitySubmission } from '../types';

const PREFIJO = 'estudia_borrador_';
/** Un borrador abandonado no queda para siempre en el celular */
const VENCE_MS = 60 * 24 * 60 * 60 * 1000;

export interface BorradorEntrega {
  answers: Record<string, ActivityAnswer>;
  responseText: string;
  timeSpentSeconds: number;
  /** ISO: cuándo se guardó en el equipo */
  guardadoEl: string;
}

const clave = (studentId: string, activityId: string) => `${PREFIJO}${studentId}_${activityId}`;

export function leerBorrador(studentId: string, activityId: string): BorradorEntrega | null {
  try {
    const b = JSON.parse(localStorage.getItem(clave(studentId, activityId)) ?? 'null') as BorradorEntrega | null;
    if (!b) return null;
    if (Date.now() - new Date(b.guardadoEl).getTime() > VENCE_MS) {
      localStorage.removeItem(clave(studentId, activityId));
      return null;
    }
    return b;
  } catch {
    return null;
  }
}

/**
 * `mantenerFecha`: para el latido del tiempo. La fecha dice cuándo cambiaron
 * las respuestas; si el latido la moviera, un borrador viejo de este equipo
 * parecería más nuevo que lo que el alumno hizo después en otro.
 */
export function guardarBorrador(
  studentId: string,
  activityId: string,
  b: Omit<BorradorEntrega, 'guardadoEl'> & { guardadoEl?: string },
  opciones: { mantenerFecha?: boolean } = {},
): void {
  try {
    const guardadoEl = opciones.mantenerFecha && b.guardadoEl ? b.guardadoEl : new Date().toISOString();
    localStorage.setItem(clave(studentId, activityId), JSON.stringify({
      answers: b.answers, responseText: b.responseText, timeSpentSeconds: b.timeSpentSeconds, guardadoEl,
    }));
  } catch { /* sin espacio o sin storage: queda lo de la cola y lo del servidor */ }
}

export function borrarBorrador(studentId: string, activityId: string): void {
  try { localStorage.removeItem(clave(studentId, activityId)); } catch { /* nada que borrar */ }
}

/**
 * La entrega que hay que mostrar: la del servidor o la del equipo.
 * Entregada o corregida, manda la del servidor. En curso (o sin empezar en
 * el servidor), manda el borrador si es más nuevo, o siempre que haya algo
 * de esta actividad esperando en la cola (así un reloj del celular atrasado
 * no hace perder lo que todavía no se mandó).
 */
export function conBorrador(
  sub: ActivitySubmission | null,
  b: BorradorEntrega | null,
  activityId: string,
  studentId: string,
  enCola: boolean,
): ActivitySubmission | null {
  if (!b) return sub;
  if (sub && (sub.status === 'submitted' || sub.status === 'graded')) return sub;
  if (!enCola && sub?.updatedAt && new Date(sub.updatedAt).getTime() > new Date(b.guardadoEl).getTime()) return sub;
  return {
    ...(sub ?? {
      id: `local:${activityId}`,
      activityId,
      studentId,
      startedAt: b.guardadoEl,
      submittedAt: null,
      gradedAt: null,
    }),
    status: 'in_progress',
    answers: b.answers,
    responseText: b.responseText,
    timeSpentSeconds: Math.max(b.timeSpentSeconds, sub?.timeSpentSeconds ?? 0),
  };
}

/**
 * Las entregas como las ve el alumno en este equipo: las del servidor más
 * lo que empezó o entregó sin señal (borradores y cola). Para las listas:
 * sin esto, una actividad empezada sin conexión figuraba "sin empezar".
 */
export function entregasConLoLocal(
  subs: ActivitySubmission[],
  activityIds: string[],
  studentId: string,
  enCola: (activityId: string) => boolean,
  entregaEnCola: (activityId: string) => boolean,
): ActivitySubmission[] {
  const otras = subs.filter(s => !activityIds.includes(s.activityId));
  const deEstas = activityIds.flatMap(id => {
    let s = conBorrador(subs.find(x => x.activityId === id) ?? null, leerBorrador(studentId, id), id, studentId, enCola(id));
    if (s && s.status !== 'submitted' && s.status !== 'graded' && entregaEnCola(id)) {
      s = { ...s, status: 'submitted', submittedAt: s.submittedAt ?? new Date().toISOString() };
    }
    return s ? [s] : [];
  });
  return [...deEstas, ...otras];
}

/**
 * Al cerrar sesión (o cuando entra otra persona): borra los borradores del
 * equipo salvo los que todavía esperan en la cola (`${studentId}_${activityId}`).
 */
export function borrarBorradoresSalvo(conservar: Set<string>): void {
  try {
    const claves: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k?.startsWith(PREFIJO) && !conservar.has(k.slice(PREFIJO.length))) claves.push(k);
    }
    claves.forEach(k => localStorage.removeItem(k));
  } catch { /* sin storage: nada que borrar */ }
}
