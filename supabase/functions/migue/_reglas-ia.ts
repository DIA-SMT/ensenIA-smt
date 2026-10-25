/**
 * Lo que el docente permite de la IA en cada actividad (078).
 *
 * Migue (el del estudiante) lo recibe en cada turno, al final del mensaje:
 * así respeta un "sin IA" aunque el chico pegue la consigna sin decir de
 * dónde es. Se lee con SU JWT (student_activities: solo lo publicado de sus
 * materias) y solo lo que todavía no entregó. "Con pistas" no se manda: es
 * lo que Migue hace siempre.
 */

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

const MAX_ACTIVIDADES = 6;

/** La consigna sin Markdown, en una línea */
function plano(t: string | null | undefined): string {
  return (t ?? '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/[#>*_`|~-]+/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

const corto = (t: string, n: number) => (t.length > n ? `${t.slice(0, n)}…` : t);

export async function reglasDeIADelEstudiante(asUser: SupabaseClient, tapar: (t: string) => string): Promise<string> {
  const { data, error } = await asUser
    .from('student_activities')
    .select('id, title, tipo, content_md, questions, ia_permitida, subjects(name)')
    .in('ia_permitida', ['sin_ia', 'libre'])
    .order('created_at', { ascending: false })
    .limit(20);
  // Sin la 078, o nada con reglas: lo de siempre
  if (error || !data?.length) return '';

  type Act = {
    id: string; title: string; tipo: string; content_md: string | null;
    questions: { prompt?: string }[] | null; ia_permitida: 'sin_ia' | 'libre';
    subjects: { name: string } | null;
  };
  const acts = data as unknown as Act[];
  const { data: subs } = await asUser
    .from('activity_submissions')
    .select('activity_id, status')
    .in('activity_id', acts.map(a => a.id));
  const entregadas = new Set(((subs ?? []) as { activity_id: string; status: string }[])
    .filter(s => s.status === 'submitted' || s.status === 'graded')
    .map(s => s.activity_id));
  const pendientes = acts.filter(a => !entregadas.has(a.id)).slice(0, MAX_ACTIVIDADES);
  if (pendientes.length === 0) return '';

  const lineas = pendientes.map(a => {
    const tipo = a.tipo === 'evaluacion' ? 'evaluación' : a.tipo === 'tp' ? 'TP' : 'actividad';
    const de = `${a.subjects?.name ? `${a.subjects.name}, ` : ''}${tipo}`;
    if (a.ia_permitida === 'libre') return `- «${a.title}» (${de}): LIBRE.`;
    // Sin IA: con lo necesario para reconocerla si la pega sin nombrarla
    const consigna = corto(plano(a.content_md), 300);
    const preguntas = (a.questions ?? []).map(q => corto(plano(q.prompt), 150)).filter(Boolean).slice(0, 2);
    return `- «${a.title}» (${de}): SIN IA.${consigna ? ` Consigna: "${consigna}"` : ''}${
      preguntas.length ? ` Preguntas: ${preguntas.map(p => `"${p}"`).join('; ')}` : ''}`;
  });

  return tapar(`\n\n## Lo que su docente permite de la IA en sus actividades pendientes
${lineas.join('\n')}
- SIN IA: si te pide resolverla, corregirla o pistas para esas consignas (aunque no la nombre:
  si pega la consigna o algo muy parecido), no lo hagas. Decile con buena onda que su docente la
  pidió sin IA y que la intente por su cuenta. Podés ayudarlo a organizarse o con cómo usar la app.
- LIBRE: podés revisar su borrador, dar ejemplos resueltos parecidos y explicar en detalle,
  sin hacerla entera por él.
- En cualquier otra, lo de siempre: pistas, no respuestas.`);
}
