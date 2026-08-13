/**
 * Visor de placas de estudio: tarjetas hojeables (mobile-first)
 * con descarga en PDF para imprimir o compartir por WhatsApp.
 */

import { useState } from 'react';
import { X, ChevronLeft, ChevronRight, Download, Layers } from 'lucide-react';
import { studyCardsToPdf } from '../lib/pdf';
import type { StudyCard } from '../types';
import './Modals.css';
import './StudyCardsViewer.css';

interface Props {
  cards: StudyCard[];
  title: string;
  subjectName?: string;
  onClose: () => void;
}

export default function StudyCardsViewer({ cards, title, subjectName, onClose }: Props) {
  const [index, setIndex] = useState(0);
  const card = cards[index];

  const prev = () => setIndex(i => Math.max(0, i - 1));
  const next = () => setIndex(i => Math.min(cards.length - 1, i + 1));

  if (!card) return null;

  return (
    <div
      className="em-modal-overlay"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      onKeyDown={e => { if (e.key === 'ArrowLeft') prev(); if (e.key === 'ArrowRight') next(); }}
      tabIndex={-1}
    >
      <div className="em-modal sc-modal">
        <div className="em-modal-header">
          <h3><Layers size={17} className="text-ia-accent" /> Placas — {title}</h3>
          <button className="btn-icon" onClick={onClose}><X size={18} /></button>
        </div>

        <div className="em-modal-body sc-body">
          <div className="sc-card" key={index}>
            <span className="sc-counter">{index + 1} / {cards.length}</span>
            <span className="sc-emoji">{card.emoji}</span>
            <h2 className="sc-title">{card.title}</h2>
            <p className="sc-text">{card.body}</p>
          </div>

          <div className="sc-nav">
            <button className="btn-icon sc-nav-btn" onClick={prev} disabled={index === 0} aria-label="Anterior">
              <ChevronLeft size={22} />
            </button>
            <div className="sc-dots">
              {cards.map((_, i) => (
                <button
                  key={i}
                  className={`sc-dot ${i === index ? 'active' : ''}`}
                  onClick={() => setIndex(i)}
                  aria-label={`Placa ${i + 1}`}
                />
              ))}
            </div>
            <button className="btn-icon sc-nav-btn" onClick={next} disabled={index === cards.length - 1} aria-label="Siguiente">
              <ChevronRight size={22} />
            </button>
          </div>
        </div>

        <div className="em-modal-footer">
          <button className="btn btn-outline btn-sm" onClick={() => studyCardsToPdf(cards, title, subjectName)}>
            <Download size={14} /> Descargar PDF
          </button>
          <button className="btn btn-primary btn-sm" onClick={onClose}>Cerrar</button>
        </div>
      </div>
    </div>
  );
}
