/**
 * La parte de un texto que es solo para el docente: respuestas correctas,
 * clave de corrección, rúbrica de corrección, notas. Va desde el primer
 * título que la anuncia hasta el final.
 *
 * La IA la escribe al final bajo "## 🔒 Solo para el docente"
 * (ia-chat/_tools.ts); lo armado antes trae títulos como "✅ Respuestas
 * correctas" o "🔑 Clave de corrección (uso docente)". El título tiene que
 * EMPEZAR así: "Marcá las respuestas correctas" es una consigna y no corta.
 *
 * La base hace el mismo corte en lo que lee el estudiante
 * (parte_para_estudiante, migración 084): si cambia una, cambia la otra.
 */

const TITULO_DOCENTE = new RegExp(
  '^[ \\t]*(?:#{1,4}|\\*\\*)[ \\t]*[^\\p{L}\\n]*(?:' + [
    'solo para (?:el|la|los) docentes?',
    '(?:notas?|sugerencias|orientaciones|indicaciones) para (?:el|la|los) docentes?',
    'para (?:el|la) docente',
    'uso (?:del |de la )?docente',
    'claves? de (?:correcci|respuestas)',
    'respuestas? (?:correctas?|esperadas|sugeridas|modelo)',
    'solucionario',
    'soluciones[ \\t:.*]*$',
    'gu[ií]a de correcci',
    'pauta de correcci',
    'criterios de correcci',
    'r[uú]brica de correcci',
  ].join('|') + ')',
  'imu',
);

/** El texto partido en lo que ve el estudiante y lo que es solo del docente */
export function separarParteDocente(md: string | null | undefined): { estudiante: string; docente: string | null } {
  const texto = md ?? '';
  const m = TITULO_DOCENTE.exec(texto);
  if (!m) return { estudiante: texto, docente: null };
  return {
    // Sin la raya (---) que suele separar las dos partes
    estudiante: texto.slice(0, m.index).replace(/[\s\-*_]+$/, ''),
    docente: texto.slice(m.index),
  };
}

/** Solo lo que ve el estudiante */
export function parteParaEstudiante(md: string | null | undefined): string {
  return separarParteDocente(md).estudiante;
}

/** El título con el que empieza la parte del docente, sin #, ** ni emojis: para nombrarla */
export function tituloParteDocente(docente: string): string {
  const primera = docente.split('\n', 1)[0];
  return primera.replace(/^[ \t]*(?:#{1,4}|\*\*)[ \t]*/, '').replace(/^[^\p{L}]*/u, '').replace(/[*:\s]+$/, '');
}
