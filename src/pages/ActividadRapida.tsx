/**
 * ⚡ Actividad Rápida — pensada para el celular del docente.
 *
 * Un solo recorrido vertical: materia → tema → la IA genera (o escribís)
 * → cuestionario opcional → publicar. Sin árbol de planificación, sin
 * paneles: lo mínimo para crear una actividad buena en 60 segundos.
 * Para la planificación profunda está el Laboratorio IA en la compu.
 */

import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import {
  Zap, Sparkles, Send, Trash2, PenLine, Square, CheckCircle, AlertCircle, ListChecks,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { getSubjects } from '../services/subjects.service';
import { getOrCreateSession, saveUserMessage } from '../services/chat-history.service';
import { streamChat } from '../services/ia-chat.service';
import { extractQuestions } from '../services/documents.service';
import { createActivity } from '../services/activities.service';
import MarkdownRenderer from '../components/MarkdownRenderer';
import type { Subject, ActivityQuestion, SubjectAssignment } from '../types';
import './ActividadRapida.css';
import '../components/Modals.css';

type DueOption = 'none' | 'tomorrow' | 'week';

export default function ActividadRapida() {
  const { user } = useAuth();
  const [subjectsMap, setSubjectsMap] = useState<Record<string, Subject>>({});
  const [assignmentIdx, setAssignmentIdx] = useState(0);

  const [topic, setTopic] = useState('');
  const [content, setContent] = useState('');
  const [editing, setEditing] = useState(false);
  const [generating, setGenerating] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const [questions, setQuestions] = useState<ActivityQuestion[]>([]);
  const [extracting, setExtracting] = useState(false);

  const [due, setDue] = useState<DueOption>('week');
  const [points, setPoints] = useState('10');
  const [publishing, setPublishing] = useState(false);
  const [publishedId, setPublishedId] = useState<string | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    getSubjects().then(subjects => {
      const map: Record<string, Subject> = {};
      subjects.forEach(s => { map[s.id] = s; });
      setSubjectsMap(map);
    }).catch(console.error);
    return () => abortRef.current?.abort();
  }, []);

  if (!user) return null;

  const assignments = user.subjects ?? [];
  const assignment: SubjectAssignment | undefined = assignments[assignmentIdx];
  const subjectName = assignment ? (subjectsMap[assignment.subjectId]?.name ?? '') : '';

  // ── Generar con IA (streaming) ──
  const handleGenerate = async () => {
    if (!topic.trim() || !assignment || generating) return;
    setGenerating(true);
    setError('');
    setContent('');
    setEditing(false);
    setQuestions([]);

    try {
      const session = await getOrCreateSession(user.id, null, {
        subjectId: assignment.subjectId,
        courseId: assignment.courseId,
        title: 'Actividad rápida',
      });
      const prompt = `Generá una actividad BREVE y lista para usar sobre: "${topic.trim()}". `
        + `Formato: un título atractivo, una introducción de 2-3 líneas para los estudiantes, y 3-4 consignas concretas. `
        + `Que se pueda resolver en 20-30 minutos. Directo al grano, sin secciones de materiales ni criterios.`;
      saveUserMessage(session.id, prompt, 'act').catch(() => {});

      const controller = new AbortController();
      abortRef.current = controller;
      let full = '';
      await streamChat(
        [{ role: 'user', content: prompt }],
        {
          subjectName,
          courseName: assignment.courseName,
          educationLevel: undefined,
        },
        { sessionId: session.id, tool: 'act' },
        {
          onToken: t => { full += t; setContent(full); },
          onDone: () => { setGenerating(false); abortRef.current = null; },
          onError: e => { setError(e.message); setGenerating(false); abortRef.current = null; },
        },
        controller.signal,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error generando la actividad.');
      setGenerating(false);
    }
  };

  const handleStop = () => {
    abortRef.current?.abort();
    setGenerating(false);
  };

  // ── Cuestionario ──
  const handleQuestions = async () => {
    if (!content.trim()) return;
    setExtracting(true);
    setError('');
    try {
      const qs = await extractQuestions(content);
      setQuestions(qs);
      if (!qs.length) setError('La IA no generó preguntas para este contenido.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error generando preguntas.');
    } finally {
      setExtracting(false);
    }
  };

  // ── Publicar ──
  const dueDateIso = (): string | null => {
    if (due === 'none') return null;
    const d = new Date();
    d.setDate(d.getDate() + (due === 'tomorrow' ? 1 : 7));
    d.setHours(23, 59, 0, 0);
    return d.toISOString();
  };

  const handlePublish = async () => {
    if (!assignment || !content.trim()) return;
    setPublishing(true);
    setError('');
    try {
      const firstLine = content.split('\n').find(l => l.trim())?.replace(/^#+\s*/, '').replace(/\*\*/g, '').trim();
      const activity = await createActivity({
        title: (topic.trim() || firstLine || 'Actividad rápida').slice(0, 120),
        contentMd: content,
        questions,
        subjectId: assignment.subjectId,
        courseId: assignment.courseId,
        teacherId: user.id,
        schoolId: user.schoolId,
        sourceTool: 'act',
        dueDate: dueDateIso(),
        points: points ? Number(points) : null,
      });
      setPublishedId(activity.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error publicando.');
    } finally {
      setPublishing(false);
    }
  };

  // ── Publicada ──
  if (publishedId) {
    return (
      <div className="ar-container animate-in">
        <div className="card ar-done">
          <CheckCircle size={44} className="text-success" />
          <h2>¡Actividad publicada! ⚡</h2>
          <p className="text-secondary">
            Los estudiantes de <strong>{assignment?.courseName}</strong> ya la ven en su portal.
          </p>
          <div className="ar-done-actions">
            <Link to={`/actividades/${publishedId}`} className="btn btn-primary">Ver resultados</Link>
            <button
              className="btn btn-outline"
              onClick={() => { setPublishedId(null); setTopic(''); setContent(''); setQuestions([]); }}
            >
              Crear otra
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="ar-container animate-in">
      <header className="ar-header">
        <h2><Zap size={20} className="text-warning" /> Actividad rápida</h2>
        <p className="text-secondary text-sm">
          Elegí el curso, escribí el tema, y en un minuto está publicada.
          Para planificar en profundidad, usá el <Link to="/ia-lab">Laboratorio IA</Link>.
        </p>
      </header>

      {error && <div className="em-error"><AlertCircle size={15} /> {error}</div>}

      {/* 1. Curso */}
      <section className="ar-step card">
        <h3><span className="ar-step-num">1</span> ¿Para qué curso?</h3>
        <div className="ar-chips">
          {assignments.map((a, i) => (
            <button
              key={i}
              className={`ar-chip ${assignmentIdx === i ? 'selected' : ''}`}
              onClick={() => setAssignmentIdx(i)}
            >
              {subjectsMap[a.subjectId]?.name ?? 'Materia'} · {a.courseName}
            </button>
          ))}
        </div>
      </section>

      {/* 2. Tema + generación */}
      <section className="ar-step card">
        <h3><span className="ar-step-num">2</span> ¿Sobre qué tema?</h3>
        <input
          className="ar-topic-input"
          type="text"
          placeholder='Ej: "suma de vectores con ejemplos de la vida real"'
          value={topic}
          onChange={e => setTopic(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') handleGenerate(); }}
        />
        <div className="ar-gen-actions">
          {generating ? (
            <button className="btn btn-outline w-full" onClick={handleStop}>
              <Square size={15} /> Detener
            </button>
          ) : (
            <button className="btn btn-primary w-full" onClick={handleGenerate} disabled={!topic.trim() || !assignment}>
              <Sparkles size={16} /> {content ? 'Regenerar con IA' : 'Generar con IA'}
            </button>
          )}
        </div>

        {(content || generating) && (
          <div className="ar-preview">
            <div className="ar-preview-head">
              <span className="text-xs text-subtle">{generating ? 'Generando...' : 'Podés editarla antes de publicar'}</span>
              {!generating && (
                <button className="btn btn-outline btn-sm" onClick={() => setEditing(v => !v)}>
                  <PenLine size={13} /> {editing ? 'Vista previa' : 'Editar'}
                </button>
              )}
            </div>
            {editing ? (
              <textarea
                className="form-textarea w-full"
                rows={12}
                value={content}
                onChange={e => setContent(e.target.value)}
              />
            ) : (
              <div className="ar-preview-md">
                <MarkdownRenderer content={content} />
              </div>
            )}
          </div>
        )}

        {!content && !generating && (
          <button className="ar-manual-link" onClick={() => { setEditing(true); setContent(`## ${topic || 'Actividad'}\n\n`); }}>
            ...o escribila vos mismo/a
          </button>
        )}
      </section>

      {/* 3. Cuestionario opcional */}
      {content && !generating && (
        <section className="ar-step card">
          <h3><span className="ar-step-num">3</span> ¿Cuestionario autocorregible? <span className="text-xs text-subtle">(opcional)</span></h3>
          {questions.length === 0 ? (
            <button className="btn btn-secondary w-full" onClick={handleQuestions} disabled={extracting}>
              <ListChecks size={15} /> {extracting ? 'Generando preguntas...' : 'Generar preguntas con IA'}
            </button>
          ) : (
            <>
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
                    {q.type === 'open' && <span className="text-xs text-subtle">Respuesta abierta</span>}
                  </div>
                  <button className="btn-icon" onClick={() => setQuestions(prev => prev.filter(x => x.id !== q.id))}>
                    <Trash2 size={15} />
                  </button>
                </div>
              ))}
              <button className="btn btn-outline btn-sm" onClick={handleQuestions} disabled={extracting}>
                {extracting ? 'Regenerando...' : 'Regenerar preguntas'}
              </button>
            </>
          )}
        </section>
      )}

      {/* 4. Publicar */}
      {content && !generating && (
        <section className="ar-step card">
          <h3><span className="ar-step-num">4</span> Publicar</h3>
          <div className="ar-publish-row">
            <div className="ar-chips">
              <button className={`ar-chip ${due === 'none' ? 'selected' : ''}`} onClick={() => setDue('none')}>Sin fecha</button>
              <button className={`ar-chip ${due === 'tomorrow' ? 'selected' : ''}`} onClick={() => setDue('tomorrow')}>Para mañana</button>
              <button className={`ar-chip ${due === 'week' ? 'selected' : ''}`} onClick={() => setDue('week')}>En la semana</button>
            </div>
            <label className="ar-points">
              Puntos
              <input type="number" min="1" max="100" value={points} onChange={e => setPoints(e.target.value)} />
            </label>
          </div>
          <button className="btn btn-primary w-full ar-publish-btn" onClick={handlePublish} disabled={publishing}>
            <Send size={16} /> {publishing ? 'Publicando...' : `Publicar a ${assignment?.courseName ?? 'curso'}`}
          </button>
        </section>
      )}
    </div>
  );
}
