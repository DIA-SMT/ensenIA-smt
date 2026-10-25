/**
 * SMT EstudIA — Migue (017)
 *
 * La audiencia no se manda: la deriva el servidor del rol del usuario.
 * Acá solo se calcula para elegir qué mostrar en pantalla.
 */

import { supabase, unwrap } from './_helpers';
import type { MigueAudience, MigueMessage, MigueSession, UserRole } from '../types';

export function audienceForRole(role: UserRole): MigueAudience | null {
  if (role === 'docente' || role === 'director') return 'equipo';
  if (role === 'estudiante') return 'estudiante';
  if (role === 'padre') return 'familia';
  return null;
}

function mapSession(row: any): MigueSession {
  return {
    id: row.id,
    userId: row.user_id,
    schoolId: row.school_id,
    audience: row.audience,
    title: row.title,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapMessage(row: any): MigueMessage {
  return {
    id: row.id,
    sessionId: row.session_id,
    role: row.role,
    content: row.content,
    citedPolicyIds: row.cited_policy_ids ?? [],
    createdAt: row.created_at,
  };
}

/**
 * La conversación abierta del usuario, o una nueva.
 * No manda user_id ni school_id: los pone el servidor (018), que es
 * justamente el dato que no hay que creerle al cliente.
 *
 * Con un tema (079): la charla de repaso de ese tema, aparte de la de
 * siempre. Que el repaso esté abierto para su curso lo controla la función.
 */
export async function getOrCreateSession(audience: MigueAudience, classId: string | null = null): Promise<MigueSession> {
  const buscar = async (conTema: boolean) => {
    let q = supabase.from('migue_sessions').select('*').eq('audience', audience);
    if (conTema) q = classId ? q.eq('class_id', classId) : q.is('class_id', null);
    return q.order('updated_at', { ascending: false }).limit(1);
  };
  let { data: existing, error } = await buscar(true);
  // Sin la 079 no hay columna class_id: la de siempre, como antes
  if (error?.code === '42703' && !classId) ({ data: existing, error } = await buscar(false));
  if (error) throw error;
  if (existing && existing.length > 0) return mapSession(existing[0]);

  const { data, error: err2 } = await supabase
    .from('migue_sessions')
    .insert(classId ? { audience, class_id: classId } : { audience })
    .select('*')
    .single();
  if (!err2) return mapSession(data);

  // Dos cargas de la página a la vez: la única por persona, audiencia y
  // tema (079; antes 019) hace que la segunda choque. No es un error para
  // el usuario, es que la conversación ya existe.
  if (err2.code !== '23505') throw err2;
  const { data: ya, error: err3 } = await buscar(true);
  if (err3) throw err3;
  if (!ya || ya.length === 0) throw err2;
  return mapSession(ya[0]);
}

export async function getMessages(sessionId: string): Promise<MigueMessage[]> {
  const data = unwrap(
    await supabase
      .from('migue_messages')
      .select('*')
      .eq('session_id', sessionId)
      .order('created_at')
  );
  return data.map(mapMessage);
}

/** Empezar de cero: borra la conversación, no el historial de señales. */
export async function resetSession(sessionId: string): Promise<void> {
  const { error } = await supabase.from('migue_messages').delete().eq('session_id', sessionId);
  if (error) throw error;
}

/** Un botón que propone Migue: lleva a una pantalla con todo cargado (lo arma el servidor) */
export interface AccionMigue { clave: string; etiqueta: string; ruta: string }

/** Lo que el servidor leyó de lo que el docente está mirando (con sus permisos) */
export interface ContextoResueltoMigue {
  tipo: 'tema' | 'material' | 'actividad' | 'clase_en_vivo';
  id: string;
  titulo: string;
  temaId: string | null;
  subjectId: string | null;
  courseId: string | null;
  materia: string | null;
  curso: string | null;
}

/** Las marcas de acción que Migue deja al final: no se muestran como texto */
export function sinMarcas(texto: string): string {
  return texto
    .replace(/\[\[\s*acci[oó]n\s*:[^\]]*\]\]\s*/gi, '')
    .replace(/\[\[\s*(?:a(?:c(?:c(?:i(?:[oó](?:n(?:\s*:[^\]]*\]?)?)?)?)?)?)?)?$/i, '')
    .trimEnd();
}

export interface MigueCallbacks {
  onToken: (text: string) => void;
  onDone: (meta: {
    citedPolicies: { id: string; title: string }[];
    /** Las referencias oficiales que consultó (leyes, NAP, ESI) */
    citedReferencias: { id: string; titulo: string; numero: string | null }[];
    derivada: 'seguimiento' | 'urgente' | null;
    /** false = Migue respondió pero la conversación no quedó guardada. */
    persistido: boolean;
    acciones: AccionMigue[];
    contexto: ContextoResueltoMigue | null;
  }) => void;
  /** derivada viaja también en el error: si la escuela ya fue avisada, el
   *  chico tiene que enterarse aunque el chat se haya caído. */
  onError: (e: {
    code: string;
    message: string;
    derivada: 'seguimiento' | 'urgente' | null;
  }) => void;
}

export async function streamMigue(
  sessionId: string,
  messages: { role: 'user' | 'assistant'; content: string }[],
  cb: MigueCallbacks,
  signal?: AbortSignal,
  opciones?: {
    /** Ruta desde la que se abrió Migue: con eso guía "en esta pantalla" */
    pantalla?: string;
    /** Lo que está mirando: solo el tipo y el id (el servidor lo lee con sus permisos) */
    contexto?: { tipo: string; id: string } | null;
  },
): Promise<void> {
  const pantalla = opciones?.pantalla;
  const contexto = opciones?.contexto;
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) {
    cb.onError({ code: 'AUTH_INVALID', message: 'No hay sesión activa.', derivada: null });
    return;
  }

  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/migue`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        sessionId, messages,
        ...(pantalla ? { pantalla } : {}),
        ...(contexto ? { contexto: { tipo: contexto.tipo, id: contexto.id } } : {}),
      }),
      signal,
    });
  } catch (err) {
    if ((err as any)?.name === 'AbortError') return;
    cb.onError({ code: 'NETWORK', message: 'No se pudo conectar con Migue.', derivada: null });
    return;
  }

  if (!res.ok && !res.headers.get('Content-Type')?.includes('text/event-stream')) {
    cb.onError({ code: 'HTTP_' + res.status, message: 'Migue no respondió. Probá de nuevo.', derivada: null });
    return;
  }

  const reader = res.body?.getReader();
  if (!reader) {
    cb.onError({ code: 'NO_BODY', message: 'Migue no respondió. Probá de nuevo.', derivada: null });
    return;
  }

  const decoder = new TextDecoder();
  let buffer = '';
  let evento = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lineas = buffer.split('\n');
      buffer = lineas.pop() ?? '';

      for (const l of lineas) {
        if (l.startsWith('event: ')) { evento = l.slice(7).trim(); continue; }
        if (!l.startsWith('data: ')) continue;
        let payload: any;
        try { payload = JSON.parse(l.slice(6)); } catch { continue; }

        if (evento === 'token') cb.onToken(payload.text ?? '');
        else if (evento === 'done') {
          cb.onDone({
            citedPolicies: payload.citedPolicies ?? [],
            citedReferencias: payload.citedReferencias ?? [],
            derivada: payload.derivada ?? null,
            persistido: payload.persistido !== false,
            acciones: Array.isArray(payload.acciones) ? payload.acciones : [],
            contexto: payload.contexto ?? null,
          });
        } else if (evento === 'error') {
          cb.onError({
            code: payload.code ?? 'ERROR',
            message: payload.message ?? 'Error.',
            derivada: payload.derivada ?? null,
          });
        }
      }
    }
  } catch (err) {
    if ((err as any)?.name !== 'AbortError') {
      console.error(err);
      cb.onError({ code: 'STREAM', message: 'Se cortó la respuesta de Migue.', derivada: null });
    }
  }
}
