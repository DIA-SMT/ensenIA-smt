/**
 * Dar medallas durante la clase en vivo: a uno, a varios o a los que
 * acertaron. Las mismas medallas que desde la ficha del estudiante
 * (AWARD_META): suman XP y quedan en su perfil, y el celular de quien la
 * recibe la festeja en el momento.
 */

import { useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Medal, Send } from 'lucide-react';
import { giveStudentAwards } from '../services/awards.service';
import { AWARD_META, type Student } from '../types';
import '../pages/IALab.css';
import './Modals.css';
import './AwardPickerModal.css';
import './PremiarEnVivo.css';

export default function PremiarEnVivo({
  titulo, students, onlineIds, preseleccion, teacherId, subjectId, onClose, onListo,
}: {
  titulo: string;
  students: Student[];
  onlineIds: Set<string>;
  /** Quiénes vienen marcados (por ejemplo, los que acertaron). */
  preseleccion: string[];
  teacherId: string;
  subjectId: string;
  onClose: () => void;
  onListo: (cantidad: number, badgeCode: string) => void;
}) {
  const [medalla, setMedalla] = useState<string | null>(null);
  const [elegidos, setElegidos] = useState<Set<string>>(new Set(preseleccion));
  const [mensaje, setMensaje] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // Conectados primero: son los que están en el aula
  const lista = [...students].sort((a, b) =>
    Number(onlineIds.has(b.id)) - Number(onlineIds.has(a.id)) || a.lastName.localeCompare(b.lastName));

  const alternar = (id: string) => setElegidos(prev => {
    const n = new Set(prev);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });
  const marcar = (ids: string[]) => setElegidos(new Set(ids));

  const dar = async () => {
    if (!medalla || elegidos.size === 0 || busy) return;
    setBusy(true);
    setError('');
    try {
      const n = await giveStudentAwards({
        studentIds: [...elegidos], teacherId, subjectId, badgeCode: medalla, message: mensaje,
      });
      onListo(n, medalla);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo dar la medalla.');
      setBusy(false);
    }
  };

  // En el body: dentro de la clase en vivo un ancestro con transform lo
  // dejaba debajo de las barras de la app
  return createPortal(
    <div className="em-modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="em-modal award-modal pev" role="dialog" aria-labelledby="pev-titulo">
        <div className="em-modal-header">
          <h3 id="pev-titulo"><Medal size={17} className="text-warning" /> {titulo}</h3>
          <button className="btn-icon" onClick={onClose} aria-label="Cerrar"><X size={18} /></button>
        </div>

        <div className="em-modal-body">
          <div className="award-grid" role="radiogroup" aria-label="Medalla">
            {Object.entries(AWARD_META).map(([code, meta]) => (
              <button key={code} type="button" role="radio" aria-checked={medalla === code}
                className={`award-option ${medalla === code ? 'selected' : ''}`}
                onClick={() => setMedalla(code)} title={meta.description}>
                <span className="award-emoji">{meta.emoji}</span>
                <span className="award-label">{meta.label}</span>
                <span className="award-desc">{meta.description}</span>
              </button>
            ))}
          </div>

          <div className="pev-quienes">
            <div className="pev-quienes-head">
              <span className="brief-label">Para quién ({elegidos.size})</span>
              <div className="pev-atajos">
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => marcar(students.filter(s => onlineIds.has(s.id)).map(s => s.id))}>Conectados</button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => marcar(students.map(s => s.id))}>Todo el curso</button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => marcar([])}>Nadie</button>
              </div>
            </div>
            <div className="pev-lista">
              {lista.map(s => (
                <label key={s.id} className={`pev-alumno ${elegidos.has(s.id) ? 'on' : ''}`}>
                  <input type="checkbox" checked={elegidos.has(s.id)} onChange={() => alternar(s.id)} />
                  <span className={`cv-person-dot ${onlineIds.has(s.id) ? 'on' : ''}`} aria-hidden="true" />
                  {s.firstName} {s.lastName}
                </label>
              ))}
              {lista.length === 0 && <p className="text-sm text-secondary">Todavía no hay estudiantes en el curso.</p>}
            </div>
          </div>

          <div className="award-message">
            <label className="brief-label" htmlFor="pev-msg">Dedicatoria (opcional)</label>
            <input id="pev-msg" className="brief-input" type="text" maxLength={200} value={mensaje}
              placeholder="Ej: por cómo explicaron la consigna 2 😉" onChange={e => setMensaje(e.target.value)} />
          </div>
          {error && <div className="em-error" role="alert">{error}</div>}
        </div>

        <div className="em-modal-footer">
          <button className="btn btn-outline btn-sm" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary btn-sm" disabled={!medalla || elegidos.size === 0 || busy} onClick={dar}>
            <Send size={14} />
            {busy ? 'Dando…' : elegidos.size <= 1 ? 'Dar medalla' : `Dar a ${elegidos.size}`}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
