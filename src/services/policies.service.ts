/**
 * SMT EstudIA — Normativa y protocolos (015)
 *
 * Las escuelas pidieron "carga sencilla de normativa": dirección escribe
 * el texto acá, no sube un PDF que después nadie abre. La misma tabla es
 * lo que Migue consulta para responder citando la norma.
 *
 * Quién ve qué lo decide la RLS por audiencia: acá no hay filtrado por rol.
 */

import { supabase, unwrap } from './_helpers';
import type { SchoolPolicy, PolicyHit, PolicyCategory, PolicyAudience } from '../types';

function mapPolicy(row: any): SchoolPolicy {
  return {
    id: row.id,
    schoolId: row.school_id,
    title: row.title,
    category: row.category,
    audience: row.audience,
    summary: row.summary ?? null,
    body: row.body,
    sourceUrl: row.source_url ?? null,
    effectiveFrom: row.effective_from ?? null,
    isPublished: row.is_published,
    createdBy: row.created_by ?? null,
    updatedBy: row.updated_by ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export const CATEGORY_LABELS: Record<PolicyCategory, string> = {
  reglamento: 'Reglamento',
  protocolo: 'Protocolo',
  circular: 'Circular',
  seguridad: 'Seguridad',
  administrativo: 'Administrativo',
};

export const AUDIENCE_LABELS: Record<PolicyAudience, string> = {
  equipo: 'Equipo docente y dirección',
  comunidad: 'Toda la comunidad (incluye familias y estudiantes)',
};

/** Todo lo que el rol de quien pregunta tenga permitido ver. */
export async function getPolicies(): Promise<SchoolPolicy[]> {
  const data = unwrap(
    await supabase
      .from('school_policies')
      .select('*')
      .order('category')
      .order('title')
  );
  return data.map(mapPolicy);
}

export async function savePolicy(p: {
  id?: string | null;
  schoolId: string;
  title: string;
  category: PolicyCategory;
  audience: PolicyAudience;
  summary: string;
  body: string;
  sourceUrl: string;
  effectiveFrom: string;
  isPublished: boolean;
}): Promise<void> {
  const campos = {
    title: p.title.trim(),
    category: p.category,
    audience: p.audience,
    summary: p.summary.trim() || null,
    body: p.body.trim(),
    source_url: p.sourceUrl.trim() || null,
    effective_from: p.effectiveFrom || null,
    is_published: p.isPublished,
  };

  if (p.id) {
    const { data, error } = await supabase
      .from('school_policies')
      .update(campos)
      .eq('id', p.id)
      .select('id');
    if (error) throw error;
    if (!data || data.length === 0) {
      throw new Error('No se pudo guardar: puede que ya no tengas permiso sobre esta norma.');
    }
    return;
  }

  const { error } = await supabase
    .from('school_policies')
    .insert({ school_id: p.schoolId, ...campos });
  if (error) throw error;
}

export async function deletePolicy(id: string): Promise<void> {
  const { error } = await supabase.from('school_policies').delete().eq('id', id);
  if (error) throw error;
}

/**
 * Búsqueda de texto completo en español. La función es SECURITY INVOKER,
 * así que devuelve solo lo que quien pregunta puede leer — es lo que
 * impide que Migue le recite a un estudiante un protocolo del equipo.
 */
export async function searchPolicies(query: string, maxResults = 5): Promise<PolicyHit[]> {
  const q = query.trim();
  if (!q) return [];
  const { data, error } = await supabase.rpc('search_school_policies', {
    q, max_results: maxResults,
  });
  if (error) throw error;
  return (data ?? []).map((row: any) => ({
    id: row.id,
    title: row.title,
    category: row.category,
    summary: row.summary ?? null,
    body: row.body,
    sourceUrl: row.source_url ?? null,
    effectiveFrom: row.effective_from ?? null,
    rank: row.rank,
  }));
}
