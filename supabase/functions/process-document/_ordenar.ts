/**
 * Lo que se acomoda con código después de que responde la IA: el orden de
 * las opciones y el de las placas.
 *
 * Los modelos ponen la correcta casi siempre en el mismo lugar (en las
 * placas reales del piloto, 4 de 5 en la segunda opción): un estudiante
 * que lo nota acierta sin pensar. Pedírselo al modelo no alcanza; mezclar
 * acá sí. Por eso los prompts piden que las explicaciones no nombren letras
 * ni posiciones.
 */

type Azar = () => number;

/**
 * Las opciones en otro orden, con el índice de la correcta movido con
 * ellas. Si todas son números (años, resultados), van de menor a mayor:
 * es lo que se espera leer y no deja pista.
 *
 * Sin una correcta válida (pregunta de opinión, como "mucho / poco /
 * nada") no se toca: ahí el orden lo eligió quien la escribió.
 */
export function mezclarOpciones(
  opciones: string[],
  correcta: number,
  azar: Azar = Math.random,
): { opciones: string[]; correcta: number } {
  if (!Array.isArray(opciones) || opciones.length < 2) return { opciones, correcta };
  if (!Number.isInteger(correcta) || correcta < 0 || correcta >= opciones.length) return { opciones, correcta };

  const indices = opciones.map((_, i) => i);
  // El número con el que empieza ("3,5 kg" → 3.5; "1/2" → 1, y ahí queda como vino)
  const numero = (s: string) => {
    const m = s.match(/^\s*([-−]?\d+(?:[.,]\d+)?)/);
    return m ? Number(m[1].replace('−', '-').replace(',', '.')) : Number.NaN;
  };
  const todasNumeros = opciones.every(o => Number.isFinite(numero(o)));
  if (todasNumeros) {
    indices.sort((a, b) => numero(opciones[a]) - numero(opciones[b]));
  } else {
    for (let i = indices.length - 1; i > 0; i--) {
      const j = Math.floor(azar() * (i + 1));
      [indices[i], indices[j]] = [indices[j], indices[i]];
    }
  }
  return { opciones: indices.map(i => opciones[i]), correcta: indices.indexOf(correcta) };
}

interface Placa {
  type: string;
  options?: string[];
  correct_index?: number;
}

/**
 * Placas mezcladas por tipo. Si el modelo las agrupó (cinco conceptos,
 * después cinco tarjetas, después cinco preguntas), se intercalan: el
 * celular se recorre de a una y cinco placas para leer seguidas cansan
 * antes de llegar a las que hacen pensar. Dentro de cada tipo se respeta
 * el orden del modelo, que sigue el del material: la pregunta sobre el
 * concepto N queda cerca, pero con otra placa en el medio (primero el
 * concepto 1, después el 2, recién ahí la tarjeta del 1): se contesta
 * recordando, no releyendo lo que está justo arriba.
 */
export function intercalarPlacas<T extends Placa>(placas: T[]): T[] {
  const agrupadas = placas.some((p, i) => i >= 2 && p.type === placas[i - 1].type && p.type === placas[i - 2].type);
  if (!agrupadas) return placas;
  const tipos = ['concept', 'flashcard', 'quiz'];
  const colas = new Map<string, T[]>(tipos.map(t => [t, []]));
  for (const p of placas) (colas.get(p.type) ?? colas.get('concept')!).push(p);
  const salida: T[] = [];
  // La primera presenta el tema
  const primera = colas.get('concept')!.shift();
  if (primera) salida.push(primera);
  while (salida.length < placas.length) {
    for (const t of tipos) {
      const p = colas.get(t)!.shift();
      if (p) salida.push(p);
    }
  }
  return salida;
}

/** Las placas listas: opciones mezcladas en las preguntas e intercaladas por tipo. */
export function acomodarPlacas<T extends Placa>(placas: T[], azar: Azar = Math.random): T[] {
  return intercalarPlacas(placas.map(p => {
    if (p.type !== 'quiz' || !Array.isArray(p.options)) return p;
    const { opciones, correcta } = mezclarOpciones(p.options, p.correct_index ?? -1, azar);
    return { ...p, options: opciones, correct_index: correcta };
  }));
}
