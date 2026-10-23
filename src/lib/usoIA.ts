/**
 * Cuántos usos de IA le quedan hoy al docente.
 *
 * El límite lo pone el servidor (CUPO_DIARIO_EQUIPO en las funciones ia-chat
 * y process-document: 15 por día para el personal, compartidos entre el chat,
 * las placas, los resúmenes, etc.; los estudiantes tienen 50).
 * Cambiarlos juntos. Acá solo se muestra, para que no se termine de golpe.
 * Cada vez que algo usa la IA, avisa con usoIAGastado() y los contadores
 * a la vista se actualizan solos.
 */

export const LIMITE_DIARIO_IA = 15;

const EVENTO = 'estudia:uso-ia';

export function usoIAGastado(): void {
  window.dispatchEvent(new Event(EVENTO));
}

export function alGastarUsoIA(fn: () => void): () => void {
  window.addEventListener(EVENTO, fn);
  return () => window.removeEventListener(EVENTO, fn);
}
