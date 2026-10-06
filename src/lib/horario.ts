/** Días y colores del horario (aparte del componente para que Vite recargue en caliente). */

export const DIAS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes'];

const COLORES = ['azul', 'verde', 'violeta', 'naranja', 'celeste', 'rosa', 'oliva', 'gris'];

/** El mismo color para la misma materia, en todas las pantallas */
export function colorDe(subjectId: string): string {
  let h = 0;
  for (const c of subjectId) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return COLORES[h % COLORES.length];
}

/** Índice del día de hoy en el horario (0 = lunes), o null el fin de semana */
export function hoyIndice(): number | null {
  const d = new Date().getDay();
  return d >= 1 && d <= 5 ? d - 1 : null;
}
