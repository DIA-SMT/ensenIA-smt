/** Cómo termina una partida: cuántas bien, de cuántas, y qué conviene repasar */
export interface FinPartida {
  score: number;
  total: number;
  repaso: { pregunta: string; respuesta: string }[];
}
