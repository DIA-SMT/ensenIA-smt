/**
 * SMT EstudIA — Invitados en la clase en vivo
 *
 * El que escanea el QR no tiene cuenta ni la va a crear: entra con un
 * código de sala y un nombre de pila. Sirve para una presentación, una
 * jornada docente o una visita al aula.
 *
 * Todo pasa por cuatro funciones de Postgres que validan un token en
 * cada llamada (migración 012). Desde acá no se toca ninguna tabla
 * directamente, así que no hay nada abierto que después haya que
 * acordarse de cerrar.
 */

import { supabase } from './_helpers';
import type { LiveActivityKind, LiveActivityConfig, LiveActivityStatus, LiveResults } from './live.service';

// ── Tipos ──

export interface GuestSession {
  token: string;
  guestId: string;
  sessionId: string;
  title: string;
  displayName: string;
}

export interface GuestActivity {
  id: string;
  kind: LiveActivityKind;
  config: LiveActivityConfig;
  status: LiveActivityStatus;
}

export type GuestState =
  /** El docente terminó la clase. */
  | { status: 'ended' }
  /** Hay clase, pero ninguna actividad lanzada: el celular queda en pausa. */
  | { status: 'idle'; title: string; reactionsEnabled: boolean }
  | {
      status: 'active';
      title: string;
      reactionsEnabled: boolean;
      activity: GuestActivity;
      myAnswer: Record<string, unknown> | null;
      results: LiveResults | null;
    };

/** Lo que el invitado manda según el tipo de actividad. */
export type GuestPayload =
  | { opcion: string }
  | { selected: string[] }
  | { texto: string }
  | { palabra: string }
  | { feeling: string };

// ── Errores ──

/**
 * Las funciones levantan códigos secos (SALA_LLENA, ACTIVIDAD_CERRADA…).
 * Acá se traducen a algo que se pueda leer en un celular en el medio de
 * una charla, sin jerga y sin culpar al que escaneó.
 */
const MENSAJES: Record<string, string> = {
  SALA_NO_DISPONIBLE: 'Ese código no corresponde a ninguna clase abierta. Fijate que esté bien escrito, o pedile al docente que lo proyecte de nuevo.',
  SALA_LLENA: 'La sala llegó al máximo de participantes.',
  INVITADO_DESCONOCIDO: 'Se perdió tu lugar en la sala. Volvé a escanear el QR.',
  ACTIVIDAD_NO_DISPONIBLE: 'Esa actividad ya no está disponible.',
  ACTIVIDAD_CERRADA: 'El docente cerró la actividad. Tu respuesta anterior quedó guardada.',
  RESPUESTA_VACIA: 'Te falta elegir o escribir algo antes de enviar.',
  REACCIONES_CERRADAS: 'El docente apagó las reacciones.',
  EMOJI_NO_PERMITIDO: 'Ese emoji no está habilitado.',
};

export class GuestError extends Error {
  /** Código crudo, para que la pantalla decida qué hacer (ej: volver a pedir el nombre). */
  code: string;
  constructor(code: string) {
    super(MENSAJES[code] ?? 'No se pudo conectar con la clase. Probá de nuevo en unos segundos.');
    this.name = 'GuestError';
    this.code = code;
  }
}

function fail(message: string | undefined): never {
  // PostgREST devuelve el texto del RAISE EXCEPTION tal cual.
  const code = Object.keys(MENSAJES).find(k => message?.includes(k)) ?? 'DESCONOCIDO';
  throw new GuestError(code);
}

// ── Entrar a la sala ──

export async function joinLiveSession(code: string, name: string): Promise<GuestSession> {
  const { data, error } = await supabase.rpc('join_live_session', {
    p_code: code.trim().toUpperCase(),
    p_name: name.trim(),
  });
  if (error) fail(error.message);
  return data as unknown as GuestSession;
}

// ── Estado (un solo llamado por poll) ──

export async function getGuestState(token: string): Promise<GuestState> {
  const { data, error } = await supabase.rpc('live_guest_state', { p_token: token });
  if (error) fail(error.message);
  return data as unknown as GuestState;
}

// ── Responder ──

export async function submitGuestResponse(
  token: string,
  activityId: string,
  payload: GuestPayload,
): Promise<void> {
  const { error } = await supabase.rpc('submit_live_guest_response', {
    p_token: token,
    p_activity: activityId,
    p_payload: payload as never,
  });
  if (error) fail(error.message);
}

export async function sendGuestReaction(token: string, emoji: string): Promise<void> {
  const { error } = await supabase.rpc('send_live_guest_reaction', {
    p_token: token,
    p_emoji: emoji,
  });
  if (error) fail(error.message);
}

// ── Persistencia local ──

/**
 * Guardamos el token por código de sala: si el celular se bloquea o la
 * página se recarga en el medio de la clase, el invitado vuelve a ser
 * el mismo y no pierde lo que ya respondió.
 */
const KEY = (code: string) => `smt-live-guest:${code.toUpperCase()}`;

export function loadGuestSession(code: string): GuestSession | null {
  try {
    const raw = localStorage.getItem(KEY(code));
    return raw ? (JSON.parse(raw) as GuestSession) : null;
  } catch {
    return null;
  }
}

export function saveGuestSession(code: string, session: GuestSession): void {
  try {
    localStorage.setItem(KEY(code), JSON.stringify(session));
  } catch {
    // Safari en privado tira acá. Se sigue igual: el token queda solo en
    // memoria y la sesión dura mientras no recargue.
  }
}

export function clearGuestSession(code: string): void {
  try {
    localStorage.removeItem(KEY(code));
  } catch {
    /* idem */
  }
}
