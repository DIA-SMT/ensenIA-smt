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
  unitName?: string;
  teacherId: string;
  schoolId: string;
  tags: string[];
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
        file_type: material.fileType as any,
        file_name: material.fileName,
        file_size: material.fileSize,
        subject_id: material.subjectId,
        subject_name: material.subjectName,
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
    practiceQuiz: row.practice_quiz ?? null,
    studyGuide: row.study_guide ?? null,
  };
}
