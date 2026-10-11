/**
 * Memoria de estudio de EstudIA (migración 061).
 *
 * EstudIA recuerda cómo estudia cada chico (qué le cuesta, qué ya maneja,
 * qué ejemplos le sirven) solo con la autorización de su familia y la suya.
 * Todo pasa por funciones de la base: quién responde, quién ve y quién
 * revisa lo decide el servidor, no esta pantalla. La memoria la escribe
 * solo el servidor (edge function ia-chat).
 */

import { supabase } from './_helpers';

export type TipoNota = 'trabajo' | 'cuesta' | 'maneja' | 'sirve' | 'prefiere';

export const ETIQUETA_TIPO: Record<TipoNota, string> = {
  trabajo: 'Trabajó',
  cuesta: 'Le cuesta',
  maneja: 'Ya maneja',
  sirve: 'Le sirve',
  prefiere: 'Prefiere',
};

/** La misma etiqueta, hablándole al chico. */
export const ETIQUETA_TIPO_VOS: Record<TipoNota, string> = {
  trabajo: 'Trabajaste',
  cuesta: 'Te cuesta',
  maneja: 'Ya te sale',
  sirve: 'Te sirve',
  prefiere: 'Preferís',
};

export interface TextoConsentimiento {
  version: string;
  titulo: string;
  paraFamilia: string;
  paraEstudiante: string;
  publicado: string | null;
}

export interface RespuestaConsentimiento {
  acepta: boolean;
  via: 'app' | 'papel';
  fecha: string;
  /** Acepta la versión vigente del texto (si se publicó otra, hay que volver a responder). */
  vigente: boolean;
  firmante?: string | null;
  vinculo?: string | null;
}

export interface EstadoMemoria {
  /** null: todavía no hay un texto publicado, así que no se ofrece nada. */
  texto: TextoConsentimiento | null;
  familia: RespuestaConsentimiento | null;
  estudiante: RespuestaConsentimiento | null;
  activa: boolean;
  items: number;
  /** Solo fechas: el motivo de cada revisión es de la dirección. */
  revisiones: { fecha: string; accion: 'leer' | 'borrar' }[];
}

export interface NotaMemoria {
  id: string;
  materia: string | null;
  tipo: TipoNota;
  texto: string;
  veces: number;
  primeraVez: string;
  ultimaVez: string;
}

function mensajeDe(error: { message?: string } | null, porDefecto: string): string {
  const m = error?.message ?? '';
  // Los errores de las funciones ya vienen redactados para mostrar
  return m && !/permission|violates|function|syntax|relation/i.test(m) ? m : porDefecto;
}

/** Estado de la memoria de un chico. Sin studentId: la del estudiante logueado. */
export async function getEstadoMemoria(studentId?: string): Promise<EstadoMemoria> {
  const { data, error } = await supabase.rpc('estado_memoria_estudio' as never, { p_student: studentId ?? null } as never);
  if (error) throw new Error(mensajeDe(error, 'No se pudo consultar la memoria de estudio.'));
  return data as unknown as EstadoMemoria;
}

/**
 * El chico o su familia responden desde la app. Revocar borra la memoria en
 * el momento. Sin studentId responde el estudiante logueado por sí mismo.
 * version: la del texto que leyó; para aceptar, la base exige que sea la vigente.
 */
export async function responderConsentimiento(studentId: string | null, acepta: boolean, version?: string): Promise<EstadoMemoria> {
  const { data, error } = await supabase.rpc('dar_consentimiento_memoria' as never, {
    p_student: studentId, p_acepta: acepta, p_version: version ?? null,
  } as never);
  if (error) throw new Error(mensajeDe(error, 'No se pudo guardar tu respuesta. Probá de nuevo.'));
  return data as unknown as EstadoMemoria;
}

/** Lo que EstudIA recuerda del estudiante logueado (lo ve entero). */
export async function getMiMemoria(): Promise<NotaMemoria[]> {
  const { data, error } = await supabase
    .from('memoria_estudio' as never)
    .select('id, materia, tipo, texto, veces, primera_vez, ultima_vez')
    .order('materia', { ascending: true, nullsFirst: false })
    .order('ultima_vez', { ascending: false });
  if (error) throw new Error('No se pudo traer lo que EstudIA recuerda.');
  return ((data ?? []) as unknown as {
    id: string; materia: string | null; tipo: TipoNota; texto: string; veces: number;
    primera_vez: string; ultima_vez: string;
  }[]).map(n => ({
    id: n.id, materia: n.materia, tipo: n.tipo, texto: n.texto, veces: n.veces,
    primeraVez: n.primera_vez, ultimaVez: n.ultima_vez,
  }));
}

/** El chico borra una nota (o todas, sin id). */
export async function borrarMiMemoria(notaId?: string): Promise<void> {
  let q = supabase.from('memoria_estudio' as never).delete();
  // Sin id: todas las suyas (la RLS ya limita a las suyas; el filtro es para que PostgREST acepte el DELETE)
  q = notaId ? q.eq('id', notaId) : q.not('id', 'is', null);
  const { error } = await q;
  if (error) throw new Error('No se pudo borrar. Probá de nuevo.');
}

// ── Dirección ──

/** El texto vigente, para imprimir la autorización en papel. */
export async function getTextoVigente(): Promise<TextoConsentimiento | null> {
  const { data, error } = await supabase
    .from('consentimiento_textos' as never)
    .select('version, titulo, para_familia, para_estudiante, publicado_at')
    .eq('vigente', true)
    .maybeSingle();
  if (error) throw new Error('No se pudo traer el texto del consentimiento.');
  if (!data) return null;
  const t = data as unknown as { version: string; titulo: string; para_familia: string; para_estudiante: string; publicado_at: string | null };
  return { version: t.version, titulo: t.titulo, paraFamilia: t.para_familia, paraEstudiante: t.para_estudiante, publicado: t.publicado_at };
}

export interface EstudianteMemoria {
  id: string;
  nombre: string;
  apellido: string;
  curso: string;
  cursoId: string;
  familia: RespuestaConsentimiento | null;
  estudiante: RespuestaConsentimiento | null;
  activa: boolean;
  items: number;
  ultimaRevision: string | null;
}

export interface MemoriaEscuela {
  /** Versión vigente del texto, o null si todavía no se publicó. */
  version: string | null;
  estudiantes: EstudianteMemoria[];
}

export async function getMemoriaEscuela(): Promise<MemoriaEscuela> {
  const { data, error } = await supabase.rpc('memoria_estudio_escuela' as never);
  if (error) throw new Error(mensajeDe(error, 'No se pudo traer el estado de la memoria de estudio.'));
  return data as unknown as MemoriaEscuela;
}

/** Autorización o retiro firmado en papel. version: la impresa en el papel. */
export async function registrarPapel(params: {
  studentId: string; quien: 'familia' | 'estudiante'; acepta: boolean; firmante?: string; vinculo?: string; version?: string | null;
}): Promise<void> {
  const { error } = await supabase.rpc('registrar_consentimiento_papel' as never, {
    p_student: params.studentId, p_quien: params.quien, p_acepta: params.acepta,
    p_firmante: params.firmante?.trim() || null, p_vinculo: params.vinculo?.trim() || null,
    p_version: params.version ?? null,
  } as never);
  if (error) throw new Error(mensajeDe(error, 'No se pudo registrar. Probá de nuevo.'));
}

/** Leer la memoria de un chico: pide motivo y queda registrado. */
export async function revisarMemoria(studentId: string, motivo: string): Promise<NotaMemoria[]> {
  const { data, error } = await supabase.rpc('revisar_memoria_estudio' as never, {
    p_student: studentId, p_motivo: motivo,
  } as never);
  if (error) throw new Error(mensajeDe(error, 'No se pudo abrir la memoria.'));
  return ((data as unknown as { items: NotaMemoria[] }).items ?? []);
}

export async function borrarNotaDireccion(notaId: string, motivo: string): Promise<void> {
  const { error } = await supabase.rpc('borrar_memoria_direccion' as never, { p_item: notaId, p_motivo: motivo } as never);
  if (error) throw new Error(mensajeDe(error, 'No se pudo borrar.'));
}

export interface RevisionMemoria {
  id: string;
  fecha: string;
  accion: 'leer' | 'borrar';
  motivo: string;
  detalle: string | null;
  director: string;
  estudiante: string;
  curso: string | null;
}

export async function getRevisionesEscuela(limite = 100): Promise<RevisionMemoria[]> {
  const { data, error } = await supabase.rpc('revisiones_memoria_escuela' as never, { p_limite: limite } as never);
  if (error) throw new Error(mensajeDe(error, 'No se pudo traer el registro de revisiones.'));
  return (data ?? []) as unknown as RevisionMemoria[];
}

/** Notas agrupadas por materia (null = "Cómo aprende"), en orden. */
export function agruparPorMateria(notas: NotaMemoria[]): [string, NotaMemoria[]][] {
  const grupos = new Map<string, NotaMemoria[]>();
  for (const n of notas) {
    const clave = n.materia ?? '';
    grupos.set(clave, [...(grupos.get(clave) ?? []), n]);
  }
  return [...grupos].sort(([a], [b]) => (a === '' ? 1 : b === '' ? -1 : a.localeCompare(b, 'es')));
}
