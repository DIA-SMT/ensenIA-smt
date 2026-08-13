import { useState, useEffect, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  ArrowLeft, Eye, Play, Send, CheckCircle, Clock, X, Fingerprint,
  MousePointerClick, LogOut as FocusLost, LogIn as FocusGained, RotateCcw, FileText, QrCode,
} from 'lucide-react';
import QrModal from '../components/QrModal';
import { useAuth } from '../contexts/AuthContext';
import {
  getActivityById, getSubmissionsByActivity, getEventsByActivity,
  getEnrolledStudents, gradeSubmission, setSubmissionReaction,
} from '../services/activities.service';
import { getCheckinsByActivity, addObservation } from '../services/wellbeing.service';
import MarkdownRenderer from '../components/MarkdownRenderer';
import {
  FEELING_META, OBSERVATION_META,
  type Activity, type ActivitySubmission, type ActivityEvent, type Student,
  type StudentCheckin, type ObservationCategory,
} from '../types';
import './Actividades.css';

const QUICK_REACTIONS = ['👏 Excelente', '👍 Muy bien', '💪 Seguí así', '🤝 Hablemos'];

type EnrolledStudent = Student & { enrollmentCode: string };

const EVENT_LABELS: Record<string, { label: string; icon: typeof Eye; color: string }> = {
  viewed: { label: 'Vio la actividad', icon: Eye, color: 'var(--text-secondary)' },
  started: { label: 'Comenzó a trabajar', icon: Play, color: 'var(--cyan-bright)' },
  answer_changed: { label: 'Modificó una respuesta', icon: MousePointerClick, color: '#818CF8' },
  submitted: { label: 'Entregó la actividad', icon: Send, color: 'var(--success)' },
  reopened: { label: 'Volvió a abrirla', icon: RotateCcw, color: 'var(--warning)' },
  focus_lost: { label: 'Salió de la pestaña', icon: FocusLost, color: 'var(--warning)' },
  focus_gained: { label: 'Volvió a la pestaña', icon: FocusGained, color: 'var(--text-subtle)' },
};

function fmtTime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m ${seconds % 60}s`;
}

function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export default function ActividadDetalle() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const [activity, setActivity] = useState<Activity | null>(null);
  const [students, setStudents] = useState<EnrolledStudent[]>([]);
  const [submissions, setSubmissions] = useState<ActivitySubmission[]>([]);
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [selected, setSelected] = useState<EnrolledStudent | null>(null);
  const [showContent, setShowContent] = useState(false);
  const [showQr, setShowQr] = useState(false);
  const [gradeInput, setGradeInput] = useState('');
  const [feedbackInput, setFeedbackInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [checkins, setCheckins] = useState<StudentCheckin[]>([]);
  const [obsCategory, setObsCategory] = useState<ObservationCategory>('dificultad');
  const [obsNote, setObsNote] = useState('');
  const [obsSaved, setObsSaved] = useState(false);

  const load = async () => {
    if (!id) return;
    setLoading(true);
    try {
      const act = await getActivityById(id);
      setActivity(act);
      if (act) {
        const [studs, subs, evs, chks] = await Promise.all([
          getEnrolledStudents(act.subjectId, act.courseId),
          getSubmissionsByActivity(act.id),
          getEventsByActivity(act.id),
          getCheckinsByActivity(act.id).catch(() => [] as StudentCheckin[]),
        ]);
        setStudents(studs);
        setSubmissions(subs);
        setEvents(evs);
        setCheckins(chks);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [id]);

  const subByStudent = useMemo(() => {
    const map = new Map<string, ActivitySubmission>();
    submissions.forEach(s => map.set(s.studentId, s));
    return map;
  }, [submissions]);

  const eventsByStudent = useMemo(() => {
    const map = new Map<string, ActivityEvent[]>();
    events.forEach(e => {
      const arr = map.get(e.studentId) ?? [];
      arr.push(e);
      map.set(e.studentId, arr);
    });
    return map;
  }, [events]);

  const checkinsByStudent = useMemo(() => {
    const map = new Map<string, { inicio?: StudentCheckin; fin?: StudentCheckin }>();
    checkins.forEach(c => {
      const entry = map.get(c.studentId) ?? {};
      entry[c.moment] = c; // el último pisa
      map.set(c.studentId, entry);
    });
    return map;
  }, [checkins]);

  // "Qué les costó": % de respuestas correctas por pregunta de opción múltiple
  const questionStats = useMemo(() => {
    if (!activity) return [];
    const submitted = submissions.filter(s => s.status === 'submitted' || s.status === 'graded');
    if (submitted.length === 0) return [];
    return activity.questions
      .filter(q => q.type === 'multiple_choice')
      .map((q, i) => {
        const answered = submitted.filter(s => s.answers[q.id] != null);
        const correct = answered.filter(s => s.answers[q.id]?.correct).length;
        return {
          id: q.id,
          index: i + 1,
          prompt: q.prompt,
          answered: answered.length,
          pct: answered.length > 0 ? Math.round((correct / answered.length) * 100) : null,
        };
      })
      .filter(s => s.pct !== null)
      .sort((a, b) => (a.pct ?? 0) - (b.pct ?? 0));
  }, [activity, submissions]);

  if (!user) return null;
  if (loading) return <p className="text-secondary p-6">Cargando actividad...</p>;
  if (!activity) return <p className="text-secondary p-6">Actividad no encontrada.</p>;

  const submittedCount = submissions.filter(s => s.status === 'submitted' || s.status === 'graded').length;
  const startedCount = submissions.filter(s => s.status === 'in_progress').length;
  const viewedOnly = students.filter(s =>
    !subByStudent.has(s.id) && (eventsByStudent.get(s.id)?.length ?? 0) > 0
  ).length;

  const statusOf = (st: EnrolledStudent) => {
    const sub = subByStudent.get(st.id);
    if (sub?.status === 'graded') return { label: 'Calificada', cls: 'badge-success' };
    if (sub?.status === 'submitted') return { label: 'Entregada', cls: 'badge-success' };
    if (sub?.status === 'in_progress') return { label: 'En curso', cls: 'badge-warning' };
    if ((eventsByStudent.get(st.id)?.length ?? 0) > 0) return { label: 'Vista', cls: 'badge-neutral' };
    return { label: 'Sin actividad', cls: 'badge-danger' };
  };

  const openStudent = (st: EnrolledStudent) => {
    setSelected(st);
    const sub = subByStudent.get(st.id);
    setGradeInput(sub?.score != null ? String(sub.score) : sub?.autoScore != null ? String(sub.autoScore) : '');
    setFeedbackInput(sub?.feedback ?? '');
    setObsNote('');
    setObsSaved(false);
  };

  const handleReaction = async (reaction: string) => {
    const sub = selected ? subByStudent.get(selected.id) : null;
    if (!sub) return;
    const next = sub.feedbackReaction === reaction ? null : reaction;
    await setSubmissionReaction(sub.id, next);
    setSubmissions(prev => prev.map(s => s.id === sub.id ? { ...s, feedbackReaction: next } : s));
  };

  const handleAddObservation = async () => {
    if (!selected || !user || !obsNote.trim() || !activity) return;
    await addObservation({
      studentId: selected.id,
      teacherId: user.id,
      subjectId: activity.subjectId,
      category: obsCategory,
      note: obsNote,
    });
    setObsNote('');
    setObsSaved(true);
    setTimeout(() => setObsSaved(false), 2500);
  };

  const handleGrade = async () => {
    const sub = selected ? subByStudent.get(selected.id) : null;
    if (!sub || gradeInput === '') return;
    await gradeSubmission(sub.id, Number(gradeInput), feedbackInput.trim() || undefined);
    await load();
    setSelected(null);
  };

  const selectedSub = selected ? subByStudent.get(selected.id) : null;
  const selectedEvents = selected ? (eventsByStudent.get(selected.id) ?? []) : [];

  return (
    <div className="acts-container animate-in">
      <Link to="/actividades" className="acts-back"><ArrowLeft size={15} /> Actividades</Link>

      <div className="card acts-detail-header">
        <div className="flex items-center justify-between gap-4" style={{ flexWrap: 'wrap' }}>
          <div>
            <h2>{activity.title}</h2>
            <div className="acts-card-meta mt-1">
              <span className="badge badge-cyan">{activity.subjectName}</span>
              <span className="badge badge-neutral">{activity.courseName}</span>
              {activity.points != null && <span className="badge badge-neutral">{activity.points} pts</span>}
              {activity.dueDate && (
                <span className="text-xs text-subtle flex items-center gap-1">
                  <Clock size={12} /> Vence {new Date(activity.dueDate).toLocaleDateString('es-AR')}
                </span>
              )}
            </div>
          </div>
          <div className="flex gap-2">
            <button className="btn btn-secondary btn-sm" onClick={() => setShowQr(true)} title="Para proyectar en el aula">
              <QrCode size={14} /> QR
            </button>
            <button className="btn btn-outline btn-sm" onClick={() => setShowContent(v => !v)}>
              <FileText size={14} /> {showContent ? 'Ocultar consigna' : 'Ver consigna'}
            </button>
          </div>
        </div>

        {showContent && (
          <div className="acts-content-preview">
            <MarkdownRenderer content={activity.contentMd} />
            {activity.questions.length > 0 && (
              <ol className="acts-question-list">
                {activity.questions.map(q => (
                  <li key={q.id}>
                    {q.prompt}
                    {q.type === 'multiple_choice' && q.options && (
                      <span className="text-subtle"> ({q.options[q.correct_index ?? 0]})</span>
                    )}
                  </li>
                ))}
              </ol>
            )}
          </div>
        )}

        <div className="acts-summary-row">
          <div className="acts-summary-stat"><strong>{students.length}</strong> inscriptos</div>
          <div className="acts-summary-stat text-success"><strong>{submittedCount}</strong> entregaron</div>
          <div className="acts-summary-stat text-warning"><strong>{startedCount}</strong> en curso</div>
          <div className="acts-summary-stat text-secondary"><strong>{viewedOnly}</strong> solo la vieron</div>
          <div className="acts-summary-stat text-danger">
            <strong>{students.length - submittedCount - startedCount - viewedOnly}</strong> sin actividad
          </div>
        </div>

        {questionStats.length > 0 && (
          <div>
            <h4 className="acts-side-title" style={{ marginBottom: 8 }}>📊 Qué les costó (correctas por pregunta)</h4>
            <div className="acts-qstats">
              {questionStats.map(qs => (
                <div key={qs.id} className="acts-qstat" title={qs.prompt}>
                  <span className="acts-qstat-label">{qs.index}. {qs.prompt}</span>
                  <div className="acts-qstat-bar">
                    <div
                      className="acts-qstat-fill"
                      style={{
                        width: `${qs.pct}%`,
                        background: (qs.pct ?? 0) >= 70 ? 'var(--success)' : (qs.pct ?? 0) >= 40 ? 'var(--warning)' : 'var(--danger)',
                      }}
                    />
                  </div>
                  <span className="acts-qstat-pct">{qs.pct}%</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className={`acts-detail-body ${selected ? 'panel-open' : ''}`}>
        <div className="card acts-table-card">
          <table className="modern-table">
            <thead>
              <tr>
                <th>Estudiante</th>
                <th>ID</th>
                <th>Estado</th>
                <th>Tiempo</th>
                <th>Nota</th>
                <th>Huella</th>
              </tr>
            </thead>
            <tbody>
              {students.map(st => {
                const sub = subByStudent.get(st.id);
                const evs = eventsByStudent.get(st.id) ?? [];
                const s = statusOf(st);
                return (
                  <tr key={st.id} onClick={() => openStudent(st)} className={selected?.id === st.id ? 'selected-row' : ''}>
                    <td>
                      <div className="student-cell">
                        <div className="student-avatar">{st.avatarInitials}</div>
                        <span className="font-medium">{st.firstName} {st.lastName}</span>
                      </div>
                    </td>
                    <td className="text-secondary text-xs">{st.enrollmentCode}</td>
                    <td><span className={`badge ${s.cls}`}>{s.label}</span></td>
                    <td className="text-secondary">{sub ? fmtTime(sub.timeSpentSeconds) : '—'}</td>
                    <td className="font-semibold">
                      {sub?.score != null ? sub.score : sub?.autoScore != null ? `${sub.autoScore} (auto)` : '—'}
                    </td>
                    <td>
                      <span className="acts-events-pill">
                        <Fingerprint size={13} /> {evs.length}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {selected && (
          <aside className="card acts-side-panel animate-slide-in">
            <div className="acts-side-header">
              <div className="flex items-center gap-3">
                <div className="student-avatar">{selected.avatarInitials}</div>
                <div>
                  <h3>{selected.firstName} {selected.lastName}</h3>
                  <span className="text-xs text-secondary">{selected.enrollmentCode}</span>
                </div>
              </div>
              <button className="btn-icon" onClick={() => setSelected(null)}><X size={18} /></button>
            </div>

            <div className="acts-side-body">
              {/* Cómo se sintió (check-in emocional) */}
              {(() => {
                const c = checkinsByStudent.get(selected.id);
                if (!c?.inicio && !c?.fin) return null;
                return (
                  <section>
                    <h4 className="acts-side-title">💙 Cómo se sintió</h4>
                    <div className="acts-feelings">
                      {c.inicio && (
                        <span title={FEELING_META[c.inicio.feeling].label}>
                          Llegó: {FEELING_META[c.inicio.feeling].emoji} {FEELING_META[c.inicio.feeling].label}
                        </span>
                      )}
                      {c.inicio && c.fin && <span className="text-subtle">→</span>}
                      {c.fin && (
                        <span title={FEELING_META[c.fin.feeling].label}>
                          Terminó: {FEELING_META[c.fin.feeling].emoji} {FEELING_META[c.fin.feeling].label}
                        </span>
                      )}
                      {c.inicio?.comment && <span className="acts-feeling-comment">"{c.inicio.comment}"</span>}
                      {c.fin?.comment && <span className="acts-feeling-comment">"{c.fin.comment}"</span>}
                    </div>
                  </section>
                );
              })()}

              {/* Respuestas */}
              {selectedSub && (
                <section>
                  <h4 className="acts-side-title">Respuestas</h4>
                  {activity.questions.length === 0 && (
                    <p className="acts-answer-text">{selectedSub.responseText || <em className="text-subtle">Sin texto</em>}</p>
                  )}
                  {activity.questions.map((q, qi) => {
                    const ans = selectedSub.answers[q.id];
                    return (
                      <div key={q.id} className="acts-answer">
                        <p className="acts-answer-q">{qi + 1}. {q.prompt}</p>
                        {q.type === 'multiple_choice' ? (
                          ans != null ? (
                            <p className={`acts-answer-a ${ans.correct ? 'text-success' : 'text-danger'}`}>
                              {q.options?.[Number(ans.answer)] ?? '—'} {ans.correct ? '✓' : `✗ (correcta: ${q.options?.[q.correct_index ?? 0]})`}
                            </p>
                          ) : <p className="acts-answer-a text-subtle">Sin responder</p>
                        ) : (
                          <p className="acts-answer-a">{ans?.answer != null && ans.answer !== '' ? String(ans.answer) : <em className="text-subtle">Sin responder</em>}</p>
                        )}
                      </div>
                    );
                  })}

                  {(selectedSub.status === 'submitted' || selectedSub.status === 'graded') && (
                    <div className="mt-3">
                      <h4 className="acts-side-title">⚡ Devolución rápida</h4>
                      <div className="acts-reactions">
                        {QUICK_REACTIONS.map(r => (
                          <button
                            key={r}
                            className={`acts-reaction-btn ${selectedSub.feedbackReaction === r ? 'selected' : ''}`}
                            onClick={() => handleReaction(r)}
                            title="El estudiante la ve al instante"
                          >
                            {r}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {(selectedSub.status === 'submitted' || selectedSub.status === 'graded') && (
                    <div className="acts-grade-box">
                      <div className="em-row">
                        <div className="em-field">
                          <label>Nota final {activity.points != null ? `(sobre ${activity.points})` : ''}</label>
                          <input type="number" value={gradeInput} onChange={e => setGradeInput(e.target.value)} min={0} max={activity.points ?? 100} />
                        </div>
                      </div>
                      <div className="em-field mt-2">
                        <label>Devolución (opcional)</label>
                        <textarea rows={2} value={feedbackInput} onChange={e => setFeedbackInput(e.target.value)} placeholder="¡Muy buen trabajo con...!" />
                      </div>
                      <button className="btn btn-primary btn-sm w-full mt-2" onClick={handleGrade} disabled={gradeInput === ''}>
                        <CheckCircle size={14} /> Guardar calificación
                      </button>
                    </div>
                  )}
                </section>
              )}

              {/* Observación rápida (la info en la cabeza del docente) */}
              <section>
                <h4 className="acts-side-title">✏️ Observación rápida</h4>
                <div className="acts-obs-form">
                  <div className="acts-obs-cats">
                    {(Object.entries(OBSERVATION_META) as [ObservationCategory, { emoji: string; label: string }][]).map(([key, meta]) => (
                      <button
                        key={key}
                        className={`acts-obs-cat ${obsCategory === key ? 'selected' : ''}`}
                        onClick={() => setObsCategory(key)}
                      >
                        {meta.emoji} {meta.label}
                      </button>
                    ))}
                  </div>
                  <textarea
                    className="form-textarea w-full"
                    rows={2}
                    placeholder={`Ej: "le cuesta despejar incógnitas", "hoy participó muchísimo"...`}
                    value={obsNote}
                    onChange={e => setObsNote(e.target.value)}
                  />
                  <button className="btn btn-secondary btn-sm" onClick={handleAddObservation} disabled={!obsNote.trim()}>
                    {obsSaved ? '✓ Guardada' : 'Guardar observación'}
                  </button>
                  <p className="text-xs text-subtle">
                    Queda en la ficha del estudiante y alimenta sus señales.
                  </p>
                </div>
              </section>

              {/* Huella digital */}
              <section>
                <h4 className="acts-side-title"><Fingerprint size={14} /> Huella digital</h4>
                {selectedSub && (
                  <p className="text-xs text-secondary mb-2">
                    Tiempo total activo: <strong>{fmtTime(selectedSub.timeSpentSeconds)}</strong>
                    {selectedEvents.filter(e => e.eventType === 'focus_lost').length > 0 &&
                      ` · salió de la pestaña ${selectedEvents.filter(e => e.eventType === 'focus_lost').length} veces`}
                  </p>
                )}
                {selectedEvents.length === 0 && (
                  <p className="text-sm text-subtle">Este estudiante todavía no abrió la actividad.</p>
                )}
                <div className="acts-timeline">
                  {selectedEvents.map(ev => {
                    const cfg = EVENT_LABELS[ev.eventType] ?? { label: ev.eventType, icon: Eye, color: 'var(--text-subtle)' };
                    const Icon = cfg.icon;
                    return (
                      <div key={ev.id} className="acts-timeline-item">
                        <span className="acts-timeline-dot" style={{ color: cfg.color }}><Icon size={13} /></span>
                        <div>
                          <span className="acts-timeline-label">
                            {cfg.label}
                            {ev.eventType === 'answer_changed' && ev.metadata?.question ? ` (${String(ev.metadata.question)})` : ''}
                          </span>
                          <span className="acts-timeline-time">{fmtDateTime(ev.createdAt)}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            </div>
          </aside>
        )}
      </div>

      {showQr && (
        <QrModal
          path={`/mis-actividades/${activity.id}`}
          title={activity.title}
          onClose={() => setShowQr(false)}
        />
      )}
    </div>
  );
}
