import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ClipboardList, Clock, CheckCircle, ChevronRight, GraduationCap, Award, Sparkles, Radio } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import {
  getStudentByUserId, getEnrollmentsByStudent, getActivitiesForStudent, getMySubmissions,
} from '../services/activities.service';
import { saveCheckin, getCheckinsByStudent } from '../services/wellbeing.service';
import { getAchievementsByStudent, totalPoints } from '../services/gamification.service';
import { getLiveSessionForCourse, type LiveSession } from '../services/live.service';
import { hasPendingSubmit } from '../services/offline-queue.service';
import {
  FEELING_META,
  type Activity, type ActivitySubmission, type Enrollment, type Student,
  type CheckinFeeling, type StudentAchievement,
} from '../types';
import './StudentPortal.css';

const isToday = (iso: string) => new Date(iso).toDateString() === new Date().toDateString();

/**
 * Días de clase seguidos con check-in. Sábado y domingo no cuentan ni cortan
 * la racha: si el viernes y el lunes tienen check-in, la racha sigue.
 */
function computeStreak(checkins: { moment: string; createdAt: string }[]): number {
  const days = new Set(
    checkins.filter(c => c.moment === 'libre').map(c => new Date(c.createdAt).toDateString()),
  );
  if (days.size === 0) return 0;
  const cursor = new Date();
  cursor.setHours(0, 0, 0, 0);
  // Si hoy todavía no hizo el check-in, la racha se cuenta desde ayer
  if (!days.has(cursor.toDateString())) cursor.setDate(cursor.getDate() - 1);
  let streak = 0;
  for (let i = 0; i < 90; i++) {
    const dow = cursor.getDay();
    if (dow === 0 || dow === 6) { cursor.setDate(cursor.getDate() - 1); continue; }
    if (!days.has(cursor.toDateString())) break;
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

export default function MisActividades() {
  const { user } = useAuth();
  const [student, setStudent] = useState<Student | null>(null);
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [submissions, setSubmissions] = useState<ActivitySubmission[]>([]);
  const [loading, setLoading] = useState(true);

  // Clase en vivo
  const [liveSession, setLiveSession] = useState<LiveSession | null>(null);

  // Gamificación + check-in del día
  const [achievements, setAchievements] = useState<StudentAchievement[]>([]);
  const [todayFeeling, setTodayFeeling] = useState<CheckinFeeling | null>(null);
  const [checkinDone, setCheckinDone] = useState(false);
  const [streak, setStreak] = useState(0);
  const [wantsToTalk, setWantsToTalk] = useState(false);
  const [pickedFeeling, setPickedFeeling] = useState<CheckinFeeling | null>(null);
  const [feelingComment, setFeelingComment] = useState('');
  const [savingCheckin, setSavingCheckin] = useState(false);

  useEffect(() => {
    if (!user) return;
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

          // No bloquean la carga principal
          getLiveSessionForCourse(st.courseId).then(setLiveSession).catch(console.error);
          getAchievementsByStudent(st.id).then(setAchievements).catch(console.error);
          getCheckinsByStudent(st.id, 60).then(chks => {
            const today = chks.find(c => c.moment === 'libre' && isToday(c.createdAt));
            if (today) { setCheckinDone(true); setTodayFeeling(today.feeling); }
            setStreak(computeStreak(chks));
          }).catch(console.error);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    })();
  }, [user]);

  // El aviso de clase en vivo se refresca solo
  useEffect(() => {
    if (!student) return;
    const id = window.setInterval(() => {
      getLiveSessionForCourse(student.courseId).then(setLiveSession).catch(() => {});
    }, 20000);
    return () => window.clearInterval(id);
  }, [student?.id]);

  const handleSaveCheckin = async () => {
    if (!student || !pickedFeeling || savingCheckin) return;
    setSavingCheckin(true);
    try {
      await saveCheckin({
        studentId: student.id,
        moment: 'libre',
        feeling: pickedFeeling,
        comment: feelingComment.trim() || undefined,
        wantsToTalk,
      });
      setCheckinDone(true);
      setTodayFeeling(pickedFeeling);
      setStreak(v => v + 1);
    } catch (err) {
      console.error('Error guardando check-in:', err);
      alert('No se pudo guardar. Probá de nuevo en un ratito.');
    } finally {
      setSavingCheckin(false);
    }
  };

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
          <div className="sp-hero-stat">
            <span className="sp-hero-num text-warning">{totalPoints(achievements)}</span>
            <span className="sp-hero-label">⭐ puntos</span>
          </div>
          {streak >= 2 && (
            <div className="sp-hero-stat" title="Días de clase seguidos contando cómo te sentís">
              <span className="sp-hero-num">🔥{streak}</span>
              <span className="sp-hero-label">días seguidos</span>
            </div>
          )}
        </div>
      </div>

      {/* ── Clase en vivo ahora ── */}
      {liveSession && (
        <Link to="/clase" className="card card-interactive sp-live-banner">
          <span className="sp-live-dot" />
          <div>
            <h4><Radio size={15} /> ¡{liveSession.title} está en vivo!</h4>
            <p className="text-sm text-secondary">Entrá para participar desde tu celular.</p>
          </div>
          <ChevronRight size={18} className="text-subtle" />
        </Link>
      )}

      {/* ── Check-in del día: siempre podés decir cómo venís ── */}
      <div className="card sp-checkin-card">
        {checkinDone ? (
          <div className="sp-checkin-done">
            <span className="sp-checkin-emoji">{todayFeeling ? FEELING_META[todayFeeling].emoji : '💙'}</span>
            <p>¡Gracias por contarnos cómo venís hoy! Tus docentes lo tienen en cuenta.</p>
          </div>
        ) : (
          <>
            <p className="sp-checkin-title">¿Cómo venís hoy?</p>
            <div className="sp-checkin-feelings">
              {(Object.entries(FEELING_META) as [CheckinFeeling, typeof FEELING_META[CheckinFeeling]][]).map(([key, meta]) => (
                <button
                  key={key}
                  className={`sp-feeling-btn ${pickedFeeling === key ? 'selected' : ''}`}
                  onClick={() => setPickedFeeling(key)}
                  title={meta.label}
                >
                  <span className="sp-feeling-emoji">{meta.emoji}</span>
                  <span className="sp-feeling-label">{meta.label}</span>
                </button>
              ))}
            </div>
            {pickedFeeling && (
              <>
                <div className="sp-checkin-extra">
                  <input
                    type="text"
                    placeholder="¿Querés contar algo más? (opcional)"
                    value={feelingComment}
                    maxLength={200}
                    onChange={e => setFeelingComment(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') handleSaveCheckin(); }}
                  />
                  <button className="btn btn-primary btn-sm" onClick={handleSaveCheckin} disabled={savingCheckin}>
                    {savingCheckin ? 'Guardando...' : 'Enviar'}
                  </button>
                </div>
                <label className="sp-talk-toggle">
                  <input
                    type="checkbox"
                    checked={wantsToTalk}
                    onChange={e => setWantsToTalk(e.target.checked)}
                  />
                  🤝 Me gustaría hablar con un docente
                </label>
              </>
            )}
            <p className="sp-checkin-hint">Es privado entre vos y tus docentes. No es una nota.</p>
          </>
        )}
      </div>

      {/* ── Mis logros ── */}
      {achievements.length > 0 && (
        <>
          <h3 className="sp-section-title"><Award size={17} /> Mis logros</h3>
          <div className="sp-achievements-row">
            {achievements.slice(0, 8).map(a => (
              <div key={a.id} className="sp-achievement-chip" title={`${a.title} · +${a.points} pts${a.reason ? ` · ${a.reason}` : ''}`}>
                <span className="sp-achievement-big">{a.emoji}</span>
                <span className="sp-achievement-name">{a.title}</span>
                <span className="sp-achievement-pts">+{a.points}</span>
              </div>
            ))}
          </div>
        </>
      )}

      {/* ── Acceso a la guía IA ── */}
      <Link to="/mi-guia" className="card card-interactive sp-guia-banner">
        <div className="sp-guia-banner-icon"><Sparkles size={20} /></div>
        <div>
          <h4>Mi guía IA</h4>
          <p className="text-sm text-secondary">Repasá con preguntas o pedí que te expliquen fácil el material.</p>
        </div>
        <ChevronRight size={18} className="text-subtle" />
      </Link>

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
