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
import './PresentationViewer.css';

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
      alert('No se pudo generar el PowerPoint. Intentá de nuevo.');
    } finally {
      setDownloading(false);
    }
  };

  const isQuestion = /pregunta/i.test(slide.title);

  return (
    <div className="pv-overlay">
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
