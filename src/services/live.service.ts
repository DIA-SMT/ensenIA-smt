/**
 * SMT EstudIA — Clase en vivo
 *
 * El docente dicta su clase tradicional y, cuando quiere, lanza una
 * actividad desde cualquier dispositivo (celu, tablet o compu). Los
 * estudiantes responden desde el celular y todos ven los resultados
 * agregados en vivo. Tiempo real por polling liviano (~2s, sin
 * websockets): cada respuesta pesa unos pocos cientos de bytes, así
 * que funciona hasta con datos móviles escasos.
 */

import { supabase, unwrap } from './_helpers';
import { mapStudentAward } from './awards.service';
import type { CheckinFeeling, LibraryMaterial, FileType, StudentAward } from '../types';

// ── Tipos ──

export type LiveActivityKind = 'encuesta' | 'quiz' | 'chips' | 'texto' | 'nube' | 'checkin';
export type LiveActivityStatus = 'active' | 'revealed' | 'closed';

export interface LiveOption {
  id: string;
  label: string;
}

export interface LiveActivityConfig {
  question?: string;
  options?: LiveOption[];
  /** quiz: id de la opción correcta */
  correctId?: string;
  placeholder?: string;
  /** Una respuesta por grupo (pocos celulares, o consigna grupal). */
  groupMode?: boolean;
  /**
   * Competencia (073): con tiempo y puntos por rapidez. Las preguntas de
   * una misma ronda suman para el mismo podio. Solo en preguntas rápidas.
   */
  competencia?: { segundos: number; ronda: string };
}

export interface LiveSession {
  id: string;
  teacherId: string;
  schoolId: string;
  subjectId: string;
  courseId: string;
  title: string;
  status: 'live' | 'ended';
  reactionsEnabled: boolean;
  /** Sala abierta a gente sin cuenta (QR de invitados). */
  guestsEnabled: boolean;
  /** Código corto de 6 caracteres que se proyecta junto al QR. */
  joinCode: string | null;
  /** Material de la clase (041): uno de la biblioteca o un tema del temario. */
  materialId: string | null;
  classId: string | null;
  /** Los celulares del curso lo ven mientras dure la clase. */
  materialVisible: boolean;
  createdAt: string;
  endedAt?: string | null;
}

export interface LiveActivity {
  id: string;
  sessionId: string;
  kind: LiveActivityKind;
  config: LiveActivityConfig;
  status: LiveActivityStatus;
  /** Si está, la pregunta es para UN estudiante ("esta va para vos"). */
  targetStudentId: string | null;
  createdAt: string;
}

export interface LiveResults {
  activityId: string;
  kind: LiveActivityKind;
  status: LiveActivityStatus;
  courseTotal: number;
  responded: number;
  counts: Record<string, number>;
  texts: { id: string; name: string | null; text: string }[];
  words: { word: string; n: number }[];
  /**
   * Solo docente y dirección (067): cuántas respuestas se retuvieron porque
   * sonaban a que alguien la está pasando mal. Sin quién ni qué (el panel
   * puede estar proyectado): eso va por la alerta. Ya contadas en responded.
   */
  retenidas?: number;
}

/** Emojis de la botonera (el docente la prende y apaga). */
export const LIVE_REACTIONS: { emoji: string; label: string; alert?: boolean }[] = [
  { emoji: '👏', label: 'Aplausos' },
  { emoji: '💡', label: 'Lo entendí' },
  { emoji: '😮', label: 'Wow' },
  { emoji: '🔥', label: 'Buenísimo' },
  { emoji: '🐢', label: 'Más despacio', alert: true },
  { emoji: '❓', label: 'No entiendo', alert: true },
];

export const LIVE_KIND_META: Record<LiveActivityKind, { emoji: string; label: string; desc: string }> = {
  checkin: { emoji: '💙', label: 'Check-in emocional', desc: '¿Cómo vienen con la clase? Sin nota, sin nombres entre ellos' },
  quiz: { emoji: '✅', label: 'Pregunta rápida', desc: 'Opciones con una correcta: revelás cuando quieras' },
  encuesta: { emoji: '📊', label: 'Encuesta', desc: 'Opinión del curso, sin respuesta correcta' },
  chips: { emoji: '🧩', label: 'Multi-selección', desc: 'Pueden marcar varias opciones' },
  nube: { emoji: '☁️', label: 'Nube de palabras', desc: 'Una palabra por estudiante, crece en pantalla' },
  texto: { emoji: '💬', label: 'Respuesta libre', desc: 'Texto corto: ideas, dudas, ejemplos' },
};

// ── Mapeos ──

function mapSession(row: any): LiveSession {
  return {
    id: row.id,
    teacherId: row.teacher_id,
    schoolId: row.school_id,
    subjectId: row.subject_id,
    courseId: row.course_id,
    title: row.title,
    status: row.status,
    reactionsEnabled: row.reactions_enabled,
    guestsEnabled: row.guests_enabled,
    joinCode: row.join_code,
    materialId: row.material_id ?? null,
    classId: row.class_id ?? null,
    materialVisible: row.material_visible ?? false,
    createdAt: row.created_at,
    endedAt: row.ended_at,
  };
}

function mapActivity(row: any): LiveActivity {
  return {
    id: row.id,
    sessionId: row.session_id,
    kind: row.kind,
    config: row.config ?? {},
    status: row.status,
    targetStudentId: row.target_student_id ?? null,
    createdAt: row.created_at,
  };
}

// ── Sesiones (docente) ──

export async function getMyLiveSession(teacherId: string): Promise<LiveSession | null> {
  // Sin señal se tira el error: "no tenés clase abierta" llevaba a arrancar
  // otra, que choca con la que sigue abierta (071)
  const { data, error } = await supabase
    .from('live_sessions')
    .select('*')
    .eq('teacher_id', teacherId)
    .eq('status', 'live')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data ? mapSession(data) : null;
}

export async function startLiveSession(s: {
  teacherId: string;
  schoolId: string;
  subjectId: string;
  courseId: string;
  title: string;
  materialId?: string | null;
  classId?: string | null;
}): Promise<LiveSession> {
  const { data, error } = await supabase
    .from('live_sessions')
    .insert({
      teacher_id: s.teacherId,
      school_id: s.schoolId,
      subject_id: s.subjectId,
      course_id: s.courseId,
      title: s.title,
      // Solo si se eligió: sin la 041 corrida, mandar las columnas rompería
      // el inicio de cualquier clase
      ...(s.materialId ? { material_id: s.materialId } : {}),
      ...(s.classId ? { class_id: s.classId } : {}),
    })
    .select('*')
    .single();
  if (error) {
    if (error.code === '23505') {
      throw new Error('Ya hay una clase en vivo activa para ese curso. Terminala antes de abrir otra.');
    }
    throw error;
  }
  return mapSession(data);
}

export async function endLiveSession(id: string): Promise<void> {
  const { error } = await supabase
    .from('live_sessions')
    .update({ status: 'ended', ended_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

export async function setReactionsEnabled(id: string, enabled: boolean): Promise<void> {
  const { error } = await supabase
    .from('live_sessions')
    .update({ reactions_enabled: enabled })
    .eq('id', id);
  if (error) throw error;
}

// ── Material de la clase (041) ──

/** Lo que devuelve live_class_material: un tema del temario o un material. */
export type MaterialDeClase =
  | { tipo: 'tema'; id: string; titulo: string; unidad: string; objetivos: string[]; contenido: string | null }
  | {
      tipo: 'material'; id: string; titulo: string; descripcion: string | null;
      file_type: string; file_name: string; storage_path: string | null;
      video_url: string | null; texto: string | null;
      /** 055: el mismo mazo que en la biblioteca, sus etiquetas, la materia y el juego/diagrama. */
      slides?: unknown; tags?: string[]; materia?: string | null; visual?: unknown;
    };

/** Un tema del temario o un material de la biblioteca, elegido para la clase. */
export type EleccionMaterial =
  | { materialId: string; titulo: string }
  | { classId: string; titulo: string };

/** Un material de la lista de la clase (049). */
export interface MaterialEnLista {
  /** id de la fila de la lista */
  id: string;
  materialId: string | null;
  classId: string | null;
  titulo: string;
  tipo: 'tema' | 'material';
  /** "Tema · Unidad 2", "Video", "Diapositivas", "PDF"... */
  detalle: string;
  orden: number;
}

const idDe = (e: EleccionMaterial) => ('materialId' in e ? e.materialId : e.classId);
export const idEnLista = (m: MaterialEnLista) => m.materialId ?? m.classId ?? '';

const DETALLE_ARCHIVO: Record<string, string> = { pdf: 'PDF', doc: 'Word', pptx: 'PowerPoint', image: 'Imagen', link: 'Enlace' };

/** La lista de materiales de la clase, en orden. Vacía si todavía no se corrió la 049. */
export async function getMaterialesDeClase(sessionId: string): Promise<MaterialEnLista[]> {
  const { data, error } = await supabase
    .from('live_session_materials')
    .select('id, material_id, class_id, sort_order, library_materials(title, file_type, video_url, tags), planning_classes(title, planning_units(title))')
    .eq('session_id', sessionId)
    .order('sort_order');
  if (error) {
    // Sin la 049 la clase sigue andando con un solo material
    if (error.code === '42P01' || error.code === 'PGRST205') return [];
    throw error;
  }
  type Fila = {
    id: string; material_id: string | null; class_id: string | null; sort_order: number;
    library_materials: { title: string; file_type: string; video_url: string | null; tags: string[] | null } | null;
    planning_classes: { title: string; planning_units: { title: string } | null } | null;
  };
  return ((data ?? []) as unknown as Fila[]).map(r => {
    if (r.class_id) {
      return {
        id: r.id, materialId: null, classId: r.class_id, orden: r.sort_order, tipo: 'tema' as const,
        titulo: r.planning_classes?.title ?? 'Tema',
        detalle: r.planning_classes?.planning_units?.title ? `Tema · ${r.planning_classes.planning_units.title}` : 'Tema del temario',
      };
    }
    const m = r.library_materials;
    const detalle = m?.video_url ? 'Video'
      : (m?.tags ?? []).includes('presentacion') ? 'Diapositivas'
        : DETALLE_ARCHIVO[m?.file_type ?? ''] ?? 'De tu biblioteca';
    return {
      id: r.id, materialId: r.material_id, classId: null, orden: r.sort_order, tipo: 'material' as const,
      titulo: m?.title ?? 'Material', detalle,
    };
  });
}

/**
 * Deja la lista de la clase como la eligió el docente: suma lo nuevo, saca
 * lo que destildó y respeta el orden. Si el que estaba en pantalla salió,
 * pasa el primero de la lista nueva (o ninguno).
 * @returns cuál queda en pantalla
 */
export async function sincronizarMaterialesDeClase(
  sessionId: string,
  deseados: EleccionMaterial[],
  enPantalla: string | null,
): Promise<EleccionMaterial | null> {
  const actual = await getMaterialesDeClase(sessionId);
  const ids = deseados.map(idDe);

  const sacar = actual.filter(m => !ids.includes(idEnLista(m)));
  if (sacar.length > 0) {
    const { error } = await supabase.from('live_session_materials').delete().in('id', sacar.map(m => m.id));
    if (error) throw new Error('No se pudo sacar el material de la clase.');
  }

  const yaEstan = new Set(actual.map(idEnLista));
  const nuevos = deseados.filter(e => !yaEstan.has(idDe(e)));
  if (nuevos.length > 0) {
    const { error } = await supabase.from('live_session_materials').insert(nuevos.map(e => ({
      session_id: sessionId,
      material_id: 'materialId' in e ? e.materialId : null,
      class_id: 'classId' in e ? e.classId : null,
      sort_order: ids.indexOf(idDe(e)) + 1,
    })));
    if (error) throw new Error(error.message.includes('no es') ? error.message : 'No se pudo sumar el material a la clase.');
  }

  // El orden que eligió (pocas filas: una por material)
  const quedan = actual.filter(m => ids.includes(idEnLista(m)));
  await Promise.all(quedan
    .filter(m => m.orden !== ids.indexOf(idEnLista(m)) + 1)
    .map(m => supabase.from('live_session_materials').update({ sort_order: ids.indexOf(idEnLista(m)) + 1 }).eq('id', m.id)));

  const sigueEnPantalla = enPantalla && ids.includes(enPantalla)
    ? deseados.find(e => idDe(e) === enPantalla)!
    : deseados[0] ?? null;
  if ((sigueEnPantalla ? idDe(sigueEnPantalla) : null) !== enPantalla) {
    await setLiveMaterial(sessionId, sigueEnPantalla
      ? ('materialId' in sigueEnPantalla ? { materialId: sigueEnPantalla.materialId } : { classId: sigueEnPantalla.classId })
      : null);
  }
  return sigueEnPantalla;
}

/** Cambia (o saca, con null) el material de la clase. */
export async function setLiveMaterial(
  sessionId: string,
  m: { materialId: string } | { classId: string } | null,
): Promise<void> {
  const { error } = await supabase
    .from('live_sessions')
    .update({
      material_id: m && 'materialId' in m ? m.materialId : null,
      class_id: m && 'classId' in m ? m.classId : null,
    })
    .eq('id', sessionId);
  if (error) throw new Error(error.message.includes('no es') ? error.message : 'No se pudo cambiar el material.');
}

export async function setMaterialVisible(sessionId: string, visible: boolean): Promise<void> {
  const { error } = await supabase
    .from('live_sessions')
    .update({ material_visible: visible })
    .eq('id', sessionId);
  if (error) throw error;
}

/** null si no hay material, o si al alumno todavía no se lo muestran. */
export async function getLiveClassMaterial(sessionId: string): Promise<MaterialDeClase | null> {
  const { data, error } = await supabase.rpc('live_class_material', { p_session: sessionId });
  if (error) throw error;
  return (data as unknown as MaterialDeClase | null) ?? null;
}

/** El texto con el que se puede trabajar (preguntas con IA). */
export function textoDeMaterial(m: MaterialDeClase): string {
  if (m.tipo === 'tema') {
    const objetivos = m.objetivos.length
      ? `Objetivos:\n${m.objetivos.map(o => `- ${o}`).join('\n')}\n\n`
      : '';
    return `# ${m.titulo}\n\n${objetivos}${m.contenido ?? ''}`.trim();
  }
  return (m.texto ?? '').trim();
}

/** El material con la forma que espera MaterialViewer (el tema es solo texto). */
export function materialParaVisor(m: MaterialDeClase): LibraryMaterial {
  const base = {
    id: m.id, title: m.titulo, fileSize: '', subjectId: '', subjectName: '', teacherId: '', schoolId: '',
    tags: [], uploadedAt: '', isSharedWithStudents: false,
  };
  if (m.tipo === 'tema') {
    // Sin el "# título" del principio: el visor ya lo muestra arriba
    const cuerpo = textoDeMaterial(m).replace(/^# .*\n+/, '');
    return { ...base, description: m.unidad, fileType: 'doc', fileName: '', storagePath: null, extractedText: cuerpo };
  }
  return {
    ...base, description: m.descripcion ?? '', fileType: m.file_type as FileType, fileName: m.file_name,
    storagePath: m.storage_path, extractedText: m.texto, videoUrl: m.video_url,
    tags: m.tags ?? [], subjectName: m.materia ?? '', slides: m.slides ?? null, visual: m.visual ?? null,
  };
}

// ── Resumen de la clase (042) ──

export interface ResumenClase {
  sesion: { id: string; titulo: string; inicio: string; fin: string | null; minutos: number; ai_summary: string | null };
  material: { tipo: 'tema' | 'material'; titulo: string; unidad?: string } | null;
  totales: { curso: number; conectados: number; participaron: number; actividades: number; invitados: number; medallas: number };
  actividades: {
    orden: number; tipo: LiveActivityKind; pregunta: string | null; dirigida: boolean; grupal: boolean;
    respondieron: number; aciertos: number | null; correcta: string | null;
  }[];
  alumnos: {
    id: string; nombre: string; conectado: boolean; respuestas: number; preguntas: number;
    aciertos: number; reacciones: number; medallas: number;
  }[];
  reacciones: { emoji: string; n: number }[];
  animo: { estado: string; n: number }[];
  medallas: { medalla: string; n: number }[];
}

export async function getLiveSessionSummary(sessionId: string): Promise<ResumenClase | null> {
  const { data, error } = await supabase.rpc('live_session_summary', { p_session: sessionId });
  if (error) {
    if (error.code === 'PGRST202') throw new Error('Falta correr la migración 042_resumen_clase_en_vivo.sql en Supabase.');
    throw error;
  }
  return (data as unknown as ResumenClase | null) ?? null;
}

/** El informe nombra a los chicos: va a su tabla, que leen solo el docente y la dirección (067). */
export async function saveLiveSessionReport(sessionId: string, informe: string): Promise<void> {
  const { error } = await supabase.from('live_session_informes' as never)
    .upsert({ session_id: sessionId, informe, updated_at: new Date().toISOString() } as never, { onConflict: 'session_id' });
  if (error) throw error;
}

/** Una clase en vivo (la del resumen): materia, curso, tema y cuándo fue. */
export async function getLiveSession(sessionId: string): Promise<LiveSession | null> {
  const { data, error } = await supabase.from('live_sessions').select('*').eq('id', sessionId).maybeSingle();
  if (error) throw error;
  return data ? mapSession(data) : null;
}

/** Las preguntas rápidas (con su correcta) que se lanzaron en una clase, en orden. */
export async function getPreguntasDeLaClase(sessionId: string): Promise<LiveActivity[]> {
  const data = unwrap(
    await supabase
      .from('live_activities')
      .select('*')
      .eq('session_id', sessionId)
      .eq('kind', 'quiz')
      .order('created_at'),
  );
  return (data as unknown[]).map(mapActivity);
}

/** Las últimas clases que terminó el docente (para volver a ver su resumen). */
export async function getMyPastSessions(teacherId: string, limit = 8): Promise<LiveSession[]> {
  const { data } = await supabase
    .from('live_sessions')
    .select('*')
    .eq('teacher_id', teacherId)
    .eq('status', 'ended')
    .order('created_at', { ascending: false })
    .limit(limit);
  return (data ?? []).map(mapSession);
}

// ── Sesión + actividad actual (lo pollean docente y estudiante) ──

/**
 * `asStudent`: el alumno lee live_activities_alumno, que no trae la
 * respuesta correcta del quiz hasta que el docente la revela (019).
 */
export async function getSessionState(
  sessionId: string,
  { asStudent = false }: { asStudent?: boolean } = {},
): Promise<{ session: LiveSession; activity: LiveActivity | null } | null> {
  // Un error (sin señal) se tira: devolver null decía "no hay clase" (071)
  const { data: ses, error } = await supabase
    .from('live_sessions')
    .select('*')
    .eq('id', sessionId)
    .maybeSingle();
  if (error) throw error;
  if (!ses) return null;

  const { data: act, error: errorAct } = await supabase
    // Mismas columnas en los dos: el cast es solo para que TS acepte la unión
    .from((asStudent ? 'live_activities_alumno' : 'live_activities') as 'live_activities')
    .select('*')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (errorAct) throw errorAct;

  return { session: mapSession(ses), activity: act ? mapActivity(act) : null };
}

/** Sesión en vivo del curso del estudiante (para el banner y su pantalla). */
export async function getLiveSessionForCourse(courseId: string): Promise<LiveSession | null> {
  const { data, error } = await supabase
    .from('live_sessions')
    .select('*')
    .eq('course_id', courseId)
    .eq('status', 'live')
    .maybeSingle();
  // Sin señal no es "no hay clase": quien llama decide qué mostrar
  if (error) throw error;
  return data ? mapSession(data) : null;
}

// ── Un pedido por vuelta (071) ──
// Antes cada vuelta eran 2 a 6 pedidos; con poca señal se encimaban.

/** Lo que devuelven live_estado_alumno y live_estado_docente (filas tal cual de la base) */
type Fila = Record<string, unknown>;
interface FilaEstadoAlumno {
  estado?: string; sessionId?: string; titulo?: string;
  session?: Fila; activity?: Fila | null; myAnswer?: Fila | null; results?: LiveResults | null; medalla?: Fila | null;
  ahora?: string;
}
interface FilaEstadoDocente {
  session: Fila; activity: Fila | null; results: LiveResults | null; olvidada?: boolean;
  reacciones?: { emoji: string; createdAt: string }[]; invitados?: InvitadoEnSala[]; conectados?: string[];
  ahora?: string;
}

export type EstadoAlumno =
  | {
    estado: 'en_vivo';
    session: LiveSession;
    activity: LiveActivity | null;
    myAnswer: Record<string, unknown> | null;
    /** Solo después de responder (antes ni viajan) */
    results: LiveResults | null;
    /** Una medalla que le dieron desde `medallasDesde` */
    medalla: StudentAward | null;
    /** La hora del servidor (073): la cuenta regresiva no depende del reloj del celular */
    ahora: string | null;
  }
  | { estado: 'terminada'; sessionId: string; titulo: string }
  | { estado: 'sin_clase' };

/**
 * Todo lo que el celular del estudiante necesita, en un pedido; de paso
 * marca su presencia. `sessionId`: la clase que tiene abierta (null: la que
 * esté viva en su curso). Sin señal tira el error: nunca dice "sin clase"
 * por no haber podido preguntar.
 */
export async function getEstadoAlumno(sessionId: string | null, medallasDesde: string | null, senal?: AbortSignal): Promise<EstadoAlumno> {
  const pedido = supabase.rpc('live_estado_alumno' as never, {
    p_session: sessionId, p_medallas_desde: medallasDesde,
  } as never);
  const { data, error } = await (senal ? pedido.abortSignal(senal) : pedido);
  if (error) throw error;
  const d = data as unknown as FilaEstadoAlumno | null;
  if (!d?.estado) throw new Error('Respuesta inesperada del servidor');
  if (d.estado === 'sin_clase') return { estado: 'sin_clase' };
  if (d.estado === 'terminada') return { estado: 'terminada', sessionId: d.sessionId ?? '', titulo: d.titulo ?? '' };
  return {
    estado: 'en_vivo',
    session: mapSession(d.session),
    activity: d.activity ? mapActivity(d.activity) : null,
    myAnswer: d.myAnswer ?? null,
    results: d.results ?? null,
    medalla: d.medalla ? mapStudentAward(d.medalla) : null,
    ahora: d.ahora ?? null,
  };
}

export interface EstadoDocente {
  session: LiveSession;
  activity: LiveActivity | null;
  results: LiveResults | null;
  /** Quedó abierta sin uso (2 h sin señales): se cierra sola */
  olvidada: boolean;
  /** Emojis del último minuto */
  reacciones: { emoji: string; createdAt: string }[];
  invitados: InvitadoEnSala[];
  /** Estudiantes vistos en los últimos 90 s */
  conectados: Set<string>;
  /** La hora del servidor (073), para la cuenta regresiva */
  ahora: string | null;
}

/**
 * Cierra una clase propia que quedó olvidada (2 h sin señales), con la hora
 * de su última señal. false si no era suya o no estaba olvidada.
 */
export async function cerrarMiClaseOlvidada(sessionId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('cerrar_mi_clase_olvidada' as never, { p_session: sessionId } as never);
  if (error) throw error;
  return Boolean(data);
}

/** Todo el panel del docente en un pedido. null si la clase no es suya o no existe. */
export async function getEstadoDocente(sessionId: string, senal?: AbortSignal): Promise<EstadoDocente | null> {
  const pedido = supabase.rpc('live_estado_docente' as never, { p_session: sessionId } as never);
  const { data, error } = await (senal ? pedido.abortSignal(senal) : pedido);
  if (error) throw error;
  const d = data as unknown as FilaEstadoDocente | null;
  if (!d) return null;
  return {
    session: mapSession(d.session),
    activity: d.activity ? mapActivity(d.activity) : null,
    results: d.results ?? null,
    olvidada: Boolean(d.olvidada),
    reacciones: d.reacciones ?? [],
    invitados: d.invitados ?? [],
    conectados: new Set<string>(d.conectados ?? []),
    ahora: d.ahora ?? null,
  };
}

// ── Competencia (073) ──

export interface PuestoCompetencia { nombre: string; puntos: number; posicion: number }

export interface VistaCompetencia {
  ronda: string;
  /** Cuántas preguntas de la ronda ya se revelaron (solo esas suman) */
  reveladas: number;
  participantes: number;
  /** Los tres primeros (con puntos). Solo le llega al docente: a los celulares no viaja ningún nombre */
  podio: PuestoCompetencia[];
  /** El que pregunta, si jugó: su lugar y lo que sumó en la última revelada */
  yo: { puntos: number; posicion: number; aciertos: number; respondidas: number; ultima: number } | null;
  /** Solo el docente: todos */
  todos?: (PuestoCompetencia & { aciertos: number; respondidas: number; esInvitado: boolean })[] | null;
}

/** Las posiciones de una ronda: el docente ve todas; el estudiante, el podio y la suya */
export async function getCompetencia(sessionId: string, ronda: string): Promise<VistaCompetencia | null> {
  const { data, error } = await supabase.rpc('live_competencia' as never, { p_session: sessionId, p_ronda: ronda } as never);
  if (error) throw error;
  return (data as unknown as VistaCompetencia | null) ?? null;
}

// ── Actividades ──

export async function launchActivity(
  sessionId: string,
  kind: LiveActivityKind,
  config: LiveActivityConfig,
  targetStudentId?: string | null,
  /** De qué tema es la pregunta (068): "temas para repasar" la cuenta en el suyo */
  classId?: string | null,
): Promise<LiveActivity> {
  // Cierra la anterior: en el celular del estudiante desaparece sola (poll).
  await supabase
    .from('live_activities')
    .update({ status: 'closed' })
    .eq('session_id', sessionId)
    .in('status', ['active', 'revealed']);

  const data = unwrap(
    await supabase
      .from('live_activities')
      .insert({
        session_id: sessionId,
        kind,
        config: config as never,
        target_student_id: targetStudentId ?? null,
        ...(classId ? { class_id: classId } : {}),
      } as never)
      .select('*')
  );
  return mapActivity((data as any[])[0]);
}

/**
 * Revela una pregunta, solo si sigue activa: si justo se cerró (a mano, o
 * desde otro equipo), no la reabre. Devuelve si la reveló.
 */
export async function revelarActividad(id: string): Promise<boolean> {
  const { data, error } = await supabase.from('live_activities')
    .update({ status: 'revealed' }).eq('id', id).eq('status', 'active').select('id');
  if (error) throw error;
  return (data ?? []).length > 0;
}

export async function setActivityStatus(id: string, status: LiveActivityStatus): Promise<void> {
  const { error } = await supabase.from('live_activities').update({ status }).eq('id', id);
  if (error) throw error;
}

// ── Resultados agregados (RPC, una llamada por poll) ──

export async function getLiveResults(activityId: string): Promise<LiveResults | null> {
  const { data, error } = await supabase.rpc('get_live_results', { p_activity: activityId });
  if (error) throw error;
  return (data as LiveResults | null) ?? null;
}

// ── Respuestas del estudiante ──

export async function upsertLiveResponse(
  activityId: string,
  sessionId: string,
  studentId: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const { error } = await supabase
    .from('live_responses')
    .upsert(
      { activity_id: activityId, session_id: sessionId, student_id: studentId, payload: payload as never },
      { onConflict: 'activity_id,student_id' },
    );
  if (error) throw error;
}

/** El servidor la rechazó por las reglas de la competencia (073) o porque se cerró */
export function codigoRespuestaRechazada(err: unknown): 'TIEMPO_TERMINADO' | 'RESPUESTA_YA_ENVIADA' | 'ACTIVIDAD_CERRADA' | null {
  const m = err && typeof err === 'object' && 'message' in err ? String((err as { message: unknown }).message) : '';
  return m.includes('TIEMPO_TERMINADO') ? 'TIEMPO_TERMINADO'
    : m.includes('RESPUESTA_YA_ENVIADA') ? 'RESPUESTA_YA_ENVIADA'
    : m.includes('ACTIVIDAD_CERRADA') ? 'ACTIVIDAD_CERRADA' : null;
}

/** Por qué no entró una respuesta, para leer en el celular */
export function motivoRespuestaRechazada(err: unknown): string {
  switch (codigoRespuestaRechazada(err)) {
    case 'TIEMPO_TERMINADO': return 'Se terminó el tiempo para esta pregunta.';
    case 'RESPUESTA_YA_ENVIADA': return 'Ya habías respondido: en la competencia vale la primera.';
    case 'ACTIVIDAD_CERRADA': return 'La pregunta ya se cerró.';
    default: return err instanceof Error && err.message ? err.message : 'Probá de nuevo.';
  }
}

export async function getMyLiveResponse(
  activityId: string,
  studentId: string,
): Promise<Record<string, unknown> | null> {
  const { data } = await supabase
    .from('live_responses')
    .select('payload')
    .eq('activity_id', activityId)
    .eq('student_id', studentId)
    .maybeSingle();
  return (data?.payload as Record<string, unknown>) ?? null;
}

/** Quiénes eligieron la opción correcta de una pregunta rápida. */
export async function getCorrectResponders(activityId: string, correctId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('live_responses')
    .select('student_id')
    .eq('activity_id', activityId)
    .eq('payload->>opcion', correctId);
  if (error) throw error;
  // Los invitados sin cuenta (012) responden sin student_id: no tienen perfil donde guardar una medalla
  return (data ?? []).map(r => r.student_id).filter((id): id is string => Boolean(id));
}

// ── Reacciones ──

export async function sendLiveReaction(sessionId: string, studentId: string, emoji: string): Promise<void> {
  const { error } = await supabase
    .from('live_reactions')
    .insert({ session_id: sessionId, student_id: studentId, emoji });
  if (error) throw error;
}

/** Reacciones recientes (docente): últimas N desde un instante dado. */
export async function getRecentReactions(sessionId: string, sinceIso: string): Promise<{ emoji: string; createdAt: string }[]> {
  const data = unwrap(
    await supabase
      .from('live_reactions')
      .select('emoji, created_at')
      .eq('session_id', sessionId)
      .gt('created_at', sinceIso)
      .order('created_at', { ascending: false })
      .limit(60)
  );
  return data.map((r: any) => ({ emoji: r.emoji, createdAt: r.created_at }));
}

// ── Check-in vivo → también alimenta el bienestar del estudiante ──

export async function saveLiveCheckin(studentId: string, feeling: CheckinFeeling): Promise<void> {
  // La ficha de bienestar (señales, alertas, resumen IA) se alimenta de student_checkins.
  const { error } = await supabase.from('student_checkins').insert({
    student_id: studentId,
    activity_id: null,
    moment: 'libre',
    feeling,
    comment: null,
  });
  if (error) throw error;
}

// ── Sala abierta a invitados (migración 012) ──

/**
 * Abre o cierra la sala a gente sin cuenta. Apagado por default: en una
 * clase normal los que participan son los estudiantes del curso y nadie
 * más. Se prende para una presentación, una jornada o una visita.
 */
export async function setGuestsEnabled(id: string, enabled: boolean): Promise<void> {
  const { error } = await supabase
    .from('live_sessions')
    .update({ guests_enabled: enabled })
    .eq('id', id);
  if (error) throw error;
}

/**
 * Borra una respuesta suelta. Con invitados anónimos, lo que alguien
 * escribe en "respuesta libre" o en la nube de palabras queda proyectado
 * en una pared: el docente tiene que poder sacarlo sin frenar la clase.
 */
export async function deleteLiveResponse(id: string): Promise<void> {
  const { error } = await supabase.from('live_responses').delete().eq('id', id);
  if (error) throw error;
}

export interface InvitadoEnSala { id: string; nombre: string; vistoAt: string }

/**
 * Los invitados que siguen en la sala (sin los que el docente sacó), con
 * su última señal: el panel los lista para poder sacar a uno.
 */
export async function getInvitadosEnSala(sessionId: string): Promise<InvitadoEnSala[]> {
  const { data, error } = await supabase
    .from('live_guests')
    .select('id, display_name, last_seen_at')
    .eq('session_id', sessionId)
    .is('expulsado_at' as never, null)
    .order('created_at');
  if (error) throw error;
  return ((data ?? []) as { id: string; display_name: string; last_seen_at: string }[])
    .map(g => ({ id: g.id, nombre: g.display_name, vistoAt: g.last_seen_at }));
}

/** Saca a un invitado de la sala y borra lo que mandó (067). */
export async function sacarInvitado(guestId: string): Promise<void> {
  const { error } = await supabase.rpc('sacar_invitado' as never, { p_guest: guestId } as never);
  if (error) throw error;
}

/** Saca una palabra de la nube (todas las respuestas con esa palabra). */
export async function sacarPalabraEnVivo(activityId: string, palabra: string): Promise<void> {
  const { error } = await supabase.rpc('sacar_palabra_en_vivo' as never, { p_activity: activityId, p_palabra: palabra } as never);
  if (error) throw error;
}

// ── Presencia: quién está conectado ahora (migración 014) ──

/**
 * Late mientras el estudiante tiene la clase abierta. Se llama desde el
 * poll pero throttleado (~30s): la presencia no necesita la cadencia de
 * los resultados y así cuida datos y batería.
 */
export async function sendHeartbeat(sessionId: string, studentId: string): Promise<void> {
  const { error } = await supabase
    .from('live_presence')
    .upsert(
      { session_id: sessionId, student_id: studentId, last_seen_at: new Date().toISOString() },
      { onConflict: 'session_id,student_id' },
    );
  if (error) throw error;
}

/** Ids de estudiantes vistos en los últimos 90s (mismo criterio que invitados). */
export async function getOnlineStudentIds(sessionId: string): Promise<Set<string>> {
  const since = new Date(Date.now() - 90_000).toISOString();
  const data = unwrap(
    await supabase
      .from('live_presence')
      .select('student_id')
      .eq('session_id', sessionId)
      .gt('last_seen_at', since)
  );
  return new Set(data.map((r: any) => r.student_id));
}
