/**
 * Cuánta ayuda de la IA permite el docente en una actividad (078).
 * Migue (el del estudiante) lo respeta aunque el chico pegue la consigna en
 * otro lado: el servidor le pasa las reglas de sus actividades pendientes.
 */

export type NivelIA = 'sin_ia' | 'guia' | 'libre';

export const NIVELES_IA: NivelIA[] = ['sin_ia', 'guia', 'libre'];

export const NIVEL_IA: Record<NivelIA, { etiqueta: string; docente: string; estudiante: string }> = {
  sin_ia: {
    etiqueta: 'Sin IA',
    docente: 'Migue no ayuda con esta actividad, aunque le peguen la consigna.',
    estudiante: 'Sin IA: tu docente pidió que la hagas por tu cuenta. Migue no te va a ayudar con esta.',
  },
  guia: {
    etiqueta: 'Con pistas',
    docente: 'Migue explica el tema y da pistas, pero no da las respuestas.',
    estudiante: 'Con pistas: Migue te ayuda a pensarla, pero no te da las respuestas.',
  },
  libre: {
    etiqueta: 'Libre',
    docente: 'Migue puede revisar el borrador y dar ejemplos resueltos parecidos (no la hace entera).',
    estudiante: 'Libre: podés pedirle a Migue que revise tu borrador o te dé ejemplos parecidos.',
  },
};

/** Lo que se propone si el docente no elige: las evaluaciones, sin IA; el resto, con pistas */
export function nivelIAPorDefecto(tipo: string): NivelIA {
  return tipo === 'evaluacion' ? 'sin_ia' : 'guia';
}

export function esNivelIA(v: unknown): v is NivelIA {
  return v === 'sin_ia' || v === 'guia' || v === 'libre';
}
