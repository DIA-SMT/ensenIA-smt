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
import { ArrowLeft, Clock, CheckCircle, Send, Play, PartyPopper, AlertCircle, SearchX } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import {
  getActivityForStudent, getStudentByUserId, getOrCreateSubmission, getMySubmissions, getMySubmission,
} from '../services/activities.service';
import {
  iniciarResiliente, guardarAvanceResiliente, entregarResiliente, logEventResilient, saveCheckinResilient,
  subscribe, hasPendingSubmit, hayEnColaDe, rechazoDe, reintentarActividad,
} from '../services/offline-queue.service';
import { haySenial, esErrorDeRed } from '../lib/conexion';
import { useSenial } from '../lib/useSenial';
import { leerBorrador, guardarBorrador, borrarBorrador, conBorrador } from '../lib/borradorEntrega';
import MarkdownRenderer from '../components/MarkdownRenderer';
import CheckinCard from '../components/CheckinCard';
import PedirDevolucion from '../components/PedirDevolucion';
import EstadoVacio from '../components/ui/EstadoVacio';
import { Esqueleto } from '../components/ui/Esqueleto';
import { avisar, confirmar } from '../components/ui/avisar';
import { TIPOS_ACTIVIDAD, puntosATexto } from '../lib/actividades';
import type { Activity, ActivitySubmission, ActivityAnswer, Student, CheckinFeeling, CheckinMoment } from '../types';
// Estilos compartidos con otras pantallas: desde que cada pantalla se baja
// por separado, lo que no se importa acá no llega.
import './Actividades.css';
import '../components/Modals.css';
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
  // Algo de esta actividad no se pudo mandar (el motivo); lo hecho sigue en el equipo
  const [noSeMando, setNoSeMando] = useState<string | null>(null);
  // "Comenzar" en curso: con la red colgada, un segundo toque borraba lo respondido
  const [empezando, setEmpezando] = useState(false);
  const senial = useSenial();
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
      avisar.exito('¡Gracias por contarnos cómo venís!');
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
  // Al salir de la pantalla no queda un autoguardado colgado (después de cerrar
  // sesión se mandaría con la sesión de otra persona). Lo escrito ya está en
  // el borrador del equipo.
  useEffect(() => () => { if (saveTimeout.current) clearTimeout(saveTimeout.current); }, []);

  submissionRef.current = submission;

  // ── Load ──
  useEffect(() => {
    if (!user || !id) return;
    (async () => {
      try {
        const [act, st] = await Promise.all([getActivityForStudent(id), getStudentByUserId(user.id)]);
        setActivity(act);
        setStudent(st);
        if (act && st) {
          // huella: vio la actividad
          logEventResilient(act.id, st.id, 'viewed');
        }
        if (act && st) {
          // ¿ya tiene una entrega en curso o hecha? (sin crearla)
          // Si no hay ni copia del servidor, igual vale lo que está en el equipo
          const subs = await getMySubmissions(st.id).catch(() => null);
          const delServidor = subs?.find(s => s.activityId === act.id) ?? null;
          // Lo respondido en este equipo manda sobre la copia vieja del
          // servidor (sin señal, es la de la última vez que hubo conexión)
          let mine = conBorrador(delServidor, leerBorrador(st.id, act.id), act.id, st.id, hayEnColaDe(act.id, st.id));
          if (delServidor && (delServidor.status === 'submitted' || delServidor.status === 'graded')) {
            borrarBorrador(st.id, act.id);
          } else if (mine && hasPendingSubmit(act.id)) {
            // La entregó sin señal y todavía no salió: se ve entregada, no de nuevo para hacer
            mine = { ...mine, status: 'submitted', submittedAt: mine.submittedAt ?? new Date().toISOString() };
            setPendingSync(true);
          }
          const motivo = rechazoDe(act.id);
          if (motivo) setNoSeMando(motivo);
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

  // Entregada sin conexión: la corrección la hace la base, así que cuando
  // la cola termina de mandarla traemos la entrega ya corregida.
  // Por actividad y alumno: una entrega empezada sin señal no tenía id.
  const activityId = activity?.id;
  const studentId = student?.id;
  useEffect(() => {
    if (!pendingSync || !activityId || !studentId) return;
    const refresh = () => {
      // Algo de esta actividad no se pudo mandar: se dice, con el motivo, en vez
      // de seguir diciendo "se envía sola". Lo respondido sigue en el equipo.
      const motivo = rechazoDe(activityId);
      if (motivo && !hasPendingSubmit(activityId)) {
        setNoSeMando(motivo);
        setPendingSync(false);
        const b = leerBorrador(studentId, activityId);
        setSubmission(prev => (prev ? { ...prev, status: 'in_progress', submittedAt: null, ...(b ? { answers: b.answers, responseText: b.responseText } : {}) } : prev));
        return;
      }
      if (hasPendingSubmit(activityId) || !haySenial()) return;
      getMySubmission(activityId, studentId)
        .then(s => {
          if (s && (s.status === 'submitted' || s.status === 'graded')) {
            setSubmission(s);
            setPendingSync(false);
            borrarBorrador(studentId, activityId);
          }
        })
        .catch(() => {});
    };
    return subscribe(refresh); // subscribe ya lo llama una vez al suscribir
  }, [pendingSync, activityId, studentId]);

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
        if (sub && sub.status === 'in_progress') {
          const total = baseSecondsRef.current + secondsRef.current;
          const b = leerBorrador(student.id, activity.id);
          if (b) guardarBorrador(student.id, activity.id, { ...b, timeSpentSeconds: total }, { mantenerFecha: true });
          guardarAvanceResiliente(activity.id, student.id, { timeSpentSeconds: total }).catch(() => {});
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
    const sub = submissionRef.current;
    if (!sub || sub.status !== 'in_progress') return;
    // En el equipo, al instante: si se cierra la app sin señal, no se pierde
    guardarBorrador(sub.studentId, sub.activityId, {
      answers: nextAnswers,
      responseText: nextText,
      timeSpentSeconds: baseSecondsRef.current + secondsRef.current,
    });
    if (saveTimeout.current) clearTimeout(saveTimeout.current);
    saveTimeout.current = setTimeout(() => {
      const s = submissionRef.current;
      if (s && s.status === 'in_progress') {
        guardarAvanceResiliente(s.activityId, s.studentId, { answers: nextAnswers, responseText: nextText }).catch(() => {});
      }
    }, 800);
  }, []);

  if (!user) return null;
  if (loading) {
    return (
      <div className="sp-container">
        <Esqueleto tipo="tarjetas" cantidad={1} etiqueta="Cargando la actividad…" />
        <Esqueleto tipo="filas" cantidad={3} />
      </div>
    );
  }
  if (!activity || !student) {
    return (
      <div className="sp-container">
        <EstadoVacio
          icono={SearchX}
          titulo="No encontramos esta actividad"
          texto="Puede que la hayan sacado o que el enlace esté mal."
          accion={{ etiqueta: 'Volver a mis actividades', a: '/mis-actividades', icono: ArrowLeft }}
        />
      </div>
    );
  }

  // ── Handlers ──

  /** Muestra una entrega en curso, con lo que haya en el equipo encima (nunca lo pisa). */
  const mostrarEnCurso = (sub: ActivitySubmission | null) => {
    const conLoDelEquipo = conBorrador(sub, leerBorrador(student.id, activity.id), activity.id, student.id, true) ?? sub;
    if (!conLoDelEquipo) return;
    setSubmission(conLoDelEquipo);
    setAnswers(conLoDelEquipo.answers);
    setResponseText(conLoDelEquipo.responseText ?? '');
    baseSecondsRef.current = conLoDelEquipo.timeSpentSeconds;
  };

  const handleStart = async () => {
    if (empezando) return;
    setEmpezando(true);
    setError('');
    try {
      if (haySenial()) {
        try {
          mostrarEnCurso(await getOrCreateSubmission(activity.id, student.id));
          logEventResilient(activity.id, student.id, 'started');
          return;
        } catch (err) {
          if (!esErrorDeRed(err)) {
            setError('No se pudo comenzar la actividad. Probá de nuevo.');
            console.error(err);
            return;
          }
          // Se cortó la señal en el medio: se empieza igual, como sin señal
        }
      }
      // Sin señal se empieza igual: lo que responda queda en este celular y
      // la cola avisa al servidor (empezar, avance, entrega) cuando vuelva.
      try {
        await iniciarResiliente(activity.id, student.id);
      } catch (err) {
        setError('No se pudo comenzar la actividad. Probá de nuevo.');
        console.error(err);
        return;
      }
      // Si ya había algo respondido en el equipo, se sigue desde ahí
      if (!leerBorrador(student.id, activity.id)) {
        guardarBorrador(student.id, activity.id, { answers: {}, responseText: '', timeSpentSeconds: submission?.timeSpentSeconds ?? 0 });
      }
      mostrarEnCurso(submission);
      logEventResilient(activity.id, student.id, 'started');
    } finally {
      setEmpezando(false);
    }
  };

  const reintentarEnvio = () => {
    reintentarActividad(activity.id);
    setNoSeMando(null);
    if (hasPendingSubmit(activity.id)) {
      setSubmission(prev => (prev ? { ...prev, status: 'submitted', submittedAt: prev.submittedAt ?? new Date().toISOString() } : prev));
      setPendingSync(true);
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

  const answeredCount = activity.questions.filter(q => {
    const a = answers[q.id];
    return a != null && a.answer !== '' && a.answer !== undefined;
  }).length;

  const handleSubmit = async () => {
    if (!submission) return;
    const unanswered = activity.questions.length - answeredCount;
    if (unanswered > 0) {
      const entregar = await confirmar({
        titulo: '¿Entregar igual?',
        mensaje: `Te falta${unanswered !== 1 ? 'n' : ''} ${unanswered} pregunta${unanswered !== 1 ? 's' : ''} sin responder.`,
        accion: 'Entregar igual',
        cancelar: 'Seguir respondiendo',
      });
      if (!entregar) return;
    }
    setSubmitting(true);
    setError('');
    try {
      // La corrección la hace la base al entregar (migración 018): acá no
      // hay respuestas correctas para comparar, a propósito (019).
      const totalTime = baseSecondsRef.current + secondsRef.current;
      if (saveTimeout.current) clearTimeout(saveTimeout.current);
      const queued = await entregarResiliente(activity.id, student.id, {
        answers,
        responseText: responseText.trim() || undefined,
        timeSpentSeconds: totalTime,
      });
      logEventResilient(activity.id, student.id, 'submitted');
      setPendingSync(queued);
      const local: ActivitySubmission = {
        ...submission,
        status: 'submitted',
        answers,
        timeSpentSeconds: totalTime,
        submittedAt: new Date().toISOString(),
      };
      // Con conexión, mostramos la entrega ya corregida por la base. Sin
      // señal, el borrador queda hasta que la entrega salga (por si algo falla).
      const delServidor = queued ? null : await getMySubmission(activity.id, student.id).catch(() => null);
      // Si la red tarda, la respuesta puede ser la copia vieja "en curso": esa no
      const corrected = delServidor && (delServidor.status === 'submitted' || delServidor.status === 'graded') ? delServidor : null;
      if (!queued) borrarBorrador(student.id, activity.id);
      setNoSeMando(null);
      setSubmission(corrected ?? local);
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
              {activity.tipo !== 'actividad' && <span className="badge badge-neutral">{TIPOS_ACTIVIDAD[activity.tipo].label}</span>}
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
        {noSeMando && (
          <div className="em-error" role="alert">
            <AlertCircle size={15} />
            <span>No se pudo mandar lo que hiciste: {noSeMando} Tus respuestas siguen en este celular.</span>
            <button type="button" className="btn btn-secondary btn-sm" onClick={reintentarEnvio}>Reintentar</button>
          </div>
        )}

        {/* Estado: sin comenzar (o el docente anotó que no la entregó: igual puede hacerla) */}
        {(!submission || submission.status === 'pending') && !isDone && (
          isClosed ? (
            <div className="sp-notice">Esta actividad está cerrada y ya no acepta entregas.</div>
          ) : (
            <button className="btn btn-primary sp-start-btn" onClick={handleStart} disabled={empezando}>
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
                <p className="sp-question-prompt">
                  <span className="sp-q-num">{qi + 1}</span> {q.prompt}
                  {typeof q.points === 'number' && <span className="sp-q-puntos">{puntosATexto(q.points)} {q.points === 1 ? 'punto' : 'puntos'}</span>}
                </p>
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
                {activity.questions.length > 0 ? `${answeredCount}/${activity.questions.length} respondidas · ` : ''}
                {senial
                  ? 'se guarda automáticamente'
                  : 'sin señal: se guarda en este celular y se manda sola cuando vuelva'}
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
                    : submission?.registro === 'papel'
                      ? 'La entregaste en papel y tu docente la anotó acá.'
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
            {/* Después del check-in, la devolución anónima. Con la entrega todavía
                sin subir (sin señal) no se puede: la base valida que entregó. */}
            {endCheckinDone && !pendingSync && (
              <PedirDevolucion origen="actividad" refId={activity.id} pregunta="¿Te sirvió esta tarea?" />
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
                  // Puntaje de la parte: el que puso el docente; si no, el de la corrección automática
                  const puntaje = submission?.puntajes?.[q.id]
                    ?? (typeof q.points === 'number' && q.type === 'multiple_choice' && a?.correct != null ? (a.correct ? q.points : 0) : null);
                  return (
                    <div key={q.id} className="sp-question card readonly">
                      <p className="sp-question-prompt">
                        <span className="sp-q-num">{qi + 1}</span> {q.prompt}
                        {typeof q.points === 'number' && (
                          <span className="sp-q-puntos">
                            {puntaje != null ? `${puntosATexto(puntaje)} de ${puntosATexto(q.points)}` : `${puntosATexto(q.points)} pts`}
                          </span>
                        )}
                      </p>
                      {q.type === 'multiple_choice' && q.options ? (
                        a == null ? (
                          <p className="sp-answer-review text-subtle">Sin responder</p>
                        ) : a.correct == null ? (
                          // Todavía sin corregir: se entregó sin conexión
                          <p className="sp-answer-review">
                            {q.options[Number(a.answer)]}
                            <span className="text-subtle"> · se corrige cuando se sincronice</span>
                          </p>
                        ) : (
                          <p className={`sp-answer-review ${a.correct ? 'text-success' : 'text-danger'}`}>
                            {a.correct ? '✓' : '✗'} {q.options[Number(a.answer)]}
                            {!a.correct && a.correct_index != null && (
                              <span className="text-subtle"> · Correcta: {q.options[a.correct_index]}</span>
                            )}
                          </p>
                        )
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
