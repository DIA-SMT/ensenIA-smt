import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ClipboardList, Clock, CheckCircle, ChevronRight, GraduationCap, BookMarked, BookOpen } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import {
  getStudentByUserId, getEnrollmentsByStudent, getActivitiesForStudent, getMySubmissions,
} from '../services/activities.service';
import { hasPendingSubmit } from '../services/offline-queue.service';
import { getThresholds, DEFAULT_THRESHOLDS } from '../services/thresholds.service';
import GradesPanel from '../components/GradesPanel';
import SyllabusPanel from '../components/SyllabusPanel';
import { getTerms, pickCurrentTerm } from '../services/gradebook.service';
import type { Activity, ActivitySubmission, Enrollment, Student, AlertThresholds, AcademicTerm } from '../types';
import './StudentPortal.css';
import './Libreta.css';

export default function MisActividades() {
  const { user } = useAuth();
  const [student, setStudent] = useState<Student | null>(null);
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [submissions, setSubmissions] = useState<ActivitySubmission[]>([]);
  const [thresholds, setThresholds] = useState<AlertThresholds | null>(null);
  const [terms, setTerms] = useState<AcademicTerm[] | null>(null);
  const [currentTermId, setCurrentTermId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    getThresholds(user.schoolId).then(setThresholds).catch(console.error);
    getTerms(user.schoolId, new Date().getFullYear())
      .then(ts => { setTerms(ts); setCurrentTermId(pickCurrentTerm(ts)?.id ?? null); })
      .catch(err => { console.error(err); setTerms([]); });
    (async () => {
      try {
        const st = await getStudentByUserId(user.id);
        setStudent(st);
        if (st) {
          const [enr, acts, subs] = await Promise.all([
            getEnrollmentsByStudent(st.id),
            getActivitiesForStudent(),
            getMySubmissions(st.id),
          ]);
          setEnrollments(enr);
          setActivities(acts);
          setSubmissions(subs);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    })();
  }, [user]);

  if (!user) return null;
  if (loading) return <p className="text-secondary p-6">Cargando tus actividades...</p>;

  if (!student) {
    return (
      <div className="sp-container">
        <div className="card acts-empty">
          <GraduationCap size={36} className="text-cyan" />
          <h3>Tu cuenta no está vinculada a un curso</h3>
          <p className="text-secondary text-sm">Pedile a tu docente que te agregue a la lista del curso.</p>
        </div>
      </div>
    );
  }

  const subFor = (activityId: string) => submissions.find(s => s.activityId === activityId);

  const statusChip = (a: Activity) => {
    const sub = subFor(a.id);
    if (hasPendingSubmit(a.id)) {
      return <span className="badge badge-warning">Entrega esperando conexión</span>;
    }
    if (sub?.status === 'graded') {
      return <span className="badge badge-success">Calificada: {sub.score}</span>;
    }
    if (sub?.status === 'submitted') {
      return <span className="badge badge-success"><CheckCircle size={11} /> Entregada{sub.autoScore != null ? ` · ${sub.autoScore}` : ''}</span>;
    }
    if (sub?.status === 'in_progress') return <span className="badge badge-warning">En curso</span>;
    return <span className="badge badge-cyan">Nueva</span>;
  };

  const pending = activities.filter(a => {
    const s = subFor(a.id);
    return !s || s.status === 'in_progress';
  });
  const doneCount = activities.length - pending.length;

  return (
    <div className="sp-container animate-in">
      <div className="sp-hero card">
        <div>
          <h2>¡Hola, {student.firstName}! 👋</h2>
          <p className="text-secondary text-sm">
            {pending.length > 0
              ? `Tenés ${pending.length} actividad${pending.length !== 1 ? 'es' : ''} pendiente${pending.length !== 1 ? 's' : ''}.`
              : '¡Estás al día con todas tus actividades! 🎉'}
          </p>
          <div className="sp-enrollments">
            {enrollments.map(e => (
              <span key={e.id} className="sp-enrollment-chip" title={`Tu ID en ${e.subjectName}`}>
                {e.subjectName} · {e.courseName}
                <code>{e.enrollmentCode}</code>
              </span>
            ))}
          </div>
        </div>
        <div className="sp-hero-stats">
          <div className="sp-hero-stat">
            <span className="sp-hero-num">{pending.length}</span>
            <span className="sp-hero-label">pendientes</span>
          </div>
          <div className="sp-hero-stat">
            <span className="sp-hero-num text-success">{doneCount}</span>
            <span className="sp-hero-label">entregadas</span>
          </div>
        </div>
      </div>

      <h3 className="sp-section-title"><BookOpen size={17} /> Temario</h3>
      <div className="card" style={{ padding: 'var(--space-4)' }}>
        <SyllabusPanel terms={terms} initialTermId={currentTermId} voice="propia" />
      </div>

      <h3 className="sp-section-title"><BookMarked size={17} /> Mis notas</h3>
      <div className="card" style={{ padding: 'var(--space-4)' }}>
        {/* Umbrales reales de la escuela (011): la nota se pinta con la
            misma regla que le comunican a su familia. */}
        <GradesPanel studentId={student.id} thresholds={thresholds ?? DEFAULT_THRESHOLDS} voice="propia" />
      </div>

      <h3 className="sp-section-title"><ClipboardList size={17} /> Mis actividades</h3>

      {activities.length === 0 && (
        <div className="card acts-empty">
          <ClipboardList size={32} className="text-secondary" />
          <p className="text-secondary">Tus docentes todavía no publicaron actividades.</p>
        </div>
      )}

      <div className="sp-activity-list">
        {activities.map(a => {
          const sub = subFor(a.id);
          const isDone = sub?.status === 'submitted' || sub?.status === 'graded';
          return (
            <Link key={a.id} to={`/mis-actividades/${a.id}`} className={`card card-interactive sp-activity-card ${isDone ? 'done' : ''}`}>
              <div className="sp-activity-main">
                <h4>{a.title}</h4>
                {a.description && <p className="text-sm text-secondary">{a.description}</p>}
                <div className="sp-activity-meta">
                  <span className="badge badge-cyan">{a.subjectName}</span>
                  {statusChip(a)}
                  {a.dueDate && !isDone && (
                    <span className={`text-xs flex items-center gap-1 ${new Date(a.dueDate) < new Date() ? 'text-danger' : 'text-subtle'}`}>
                      <Clock size={12} /> Vence {new Date(a.dueDate).toLocaleDateString('es-AR')}
                    </span>
                  )}
                  {a.questions.length > 0 && (
                    <span className="text-xs text-subtle">{a.questions.length} preguntas</span>
                  )}
                </div>
              </div>
              <ChevronRight size={18} className="text-subtle" />
            </Link>
          );
        })}
      </div>
    </div>
  );
}
