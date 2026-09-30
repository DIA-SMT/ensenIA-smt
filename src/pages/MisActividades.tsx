import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  ClipboardList, Clock, CheckCircle, ChevronRight, GraduationCap, BookMarked, BookOpen,
  ArrowRight, Rocket, WifiOff, Award, Sparkles, Radio,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import {
  getStudentByUserId, getEnrollmentsByStudent, getActivitiesForStudent, getMySubmissions,
} from '../services/activities.service';
import { saveCheckin, getCheckinsByStudent } from '../services/wellbeing.service';
import { getAchievementsByStudent, totalPoints } from '../services/gamification.service';
import { getLiveSessionForCourse, type LiveSession } from '../services/live.service';
import { hasPendingSubmit } from '../services/offline-queue.service';
import { getThresholds, DEFAULT_THRESHOLDS } from '../services/thresholds.service';
import GradesPanel from '../components/GradesPanel';
import SyllabusPanel from '../components/SyllabusPanel';
import { getTerms, pickCurrentTerm } from '../services/gradebook.service';
import {
  FEELING_META,
  type Activity, type ActivitySubmission, type Enrollment, type Student,
  type CheckinFeeling, type StudentAchievement, type AlertThresholds, type AcademicTerm,
} from '../types';
// Estilos compartidos con otras pantallas: desde que cada pantalla se baja
// por separado, lo que no se importa acá no llega.
import './Actividades.css';
import './StudentPortal.css';
import './Libreta.css';

const DIA_MS = 24 * 60 * 60 * 1000;

/** "Vence hoy", "Vence mañana", "Vence en 3 días", "Venció hace 2 días". */
function vencimiento(fecha: string): { texto: string; urgente: boolean; vencida: boolean } {
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  const dia = new Date(fecha); dia.setHours(0, 0, 0, 0);
  const dias = Math.round((dia.getTime() - hoy.getTime()) / DIA_MS);
  if (dias < 0) return { texto: dias === -1 ? 'Venció ayer' : `Venció hace ${-dias} días`, urgente: true, vencida: true };
  if (dias === 0) return { texto: 'Vence hoy', urgente: true, vencida: false };
  if (dias === 1) return { texto: 'Vence mañana', urgente: true, vencida: false };
  if (dias < 7) return { texto: `Vence en ${dias} días`, urgente: false, vencida: false };
  return { texto: `Vence el ${new Date(fecha).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })}`, urgente: false, vencida: false };
}

/** Anillo de avance dibujado a mano: unos bytes de SVG, sin librerías. */
function Anillo({ hechas, total }: { hechas: number; total: number }) {
  const r = 34;
  const c = 2 * Math.PI * r;
  const parte = total > 0 ? hechas / total : 0;
  return (
    <div className="sp-anillo" role="img" aria-label={`Entregaste ${hechas} de ${total} ${total === 1 ? 'actividad' : 'actividades'}`}>
      <svg width="88" height="88" viewBox="0 0 88 88" aria-hidden="true" focusable="false">
        <circle cx="44" cy="44" r={r} fill="none" stroke="rgba(255,255,255,0.22)" strokeWidth="9" />
        {parte > 0 && (
          <circle
            cx="44" cy="44" r={r} fill="none" stroke="#FFFFFF" strokeWidth="9" strokeLinecap="round"
            strokeDasharray={`${c * parte} ${c}`} transform="rotate(-90 44 44)"
          />
        )}
      </svg>
      <span className="sp-anillo-num" aria-hidden="true"><span>{hechas}<small>/{total}</small></span></span>
    </div>
  );
}

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
  const [thresholds, setThresholds] = useState<AlertThresholds | null>(null);
  const [terms, setTerms] = useState<AcademicTerm[] | null>(null);
  const [currentTermId, setCurrentTermId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [fallo, setFallo] = useState(false);

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
        setFallo(true);
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
  if (loading) return <p className="text-secondary p-6" role="status">Cargando tus actividades…</p>;

  if (fallo && !student) {
    return (
      <div className="sp-container">
        <div className="card acts-empty" role="alert">
          <WifiOff size={32} className="text-secondary" aria-hidden="true" />
          <h2>No pudimos traer tus actividades</h2>
          <p className="text-secondary text-sm">Revisá la conexión. Lo que ya abriste en este celular sigue disponible.</p>
        </div>
      </div>
    );
  }

  if (!student) {
    return (
      <div className="sp-container">
        <div className="card acts-empty">
          <GraduationCap size={36} className="text-cyan" aria-hidden="true" />
          <h2>Tu cuenta no está vinculada a un curso</h2>
          <p className="text-secondary text-sm">Pedile a tu docente que te agregue a la lista del curso.</p>
        </div>
      </div>
    );
  }

  const subFor = (activityId: string) => submissions.find(s => s.activityId === activityId);
  const hecha = (a: Activity) => {
    const s = subFor(a.id);
    return s?.status === 'submitted' || s?.status === 'graded';
  };

  const statusChip = (a: Activity) => {
    const sub = subFor(a.id);
    if (hasPendingSubmit(a.id)) {
      return <span className="badge badge-warning"><WifiOff size={11} aria-hidden="true" /> Se manda cuando haya conexión</span>;
    }
    if (sub?.status === 'graded') {
      return <span className="badge badge-success">Calificada: {sub.score}</span>;
    }
    if (sub?.status === 'submitted') {
      return <span className="badge badge-success"><CheckCircle size={11} aria-hidden="true" /> Entregada{sub.autoScore != null ? ` · ${sub.autoScore}` : ''}</span>;
    }
    if (sub?.status === 'in_progress') return <span className="badge badge-warning">Empezada</span>;
    return <span className="badge badge-cyan">Nueva</span>;
  };

  // Pendientes primero, la que vence antes arriba; después las hechas.
  const porVencimiento = (a: Activity, b: Activity) =>
    (a.dueDate ? new Date(a.dueDate).getTime() : Infinity) - (b.dueDate ? new Date(b.dueDate).getTime() : Infinity);
  const pendientes = activities.filter(a => !hecha(a)).sort(porVencimiento);
  const hechas = activities.filter(hecha);
  const siguiente = pendientes[0];
  const empezada = siguiente ? subFor(siguiente.id)?.status === 'in_progress' : false;

  return (
    <div className="sp-container sp-v4">
      {/* ── Lo que sigue ── */}
      <section className="sp-hoy" aria-labelledby="sp-hoy-titulo">
        <div className="sp-hoy-texto">
          <p className="sp-hoy-saludo">¡Hola, {student.firstName}!</p>
          {siguiente ? (
            <h2 id="sp-hoy-titulo" className="sp-hoy-titulo">
              {pendientes.length === 1 ? 'Te queda una actividad' : `Te quedan ${pendientes.length} actividades`}
            </h2>
          ) : (
            <>
              <h2 id="sp-hoy-titulo" className="sp-hoy-titulo">
                {activities.length ? 'Estás al día' : 'Todavía no hay actividades'}
              </h2>
              <p className="sp-hoy-bajada">
                {activities.length
                  ? 'Entregaste todo. Si querés, repasá un rato y sumá a tu racha.'
                  : 'Cuando tus docentes publiquen algo, aparece acá.'}
              </p>
              <Link to="/estudiar" className="btn sp-hoy-btn"><Rocket size={16} aria-hidden="true" /> Ir a estudiar</Link>
            </>
          )}
        </div>
        {activities.length > 0 && <Anillo hechas={hechas.length} total={activities.length} />}
        {siguiente && (
          <Link to={`/mis-actividades/${siguiente.id}`} className="sp-hoy-siguiente">
            <span className="sp-hoy-siguiente-et">{empezada ? 'Seguí con' : 'La que sigue'}</span>
            <span className="sp-hoy-siguiente-titulo">{siguiente.title}</span>
            <span className="sp-hoy-siguiente-meta">
              {siguiente.subjectName}
              {siguiente.dueDate && <> · {vencimiento(siguiente.dueDate).texto}</>}
            </span>
            <span className="sp-hoy-siguiente-ir" aria-hidden="true"><ArrowRight size={18} /></span>
          </Link>
        )}
      </section>

      {/* ── Clase en vivo ahora ── */}
      {liveSession && (
        <Link to="/clase" className="card card-interactive sp-live-banner">
          <span className="sp-live-dot" aria-hidden="true" />
          <div>
            <h4><Radio size={15} aria-hidden="true" /> ¡{liveSession.title} está en vivo!</h4>
            <p className="text-sm text-secondary">Entrá para participar desde tu celular.</p>
          </div>
          <ChevronRight size={18} className="text-subtle" aria-hidden="true" />
        </Link>
      )}

      {/* ── Check-in del día: siempre podés decir cómo venís ── */}
      <div className="card sp-checkin-card">
        {checkinDone ? (
          <div className="sp-checkin-done">
            <span className="sp-checkin-emoji" aria-hidden="true">{todayFeeling ? FEELING_META[todayFeeling].emoji : '💙'}</span>
            <p>
              ¡Gracias por contarnos cómo venís hoy! Tus docentes lo tienen en cuenta.
              {streak >= 2 && <> <span title="Días de clase seguidos contando cómo te sentís">🔥 {streak} días seguidos</span></>}
            </p>
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
                  aria-pressed={pickedFeeling === key}
                  title={meta.label}
                >
                  <span className="sp-feeling-emoji" aria-hidden="true">{meta.emoji}</span>
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
                    aria-label="Contanos algo más (opcional)"
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
        <section aria-labelledby="sp-logros">
          <h2 className="sp-section-title" id="sp-logros">
            <Award size={18} aria-hidden="true" /> Mis logros
            <span className="text-warning text-sm"> · ⭐ {totalPoints(achievements)} pts</span>
          </h2>
          <div className="sp-achievements-row">
            {achievements.slice(0, 8).map(a => (
              <div key={a.id} className="sp-achievement-chip" title={`${a.title} · +${a.points} pts${a.reason ? ` · ${a.reason}` : ''}`}>
                <span className="sp-achievement-big" aria-hidden="true">{a.emoji}</span>
                <span className="sp-achievement-name">{a.title}</span>
                <span className="sp-achievement-pts">+{a.points}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Acceso a la guía IA ── */}
      <Link to="/mi-guia" className="card card-interactive sp-guia-banner">
        <div className="sp-guia-banner-icon" aria-hidden="true"><Sparkles size={20} /></div>
        <div>
          <h4>Mi guía IA</h4>
          <p className="text-sm text-secondary">Repasá con preguntas o pedí que te expliquen fácil el material.</p>
        </div>
        <ChevronRight size={18} className="text-subtle" aria-hidden="true" />
      </Link>

      {enrollments.length > 0 && (
        <ul className="sp-enrollments" aria-label="Tus materias y tu código en cada una">
          {enrollments.map(e => (
            <li key={e.id} className="sp-enrollment-chip">
              {e.subjectName} · {e.courseName}
              <code>{e.enrollmentCode}</code>
            </li>
          ))}
        </ul>
      )}

      {/* ── Actividades ── */}
      <section aria-labelledby="sp-acts">
        <h2 className="sp-section-title" id="sp-acts"><ClipboardList size={18} aria-hidden="true" /> Mis actividades</h2>
        {activities.length === 0 && (
          <div className="card acts-empty">
            <ClipboardList size={32} className="text-secondary" aria-hidden="true" />
            <p className="text-secondary">Tus docentes todavía no publicaron actividades.</p>
          </div>
        )}
        <ul className="sp-activity-list">
          {[...pendientes, ...hechas].map(a => {
            const isDone = hecha(a);
            const venc = a.dueDate && !isDone ? vencimiento(a.dueDate) : null;
            return (
              <li key={a.id}>
                <Link to={`/mis-actividades/${a.id}`} className={`card card-interactive sp-activity-card ${isDone ? 'done' : ''}`}>
                  <div className="sp-activity-main">
                    <h3>{a.title}</h3>
                    {a.description && <p className="text-sm text-secondary">{a.description}</p>}
                    <div className="sp-activity-meta">
                      <span className="badge badge-cyan">{a.subjectName}</span>
                      {statusChip(a)}
                      {venc && (
                        <span className={`text-xs flex items-center gap-1 ${venc.urgente ? 'text-danger font-semibold' : 'text-subtle'}`}>
                          <Clock size={12} aria-hidden="true" /> {venc.texto}
                        </span>
                      )}
                      {a.questions.length > 0 && (
                        <span className="text-xs text-subtle">{a.questions.length} {a.questions.length === 1 ? 'pregunta' : 'preguntas'}</span>
                      )}
                    </div>
                  </div>
                  <ChevronRight size={18} className="text-subtle" aria-hidden="true" />
                </Link>
              </li>
            );
          })}
        </ul>
      </section>

      <section aria-labelledby="sp-notas">
        <h2 className="sp-section-title" id="sp-notas"><BookMarked size={18} aria-hidden="true" /> Mis notas</h2>
        <div className="card sp-panel">
          {/* Umbrales reales de la escuela (011): la nota se pinta con la
              misma regla que le comunican a su familia. */}
          <GradesPanel studentId={student.id} thresholds={thresholds ?? DEFAULT_THRESHOLDS} voice="propia" />
        </div>
      </section>

      <section aria-labelledby="sp-temario">
        <h2 className="sp-section-title" id="sp-temario"><BookOpen size={18} aria-hidden="true" /> Temario</h2>
        <div className="card sp-panel">
          <SyllabusPanel terms={terms} initialTermId={currentTermId} voice="propia" />
        </div>
      </section>
    </div>
  );
}
