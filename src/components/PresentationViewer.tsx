/**
 * EstudIA — Visor de presentaciones
 *
 * Muestra las diapositivas generadas por la IA en pantalla completa,
 * listas para proyectar: navegación con flechas o teclado, notas del
 * docente ocultables y descarga como PowerPoint real (.pptx).
 */

import { useState, useEffect, useCallback } from 'react';
import { X, ChevronLeft, ChevronRight, StickyNote, Download, Presentation } from 'lucide-react';
import type { ParsedPresentation } from '../lib/presentation';
import { exportPresentationPptx } from '../lib/pptx';
import { avisar } from './ui/avisar';
import './PresentationViewer.css';

const esPregunta = (titulo: string) => /pregunta/i.test(titulo);

/** Teclas de una diapositiva a otra, salvo que se esté escribiendo en un campo. */
function esCampoDeTexto(t: EventTarget | null): boolean {
  return t instanceof HTMLElement && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName));
}

/**
 * Las diapositivas dentro de otra pantalla (el visor de materiales, la
 * clase en vivo, el proyector): una por vez, con anterior y siguiente.
 * Las notas del docente solo se muestran si `notas` está (nunca a los
 * estudiantes ni en el proyector).
 */
export function MazoDiapositivas({ presentation, notas = false, grande = false, pie }: {
  presentation: ParsedPresentation;
  /** Ofrecer las notas para el docente (ocultas de entrada). */
  notas?: boolean;
  /** Letra grande, para el proyector del aula. */
  grande?: boolean;
  /** Texto chico al pie de cada diapositiva (materia · curso). */
  pie?: string;
}) {
  const [index, setIndex] = useState(0);
  const [verNotas, setVerNotas] = useState(false);
  const total = presentation.slides.length;
  const slide = presentation.slides[Math.min(index, total - 1)];

  const anterior = useCallback(() => setIndex(i => Math.max(0, i - 1)), []);
  const siguiente = useCallback(() => setIndex(i => Math.min(total - 1, i + 1)), [total]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || esCampoDeTexto(e.target)) return;
      if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); anterior(); }
      if (e.key === 'ArrowRight' || e.key === 'PageDown') { e.preventDefault(); siguiente(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [anterior, siguiente]);

  if (!slide) return null;

  return (
    <section
      className={`pv-mazo ${grande ? 'pv-mazo-grande' : ''}`}
      aria-roledescription="presentación"
      aria-label={presentation.title}
    >
      <div
        className={`pv-mazo-slide ${esPregunta(slide.title) ? 'pv-slide-question' : ''}`}
        aria-roledescription="diapositiva"
        aria-label={`Diapositiva ${index + 1} de ${total}`}
        aria-live="polite"
      >
        <h3 className="pv-mazo-titulo">{slide.title}</h3>
        {slide.bullets.length > 0 && (
          <ul className="pv-mazo-puntos">
            {slide.bullets.map((b, i) => <li key={i}>{b}</li>)}
          </ul>
        )}
        {pie && <p className="pv-mazo-pie">{pie}</p>}
      </div>

      <div className="pv-mazo-nav">
        <button type="button" className="btn btn-secondary" onClick={anterior} disabled={index === 0}>
          <ChevronLeft size={18} aria-hidden="true" /> <span className="pv-mazo-nav-txt">Anterior</span>
        </button>
        <span className="pv-mazo-contador" aria-hidden="true">{index + 1} / {total}</span>
        <button type="button" className="btn btn-primary" onClick={siguiente} disabled={index === total - 1}>
          <span className="pv-mazo-nav-txt">Siguiente</span> <ChevronRight size={18} aria-hidden="true" />
        </button>
      </div>

      {notas && slide.note && (
        <div className="pv-mazo-notas">
          <button type="button" className="btn btn-ghost btn-sm" aria-expanded={verNotas} onClick={() => setVerNotas(v => !v)}>
            <StickyNote size={14} aria-hidden="true" /> {verNotas ? 'Ocultar la nota para vos' : 'Ver la nota para vos'}
          </button>
          {verNotas && <p>{slide.note}</p>}
        </div>
      )}
    </section>
  );
}

interface PresentationViewerProps {
  presentation: ParsedPresentation;
  subjectName?: string;
  courseName?: string;
  teacherName?: string;
  onClose: () => void;
}

export default function PresentationViewer({
  presentation, subjectName, courseName, teacherName, onClose,
}: PresentationViewerProps) {
  const [index, setIndex] = useState(0);
  const [showNotes, setShowNotes] = useState(true);
  const [downloading, setDownloading] = useState(false);

  const total = presentation.slides.length;
  const slide = presentation.slides[index];

  const goPrev = useCallback(() => setIndex(i => Math.max(0, i - 1)), []);
  const goNext = useCallback(() => setIndex(i => Math.min(total - 1, i + 1)), [total]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') goPrev();
      if (e.key === 'ArrowRight' || e.key === ' ') goNext();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, goPrev, goNext]);

  const handleDownload = async () => {
    if (downloading) return;
    setDownloading(true);
    try {
      await exportPresentationPptx(presentation, { subjectName, courseName, teacherName });
    } catch (err) {
      console.error('Error exportando PPTX:', err);
      avisar.error('No se pudo generar el PowerPoint.', 'Probá de nuevo en un rato.');
    } finally {
      setDownloading(false);
    }
  };

  const isQuestion = esPregunta(slide.title);

  return (
    <div className="pv-overlay" role="dialog" aria-label={`Presentación: ${presentation.title}`}>
      {/* Barra superior */}
      <div className="pv-topbar">
        <div className="pv-title">
          <Presentation size={16} />
          <span>{presentation.title}</span>
        </div>
        <div className="pv-topbar-actions">
          <button
            className={`pv-btn ${showNotes ? 'active' : ''}`}
            onClick={() => setShowNotes(v => !v)}
            title="Mostrar u ocultar las notas del docente (ocultalas al proyectar)"
          >
            <StickyNote size={15} /> Notas
          </button>
          <button className="pv-btn" onClick={handleDownload} disabled={downloading} title="Descargar como PowerPoint">
            <Download size={15} /> {downloading ? 'Generando...' : 'PowerPoint'}
          </button>
          <button className="pv-btn pv-close" onClick={onClose} title="Cerrar (Esc)">
            <X size={17} />
          </button>
        </div>
      </div>

      {/* Diapositiva */}
      <div className="pv-stage">
        <button className="pv-nav" onClick={goPrev} disabled={index === 0} aria-label="Anterior">
          <ChevronLeft size={26} />
        </button>

        <div className={`pv-slide ${isQuestion ? 'pv-slide-question' : ''}`}>
          <h2 className="pv-slide-title">{slide.title}</h2>
          {slide.bullets.length > 0 && (
            <ul className="pv-slide-bullets">
              {slide.bullets.map((b, i) => <li key={i}>{b}</li>)}
            </ul>
          )}
          <div className="pv-slide-footer">
            <span>{[subjectName, courseName].filter(Boolean).join(' · ')}</span>
            <span>SMT EstudIA</span>
          </div>
        </div>

        <button className="pv-nav" onClick={goNext} disabled={index === total - 1} aria-label="Siguiente">
          <ChevronRight size={26} />
        </button>
      </div>

      {/* Notas del docente */}
      {showNotes && slide.note && (
        <div className="pv-notes">
          <StickyNote size={14} />
          <p><strong>Para vos:</strong> {slide.note}</p>
        </div>
      )}

      {/* Progreso */}
      <div className="pv-progress">
        <span className="pv-counter">{index + 1} / {total}</span>
        <div className="pv-dots">
          {presentation.slides.map((_, i) => (
            <button
              key={i}
              className={`pv-dot ${i === index ? 'active' : ''}`}
              onClick={() => setIndex(i)}
              aria-label={`Diapositiva ${i + 1}`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
