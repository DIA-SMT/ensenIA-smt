/**
 * Publicar contenido generado en el IA Lab como actividad para un curso.
 * Opcional: extraer preguntas autocorregibles con IA.
 */

import { useState } from 'react';
import { X, Send, Sparkles, Trash2, AlertCircle, CheckCircle, ListChecks } from 'lucide-react';
import { createActivity } from '../services/activities.service';
import { extractQuestions } from '../services/documents.service';
import type { ActivityQuestion, IAToolType } from '../types';
import './Modals.css';

interface Props {
  contentMd: string;
  sourceTool?: IAToolType | null;
  teacherId: string;
  schoolId: string;
  subjectId: string;
  courseId: string;
  subjectName: string;
  courseName: string;
  unitId?: string | null;
  classId?: string | null;
  defaultTitle: string;
  onClose: () => void;
  onPublished: () => void;
}

export default function PublishActivityModal(props: Props) {
  const [title, setTitle] = useState(props.defaultTitle);
  const [description, setDescription] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [points, setPoints] = useState<string>('10');
  const [questions, setQuestions] = useState<ActivityQuestion[]>([]);
  const [extracting, setExtracting] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  const handleExtract = async () => {
    setExtracting(true);
    setError('');
    try {
      const qs = await extractQuestions(props.contentMd);
      if (!qs.length) {
        setError('La IA no encontró preguntas en el contenido. Podés publicar igual con respuesta libre.');
      }
      setQuestions(qs);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error extrayendo preguntas.');
    } finally {
      setExtracting(false);
    }
  };

  const removeQuestion = (id: string) => setQuestions(prev => prev.filter(q => q.id !== id));

  const handlePublish = async () => {
    if (!title.trim()) { setError('Poné un título.'); return; }
    setPublishing(true);
    setError('');
    try {
      await createActivity({
        title: title.trim(),
        description: description.trim() || undefined,
        contentMd: props.contentMd,
        questions,
        subjectId: props.subjectId,
        courseId: props.courseId,
        teacherId: props.teacherId,
        schoolId: props.schoolId,
        unitId: props.unitId,
        classId: props.classId,
        sourceTool: props.sourceTool,
        dueDate: dueDate ? new Date(dueDate + 'T23:59:00').toISOString() : null,
        points: points ? Number(points) : null,
      });
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error publicando la actividad.');
    } finally {
      setPublishing(false);
    }
  };

  return (
    <div className="em-modal-overlay" onClick={e => { if (e.target === e.currentTarget && !publishing) props.onClose(); }}>
      <div className="em-modal">
        <div className="em-modal-header">
          <h3><Send size={17} className="text-cyan" /> Publicar actividad</h3>
          <button className="btn-icon" onClick={props.onClose}><X size={18} /></button>
        </div>

        <div className="em-modal-body">
          {done ? (
            <div className="em-processing">
              <CheckCircle size={40} className="text-success" />
              <p><strong>¡Actividad publicada!</strong></p>
              <p className="text-sm text-secondary">
                Los estudiantes de {props.courseName} ya la ven en su portal.
                Vas a poder seguir sus avances y su huella digital en <strong>Actividades</strong>.
              </p>
            </div>
          ) : (
            <>
              {error && <div className="em-error"><AlertCircle size={15} /> {error}</div>}

              <div className="em-preview-meta">
                <span className="badge badge-cyan">{props.subjectName}</span>
                <span className="badge badge-neutral">{props.courseName}</span>
                {props.sourceTool && <span className="badge badge-ia">Generado con IA</span>}
              </div>

              <div className="em-field">
                <label>Título de la actividad</label>
                <input type="text" value={title} onChange={e => setTitle(e.target.value)} placeholder="Ej: Cuestionario de vectores" />
              </div>

              <div className="em-field">
                <label>Descripción para los estudiantes (opcional)</label>
                <textarea rows={2} value={description} onChange={e => setDescription(e.target.value)} placeholder="Instrucciones breves..." />
              </div>

              <div className="em-row">
                <div className="em-field">
                  <label>Fecha límite (opcional)</label>
                  <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} />
                </div>
                <div className="em-field">
                  <label>Puntaje</label>
                  <input type="number" min="1" max="100" value={points} onChange={e => setPoints(e.target.value)} />
                </div>
              </div>

              <div className="em-field">
                <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span><ListChecks size={13} style={{ verticalAlign: -2 }} /> Cuestionario autocorregible</span>
                  <button className="btn btn-secondary btn-sm" onClick={handleExtract} disabled={extracting}>
                    {extracting ? 'Analizando...' : <><Sparkles size={14} /> {questions.length ? 'Regenerar' : 'Extraer preguntas con IA'}</>}
                  </button>
                </label>
                {questions.length === 0 && !extracting && (
                  <p className="em-hint">
                    Sin preguntas, la actividad se entrega con respuesta libre. Con preguntas de opción múltiple,
                    la corrección es automática y ves los resultados al instante.
                  </p>
                )}
                {questions.map(q => (
                  <div key={q.id} className="em-question">
                    <div className="em-q-body">
                      <div className="em-q-prompt">{q.prompt}</div>
                      {q.type === 'multiple_choice' && q.options && (
                        <div className="em-q-options">
                          {q.options.map((opt, i) => (
                            <span key={i} className={`em-q-option ${i === q.correct_index ? 'correct' : ''}`}>
                              {String.fromCharCode(65 + i)}. {opt} {i === q.correct_index ? '✓' : ''}
                            </span>
                          ))}
                        </div>
                      )}
                      {q.type === 'open' && <span className="text-xs text-subtle">Respuesta abierta (corrección manual)</span>}
                    </div>
                    <button className="btn-icon" title="Quitar" onClick={() => removeQuestion(q.id)}><Trash2 size={15} /></button>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        <div className="em-modal-footer">
          {done ? (
            <button className="btn btn-primary btn-sm" onClick={() => { props.onPublished(); props.onClose(); }}>Listo</button>
          ) : (
            <>
              <button className="btn btn-outline btn-sm" onClick={props.onClose}>Cancelar</button>
              <button className="btn btn-primary btn-sm" onClick={handlePublish} disabled={publishing}>
                {publishing ? 'Publicando...' : <><Send size={15} /> Publicar a {props.courseName}</>}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
