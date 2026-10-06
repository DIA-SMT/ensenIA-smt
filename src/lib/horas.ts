/**
 * Horas del horario escolar, guardadas como número: 13.5 = 13:30.
 * Los módulos de 40 u 80 minutos dan fracciones (13.33): se redondea al minuto.
 */

/** 13.5 → "13:30"; 13.33 → "13:20" */
export function horaATexto(h: number): string {
  let hh = Math.floor(h);
  let mm = Math.round((h - hh) * 60);
  if (mm === 60) { hh += 1; mm = 0; }
  return `${hh}:${String(mm).padStart(2, '0')}`;
}

/** "13:20" → 13.33…; null si no es una hora */
export function textoAHora(t: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(t.trim());
  if (!m) return null;
  return Number(m[1]) + Number(m[2]) / 60;
}
