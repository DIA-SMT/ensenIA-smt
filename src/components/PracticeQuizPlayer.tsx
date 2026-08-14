/**
 * Player de práctica gamificada (Modo Estudio): overlay full-screen,
 * una pregunta por vez con feedback formativo inmediato (por qué la
 * correcta es correcta), pista opcional, barra de progreso y pantalla
 * final con XP y logros nuevos.
 *
 * El XP real lo calcula un trigger en Postgres; acá solo registramos
 * score/total. Si no hay conexión, el intento queda en la cola offline.
 */

import { useState } from 'react';
import { X, Lightbulb, ChevronRight, Sparkles, Trophy, WifiOff } from 'lucide-react';
import { recordPracticeAttemptResilient } from '../services/offline-queue.service';
import { getStudentBadges } from '../services/practice.service';
import { BADGE_META, type BadgeCode, type PracticeAttempt, type PracticeQuestion } from '../types';
import './PracticeQuizPlayer.css';

interface Props {
  questions: PracticeQuestion[];
  materialTitle: string;
  subjectName?: string;
  studentId: string;
  materialId: string;
  onClose: () => void;
  /** Se llama al terminar (attempt null = quedó encolado offline). */
  onFinished?: (attempt: PracticeAttempt | null) => void;
}

export default function PracticeQuizPlayer({
  questions, materialTitle, subjectName, studentId, materialId, onClose, onFinished,
}: Props) {
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [showHint, setShowHint] = useState(false);
  const [correctCount, setCorrectCount] = useState(0);
  const [finished, setFinished] = useState(false);
  const [saving, setSaving] = useState(false);
  const [attempt, setAttempt] = useState<PracticeAttempt | null>(null);
  const [queued, setQueued] = useState(false);
  const [newBadges, setNewBadges] = useState<BadgeCode[]>([]);

  const q = questions[index];
  const answered = selected !== null;
  const isCorrect = answered && selected === q?.correct_index;
  const isLast = index === questions.length - 1;

  const pick = (oi: number) => {
    if (answered) return;
    setSelected(oi);
    if (oi === q.correct_index) setCorrectCount(c => c + 1);
  };

  const next = async () => {
    if (!isLast) {
      setIndex(i => i + 1);
      setSelected(null);
      setShowHint(false);
      return;
    }
    // Última pregunta: registrar el intento
    setSaving(true);
    const score = correctCount; // ya incluye esta pregunta (pick sumó antes)
    try {
      let before: BadgeCode[] = [];
      try {
        before = (await getStudentBadges(studentId)).map(b => b.code);
      } catch { /* offline: sin diff de logros */ }

      const saved = await recordPracticeAttemptResilient({
        studentId, materialId, score, total: questions.length,
      });
      setAttempt(saved);
      setQueued(saved === null);

      if (saved) {
        try {
          const after = (await getStudentBadges(studentId)).map(b => b.code);
          setNewBadges(after.filter(c => !before.includes(c)));
        } catch { /* sin diff */ }
      }
      onFinished?.(saved);
    } catch (err) {
      console.error('No se pudo registrar la práctica:', err);
    } finally {
      setSaving(false);
      setFinished(true);
    }
  };

  if (!q) return null;

  // ── Pantalla final ──
  if (finished) {
    const pct = Math.round((correctCount / questions.length) * 100);
    return (
      <div className="pq-overlay">
        <div className="pq-panel pq-final animate-scale">
          <span className="pq-final-emoji">{pct === 100 ? '🎉' : pct >= 60 ? '💪' : '📚'}</span>
          <h2>{pct === 100 ? '¡Impecable!' : pct >= 60 ? '¡Muy bien!' : '¡Buen intento!'}</h2>
          <p className="text-secondary">{materialTitle}{subjectName ? ` · ${subjectName}` : ''}</p>

          <div className="sp-score-box pq-final-score">
            <span className="sp-score-num">{correctCount}/{questions.length}</span>
            <span className="sp-score-label">respuestas correctas</span>
          </div>

          {attempt && (
            <div className="pq-xp animate-in">
              <Sparkles size={18} /> +{attempt.xpEarned} XP
            </div>
          )}
          {queued && (
            <p className="pq-queued"><WifiOff size={14} /> Tu práctica se guarda cuando vuelva la conexión.</p>
          )}

          {newBadges.length > 0 && (
            <div className="pq-badges animate-in">
              <h4><Trophy size={15} /> ¡Logro{newBadges.length > 1 ? 's' : ''} desbloqueado{newBadges.length > 1 ? 's' : ''}!</h4>
              {newBadges.map(code => (
                <div key={code} className="pq-badge-row">
                  <span className="pq-badge-emoji">{BADGE_META[code].emoji}</span>
                  <div>
                    <strong>{BADGE_META[code].label}</strong>
                    <p className="text-xs text-secondary">{BADGE_META[code].description}</p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {pct < 100 && (
            <p className="text-sm text-secondary" style={{ maxWidth: 360 }}>
              Releé las explicaciones de las que fallaste y volvé a intentarlo: así se aprende de verdad.
            </p>
          )}

          <button className="btn btn-primary" onClick={onClose}>Listo</button>
        </div>
      </div>
    );
  }

  // ── Pregunta actual ──
  return (
    <div className="pq-overlay">
      <div className="pq-panel">
        <div className="pq-header">
          <div className="pq-progress-track">
            <div className="pq-progress-fill" style={{ width: `${((index + (answered ? 1 : 0)) / questions.length) * 100}%` }} />
          </div>
          <span className="pq-counter">{index + 1} / {questions.length}</span>
          <button className="btn-icon" onClick={onClose} aria-label="Cerrar"><X size={18} /></button>
        </div>

        <div className="pq-body" key={index}>
          <p className="pq-material text-xs text-subtle">{materialTitle}</p>
          <h3 className="pq-prompt">{q.prompt}</h3>

          <div className="sp-options">
            {q.options.map((opt, oi) => {
              let cls = 'sp-option pq-option';
              if (answered) {
                if (oi === q.correct_index) cls += ' pq-correct';
                else if (oi === selected) cls += ' pq-wrong';
                else cls += ' pq-disabled';
              }
              return (
                <button key={oi} className={cls} onClick={() => pick(oi)} disabled={answered}>
                  <span className="sp-option-letter">{String.fromCharCode(65 + oi)}</span>
                  <span>{opt}</span>
                </button>
              );
            })}
          </div>

          {!answered && q.hint && (
            showHint ? (
              <div className="pq-hint animate-in"><Lightbulb size={15} /> {q.hint}</div>
            ) : (
              <button className="btn btn-ghost btn-sm pq-hint-btn" onClick={() => setShowHint(true)}>
                <Lightbulb size={14} /> Pedir una pista
              </button>
            )
          )}

          {answered && (
            <div className={`pq-feedback animate-in ${isCorrect ? 'ok' : 'nope'}`}>
              <strong>{isCorrect ? '✅ ¡Correcto!' : '❌ No era esa…'}</strong>
              <p>{q.explanation}</p>
            </div>
          )}
        </div>

        <div className="pq-footer">
          {answered && (
            <button className="btn btn-primary" onClick={next} disabled={saving}>
              {saving ? 'Guardando…' : isLast ? 'Ver resultado' : 'Siguiente'} <ChevronRight size={16} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
