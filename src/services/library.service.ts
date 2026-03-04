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
  let q = supabase
    .from('library_materials')
    .select('*')
    .or(`title.ilike.%${query}%,description.ilike.%${query}%,subject_name.ilike.%${query}%`);

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
      })
      .select()
      .single()
  );

  return mapMaterial(row);
}

export async function deleteMaterial(id: string): Promise<void> {
  await supabase.from('library_materials').delete().eq('id', id);
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
  };
}
