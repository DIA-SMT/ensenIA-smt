import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  ClipboardList, Clock, CheckCircle, ChevronRight, GraduationCap, BookMarked, BookOpen,
  ArrowRight, Rocket, WifiOff,
} from 'lucide-react';
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
        setFallo(true);
      } finally {
        setLoading(false);
      }
    })();
  }, [user]);

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
