/**
 * Revisión controlada del resultado IA (Laboratorio IA):
 * el docente edita el contenido generado ANTES de consolidarlo.
 *
 * Desde acá puede:
 *  - editar a mano (Markdown) con vista previa
 *  - pedirle a la IA un ajuste rápido (más breve, más simple, etc.)
 *  - consolidar: insertar en la clase, guardar como material de la
 *    Biblioteca, o publicar como actividad/evaluación para estudiantes.
 */

import { useState } from 'react';
import { X, PenLine, Eye, ArrowDownToLine, BookOpen, ClipboardList, Sparkles } from 'lucide-react';
import MarkdownRenderer from './MarkdownRenderer';
import './Modals.css';

const QUICK_ADJUSTMENTS = [
  'Hacela más breve',
  'Simplificá el lenguaje',
  'Subí la dificultad',
  'Agregá más ejemplos',
];

interface Props {
  initialContent: string;
  defaultTitle: string;
  canInsertInClass: boolean;
  className?: string;
  onClose: () => void;
  /** Consolidar: agrega el contenido editado a la clase seleccionada. */
  onInsertInClass: (content: string) => Promise<void>;
  /** Consolidar: crea un material de Biblioteca con el contenido editado. */
  onSaveAsMaterial: (content: string, title: string) => Promise<void>;
  /** Consolidar: abre el flujo de publicación de actividad con el contenido editado. */
  onPublish: (content: string) => void;
  /** Pide un ajuste a la IA (cierra el modal y manda el pedido al chat). */
  onAskAdjust: (instruction: string) => void;
}

export default function RefineResultModal({
  initialContent, defaultTitle, canInsertInClass, className,
  onClose, onInsertInClass, onSaveAsMaterial, onPublish, onAskAdjust,
}: Props) {
  const [content, setContent] = useState(initialContent);
  const [title, setTitle] = useState(defaultTitle);
  const [view, setView] = useState<'edit' | 'preview'>('preview');
  const [busy, setBusy] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const edited = content !== initialContent;

  const run = async (key: string, fn: () => Promise<void>, doneMsg: string) => {
    setBusy(key);
    setError(null);
    try {
      await fn();
      setDone(doneMsg);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar. Probá de nuevo.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="em-modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="em-modal em-modal-lg refine-modal">
        <div className="em-modal-header">
          <h3><PenLine size={17} className="text-ia-accent" /> Revisar antes de usar</h3>
          <button className="btn-icon" onClick={onClose}><X size={18} /></button>
        </div>

        <div className="em-modal-body refine-body">
          {done ? (
            <div className="refine-done animate-scale">
              <span className="refine-done-emoji">✅</span>
              <h4>{done}</h4>
              <button className="btn btn-primary btn-sm" onClick={onClose}>Listo</button>
            </div>
          ) : (
            <>
              <div className="refine-toolbar">
                <div className="mode-tabs">
                  <button className={`mode-tab ${view === 'preview' ? 'active' : ''}`} onClick={() => setView('preview')}>
                    <Eye size={14} /> Vista previa
                  </button>
                  <button className={`mode-tab ${view === 'edit' ? 'active' : ''}`} onClick={() => setView('edit')}>
                    <PenLine size={14} /> Editar
                  </button>
                </div>
                {edited && <span className="badge badge-warning">Editado por vos</span>}
              </div>

              {view === 'edit' ? (
                <textarea
                  className="form-textarea refine-textarea"
                  value={content}
                  onChange={e => setContent(e.target.value)}
                  spellCheck={false}
                />
              ) : (
                <div className="refine-preview">
                  <MarkdownRenderer content={content} />
                </div>
              )}

              <div className="refine-adjust">
                <span className="text-xs text-subtle"><Sparkles size={12} /> Pedile un ajuste a la IA:</span>
                {QUICK_ADJUSTMENTS.map(a => (
                  <button key={a} className="hint-chip" onClick={() => onAskAdjust(a)}>{a}</button>
                ))}
              </div>

              <div className="refine-title-row">
                <label className="brief-label" htmlFor="refine-title">Título (para material o actividad)</label>
                <input
                  id="refine-title"
                  className="brief-input"
                  type="text"
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  maxLength={120}
                />
              </div>

              {error && <div className="em-error">{error}</div>}
            </>
          )}
        </div>

        {!done && (
          <div className="em-modal-footer refine-footer">
            {canInsertInClass && (
              <button
                className="btn btn-outline btn-sm"
                disabled={busy !== null}
                onClick={() => run('insert', () => onInsertInClass(content), `Insertado en "${className}"`)}
              >
                <ArrowDownToLine size={14} /> {busy === 'insert' ? 'Insertando…' : 'Insertar en clase'}
              </button>
            )}
            <button
              className="btn btn-secondary btn-sm"
              disabled={busy !== null || !title.trim()}
              onClick={() => run('material', () => onSaveAsMaterial(content, title.trim()), 'Guardado en tu Biblioteca')}
            >
              <BookOpen size={14} /> {busy === 'material' ? 'Guardando…' : 'Guardar como material'}
            </button>
            <button
              className="btn btn-primary btn-sm"
              disabled={busy !== null}
              onClick={() => onPublish(content)}
            >
              <ClipboardList size={14} /> Publicar actividad
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
