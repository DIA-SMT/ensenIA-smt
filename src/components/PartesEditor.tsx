/**
 * Las partes de una actividad, un TP o una evaluación (063): opción
 * múltiple (con la correcta marcada) o desarrollo, cada una con sus puntos.
 *
 * `bloqueado`: ya hay estudiantes trabajando. Se pueden corregir los
 * textos, la correcta y los puntos; no agregar, quitar ni reordenar partes
 * u opciones (las respuestas guardan el número de opción). La base aplica
 * la misma regla.
 */

import { ArrowDown, ArrowUp, CircleDot, Plus, Trash2, AlignLeft } from 'lucide-react';
import type { ActivityQuestion } from '../types';
import { idDeParteNueva, leerPuntos, puntoValido, puntosATexto } from '../lib/actividades';
import './PartesEditor.css';

const MAX_OPCIONES = 6;

export default function PartesEditor({
  partes, alCambiar, conPuntos, bloqueado = false, textosPuntos, alCambiarTextoPuntos,
}: {
  partes: ActivityQuestion[];
  alCambiar: (p: ActivityQuestion[]) => void;
  conPuntos: boolean;
  bloqueado?: boolean;
  /** Lo tipeado en cada casilla de puntos (para dejar escribir "2," sin perderlo) */
  textosPuntos: Record<string, string>;
  alCambiarTextoPuntos: (id: string, texto: string) => void;
}) {
  const cambiar = (i: number, cambios: Partial<ActivityQuestion>) =>
    alCambiar(partes.map((q, k) => (k === i ? { ...q, ...cambios } : q)));

  const mover = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= partes.length) return;
    const n = [...partes];
    [n[i], n[j]] = [n[j], n[i]];
    alCambiar(n);
  };

  const agregar = (type: ActivityQuestion['type']) => {
    const id = idDeParteNueva(partes);
    alCambiar([...partes, type === 'multiple_choice'
      ? { id, type, prompt: '', options: ['', '', ''], correct_index: 0, ...(conPuntos ? { points: 1 } : {}) }
      : { id, type, prompt: '', options: [], correct_index: 0, ...(conPuntos ? { points: 2 } : {}) }]);
    requestAnimationFrame(() => document.getElementById(`parte-${id}`)?.focus());
  };

  const cambiarTipo = (i: number, type: ActivityQuestion['type']) => {
    const q = partes[i];
    if (q.type === type) return;
    cambiar(i, type === 'multiple_choice'
      ? { type, options: q.options?.length ? q.options : ['', '', ''], correct_index: 0 }
      : { type, options: [], correct_index: 0 });
  };

  const cambiarOpcion = (i: number, o: number, texto: string) => {
    const opts = [...(partes[i].options ?? [])];
    opts[o] = texto;
    cambiar(i, { options: opts });
  };

  const quitarOpcion = (i: number, o: number) => {
    const q = partes[i];
    const opts = (q.options ?? []).filter((_, k) => k !== o);
    const ci = q.correct_index ?? 0;
    cambiar(i, { options: opts, correct_index: ci === o ? 0 : ci > o ? ci - 1 : ci });
  };

  return (
    <div className="partes">
      {partes.length === 0 && (
        <p className="partes-vacio">
          Sin partes, el estudiante responde la consigna con un texto libre. Con partes de opción múltiple, la corrección es automática.
        </p>
      )}
      <ol className="partes-lista">
        {partes.map((q, i) => {
          const texto = textosPuntos[q.id] ?? puntosATexto(q.points);
          const p = leerPuntos(texto);
          const malos = conPuntos && (p === null || Number.isNaN(p) || !puntoValido(p as number));
          return (
            <li key={q.id} className="parte">
              <div className="parte-cabecera">
                <strong>Parte {i + 1}</strong>
                <span className="parte-tipo" role="group" aria-label={`Tipo de la parte ${i + 1}`}>
                  <button type="button" aria-pressed={q.type === 'multiple_choice'} disabled={bloqueado}
                    className={q.type === 'multiple_choice' ? 'activa' : ''} onClick={() => cambiarTipo(i, 'multiple_choice')}>
                    <CircleDot size={13} aria-hidden="true" /> Opción múltiple
                  </button>
                  <button type="button" aria-pressed={q.type === 'open'} disabled={bloqueado}
                    className={q.type === 'open' ? 'activa' : ''} onClick={() => cambiarTipo(i, 'open')}>
                    <AlignLeft size={13} aria-hidden="true" /> Desarrollo
                  </button>
                </span>
                {conPuntos && (
                  <label className="parte-puntos">
                    <input
                      inputMode="decimal"
                      maxLength={5}
                      value={texto}
                      aria-invalid={malos}
                      className={malos ? 'mala' : undefined}
                      aria-label={`Puntos de la parte ${i + 1}`}
                      onChange={e => {
                        alCambiarTextoPuntos(q.id, e.target.value);
                        const n = leerPuntos(e.target.value);
                        cambiar(i, { points: n !== null && !Number.isNaN(n) ? n : null });
                      }}
                    />
                    <span>pts</span>
                  </label>
                )}
                {!bloqueado && (
                  <span className="parte-acciones">
                    <button type="button" className="btn-icon" onClick={() => mover(i, -1)} disabled={i === 0} aria-label={`Subir la parte ${i + 1}`}><ArrowUp size={15} /></button>
                    <button type="button" className="btn-icon" onClick={() => mover(i, 1)} disabled={i === partes.length - 1} aria-label={`Bajar la parte ${i + 1}`}><ArrowDown size={15} /></button>
                    <button type="button" className="btn-icon" onClick={() => alCambiar(partes.filter((_, k) => k !== i))} aria-label={`Quitar la parte ${i + 1}`}><Trash2 size={15} /></button>
                  </span>
                )}
              </div>

              <textarea
                id={`parte-${q.id}`}
                className="parte-enunciado"
                rows={q.type === 'open' ? 3 : 2}
                value={q.prompt}
                placeholder={q.type === 'open' ? 'Consigna de desarrollo: qué tiene que explicar, resolver o producir' : 'La pregunta'}
                aria-label={`Enunciado de la parte ${i + 1}`}
                onChange={e => cambiar(i, { prompt: e.target.value })}
              />

              {q.type === 'multiple_choice' && (
                <div className="parte-opciones" role="radiogroup" aria-label={`Opción correcta de la parte ${i + 1}`}>
                  {(q.options ?? []).map((op, o) => (
                    <div key={o} className={`parte-opcion ${q.correct_index === o ? 'correcta' : ''}`}>
                      <input type="radio" name={`correcta-${q.id}`} checked={q.correct_index === o}
                        onChange={() => cambiar(i, { correct_index: o })}
                        aria-label={`La opción ${String.fromCharCode(65 + o)} es la correcta`} />
                      <span className="parte-letra" aria-hidden="true">{String.fromCharCode(65 + o)}</span>
                      <input type="text" value={op} placeholder={`Opción ${String.fromCharCode(65 + o)}`}
                        aria-label={`Opción ${String.fromCharCode(65 + o)} de la parte ${i + 1}`}
                        onChange={e => cambiarOpcion(i, o, e.target.value)} />
                      {!bloqueado && (q.options?.length ?? 0) > 2 && (
                        <button type="button" className="btn-icon" onClick={() => quitarOpcion(i, o)}
                          aria-label={`Quitar la opción ${String.fromCharCode(65 + o)}`}><Trash2 size={14} /></button>
                      )}
                    </div>
                  ))}
                  {!bloqueado && (q.options?.length ?? 0) < MAX_OPCIONES && (
                    <button type="button" className="btn btn-ghost btn-sm parte-agregar-opcion"
                      onClick={() => cambiar(i, { options: [...(q.options ?? []), ''] })}>
                      <Plus size={13} /> Opción
                    </button>
                  )}
                  <p className="parte-ayuda">Marcá la correcta. El estudiante no la ve hasta entregar.</p>
                </div>
              )}
            </li>
          );
        })}
      </ol>

      {!bloqueado && (
        <div className="partes-agregar">
          <button type="button" className="btn btn-outline btn-sm" onClick={() => agregar('multiple_choice')}>
            <Plus size={14} /> Parte de opción múltiple
          </button>
          <button type="button" className="btn btn-outline btn-sm" onClick={() => agregar('open')}>
            <Plus size={14} /> Parte de desarrollo
          </button>
        </div>
      )}
    </div>
  );
}
