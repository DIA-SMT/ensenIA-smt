/**
 * Corregir por partes (063): el puntaje de cada parte y la suma. Las de
 * opción múltiple llegan con lo que corrigió la base; el docente puede
 * cambiarlas (medio punto por el procedimiento, por ejemplo).
 */

import type { ActivityQuestion } from '../types';
import { leerPuntos, puntosATexto } from '../lib/actividades';
import './NotaPorPartes.css';

export default function NotaPorPartes({
  partes, textos, alCambiar, respuestas,
}: {
  partes: ActivityQuestion[];
  textos: Record<string, string>;
  alCambiar: (id: string, texto: string) => void;
  /** ¿La de opción múltiple estuvo bien? (de la entrega en la app) */
  respuestas?: Record<string, { correct?: boolean } | undefined>;
}) {
  return (
    <div className="npp" role="group" aria-label="Puntaje de cada parte">
      {partes.map((q, i) => {
        const tope = typeof q.points === 'number' ? q.points : 0;
        const n = leerPuntos(textos[q.id] ?? '');
        const mala = n !== null && (Number.isNaN(n) || n < 0 || n > tope);
        const auto = q.type === 'multiple_choice' ? respuestas?.[q.id]?.correct : undefined;
        return (
          <label key={q.id} className="npp-fila">
            <span className="npp-parte">
              Parte {i + 1}
              {auto !== undefined && <small className={auto ? 'text-success' : 'text-danger'}>{auto ? ' ✓ bien' : ' ✗ mal'}</small>}
            </span>
            <span className="npp-enunciado" title={q.prompt}>{q.prompt}</span>
            <span className="npp-valor">
              <input
                inputMode="decimal"
                maxLength={5}
                value={textos[q.id] ?? ''}
                placeholder="—"
                aria-invalid={mala}
                className={mala ? 'mala' : undefined}
                aria-label={`Puntaje de la parte ${i + 1}, sobre ${puntosATexto(tope)}`}
                onChange={e => alCambiar(q.id, e.target.value)}
              />
              <span>/ {puntosATexto(tope)}</span>
            </span>
          </label>
        );
      })}
    </div>
  );
}
