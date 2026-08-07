/**
 * Check-in emocional sin fricción: una fila de emojis, opcionalmente un
 * comentario. Siempre se puede saltear — nunca bloquea la tarea.
 */

import { useState } from 'react';
import { FEELING_META, type CheckinFeeling } from '../types';
import './CheckinCard.css';

interface Props {
  title: string;
  subtitle?: string;
  withComment?: boolean;
  onPick: (feeling: CheckinFeeling, comment?: string) => void;
  onSkip: () => void;
}

const FEELINGS = Object.entries(FEELING_META) as [CheckinFeeling, typeof FEELING_META[CheckinFeeling]][];

export default function CheckinCard({ title, subtitle, withComment = false, onPick, onSkip }: Props) {
  const [selected, setSelected] = useState<CheckinFeeling | null>(null);
  const [comment, setComment] = useState('');

  const handleSelect = (f: CheckinFeeling) => {
    setSelected(f);
    if (!withComment) onPick(f);
  };

  return (
    <div className="checkin-card card animate-fade">
      <div className="checkin-head">
        <p className="checkin-title">{title}</p>
        {subtitle && <p className="checkin-subtitle">{subtitle}</p>}
      </div>
      <div className="checkin-emojis">
        {FEELINGS.map(([key, meta]) => (
          <button
            key={key}
            className={`checkin-emoji ${selected === key ? 'selected' : ''}`}
            onClick={() => handleSelect(key)}
            title={meta.label}
          >
            <span className="checkin-emoji-icon">{meta.emoji}</span>
            <span className="checkin-emoji-label">{meta.label}</span>
          </button>
        ))}
      </div>
      {withComment && selected && (
        <div className="checkin-comment animate-fade">
          <textarea
            className="form-textarea w-full"
            rows={2}
            placeholder="¿Querés contar algo más? (opcional)"
            value={comment}
            onChange={e => setComment(e.target.value)}
          />
          <button className="btn btn-primary btn-sm" onClick={() => onPick(selected, comment)}>
            Enviar
          </button>
        </div>
      )}
      <button className="checkin-skip" onClick={onSkip}>Ahora no</button>
    </div>
  );
}
