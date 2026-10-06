/**
 * El mazo de un material, venga como venga.
 *
 * Hay dos formatos guardados: el estructurado (library_materials.slides,
 * lib/diapositivas) y el viejo, Markdown en extracted_text que se lee con
 * lib/presentation. Antes cada pantalla elegía uno distinto y el mismo mazo
 * se veía de una forma en el editor, de otra al presentar y de otra en el
 * celular de los chicos. Todas las pantallas pasan por acá: primero el
 * estructurado; si no hay, el viejo convertido al vuelo.
 */

import { normalizarMazo, desdeLegado, type Mazo } from './diapositivas';
import { deckDe } from './presentation';

export function mazoDe(material: {
  slides?: unknown;
  extractedText?: string | null;
  tags?: string[];
} | null | undefined): Mazo | null {
  if (!material) return null;
  const estructurado = normalizarMazo(material.slides);
  if (estructurado) return estructurado;
  const viejo = deckDe({ tags: material.tags ?? [], extractedText: material.extractedText });
  return viejo ? desdeLegado(viejo) : null;
}
