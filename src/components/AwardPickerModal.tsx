/**
 * Selector de medalla: el docente (o directivo) elige una medalla del
 * catálogo, escribe una dedicatoria opcional y la otorga. La medalla
 * queda en el perfil de quien la recibe.
 */

import { useState } from 'react';
import { X, Medal, Send } from 'lucide-react';
import './Modals.css';
import './AwardPickerModal.css';

interface Props {
  title: string;
  recipientName: string;
  catalog: Record<string, { emoji: string; label: string; description: string }>;
  onClose: () => void;
  onGive: (badgeCode: string, message: string) => Promise<void>;
}

export default function AwardPickerModal({ title, recipientName, catalog, onClose, onGive }: Props) {
  const [selected, setSelected] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const give = async () => {
    if (!selected) return;
    setBusy(true);
    setError(null);
    try {
      await onGive(selected, message);
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo otorgar la medalla.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="em-modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="em-modal award-modal">
        <div className="em-modal-header">
          <h3><Medal size={17} className="text-warning" /> {title}</h3>
          <button className="btn-icon" onClick={onClose}><X size={18} /></button>
        </div>

        <div className="em-modal-body">
          {done ? (
            <div className="award-done animate-scale">
              <span className="award-done-emoji">{selected ? catalog[selected]?.emoji : '🏅'}</span>
              <h4>¡Medalla otorgada!</h4>
              <p className="text-sm text-secondary">
                {recipientName} va a ver "{selected ? catalog[selected]?.label : ''}" en su perfil.
              </p>
              <button className="btn btn-primary btn-sm" onClick={onClose}>Listo</button>
            </div>
          ) : (
            <>
              <p className="text-sm text-secondary award-for">Para <strong>{recipientName}</strong>:</p>
              <div className="award-grid">
                {Object.entries(catalog).map(([code, meta]) => (
                  <button
                    key={code}
                    type="button"
                    className={`award-option ${selected === code ? 'selected' : ''}`}
                    onClick={() => setSelected(code)}
                    title={meta.description}
                  >
                    <span className="award-emoji">{meta.emoji}</span>
                    <span className="award-label">{meta.label}</span>
                    <span className="award-desc">{meta.description}</span>
                  </button>
                ))}
              </div>
              <div className="award-message">
                <label className="brief-label" htmlFor="award-msg">Dedicatoria (opcional)</label>
                <input
                  id="award-msg"
                  className="brief-input"
                  type="text"
                  placeholder="Ej: por cómo explicaste el ejercicio 3 😉"
                  value={message}
                  onChange={e => setMessage(e.target.value)}
                  maxLength={200}
                />
              </div>
              {error && <div className="em-error">{error}</div>}
            </>
          )}
        </div>

        {!done && (
          <div className="em-modal-footer">
            <button className="btn btn-outline btn-sm" onClick={onClose}>Cancelar</button>
            <button className="btn btn-primary btn-sm" disabled={!selected || busy} onClick={give}>
              <Send size={14} /> {busy ? 'Otorgando…' : 'Otorgar medalla'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
