/**
 * Vista del estudiante: realizar una actividad.
 *
 * Huella digital que se registra:
 *  - viewed / reopened al abrir
 *  - started al comenzar
 *  - answer_changed por respuesta (radios al elegir, textos al salir del campo)
 *  - focus_lost / focus_gained al cambiar de pestaña
 *  - submitted al entregar
 *  - tiempo activo acumulado (heartbeat cada 15s)
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Clock, CheckCircle, Send, Play, PartyPopper, AlertCircle } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import {
  getActivityById, getStudentByUserId, getOrCreateSubmission, getMySubmissions,
} from '../services/activities.service';
import {
  saveProgressResilient, submitResilient, logEventResilient, saveCheckinResilient,
} from '../services/offline-queue.service';
import MarkdownRenderer from '../components/MarkdownRenderer';
import CheckinCard from '../components/CheckinCard';
import type { Activity, ActivitySubmission, ActivityAnswer, Student, CheckinFeeling, CheckinMoment } from '../types';
import './StudentPortal.css';

const checkinDoneKey = (activityId: string, moment: CheckinMoment) => `ensenia_checkin_${activityId}_${moment}`;

export default function RealizarActividad() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const [activity, setActivity] = useState<Activity | null>(null);
  const [student, setStudent] = useState<Student | null>(null);
  const [submission, setSubmission] = useState<ActivitySubmission | null>(null);
  const [answers, setAnswers] = useState<Record<string, ActivityAnswer>>({});
  const [responseText, setResponseText] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [pendingSync, setPendingSync] = useState(false);
  const [error, setError] = useState('');
  // check-ins emocionales (persistimos "ya respondió" por dispositivo)
  const [startCheckinDone, setStartCheckinDone] = useState(true);
  const [endCheckinDone, setEndCheckinDone] = useState(true);

  useEffect(() => {
    if (!id) return;
    setStartCheckinDone(!!localStorage.getItem(checkinDoneKey(id, 'inicio')));
    setEndCheckinDone(!!localStorage.getItem(checkinDoneKey(id, 'fin')));
  }, [id]);

  const handleCheckin = (moment: CheckinMoment, feeling?: CheckinFeeling, comment?: string) => {
    if (!activity || !student) return;
    if (feeling) {
      saveCheckinResilient({ studentId: student.id, activityId: activity.id, moment, feeling, comment });
    }
    localStorage.setItem(checkinDoneKey(activity.id, moment), '1');
    if (moment === 'inicio') setStartCheckinDone(true);
    else setEndCheckinDone(true);
  };

  // Tiempo activo (heartbeat)
  const secondsRef = useRef(0);
  const baseSecondsRef = useRef(0);
  const submissionRef = useRef<ActivitySubmission | null>(null);
  const saveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  submissionRef.current = submission;

  // ── Load ──
  useEffect(() => {
    if (!user || !id) return;
    (async () => {
      try {
        const [act, st] = await Promise.all([getActivityById(id), getStudentByUserId(user.id)]);
        setActivity(act);
        setStudent(st);
        if (act && st) {
          // huella: vio la actividad
          logEventResilient(act.id, st.id, 'viewed');
        }
        if (act && st) {
          // ¿ya tiene una entrega en curso o hecha? (sin crearla)
          const subs = await getMySubmissions(st.id);
          const mine = subs.find(s => s.activityId === act.id) ?? null;
          if (mine) {
            setSubmission(mine);
            setAnswers(mine.answers);
            setResponseText(mine.responseText ?? '');
            baseSecondsRef.current = mine.timeSpentSeconds;
            if (mine.status === 'in_progress') logEventResilient(act.id, st.id, 'reopened');
          }
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    })();
  }, [user, id]);

  const isActive = submission?.status === 'in_progress';
  const isDone = submission?.status === 'submitted' || submission?.status === 'graded';
  const isClosed = activity?.status === 'closed';
  const isOverdue = activity?.dueDate ? new Date(activity.dueDate) < new Date() : false;

  // ── Heartbeat de tiempo + foco ──
  useEffect(() => {
    if (!isActive || !activity || !student) return;

    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') {
        secondsRef.current += 15;
        const sub = submissionRef.current;
        if (sub) {
          saveProgressResilient(sub.id, {
            timeSpentSeconds: baseSecondsRef.current + secondsRef.current,
          }).catch(() => {});
        }
      }
    }, 15000);

    const onVisibility = () => {
      logEventResilient(activity.id, student.id, document.visibilityState === 'hidden' ? 'focus_lost' : 'focus_gained');
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [isActive, activity?.id, student?.id]);

  // ── Autosave de respuestas (debounced) ──
  const scheduleSave = useCallback((nextAnswers: Record<string, ActivityAnswer>, nextText: string) => {
    if (saveTimeout.current) clearTimeout(saveTimeout.current);
    saveTimeout.current = setTimeout(() => {
      const sub = submissionRef.current;
      if (sub && sub.status === 'in_progress') {
        saveProgressResilient(sub.id, { answers: nextAnswers, responseText: nextText }).catch(() => {});
      }
    }, 800);
  }, []);

  if (!user) return null;
  if (loading) return <p className="text-secondary p-6">Cargando actividad...</p>;
  if (!activity || !student) return <p className="text-secondary p-6">Actividad no encontrada.</p>;

  // ── Handlers ──

  const handleStart = async () => {
    try {
      const sub = await getOrCreateSubmission(activity.id, student.id);
      setSubmission(sub);
      setAnswers(sub.answers);
      setResponseText(sub.responseText ?? '');
      baseSecondsRef.current = sub.timeSpentSeconds;
      logEventResilient(activity.id, student.id, 'started');
    } catch (err) {
      setError(navigator.onLine
        ? 'No se pudo comenzar la actividad. Probá de nuevo.'
        : 'Necesitás conexión para comenzar una actividad por primera vez. Una vez comenzada, podés trabajar sin internet y se sincroniza sola.');
      console.error(err);
    }
  };

  const setAnswer = (questionId: string, value: string | number, logNow: boolean) => {
    const next = { ...answers, [questionId]: { answer: value } };
    setAnswers(next);
    scheduleSave(next, responseText);
    if (logNow) logEventResilient(activity.id, student.id, 'answer_changed', { question: questionId });
  };

  const handleTextBlur = (questionId?: string) => {
    if (questionId) {
      logEventResilient(activity.id, student.id, 'answer_changed', { question: questionId });
    } else if (responseText.trim()) {
      logEventResilient(activity.id, student.id, 'answer_changed', { question: 'respuesta_libre' });
    }
  };

  const mcqs = activity.questions.filter(q => q.type === 'multiple_choice');
  const answeredCount = activity.questions.filter(q => {
    const a = answers[q.id];
    return a != null && a.answer !== '' && a.answer !== undefined;
  }).length;

  const handleSubmit = async () => {
    if (!submission) return;
    const unanswered = activity.questions.length - answeredCount;
    if (unanswered > 0 && !window.confirm(`Te falta${unanswered !== 1 ? 'n' : ''} ${unanswered} pregunta${unanswered !== 1 ? 's' : ''} por responder. ¿Entregar igual?`)) {
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      // Autocorrección de opción múltiple
      const graded: Record<string, ActivityAnswer> = {};
      let correct = 0;
      for (const q of activity.questions) {
        const a = answers[q.id];
        if (!a) continue;
        if (q.type === 'multiple_choice') {
          const isCorrect = Number(a.answer) === q.correct_index;
          if (isCorrect) correct++;
          graded[q.id] = { ...a, correct: isCorrect };
        } else {
          graded[q.id] = a;
        }
      }
      const autoScore = mcqs.length > 0 && activity.points != null
        ? Math.round((correct / mcqs.length) * activity.points * 10) / 10
        : mcqs.length > 0 ? Math.round((correct / mcqs.length) * 10 * 10) / 10 : null;

      const totalTime = baseSecondsRef.current + secondsRef.current;
      const queued = await submitResilient(submission.id, activity.id, {
        answers: graded,
        responseText: responseText.trim() || undefined,
        autoScore,
        timeSpentSeconds: totalTime,
      });
      logEventResilient(activity.id, student.id, 'submitted');
      setPendingSync(queued);
      setSubmission({
        ...submission,
        status: 'submitted',
        answers: graded,
        autoScore,
        timeSpentSeconds: totalTime,
        submittedAt: new Date().toISOString(),
      });
    } catch (err) {
      setError('No se pudo entregar. Intentá de nuevo.');
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  };

  // ── Render ──

  return (
    <div className="sp-container animate-in">
      <Link to="/mis-actividades" className="acts-back"><ArrowLeft size={15} /> Mis actividades</Link>

      <div className="card sp-activity-detail">
        <header className="sp-detail-header">
          <div>
            <h2>{activity.title}</h2>
            <div className="sp-activity-meta mt-1">
              <span className="badge badge-cyan">{activity.subjectName}</span>
              {activity.points != null && <span className="badge badge-neutral">{activity.points} pts</span>}
              {activity.dueDate && (
                <span className={`text-xs flex items-center gap-1 ${isOverdue ? 'text-danger' : 'text-subtle'}`}>
                  <Clock size={12} /> Vence {new Date(activity.dueDate).toLocaleDateString('es-AR')}
                </span>
              )}
            </div>
          </div>
          {isDone && (
            <div className="sp-score-box">
              {(submission?.score ?? submission?.autoScore) != null ? (
                <>
                  <span className="sp-score-num">{submission?.score ?? submission?.autoScore}</span>
                  <span className="sp-score-label">{submission?.status === 'graded' ? 'nota final' : 'autocorrección'}</span>
                </>
              ) : (
                <span className="badge badge-success"><CheckCircle size={12} /> Entregada</span>
              )}
            </div>
          )}
        </header>

        {activity.description && <p className="text-secondary text-sm">{activity.description}</p>}

        <div className="sp-content">
          <MarkdownRenderer content={activity.contentMd} />
        </div>

        {error && <div className="em-error"><AlertCircle size={15} /> {error}</div>}

        {/* Estado: sin comenzar */}
        {!submission && !isDone && (
          isClosed ? (
            <div className="sp-notice">Esta actividad está cerrada y ya no acepta entregas.</div>
          ) : (
            <button className="btn btn-primary sp-start-btn" onClick={handleStart}>
              <Play size={16} /> Comenzar actividad
            </button>
          )
        )}

        {/* Estado: en curso → formulario */}
        {isActive && !isClosed && (
          <div className="sp-form">
            {!startCheckinDone && (
              <CheckinCard
                title="Antes de empezar... ¿cómo llegás hoy? 💙"
                subtitle="Es solo para vos y tu docente. No afecta tu nota."
                onPick={f => handleCheckin('inicio', f)}
                onSkip={() => handleCheckin('inicio')}
              />
            )}
            {activity.questions.map((q, qi) => (
              <div key={q.id} className="sp-question card">
                <p className="sp-question-prompt"><span className="sp-q-num">{qi + 1}</span> {q.prompt}</p>
                {q.type === 'multiple_choice' && q.options ? (
                  <div className="sp-options">
                    {q.options.map((opt, oi) => (
                      <label key={oi} className={`sp-option ${Number(answers[q.id]?.answer) === oi ? 'selected' : ''}`}>
                        <input
                          type="radio"
                          name={q.id}
                          checked={Number(answers[q.id]?.answer) === oi}
                          onChange={() => setAnswer(q.id, oi, true)}
                        />
                        <span className="sp-option-letter">{String.fromCharCode(65 + oi)}</span>
                        <span>{opt}</span>
                      </label>
                    ))}
                  </div>
                ) : (
                  <textarea
                    className="form-textarea w-full"
                    rows={4}
                    placeholder="Escribí tu respuesta..."
                    value={String(answers[q.id]?.answer ?? '')}
                    onChange={e => setAnswer(q.id, e.target.value, false)}
                    onBlur={() => handleTextBlur(q.id)}
                  />
                )}
              </div>
            ))}

            {activity.questions.length === 0 && (
              <div className="sp-question card">
                <p className="sp-question-prompt">Tu respuesta</p>
                <textarea
                  className="form-textarea w-full"
                  rows={8}
                  placeholder="Desarrollá tu respuesta acá..."
                  value={responseText}
                  onChange={e => { setResponseText(e.target.value); scheduleSave(answers, e.target.value); }}
                  onBlur={() => handleTextBlur()}
                />
              </div>
            )}

            <div className="sp-submit-row">
              <span className="text-sm text-secondary">
                {activity.questions.length > 0
                  ? `${answeredCount}/${activity.questions.length} respondidas · se guarda automáticamente`
                  : 'Se guarda automáticamente'}
              </span>
              <button className="btn btn-primary" onClick={handleSubmit} disabled={submitting}>
                {submitting ? 'Entregando...' : <><Send size={15} /> Entregar</>}
              </button>
            </div>
          </div>
        )}

        {/* Estado: entregada → resultado */}
        {isDone && (
          <div className="sp-result">
            <div className="sp-result-banner">
              <PartyPopper size={22} className="text-success" />
              <div>
                <strong>¡Actividad entregada!</strong>
                <span className="text-sm text-secondary" style={{ display: 'block' }}>
                  {pendingSync
                    ? 'Quedó guardada en tu dispositivo y se envía sola apenas tengas conexión. 📶'
                    : submission?.submittedAt && `Entregaste el ${new Date(submission.submittedAt).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}.`}
                  {submission?.feedback && ' Tu docente te dejó una devolución 👇'}
                </span>
              </div>
            </div>
            {!endCheckinDone && (
              <CheckinCard
                title="¿Cómo te sentiste con esta actividad?"
                subtitle="Tu respuesta ayuda a que las próximas clases sean mejores."
                withComment
                onPick={(f, c) => handleCheckin('fin', f, c)}
                onSkip={() => handleCheckin('fin')}
              />
            )}
            {(submission?.feedbackReaction || submission?.feedback) && (
              <div className="sp-feedback">
                {submission.feedbackReaction && (
                  <span className="sp-reaction-chip">{submission.feedbackReaction}</span>
                )}
                {submission.feedback && <>💬 {submission.feedback}</>}
              </div>
            )}
            {activity.questions.length > 0 && (
              <div className="sp-form">
                {activity.questions.map((q, qi) => {
                  const a = submission?.answers[q.id];
                  return (
                    <div key={q.id} className="sp-question card readonly">
                      <p className="sp-question-prompt"><span className="sp-q-num">{qi + 1}</span> {q.prompt}</p>
                      {q.type === 'multiple_choice' && q.options ? (
                        a != null ? (
                          <p className={`sp-answer-review ${a.correct ? 'text-success' : 'text-danger'}`}>
                            {a.correct ? '✓' : '✗'} {q.options[Number(a.answer)]}
                            {!a.correct && <span className="text-subtle"> · Correcta: {q.options[q.correct_index ?? 0]}</span>}
                          </p>
                        ) : <p className="sp-answer-review text-subtle">Sin responder</p>
                      ) : (
                        <p className="sp-answer-review">{a?.answer ? String(a.answer) : <em className="text-subtle">Sin responder</em>}</p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
