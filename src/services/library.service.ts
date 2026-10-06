import { supabase, unwrap } from './_helpers';
import type { LibraryMaterial } from '../types';

export async function getMaterialsByTeacher(teacherId: string): Promise<LibraryMaterial[]> {
  const data = unwrap(
    await supabase
      .from('library_materials')
      .select('*')
      .eq('teacher_id', teacherId)
      .order('uploaded_at', { ascending: false })
  );

  return data.map(mapMaterial);
}

export async function getMaterialsBySubject(subjectId: string): Promise<LibraryMaterial[]> {
  const data = unwrap(
    await supabase
      .from('library_materials')
      .select('*')
      .eq('subject_id', subjectId)
      .order('uploaded_at', { ascending: false })
  );

  return data.map(mapMaterial);
}

export async function searchMaterials(query: string, teacherId?: string): Promise<LibraryMaterial[]> {
  // Escape special PostgREST characters to prevent filter injection
  const safeQuery = query.replace(/[%_\\()",.*]/g, '');
  if (!safeQuery) return [];
  let q = supabase
    .from('library_materials')
    .select('*')
    .or(`title.ilike.%${safeQuery}%,description.ilike.%${safeQuery}%,subject_name.ilike.%${safeQuery}%`);

  if (teacherId) q = q.eq('teacher_id', teacherId);

  const data = unwrap(await q.order('uploaded_at', { ascending: false }));
  return data.map(mapMaterial);
}

export async function createMaterial(material: {
  title: string;
  description: string;
  fileType: string;
  fileName: string;
  fileSize: string;
  subjectId: string;
  subjectName: string;
  /** null o sin dar = todos los cursos donde el docente da la materia. */
  courseId?: string | null;
  unitName?: string;
  teacherId: string;
  schoolId: string;
  tags: string[];
  classId?: string | null;
  videoUrl?: string | null;
  /** Contenido en texto (ej. generado por IA): habilita resumen, placas y quiz sin archivo. */
  extractedText?: string;
  aiSummary?: string;
}): Promise<LibraryMaterial> {
  const row = unwrap(
    await supabase
      .from('library_materials')
      .insert({
        title: material.title,
        description: material.description,
        class_id: material.classId ?? null,
        video_url: material.videoUrl ?? null,
        file_type: material.fileType as any,
        file_name: material.fileName,
        file_size: material.fileSize,
        subject_id: material.subjectId,
        subject_name: material.subjectName,
        course_id: material.courseId ?? null,
        unit_name: material.unitName ?? null,
        teacher_id: material.teacherId,
        school_id: material.schoolId,
        tags: material.tags,
        extracted_text: material.extractedText ?? null,
        ai_summary: material.aiSummary ?? null,
      })
      .select()
      .single()
  );

  return mapMaterial(row);
}

export async function renameMaterial(id: string, title: string, description: string, courseId?: string | null): Promise<void> {
  const { error } = await supabase
    .from('library_materials')
    .update(courseId === undefined ? { title, description } : { title, description, course_id: courseId })
    .eq('id', id);
  if (error) throw error;
}

export async function deleteMaterial(id: string): Promise<void> {
  const { error } = await supabase.from('library_materials').delete().eq('id', id);
  if (error) throw error;
}

export async function getSharedMaterialsForStudent(): Promise<LibraryMaterial[]> {
  // RLS filtra: materiales compartidos de las materias donde el alumno está inscripto
  const data = unwrap(
    await supabase
      .from('library_materials')
      .select('*')
      .eq('is_shared_with_students', true)
      .order('uploaded_at', { ascending: false })
  );
  return data.map(mapMaterial);
}

function mapMaterial(row: any): LibraryMaterial {
  return {
    id: row.id,
    title: row.title,
    description: row.description ?? '',
    fileType: row.file_type,
    fileName: row.file_name ?? '',
    fileSize: row.file_size ?? '',
    subjectId: row.subject_id,
    subjectName: row.subject_name,
    courseId: row.course_id ?? null,
    unitName: row.unit_name ?? undefined,
    teacherId: row.teacher_id,
    schoolId: row.school_id,
    tags: row.tags ?? [],
    uploadedAt: row.uploaded_at,
    storagePath: row.storage_path,
    fileSizeBytes: row.file_size_bytes,
    extractedText: row.extracted_text,
    aiSummary: row.ai_summary,
    isSharedWithStudents: row.is_shared_with_students ?? false,
    studyCards: row.study_cards ?? null,
    slides: row.slides ?? null,
    podcastPath: row.podcast_path ?? null,
    podcastStatus: row.podcast_status ?? 'none',
    classId: row.class_id ?? null,
    videoUrl: row.video_url ?? null,
    practiceQuiz: row.practice_quiz ?? null,
    studyGuide: row.study_guide ?? null,
  };
}

/** El material que ya se generó para un tema, si existe. Se genera una vez y queda. */
export async function getMaterialByClass(classId: string): Promise<LibraryMaterial | null> {
  const { data } = await supabase
    .from('library_materials')
    .select('*')
    .eq('class_id', classId)
    .order('uploaded_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ? mapMaterial(data) : null;
}

/** Etiqueta de las versiones adaptadas que se leen con letra grande e interlineado. */
export const TAG_LETRA_GRANDE = 'letra-grande';

/**
 * Guarda el diseño elegido en unas diapositivas de la biblioteca. Solo cambia
 * la marca "<!-- diseño: x -->" del texto: el contenido es el mismo, así que
 * NO se invalidan el quiz ni la guía de estudio cacheados (updateMaterial sí).
 */
export async function guardarTextoDeck(materialId: string, texto: string): Promise<void> {
  const { error } = await supabase.from('library_materials').update({ extracted_text: texto }).eq('id', materialId);
  if (error) throw error;
}
