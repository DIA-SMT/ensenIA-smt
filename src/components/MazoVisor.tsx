/**
 * SMT EstudIA — Visor del mazo estructurado
 *
 * Dibuja las seis formas de lámina. El visor anterior solo sabía hacer
 * título + viñetas, así que una presentación entera salía con la misma
 * forma doce veces: por eso se veía básica, más allá del tema de color.
 *
 * Los colores salen de lib/disenos, los mismos que usa el PowerPoint.
 *
 * Es un componente nuevo y no reemplaza a PresentationViewer: ese sigue
 * sirviendo los mazos en formato viejo mientras migramos.
 */

import { useState, useEffect, useCallback } from 'react';
import { ChevronLeft, ChevronRight, StickyNote } from 'lucide-react';
import { disenoDe, varsDiseno, DISENO_PREDETERMINADO } from '../lib/disenos';
import type { Mazo, Diapositiva } from '../lib/diapositivas';
import './MazoVisor.css';

/** No navegar con las flechas mientras alguien escribe. */
function enCampoDeTexto(t: EventTarget | null): boolean {
  return t instanceof HTMLElement && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName));
}

export function Lamina({ dia, pie }: { dia: Diapositiva; pie?: string }) {
  return (
    <div className={`mv-lamina mv-${dia.tipo}`}>
      {dia.tipo === 'portada' ? (
        <>
          <h1 className="mv-portada-titulo">{dia.titulo}</h1>
          {dia.puntos.length > 0 && (
            <p className="mv-portada-bajada">{dia.puntos.join(' · ')}</p>
          )}
        </>
      ) : (
        <>
          <h2 className="mv-titulo">{dia.titulo}</h2>

          {dia.tipo === 'destacado' && (
            <blockquote className="mv-cita">{dia.destacado}</blockquote>
          )}

          {dia.tipo === 'dos-columnas' && (
            <div className="mv-columnas">
              {[dia.izquierda, dia.derecha].map((col, i) => col && (
                <div className="mv-columna" key={i}>
                  <h3>{col.titulo}</h3>
                  <ul>{col.puntos.map((p, j) => <li key={j}>{p}</li>)}</ul>
                </div>
              ))}
            </div>
          )}

          {dia.tipo === 'pregunta' && (
            <>
              {/* El estímulo va arriba de las opciones: sin esto la pregunta
                  no se entiende proyectada. */}
              {dia.puntos.length > 0 && (
                <p className="mv-estimulo">{dia.puntos.join(' ')}</p>
              )}
              <ol className="mv-opciones">
                {(dia.opciones ?? []).map((op, i) => (
                  <li key={i}><span className="mv-letra">{String.fromCharCode(65 + i)}</span>{op}</li>
                ))}
              </ol>
            </>
          )}

          {(dia.tipo === 'puntos' || dia.tipo === 'cierre') && dia.puntos.length > 0 && (
            <ul className="mv-puntos">{dia.puntos.map((p, i) => <li key={i}>{p}</li>)}</ul>
          )}
        </>
      )}

      {pie && dia.tipo !== 'portada' && <span className="mv-pie">{pie}</span>}
    </div>
  );
}

export default function MazoVisor({ mazo, notas = false, grande = false, pie }: {
  mazo: Mazo;
  /** Ofrecer las notas del docente. Nunca para estudiantes ni en el proyector. */
  notas?: boolean;
  /** Letra más grande, para proyectar. */
  grande?: boolean;
  pie?: string;
}) {
  const [i, setI] = useState(0);
  const [verNotas, setVerNotas] = useState(false);
  const total = mazo.diapositivas.length;
  const dia = mazo.diapositivas[Math.min(i, total - 1)];

  const ir = useCallback((d: number) => setI(x => Math.max(0, Math.min(total - 1, x + d))), [total]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (enCampoDeTexto(e.target)) return;
      if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ') { e.preventDefault(); ir(1); }
      if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); ir(-1); }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [ir]);

  if (!dia) return null;

  const d = disenoDe(mazo.diseno ?? DISENO_PREDETERMINADO);
  const estilo = varsDiseno(d, dia.tipo === 'pregunta');

  return (
    <div className={`mv ${grande ? 'mv-grande' : ''}`} style={estilo}>
      <Lamina dia={dia} pie={pie} />

      <div className="mv-barra">
        <button className="mv-nav" onClick={() => ir(-1)} disabled={i === 0} aria-label="Anterior">
          <ChevronLeft size={18} />
        </button>
        <span className="mv-contador">{i + 1} / {total}</span>
        <button className="mv-nav" onClick={() => ir(1)} disabled={i >= total - 1} aria-label="Siguiente">
          <ChevronRight size={18} />
        </button>

        {notas && dia.nota && (
          <button
            className={`mv-notas-btn ${verNotas ? 'on' : ''}`}
            onClick={() => setVerNotas(v => !v)}
          >
            <StickyNote size={15} /> {verNotas ? 'Ocultar nota' : 'Nota'}
          </button>
        )}
      </div>

      {notas && verNotas && dia.nota && (
        <p className="mv-nota" role="note">{dia.nota}</p>
      )}
    </div>
  );
}
