/**
 * SMT EstudIA — Documents Service
 *
 * Subida real de archivos a Supabase Storage, extracción de texto
 * (edge function process-document con visión para PDFs, mammoth para DOCX),
 * resumen IA e importación de programas anuales.
 */

import { supabase } from './_helpers';
import type { ImportedProgram, ActivityQuestion, PracticeQuestion, StudyCard } from '../types';
import { usoIAGastado } from '../lib/usoIA';

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

/** Link temporal al archivo. Con `descargarComo`, el navegador lo baja con ese nombre en vez de abrirlo. */
export async function getSignedUrl(storagePath: string, descargarComo?: string): Promise<string> {
  const { data, error } = await supabase.storage.from(BUCKET)
    .createSignedUrl(storagePath, 3600, descargarComo ? { download: descargarComo } : undefined);
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
export async function extractDocxText(file: Blob): Promise<string> {
  const mammoth = await import('mammoth');
  const arrayBuffer = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer });
  return result.value.trim();
}

/** pdf.js bajo demanda: pesa, y solo hace falta al leer o mostrar un PDF. */
export async function cargarPdfjs() {
  const pdfjs = await import('pdfjs-dist');
  if (!pdfjs.GlobalWorkerOptions.workerSrc) {
    pdfjs.GlobalWorkerOptions.workerSrc = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
  }
  return pdfjs;
}

/**
 * Un Word como HTML para verlo en la plataforma, con títulos, listas,
 * tablas e imágenes. Se limpia antes de mostrarlo: un .docx puede traer
 * links con código y lo abren estudiantes.
 */
export async function wordAHtml(file: Blob): Promise<string> {
  const [mammoth, { default: DOMPurify }] = await Promise.all([import('mammoth'), import('dompurify')]);
  const { value } = await mammoth.convertToHtml({ arrayBuffer: await file.arrayBuffer() });
  return DOMPurify.sanitize(value);
}

/**
 * El texto que trae adentro un PDF digital (exportado de Word, de una web…),
 * leído en el navegador con pdf.js: instantáneo y sin gastar IA. Un escaneo
 * no trae texto, o apenas la marca de agua de la app que lo escaneó.
 */
export async function extractPdfTextLayer(file: Blob): Promise<{ text: string; pages: number }> {
  const pdfjs = await cargarPdfjs();
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  try {
    const paginas: string[] = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const { items } = await (await doc.getPage(i)).getTextContent();
      paginas.push(items.map(it => ('str' in it ? it.str + (it.hasEOL ? '\n' : ' ') : '')).join(''));
    }
    return { text: paginas.join('\n\n').replace(/[ \t]+\n/g, '\n').trim(), pages: doc.numPages };
  } finally {
    doc.destroy();
  }
}

// Una página de texto real tiene más de mil letras; un escaneo, ninguna o
// la marca de agua ("Scanned with CamScanner").
const MIN_LETRAS_POR_PAGINA = 200;

/**
 * El texto de un material, que es lo que usan placas, podcast e IA Lab.
 * Word y PDF digital se leen en el navegador; un PDF escaneado lo
 * transcribe la IA mirando las páginas (tarda, y la pestaña tiene que
 * quedar abierta mientras tanto). Si falla, el error trae un mensaje para
 * mostrarle al docente.
 */
export async function leerTextoDeArchivo(file: Blob, tipo: 'pdf' | 'doc', title?: string): Promise<string> {
  if (tipo === 'doc') {
    const text = await extractDocxText(file).catch(() => {
      throw new Error('No se pudo abrir el Word. Si es un .doc viejo, guardalo como .docx o PDF y subilo de nuevo.');
    });
    if (!text) throw new Error('Este Word no tiene texto (puede que sean solo imágenes). Exportalo como PDF y subilo de nuevo.');
    return text;
  }

  // PDF digital: alcanza con el texto que trae adentro
  try {
    const { text, pages } = await extractPdfTextLayer(file);
    if (text.replace(/\s/g, '').length >= MIN_LETRAS_POR_PAGINA * pages) return text;
  } catch (err) {
    // PDF raro o protegido: que lo intente la IA
    console.warn('pdf.js no pudo leer el PDF:', err);
  }

  // PDF escaneado: lo transcribe la IA
  let text: string;
  try {
    text = await extractPdfText(await fileToBase64(file), title);
  } catch (err) {
    const msg = err instanceof Error ? err.message : '';
    // Sin conexión o la función cortó por tiempo: el mensaje del navegador
    // ("Failed to fetch", "Error … (504)") no le dice nada al docente.
    if (!msg || /fetch|network|\((5\d\d)\)/i.test(msg)) {
      throw new Error('La lectura con IA no llegó a terminar (se cortó la conexión o el archivo es muy largo). Probá de nuevo; si sigue fallando, subilo en partes más chicas.');
    }
    throw err;
  }
  if (!text.trim()) throw new Error('La IA no encontró texto en este PDF. ¿Las páginas se ven bien al abrirlo?');
  return text.trim();
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
  if (!json.cached) usoIAGastado();
  return json as T;
}

/** Genera el mini podcast de un material (guion con IA + voz). Tarda ~30-60s. */
export async function generatePodcast(materialId: string): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error('No hay sesión activa.');

  const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-podcast`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({ materialId }),
  });
  const json = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(json.error || `No se pudo generar el podcast (${resp.status}).`);
}

/**
 * Transcripción de un video de YouTube (vía sus subtítulos). Con ella el
 * video se vuelve material real: alimenta "Explicámelo fácil", la guía
 * IA, las placas y el podcast. Si el video no tiene subtítulos, falla
 * con un mensaje claro.
 */
export async function transcribeYouTube(videoUrl: string): Promise<string> {
  const { text } = await callProcessDocument<{ text: string }>({
    mode: 'youtube_transcript',
    videoUrl,
  });
  return text;
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

/** Informe de una clase en vivo, escrito por la IA a partir de sus números. */
export async function classReport(datos: string): Promise<string> {
  try {
    const { summary } = await callProcessDocument<{ summary: string }>({ mode: 'class_report', text: datos });
    return summary;
  } catch (err) {
    // La función del servidor todavía no tiene este modo (falta desplegarla)
    if (err instanceof Error && /\(400\)/.test(err.message)) {
      throw new Error('Para el informe con IA hay que desplegar la función process-document actualizada.');
    }
    throw err;
  }
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

/** Placas de estudio: tarjetas visuales de conceptos a partir del material. */
/** Que una placa tenga lo que su tipo necesita para mostrarse bien. */
export function placaCompleta(c: StudyCard): boolean {
  const lleno = (s?: string) => Boolean(s && s.trim());
  const tipo = c.type ?? 'concept';
  if (tipo === 'concept') return lleno(c.title) && lleno(c.body);
  if (tipo === 'flashcard') return lleno(c.question) && lleno(c.answer);
  const opciones = c.options ?? [];
  return lleno(c.question) && opciones.length >= 2 && opciones.every(o => lleno(o))
    && typeof c.correct_index === 'number' && c.correct_index >= 0 && c.correct_index < opciones.length;
}

export async function generateStudyCards(text: string, title: string): Promise<StudyCard[]> {
  const { cards, truncated } = await callProcessDocument<{ cards: StudyCard[]; truncated?: boolean }>({
    mode: 'study_cards',
    text,
    title,
  });
  // Si la respuesta se cortó, las últimas placas pueden venir a medias:
  // se descartan las incompletas en vez de mostrar un quiz sin opciones.
  const completas = (cards ?? []).filter(placaCompleta);
  if (completas.length < 4) {
    throw new Error(truncated
      ? 'Las placas salieron cortadas. Probá de nuevo; si el material es muy largo, acotá el tema.'
      : 'La IA no armó suficientes placas con este material. Probá de nuevo.');
  }
  return completas;
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

/**
 * Quiz de práctica pedagógico (Modo Estudio). Se genera UNA vez por
 * material y queda cacheado en el servidor para todo el curso.
 */
export async function generatePracticeQuiz(materialId: string): Promise<{ questions: PracticeQuestion[]; cached: boolean }> {
  const { questions, cached } = await callProcessDocument<{ questions: PracticeQuestion[]; cached: boolean }>({
    mode: 'practice_quiz',
    materialId,
  });
  return { questions: questions ?? [], cached: cached ?? false };
}

/** Guía de estudio dirigida al estudiante. Cacheada igual que el quiz. */
export async function generateStudyGuide(materialId: string): Promise<{ guide: string; cached: boolean }> {
  const { guide, cached } = await callProcessDocument<{ guide: string; cached: boolean }>({
    mode: 'study_guide',
    materialId,
  });
  return { guide: guide ?? '', cached: cached ?? false };
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
    studyCards: StudyCard[];
  }>,
): Promise<void> {
  const dbUpdates: Record<string, any> = {};
  if (updates.extractedText !== undefined) {
    dbUpdates.extracted_text = updates.extractedText;
    // El texto cambió: invalidamos el quiz y la guía cacheados para que se regeneren
    dbUpdates.practice_quiz = null;
    dbUpdates.study_guide = null;
  }
  if (updates.aiSummary !== undefined) dbUpdates.ai_summary = updates.aiSummary;
  if (updates.isSharedWithStudents !== undefined) dbUpdates.is_shared_with_students = updates.isSharedWithStudents;
  if (updates.storagePath !== undefined) dbUpdates.storage_path = updates.storagePath;
  if (updates.fileSizeBytes !== undefined) dbUpdates.file_size_bytes = updates.fileSizeBytes;
  if (updates.studyCards !== undefined) dbUpdates.study_cards = updates.studyCards;
  const { error } = await supabase.from('library_materials').update(dbUpdates).eq('id', id);
  if (error) throw error;
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
