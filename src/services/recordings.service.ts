/**
 * SMT EstudIA — Clases grabadas (020)
 *
 * La escuela no aloja video: sube a YouTube, Drive o Meet y pega el link.
 * La grabación cuelga de la materia+curso y, si el docente quiere, de una
 * unidad del temario, para que el estudiante la encuentre donde busca el
 * tema y no en una lista suelta.
 */

import { supabase, unwrap } from './_helpers';
import type { RecordedClass, RecordingProvider } from '../types';

function mapRecording(row: any): RecordedClass {
  return {
    id: row.id,
    schoolId: row.school_id,
    subjectId: row.subject_id,
    courseId: row.course_id,
    teacherId: row.teacher_id,
    unitId: row.unit_id ?? null,
    termId: row.term_id ?? null,
    title: row.title,
    description: row.description ?? null,
    url: row.url,
    provider: row.provider,
    durationMin: row.duration_min ?? null,
    recordedOn: row.recorded_on ?? null,
    isPublished: row.is_published,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export const PROVIDER_LABELS: Record<RecordingProvider, string> = {
  youtube: 'YouTube',
  drive: 'Google Drive',
  meet: 'Grabación de Meet',
  otro: 'Otro',
};

/** Deduce de dónde viene el video para poder mostrarlo embebido. */
export function detectProvider(url: string): RecordingProvider {
  const u = url.toLowerCase();
  if (u.includes('youtube.com') || u.includes('youtu.be')) return 'youtube';
  if (u.includes('drive.google.com')) return 'drive';
  if (u.includes('meet.google.com')) return 'meet';
  return 'otro';
}

/**
 * URL embebible, o null si no se puede reproducir dentro de la página.
 * Devolver null es una respuesta válida: preferimos avisar que se abre
 * afuera antes que mostrar un recuadro roto.
 */
export function embedUrl(rec: { url: string; provider: RecordingProvider }): string | null {
  try {
    const u = new URL(rec.url);
    if (rec.provider === 'youtube') {
      let id: string | null = null;
      if (u.hostname.includes('youtu.be')) {
        id = u.pathname.slice(1);
      } else if (u.pathname.startsWith('/shorts/')) {
        id = u.pathname.split('/')[2] ?? null;
      } else if (u.pathname.startsWith('/live/')) {
        id = u.pathname.split('/')[2] ?? null;
      } else if (u.pathname.startsWith('/embed/')) {
        id = u.pathname.split('/')[2] ?? null;
      } else {
        id = u.searchParams.get('v');
      }
      if (!id) return null;
      // El id no lleva query ni fragmento pegado.
      id = id.split(/[?&#/]/)[0];
      if (!/^[A-Za-z0-9_-]{6,}$/.test(id)) return null;
      // Respetar el minuto al que apunta el link, si lo trae.
      const t = u.searchParams.get('t') ?? u.searchParams.get('start');
      const seg = t ? String(parseInt(t, 10) || 0) : null;
      const base = `https://www.youtube-nocookie.com/embed/${id}`;
      return seg && seg !== '0' ? `${base}?start=${seg}` : base;
    }
    if (rec.provider === 'drive') {
      const m = u.pathname.match(/\/file\/d\/([^/]+)/);
      if (m) return `https://drive.google.com/file/d/${m[1]}/preview`;
      // Forma vieja: /open?id=… o /uc?id=…
      const id = u.searchParams.get('id');
      if (id && /^[A-Za-z0-9_-]+$/.test(id)) {
        return `https://drive.google.com/file/d/${id}/preview`;
      }
      return null;
    }
    return null;
  } catch {
    return null;
  }
}

/** Las del docente en una materia+curso, publicadas o no. */
export async function getRecordingsForTeacher(
  subjectId: string, courseId: string,
): Promise<RecordedClass[]> {
  const data = unwrap(
    await supabase
      .from('recorded_classes')
      .select('*')
      .eq('subject_id', subjectId)
      .eq('course_id', courseId)
      .order('recorded_on', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })
  );
  return data.map(mapRecording);
}

/** Las publicadas que alcanza quien consulta. La RLS hace el filtrado. */
export async function getPublishedRecordings(courseId?: string): Promise<RecordedClass[]> {
  let q = supabase
    .from('recorded_classes')
    .select('*')
    .eq('is_published', true);
  if (courseId) q = q.eq('course_id', courseId);
  const data = unwrap(
    await q
      .order('recorded_on', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })
  );
  return data.map(mapRecording);
}

export async function saveRecording(r: {
  id?: string | null;
  schoolId: string;
  subjectId: string;
  courseId: string;
  unitId: string | null;
  termId: string | null;
  title: string;
  description: string;
  url: string;
  durationMin: string;
  recordedOn: string;
  isPublished: boolean;
}): Promise<void> {
  const provider = detectProvider(r.url);
  const dur = r.durationMin.trim() ? Number(r.durationMin) : null;

  const campos = {
    unit_id: r.unitId,
    term_id: r.termId,
    title: r.title.trim(),
    description: r.description.trim() || null,
    url: r.url.trim(),
    provider,
    duration_min: dur !== null && Number.isFinite(dur) && dur > 0 ? Math.round(dur) : null,
    recorded_on: r.recordedOn || null,
    is_published: r.isPublished,
  };

  if (r.id) {
    const { data, error } = await supabase
      .from('recorded_classes').update(campos).eq('id', r.id).select('id');
    if (error) throw error;
    if (!data || data.length === 0) {
      throw new Error('No se pudo guardar: puede que ya no dictes esta materia.');
    }
    return;
  }

  const { error } = await supabase.from('recorded_classes').insert({
    school_id: r.schoolId,
    subject_id: r.subjectId,
    course_id: r.courseId,
    ...campos,
  });
  if (error) throw error;
}

export async function deleteRecording(id: string): Promise<void> {
  const { error } = await supabase.from('recorded_classes').delete().eq('id', id);
  if (error) throw error;
}
