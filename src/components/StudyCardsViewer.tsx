/**
 * Visor de placas de estudio v2 (mobile-first).
 * Tres tipos de placa: concepto (leer), flashcard (dar vuelta para ver
 * la respuesta) y quiz (tocar una opción y recibir devolución al toque).
 * Compatible con placas viejas sin `type` (se tratan como concepto).
 */

import { useState } from 'react';
import { X, ChevronLeft, ChevronRight, Download, Layers, RotateCcw } from 'lucide-react';
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

const cardType = (c: StudyCard) => c.type ?? 'concept';

export default function StudyCardsViewer({ cards, title, subjectName, onClose }: Props) {
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  // respuestas del quiz por placa: índice elegido
  const [picked, setPicked] = useState<Record<number, number>>({});

  const card = cards[index];

  const goTo = (i: number) => {
    setIndex(Math.max(0, Math.min(cards.length - 1, i)));
    setFlipped(false);
  };
  const prev = () => goTo(index - 1);
  const next = () => goTo(index + 1);

  if (!card) return null;

  const kind = cardType(card);
  const chosen = picked[index];
  const answered = chosen !== undefined;

  // Puntaje del repaso (solo quiz respondidos)
  const quizTotal = cards.filter(c => cardType(c) === 'quiz').length;
  const quizOk = cards.reduce((acc, c, i) =>
    acc + (cardType(c) === 'quiz' && picked[i] === (c.correct_index ?? 0) ? 1 : 0), 0);
  const quizDone = Object.keys(picked).length;

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
          <div className="flex items-center gap-2">
            {quizTotal > 0 && quizDone > 0 && (
              <span className="sc-score" title="Quiz respondidos correctamente">
                🎯 {quizOk}/{quizDone}
              </span>
            )}
            <button className="btn-icon" aria-label="Cerrar" onClick={onClose}><X size={18} /></button>
          </div>
        </div>

        <div className="em-modal-body sc-body">
          <div className={`sc-card sc-kind-${kind}`} key={index}>
            <div className="sc-card-top">
              <span className="sc-counter">{index + 1} / {cards.length}</span>
              {card.tag && <span className="sc-tag">{card.tag}</span>}
            </div>

            {/* ── Concepto ── */}
            {kind === 'concept' && (
              <>
                {card.emoji && <span className="sc-emoji">{card.emoji}</span>}
                <h2 className="sc-title">{card.title}</h2>
                <p className="sc-text">{card.body}</p>
              </>
            )}

            {/* ── Flashcard: tocá para dar vuelta ── */}
            {kind === 'flashcard' && (
              <button className="sc-flip-area" onClick={() => setFlipped(v => !v)}>
                {!flipped ? (
                  <>
                    {card.emoji && <span className="sc-emoji">{card.emoji}</span>}
                    <h2 className="sc-title">{card.question}</h2>
                    <span className="sc-flip-hint"><RotateCcw size={13} /> Pensá la respuesta y tocá para dar vuelta</span>
                  </>
                ) : (
                  <>
                    <span className="sc-flip-label">Respuesta</span>
                    <p className="sc-text sc-answer">{card.answer}</p>
                    <span className="sc-flip-hint"><RotateCcw size={13} /> Tocá para volver a la pregunta</span>
                  </>
                )}
              </button>
            )}

            {/* ── Quiz: tocá una opción ── */}
            {kind === 'quiz' && (
              <>
                {card.emoji && <span className="sc-emoji sc-emoji-sm">{card.emoji}</span>}
                <h2 className="sc-title sc-title-quiz">{card.question}</h2>
                <div className="sc-options">
                  {(card.options ?? []).map((opt, i) => {
                    const correct = i === (card.correct_index ?? 0);
                    const cls = !answered ? '' : correct ? 'correct' : i === chosen ? 'wrong' : 'dim';
                    return (
                      <button
                        key={i}
                        className={`sc-option ${cls}`}
                        disabled={answered}
                        onClick={() => setPicked(prev => ({ ...prev, [index]: i }))}
                      >
                        <span className="sc-option-letter">{String.fromCharCode(65 + i)}</span>
                        <span>{opt}</span>
                      </button>
                    );
                  })}
                </div>
                {answered && (
                  <div className={`sc-feedback ${chosen === (card.correct_index ?? 0) ? 'ok' : 'no'}`}>
                    <strong>{chosen === (card.correct_index ?? 0) ? '¡Bien ahí! ✅' : 'No era esa 😅'}</strong>
                    {card.explanation && <p>{card.explanation}</p>}
                  </div>
                )}
              </>
            )}
          </div>

          <div className="sc-nav">
            <button className="btn-icon sc-nav-btn" onClick={prev} disabled={index === 0} aria-label="Anterior">
              <ChevronLeft size={22} />
            </button>
            <div className="sc-dots">
              {cards.map((c, i) => (
                <button
                  key={i}
                  className={`sc-dot sc-dot-${cardType(c)} ${i === index ? 'active' : ''} ${picked[i] !== undefined ? 'done' : ''}`}
                  onClick={() => goTo(i)}
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
