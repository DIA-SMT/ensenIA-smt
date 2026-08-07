/**
 * ENSEÑIA SMT — Documents Service
 *
 * Subida real de archivos a Supabase Storage, extracción de texto
 * (edge function process-document con visión para PDFs, mammoth para DOCX),
 * resumen IA e importación de programas anuales.
 */

import { supabase } from './_helpers';
import type { ImportedProgram, ActivityQuestion } from '../types';

const BUCKET = 'library';
const EDGE_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/process-document`;

// ── Storage ──

export interface UploadResult {
  storagePath: string;
  fileSizeBytes: number;
}

export async function uploadFile(teacherId: string, file: File): Promise<UploadResult> {
  const safeName = file.name.normalize('NFKD').replace(/[^\w.\- ]/g, '').replace(/\s+/g, '_');
  const storagePath = `${teacherId}/${crypto.randomUUID().slice(0, 8)}_${safeName}`;
  const { error } = await supabase.storage.from(BUCKET).upload(storagePath, file, {
    contentType: file.type || undefined,
    upsert: false,
  });
  if (error) throw new Error(`Error subiendo archivo: ${error.message}`);
  return { storagePath, fileSizeBytes: file.size };
}

export async function getSignedUrl(storagePath: string): Promise<string> {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(storagePath, 3600);
  if (error || !data) throw new Error('No se pudo generar el enlace de descarga.');
  return data.signedUrl;
}

export async function removeFile(storagePath: string): Promise<void> {
  await supabase.storage.from(BUCKET).remove([storagePath]);
}

// ── Extracción de texto en el navegador ──

export function fileToBase64(file: File | Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      resolve(dataUrl.split(',')[1] ?? '');
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/** DOCX → texto plano, client-side (sin gastar IA). */
export async function extractDocxText(file: File): Promise<string> {
  const mammoth = await import('mammoth');
  const arrayBuffer = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer });
  return result.value.trim();
}

// ── Edge function process-document ──

async function callProcessDocument<T>(body: Record<string, unknown>): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error('No hay sesión activa.');

  const resp = await fetch(EDGE_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`,
    },
    body: JSON.stringify(body),
  });

  const json = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    throw new Error(json.message || `Error del servidor de IA (${resp.status}).`);
  }
  return json as T;
}

export async function extractPdfText(pdfBase64: string, title?: string): Promise<string> {
  const { text } = await callProcessDocument<{ text: string }>({
    mode: 'extract_text',
    pdfBase64,
    title,
  });
  return text;
}

export async function summarizeDocument(input: { text?: string; pdfBase64?: string; title?: string }): Promise<string> {
  const { summary } = await callProcessDocument<{ summary: string }>({
    mode: 'summarize',
    ...input,
  });
  return summary;
}

export async function importProgram(input: {
  pdfBase64?: string;
  text?: string;
  title?: string;
  subjectName?: string;
  courseName?: string;
}): Promise<ImportedProgram> {
  const { program } = await callProcessDocument<{ program: ImportedProgram }>({
    mode: 'import_program',
    pdfBase64: input.pdfBase64,
    text: input.text,
    title: input.title,
    context: { subjectName: input.subjectName, courseName: input.courseName },
  });
  return program;
}

/** Síntesis IA del estudiante para reuniones/boletín (señales + observaciones + métricas). */
export async function summarizeStudent(profileText: string, studentName: string): Promise<string> {
  const { summary } = await callProcessDocument<{ summary: string }>({
    mode: 'student_summary',
    text: profileText,
    title: studentName,
  });
  return summary;
}

export async function extractQuestions(contentMd: string): Promise<ActivityQuestion[]> {
  const { questions } = await callProcessDocument<{ questions: Omit<ActivityQuestion, 'id'>[] }>({
    mode: 'extract_questions',
    text: contentMd,
  });
  return (questions ?? []).map((q, i) => ({ ...q, id: `q${i + 1}` }));
}

// ── Material metadata updates ──

export async function updateMaterial(
  id: string,
  updates: Partial<{
    extractedText: string;
    aiSummary: string;
    isSharedWithStudents: boolean;
    storagePath: string;
    fileSizeBytes: number;
  }>,
): Promise<void> {
  const dbUpdates: Record<string, any> = {};
  if (updates.extractedText !== undefined) dbUpdates.extracted_text = updates.extractedText;
  if (updates.aiSummary !== undefined) dbUpdates.ai_summary = updates.aiSummary;
  if (updates.isSharedWithStudents !== undefined) dbUpdates.is_shared_with_students = updates.isSharedWithStudents;
  if (updates.storagePath !== undefined) dbUpdates.storage_path = updates.storagePath;
  if (updates.fileSizeBytes !== undefined) dbUpdates.file_size_bytes = updates.fileSizeBytes;
  const { error } = await supabase.from('library_materials').update(dbUpdates).eq('id', id);
  if (error) throw error;
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
