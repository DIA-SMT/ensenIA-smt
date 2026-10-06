/**
 * SMT EstudIA — Un pedido puntual a la IA, con la respuesta entera.
 *
 * Para lo que no es una conversación (sugerir una devolución, adaptar un
 * material): se manda un mensaje y se espera el texto completo. Usa el
 * mismo ia-chat que el Laboratorio (misma cuota, mismo modelo, mismo
 * registro de consumo) y cada tipo de pedido junta su historial en UNA
 * sesión con nombre fijo, en vez de crear una sesión nueva cada vez.
 */

import { streamChat } from './ia-chat.service';
import { getOrCreateSession, getSessionsByTeacher, saveUserMessage } from './chat-history.service';
import type { IAToolType, IAChatContext } from '../types';

const sesiones = new Map<string, string>();

async function sesionDe(teacherId: string, titulo: string): Promise<string> {
  const clave = `${teacherId}|${titulo}`;
  const guardada = sesiones.get(clave);
  if (guardada) return guardada;
  const existente = (await getSessionsByTeacher(teacherId)).find(s => s.title === titulo);
  const sesion = existente ?? await getOrCreateSession(teacherId, null, { title: titulo });
  sesiones.set(clave, sesion.id);
  return sesion.id;
}

export interface PedidoIA {
  teacherId: string;
  /** Nombre de la sesión donde queda el historial ("Devoluciones", "Adaptaciones"). */
  sesion: string;
  prompt: string;
  contexto?: IAChatContext;
  tool?: IAToolType;
  /** Va recibiendo el texto a medida que llega. */
  alAvanzar?: (texto: string) => void;
  signal?: AbortSignal;
}

/** Devuelve el texto completo de la respuesta. Tira un Error con mensaje para mostrar. */
export async function pedirIA({ teacherId, sesion, prompt, contexto = { subjectName: '', courseName: '' }, tool = 'free', alAvanzar, signal }: PedidoIA): Promise<string> {
  const sessionId = await sesionDe(teacherId, sesion);
  saveUserMessage(sessionId, prompt, tool).catch(() => {});
  let texto = '';
  let error: { code: string; message: string } | null = null;
  await streamChat(
    [{ role: 'user', content: prompt }],
    contexto,
    { sessionId, tool },
    {
      onToken: t => { texto += t; alAvanzar?.(texto); },
      onDone: () => {},
      onError: e => { error = e; },
    },
    signal,
  );
  if (error) {
    const e = error as { code: string; message: string };
    throw new Error(e.code === 'QUOTA_EXCEEDED' ? 'Llegaste al límite de usos de IA de hoy. Mañana se renueva.' : e.message || 'La IA no respondió. Probá de nuevo.');
  }
  if (!texto.trim()) throw new Error('La IA no devolvió nada. Probá de nuevo.');
  return texto.trim();
}
