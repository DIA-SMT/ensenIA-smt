/**
 * Mensajería interna (migración 060).
 *
 * Todo pasa por funciones de la base: ellas deciden quién le puede escribir a
 * quién (pueden_hablar), arman la bandeja con los nombres y cuentan lo sin
 * leer. Los mensajes no se editan ni se borran. Las conversaciones con un
 * estudiante las puede leer la dirección (supervisión): la pantalla lo avisa.
 */

import { supabase } from './_helpers';
import type { UserRole } from '../types';

export type OrigenConversacion = 'mensaje' | 'comunicado' | 'citacion' | 'pedido_hablar' | 'aviso_direccion';

export interface Persona {
  id: string;
  nombre: string;
  rol: UserRole;
  /** "Docente · Lengua", "Estudiante · 2° A", "Familia de Lucas (2° A)" */
  detalle?: string;
}

export interface ResumenConversacion {
  id: string;
  asunto: string;
  origen: OrigenConversacion;
  conEstudiante: boolean;
  ultimoMensajeAt: string;
  archivada: boolean;
  soyParticipante: boolean;
  sinLeer: boolean;
  ultimo: { autor: string; cuerpo: string } | null;
  participantes: Persona[];
}

export interface Mensaje {
  id: string;
  autorId: string | null;
  autor: string;
  cuerpo: string;
  createdAt: string;
}

export interface Conversacion extends ResumenConversacion {
  mensajes: Mensaje[];
}

/** Avisa al menú y a la barra de arriba que cambió lo sin leer. */
export const EVENTO_MENSAJES = 'estudia:mensajes';
const avisarCambio = () => window.dispatchEvent(new Event(EVENTO_MENSAJES));

const rpc = async <T>(fn: string, args?: Record<string, unknown>): Promise<T> => {
  const { data, error } = await supabase.rpc(fn as never, (args ?? {}) as never);
  if (error) throw new Error(error.message || 'No se pudo completar. Probá de nuevo.');
  return data as unknown as T;
};

export const misConversaciones = (archivadas = false) =>
  rpc<ResumenConversacion[]>('mis_conversaciones', { p_archivadas: archivadas }).then(r => r ?? []);

/** Dirección: las conversaciones con estudiantes en las que no participa. */
export const conversacionesSupervisadas = () =>
  rpc<ResumenConversacion[] | null>('conversaciones_supervisadas').then(r => r ?? []);

export const verConversacion = (id: string) => rpc<Conversacion | null>('ver_conversacion', { p_conv: id });

export const misContactos = () => rpc<Persona[]>('mis_contactos').then(r => r ?? []);

export const mensajesSinLeer = () => rpc<number>('mensajes_sin_leer').then(n => Number(n ?? 0));

/** Abre una conversación nueva. Tira Error con el motivo si la base no la deja. */
export async function iniciarConversacion(para: string[], asunto: string, texto: string, origen: 'mensaje' | 'comunicado' | 'citacion' = 'mensaje'): Promise<string> {
  const id = await rpc<string>('iniciar_conversacion', { p_para: para, p_asunto: asunto.trim(), p_texto: texto.trim(), p_origen: origen });
  avisarCambio();
  return id;
}

export async function enviarMensaje(conversacionId: string, autorId: string, cuerpo: string): Promise<void> {
  const { error } = await supabase.from('mensajes' as never)
    .insert({ conversacion_id: conversacionId, autor_id: autorId, cuerpo: cuerpo.trim() } as never);
  if (error) throw new Error('No se pudo enviar el mensaje. Revisá la conexión y probá de nuevo.');
}

export async function marcarLeida(conversacionId: string): Promise<void> {
  await rpc('marcar_conversacion_leida', { p_conv: conversacionId });
  avisarCambio();
}

export async function archivar(conversacionId: string, archivar: boolean): Promise<void> {
  await rpc('archivar_conversacion', { p_conv: conversacionId, p_archivar: archivar });
  avisarCambio();
}

/**
 * Enlace a "Nuevo mensaje" ya completo (lo abren las fichas, los comunicados
 * y las citaciones). Responder a un comunicado es abrir una conversación con
 * quien lo mandó.
 */
export function enlaceMensaje(para: string[], asunto = '', origen?: 'comunicado' | 'citacion'): string {
  const q = new URLSearchParams({ para: para.join(',') });
  if (asunto) q.set('asunto', asunto.slice(0, 160));
  if (origen) q.set('origen', origen);
  return `/mensajes?${q.toString()}`;
}

/** Cómo se nombra a cada rol en la bandeja. */
export const NOMBRE_ROL: Record<string, string> = {
  director: 'Dirección', docente: 'Docente', estudiante: 'Estudiante', padre: 'Familia', superadmin: 'Administración',
};
