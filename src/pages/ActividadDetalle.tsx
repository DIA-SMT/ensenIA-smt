import { useState, useEffect, useMemo, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  ArrowLeft, Eye, Play, Send, CheckCircle, Clock, X, Fingerprint,
  MousePointerClick, LogOut as FocusLost, LogIn as FocusGained, RotateCcw, FileText, QrCode,
  PencilLine, Undo2, Ban,
} from 'lucide-react';
import QrModal from '../components/QrModal';
import { useAuth } from '../contexts/AuthContext';
import {
  getActivityById, getSubmissionsByActivity, getEventsByActivity,
  getEnrolledStudents, gradeSubmission, setSubmissionReaction, updateActivity,
  registrarEntregaDocente, porPartes, puntajesAutomaticos,
} from '../services/activities.service';
import NotaPorPartes from '../components/NotaPorPartes';
import { TIPOS_ACTIVIDAD, leerPuntajes, partesCompletas, puntosATexto, sumaPuntajes } from '../lib/actividades';
import { getCheckinsByActivity, getObservationsByStudent } from '../services/wellbeing.service';
import { guardarObservacionResiliente } from '../services/offline-queue.service';
import MarkdownRenderer from '../components/MarkdownRenderer';
import SugerirDevolucion from '../components/SugerirDevolucion';
import BotonCopiarActividad from '../components/CopiarActividad';
import { sugerirDevolucion } from '../components/devolucion-ia';
import { avisar, confirmar, pedirTexto } from '../components/ui/avisar';
import EstadoVacio from '../components/ui/EstadoVacio';
import { Esqueleto } from '../components/ui/Esqueleto';
import {
  FEELING_META, OBSERVATION_META,
  type Activity, type ActivitySubmission, type ActivityEvent, type Student,
  type StudentCheckin, type CheckinMoment, type ObservationCategory, type StudentObservation,
} from '../types';
// Estilos compartidos con otras pantallas: desde que cada pantalla se baja
// por separado, lo que no se importa acá no llega.
import './Students.css';
import './Actividades.css';

const QUICK_REACTIONS = ['👏 Excelente', '👍 Muy bien', '💪 Seguí así', '🤝 Hablemos'];

type EnrolledStudent = Student & { enrollmentCode: string };

const EVENT_LABELS: Record<string, { label: string; icon: typeof Eye; color: string }> = {
  viewed: { label: 'Vio la actividad', icon: Eye, color: 'var(--text-secondary)' },
  started: { label: 'Comenzó a trabajar', icon: Play, color: 'var(--cyan-bright)' },
  answer_changed: { label: 'Modificó una respuesta', icon: MousePointerClick, color: 'var(--accent-ia)' },
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
  // Corrección por partes (063): lo tipeado en cada parte. Mientras el
  // docente no toque la nota final, la nota es la suma.
  const [partesInput, setPartesInput] = useState<Record<string, string>>({});
  const [notaTocada, setNotaTocada] = useState(false);
  // Anotar la entrega en papel de quien no la hizo en la app
  const [anotandoPapel, setAnotandoPapel] = useState(false);
  const [anotando, setAnotando] = useState(false);
  const [loading, setLoading] = useState(true);
  const [checkins, setCheckins] = useState<StudentCheckin[]>([]);
  const [obsCategory, setObsCategory] = useState<ObservationCategory>('dificultad');
  const [obsNote, setObsNote] = useState('');
  const [obsSaved, setObsSaved] = useState(false);
  const [obsSaving, setObsSaving] = useState(false);
  const [obsError, setObsError] = useState('');
  const [obsHistory, setObsHistory] = useState<StudentObservation[]>([]);
  // Devolución sugerida por IA (un borrador: se guarda con el botón de siempre)
  const [sugiriendo, setSugiriendo] = useState(false);
  const [notaSugerida, setNotaSugerida] = useState(false);
  const sugerirRef = useRef<AbortController | null>(null);
  useEffect(() => () => sugerirRef.current?.abort(), []);

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
    // 'libre' (el check-in del día) no corresponde a una actividad: acá
    // solo interesan el de inicio y el de fin.
    const map = new Map<string, Partial<Record<CheckinMoment, StudentCheckin>>>();
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
  if (loading) return (
    <div className="acts-container">
      <Esqueleto tipo="tarjetas" cantidad={1} etiqueta="Cargando actividad…" />
      <Esqueleto tipo="tabla" cantidad={6} etiqueta="Cargando entregas…" />
    </div>
  );
  if (!activity) return (
    <div className="acts-container">
      <EstadoVacio
        icono={FileText}
        titulo="No encontramos esta actividad"
        texto="Puede que la hayan eliminado o que el enlace esté incompleto."
        accion={{ etiqueta: 'Ver mis actividades', a: '/actividades', icono: ArrowLeft }}
      />
    </div>
  );

  const submittedCount = submissions.filter(s => s.status === 'submitted' || s.status === 'graded').length;
  const startedCount = submissions.filter(s => s.status === 'in_progress').length;
  const viewedOnly = students.filter(s =>
    !subByStudent.has(s.id) && (eventsByStudent.get(s.id)?.length ?? 0) > 0
  ).length;

  const statusOf = (st: EnrolledStudent) => {
    const sub = subByStudent.get(st.id);
    if (sub?.registro === 'no_entrego' && sub.status === 'in_progress') return { label: 'La está haciendo (anotaste que no la entregó)', cls: 'badge-warning' };
    if (sub?.registro === 'no_entrego' && sub.status !== 'graded' && sub.status !== 'submitted') return { label: 'No entregó', cls: 'badge-danger' };
    if (sub?.registro === 'papel') return { label: sub.status === 'graded' ? 'En papel · calificada' : 'En papel', cls: 'badge-success' };
    if (sub?.status === 'graded') return { label: 'Calificada', cls: 'badge-success' };
    if (sub?.status === 'submitted') return { label: 'Entregada', cls: 'badge-success' };
    if (sub?.status === 'in_progress') return { label: 'En curso', cls: 'badge-warning' };
    if ((eventsByStudent.get(st.id)?.length ?? 0) > 0) return { label: 'Vista', cls: 'badge-neutral' };
    return { label: 'Sin actividad', cls: 'badge-danger' };
  };

  // El borrador es de un estudiante: si se cambia o se cierra el panel, se corta
  const cortarSugerencia = () => {
    sugerirRef.current?.abort();
    sugerirRef.current = null;
    setSugiriendo(false);
    setNotaSugerida(false);
  };

  const closeStudent = () => {
    cortarSugerencia();
    setSelected(null);
  };

  const openStudent = (st: EnrolledStudent) => {
    cortarSugerencia();
    setSelected(st);
    const sub = subByStudent.get(st.id);
    setFeedbackInput(sub?.feedback ?? '');
    setAnotandoPapel(false);
    // Lo de papel no tiene autocorrección
    const auto = sub?.registro === 'papel' ? null : sub?.autoScore ?? null;
    // Por partes: lo que ya puso el docente, o lo que corrigió la base en las de opción múltiple
    if (activity && porPartes(activity.questions)) {
      const base = sub?.puntajes ?? (sub ? puntajesAutomaticos(activity.questions, sub) : {});
      setPartesInput(Object.fromEntries(Object.entries(base).map(([k, v]) => [k, puntosATexto(v)])));
      // La nota sigue a las partes salvo que el docente haya puesto otra
      setNotaTocada(sub?.score != null && !(sub.puntajes && sumaPuntajes(sub.puntajes) === sub.score));
      setGradeInput(sub?.score != null ? String(sub.score)
        : partesCompletas(activity.questions, base) ? String(sumaPuntajes(base)) : '');
    } else {
      setPartesInput({});
      setNotaTocada(sub?.score != null);
      setGradeInput(sub?.score != null ? String(sub.score) : auto != null ? String(auto) : '');
    }
    setObsNote('');
    setObsSaved(false);
    setObsError('');
    setObsHistory([]);
    getObservationsByStudent(st.id).then(setObsHistory).catch(console.error);
  };

  const handleReaction = async (reaction: string) => {
    const sub = selected ? subByStudent.get(selected.id) : null;
    if (!sub) return;
    const next = sub.feedbackReaction === reaction ? null : reaction;
    await setSubmissionReaction(sub.id, next);
    setSubmissions(prev => prev.map(s => s.id === sub.id ? { ...s, feedbackReaction: next } : s));
  };

  const handleAddObservation = async () => {
    if (!selected || !user || !obsNote.trim() || !activity || obsSaving) return;
    setObsSaving(true);
    setObsError('');
    try {
      // Sin señal queda guardada en el equipo y se envía sola
      const resultado = await guardarObservacionResiliente({
        studentId: selected.id,
        teacherId: user.id,
        subjectId: activity.subjectId,
        category: obsCategory,
        note: obsNote,
        descripcion: `Observación sobre ${selected.firstName} ${selected.lastName}`,
      });
      // La huella aparece al instante en la lista de abajo
      setObsHistory(prev => [{
        id: `local-${Date.now()}`,
        studentId: selected.id,
        teacherId: user.id,
        subjectId: activity.subjectId,
        category: obsCategory,
        note: obsNote.trim(),
        createdAt: new Date().toISOString(),
        teacherName: `${user.firstName} ${user.lastName}`,
        pendiente: resultado === 'pendiente',
      }, ...prev]);
      setObsNote('');
      setObsSaved(true);
      setTimeout(() => setObsSaved(false), 2500);
    } catch (err) {
      // Con o sin señal, lo que llega acá es que el servidor no la aceptó
      console.error('Error guardando observación:', err);
      setObsError('El servidor no aceptó la observación. Probá de nuevo; el texto sigue acá.');
    } finally {
      setObsSaving(false);
    }
  };

  const cambiarParte = (qid: string, texto: string) => {
    if (!activity) return;
    const nuevos = { ...partesInput, [qid]: texto };
    setPartesInput(nuevos);
    // Mientras no toque la nota final, la nota es la suma de las partes, y
    // solo cuando están todas: un subtotal no es la nota
    if (!notaTocada) {
      const { puntajes, mala } = leerPuntajes(activity.questions, nuevos);
      if (mala === null) setGradeInput(partesCompletas(activity.questions, puntajes) ? String(sumaPuntajes(puntajes)) : '');
    }
  };

  /** Nota, puntajes por parte y devolución, validados; null si algo está mal (ya avisado). */
  const leerCorreccion = (): { score: number | null; puntajes?: Record<string, number> | null } | null => {
    if (!activity) return null;
    const tope = activity.points ?? 100;
    const score = gradeInput.trim() === '' ? null : Number(gradeInput.replace(',', '.'));
    if (score !== null && (!Number.isFinite(score) || score < 0 || score > tope)) {
      avisar.error('Revisá la nota', `Va de 0 a ${tope}.`);
      return null;
    }
    if (!porPartes(activity.questions)) return { score };
    const { puntajes, mala } = leerPuntajes(activity.questions, partesInput);
    if (mala !== null) {
      const q = activity.questions[mala - 1];
      avisar.error(`Revisá la parte ${mala}`, `Va de 0 a ${puntosATexto(q?.points ?? 0)}.`);
      return null;
    }
    return { score, puntajes };
  };

  const handleGrade = async () => {
    const sub = selected ? subByStudent.get(selected.id) : null;
    if (!sub || !activity || gradeInput === '') return;
    const c = leerCorreccion();
    if (!c || c.score === null) return;
    try {
      if (sub.registro === 'papel') {
        await registrarEntregaDocente(activity.id, sub.studentId, 'papel', { score: c.score, puntajes: c.puntajes, feedback: feedbackInput });
      } else {
        await gradeSubmission(sub.id, c.score, feedbackInput.trim() || undefined, c.puntajes);
      }
    } catch (err) {
      console.error(err);
      avisar.error('No se pudo guardar la nota', err instanceof Error && err.message ? err.message : 'Probá de nuevo.');
      return;
    }
    avisar.exito(selected ? `Nota de ${selected.firstName} guardada` : 'Nota guardada');
    await load();
    closeStudent();
  };

  /** Lo que pasó fuera de la app: lo entregó en papel (con o sin nota) o no lo entregó. null deshace. */
  const anotar = async (registro: 'papel' | 'no_entrego' | null) => {
    if (!selected || !activity || anotando) return;
    let datos: { score?: number | null; puntajes?: Record<string, number> | null; feedback?: string | null } = {};
    if (registro === 'papel') {
      const c = leerCorreccion();
      if (!c) return;
      datos = { score: c.score, puntajes: c.puntajes ?? null, feedback: feedbackInput };
    } else if (registro === null) {
      const sub = subByStudent.get(selected.id);
      if (sub?.registro === 'papel' && (sub.score != null || sub.feedback)) {
        const ok = await confirmar({
          titulo: '¿Borrar lo anotado?',
          mensaje: `Se borra la entrega en papel de ${selected.firstName}, con su nota y su devolución.`,
          accion: 'Borrar',
          peligro: true,
        });
        if (!ok) return;
      }
    }
    // "No lo entregó" va sin devolución: lo que quedó escrito en el panel
    // era para otra cosa, y el alumno lo vería
    setAnotando(true);
    try {
      await registrarEntregaDocente(activity.id, selected.id, registro, datos);
    } catch (err) {
      console.error(err);
      avisar.error('No se pudo anotar', err instanceof Error && err.message ? err.message : 'Probá de nuevo.');
      return;
    } finally {
      setAnotando(false);
    }
    avisar.exito(
      registro === 'papel' ? `Anotado: ${selected.firstName} lo entregó en papel`
        : registro === 'no_entrego' ? `Anotado: ${selected.firstName} no lo entregó`
          : 'Se borró lo anotado',
      registro === 'no_entrego' ? 'Si después lo entrega en la app, queda como entregado.' : undefined,
    );
    await load();
    closeStudent();
  };

  const publicar = async () => {
    if (!activity) return;
    try {
      await updateActivity(activity.id, { status: 'published' });
    } catch (err) {
      avisar.error('No se pudo publicar', err instanceof Error && err.message ? err.message : 'Probá de nuevo.');
      return;
    }
    avisar.exito('Publicada', `Ya la ven en ${activity.courseName ?? 'el curso'}.`);
    await load();
  };

  // Al pedido va la actividad y las respuestas: nunca el nombre ni otros datos del estudiante
  const handleSugerirDevolucion = async () => {
    const sub = selected ? subByStudent.get(selected.id) : null;
    if (!sub || !activity || sugiriendo) return;
    if (feedbackInput.trim()) {
      const ok = await confirmar({
        titulo: '¿Reemplazar lo que escribiste?',
        mensaje: 'La IA escribe un borrador nuevo en lugar de tu devolución. Usa 1 uso de IA.',
        accion: 'Reemplazar',
      });
      if (!ok) return;
    }
    const controller = new AbortController();
    sugerirRef.current = controller;
    setSugiriendo(true);
    try {
      const d = await sugerirDevolucion({
        teacherId: user.id,
        materia: activity.subjectName ?? '',
        curso: activity.courseName ?? '',
        titulo: activity.title,
        descripcion: activity.description,
        consigna: activity.contentMd,
        preguntas: activity.questions,
        respuestas: sub.answers,
        textoLibre: sub.responseText,
        puntos: activity.points ?? null,
        signal: controller.signal,
      });
      if (!d || sugerirRef.current !== controller) return;
      setFeedbackInput(d.devolucion);
      if (d.puntaje != null) {
        setGradeInput(String(d.puntaje));
        setNotaTocada(true);
        setNotaSugerida(true);
      }
      requestAnimationFrame(() => document.getElementById('ad-devolucion')?.focus());
    } catch (err) {
      if (sugerirRef.current !== controller) return;
      avisar.error('No se pudo sugerir la devolución', err instanceof Error ? err.message : 'Probá de nuevo.');
    } finally {
      if (sugerirRef.current === controller) {
        sugerirRef.current = null;
        setSugiriendo(false);
      }
    }
  };

  // Renombrar la actividad: lo que el docente creó lo puede corregir
  const handleRenameActivity = async () => {
    if (!activity) return;
    const next = await pedirTexto({ titulo: 'Cambiar el nombre de la actividad', etiqueta: 'Nombre', valor: activity.title, maxLength: 120 });
    if (next === null) return;
    const title = next.trim();
    if (!title || title === activity.title) return;
    try {
      await updateActivity(activity.id, { title });
      setActivity({ ...activity, title });
      avisar.exito('Nombre cambiado');
    } catch (err) {
      console.error(err);
      avisar.error('No se pudo cambiar el nombre', 'Probá de nuevo.');
    }
  };

  const selectedSub = selected ? subByStudent.get(selected.id) : null;
  const selectedEvents = selected ? (eventsByStudent.get(selected.id) ?? []) : [];

  return (
    <div className="acts-container animate-in">
      <Link to="/actividades" className="acts-back"><ArrowLeft size={15} /> Actividades</Link>

      <div className="card acts-detail-header">
        <div className="flex items-center justify-between gap-4" style={{ flexWrap: 'wrap' }}>
          <div>
            <h2 className="acts-title-row">
              {activity.title}
              <button className="btn-icon" aria-label="Renombrar actividad" title="Cambiar el nombre" onClick={handleRenameActivity}>
                <PencilLine size={15} />
              </button>
            </h2>
            <div className="acts-card-meta mt-1">
              {activity.tipo !== 'actividad' && <span className="badge badge-neutral">{TIPOS_ACTIVIDAD[activity.tipo].emoji} {TIPOS_ACTIVIDAD[activity.tipo].label}</span>}
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
          <div className="flex gap-2" style={{ flexWrap: 'wrap' }}>
            <Link to={`/actividades/${activity.id}/editar`} className="btn btn-outline btn-sm" title="Consigna, partes, puntos, respuesta correcta y fecha">
              <PencilLine size={14} /> Editar
            </Link>
            <BotonCopiarActividad activity={activity} />
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

        {activity.status === 'draft' && (
          <div className="acts-borrador" role="status">
            <span>Es un borrador: los estudiantes todavía no la ven.</span>
            <Link to={`/actividades/${activity.id}/editar`} className="btn btn-outline btn-sm"><PencilLine size={14} /> Seguir armando</Link>
            <button type="button" className="btn btn-primary btn-sm" onClick={publicar}><Send size={14} /> Publicar</button>
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
                </div>
              </div>
              <button className="btn-icon" aria-label="Cerrar" onClick={closeStudent}><X size={18} /></button>
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
                  {selectedSub.registro === 'papel' && Object.keys(selectedSub.answers).length === 0 && !selectedSub.responseText ? (
                    <p className="text-sm text-secondary">Lo hizo en papel: las respuestas están en su hoja.</p>
                  ) : <>
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
                  </>}

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
                      {selectedSub.registro === 'papel' && (
                        <p className="acts-papel">
                          <FileText size={14} aria-hidden="true" /> Lo entregó en papel.
                          <button type="button" className="btn btn-ghost btn-sm" onClick={() => anotar(null)} disabled={anotando}>
                            <Undo2 size={13} /> Deshacer
                          </button>
                        </p>
                      )}
                      {porPartes(activity.questions) && (
                        <NotaPorPartes partes={activity.questions} textos={partesInput} alCambiar={cambiarParte}
                          respuestas={selectedSub.answers} />
                      )}
                      <div className="em-row">
                        <div className="em-field">
                          <label htmlFor="ad-nota">Nota final {activity.points != null ? `(sobre ${activity.points})` : ''}</label>
                          <input
                            id="ad-nota"
                            type="number"
                            value={gradeInput}
                            onChange={e => { setGradeInput(e.target.value); setNotaSugerida(false); setNotaTocada(true); }}
                            min={0}
                            max={activity.points ?? 100}
                          />
                        </div>
                      </div>
                      {notaSugerida && <p className="sdev-aviso mt-1">Nota sugerida por la IA: revisala antes de guardar.</p>}
                      <div className="em-field mt-2">
                        <label htmlFor="ad-devolucion">Devolución (opcional)</label>
                        <textarea
                          id="ad-devolucion"
                          rows={sugiriendo || feedbackInput.length > 120 ? 4 : 2}
                          value={feedbackInput}
                          onChange={e => setFeedbackInput(e.target.value)}
                          placeholder="¡Muy buen trabajo con...!"
                          aria-busy={sugiriendo}
                        />
                      </div>
                      {/* En papel no hay respuestas en la app: la IA no tiene qué leer */}
                      {selectedSub.registro !== 'papel' && (
                        <SugerirDevolucion
                          className="mt-2"
                          cargando={sugiriendo}
                          alTocar={handleSugerirDevolucion}
                          alCancelar={cortarSugerencia}
                        />
                      )}
                      <button className="btn btn-primary btn-sm w-full mt-2" onClick={handleGrade} disabled={gradeInput === ''}>
                        <CheckCircle size={14} /> Guardar calificación
                      </button>
                    </div>
                  )}
                </section>
              )}

              {/* Lo que pasó fuera de la app (063): lo hizo en papel o no lo entregó */}
              {activity.status !== 'draft' && selectedSub?.registro !== 'papel'
                && (!selectedSub || selectedSub.status === 'pending' || selectedSub.status === 'in_progress') && (
                <section>
                  <h4 className="acts-side-title"><FileText size={14} /> En papel</h4>
                  {selectedSub?.registro === 'no_entrego' ? (
                    <p className="acts-papel">
                      <Ban size={14} aria-hidden="true" /> Anotado: no lo entregó.
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => anotar(null)} disabled={anotando}>
                        <Undo2 size={13} /> Deshacer
                      </button>
                    </p>
                  ) : (
                    <p className="text-xs text-subtle">
                      Si lo hizo en la carpeta o en una hoja, anotalo acá: queda en la libreta junto con lo de la app.
                    </p>
                  )}
                  {!anotandoPapel ? (
                    <div className="acts-papel-acciones">
                      <button type="button" className="btn btn-secondary btn-sm" onClick={() => setAnotandoPapel(true)} disabled={anotando}>
                        <FileText size={14} /> Lo entregó en papel
                      </button>
                      {selectedSub?.registro !== 'no_entrego' && (
                        <button type="button" className="btn btn-outline btn-sm" onClick={() => anotar('no_entrego')} disabled={anotando}>
                          <Ban size={14} /> No lo entregó
                        </button>
                      )}
                    </div>
                  ) : (
                    <div className="acts-grade-box">
                      {porPartes(activity.questions) && (
                        <NotaPorPartes partes={activity.questions} textos={partesInput} alCambiar={cambiarParte} />
                      )}
                      <div className="em-field">
                        <label htmlFor="ad-nota-papel">Nota {activity.points != null ? `(sobre ${activity.points})` : ''} — si todavía no lo corregiste, dejala vacía</label>
                        <input id="ad-nota-papel" type="number" value={gradeInput} min={0} max={activity.points ?? 100}
                          onChange={e => { setGradeInput(e.target.value); setNotaTocada(true); }} />
                      </div>
                      <div className="em-field mt-2">
                        <label htmlFor="ad-devolucion-papel">Devolución (opcional)</label>
                        <textarea id="ad-devolucion-papel" rows={2} value={feedbackInput}
                          onChange={e => setFeedbackInput(e.target.value)} placeholder="Lo ve en la app" />
                      </div>
                      <div className="acts-papel-acciones mt-2">
                        <button type="button" className="btn btn-outline btn-sm" onClick={() => setAnotandoPapel(false)} disabled={anotando}>Cancelar</button>
                        <button type="button" className="btn btn-primary btn-sm" onClick={() => anotar('papel')} disabled={anotando}>
                          <CheckCircle size={14} /> {anotando ? 'Guardando…' : 'Guardar'}
                        </button>
                      </div>
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
                  <button
                    className={`btn btn-sm ${obsSaved ? 'btn-primary' : 'btn-secondary'}`}
                    onClick={handleAddObservation}
                    disabled={!obsNote.trim() || obsSaving}
                  >
                    {obsSaving ? 'Guardando...' : obsSaved ? '✓ Guardada' : 'Guardar observación'}
                  </button>
                  {obsError && (
                    <p className="text-xs text-danger">{obsError}</p>
                  )}
                  <p className="text-xs text-subtle">
                    Queda en la ficha del estudiante (sección Estudiantes). Sin señal se guarda en este equipo y se envía sola.
                  </p>
                </div>
                {obsHistory.length > 0 && (
                  <div className="acts-obs-history">
                    <p className="text-xs text-subtle" style={{ marginBottom: 6 }}>
                      Últimas observaciones de {selected.firstName}:
                    </p>
                    {obsHistory.slice(0, 4).map(o => (
                      <div key={o.id} className="acts-obs-item">
                        <p className="acts-obs-note">
                          {OBSERVATION_META[o.category].emoji} {o.note}
                        </p>
                        <span className="acts-obs-meta">
                          {o.teacherName ?? 'Docente'} · {new Date(o.createdAt).toLocaleDateString('es-AR')}
                          {o.pendiente && <span className="text-warning"> · sin enviar (se manda sola con señal)</span>}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
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
