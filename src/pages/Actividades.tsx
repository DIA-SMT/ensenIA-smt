import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  ClipboardList, Users, CheckCircle, Clock, ChevronRight, Sparkles,
  CircleDot, Lock, Unlock, Trash2, QrCode,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import {
  getActivitiesByTeacher, getSubmissionsByActivity, updateActivityStatus, deleteActivity,
} from '../services/activities.service';
import QrModal from '../components/QrModal';
import type { Activity, ActivitySubmission } from '../types';
import './Actividades.css';

interface ActivityWithStats extends Activity {
  submitted: number;
  avgScore: number | null;
}

export default function Actividades() {
  const { user } = useAuth();
  const [activities, setActivities] = useState<ActivityWithStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [qrFor, setQrFor] = useState<Activity | null>(null);

  const load = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const acts = await getActivitiesByTeacher(user.id);
      const withStats: ActivityWithStats[] = await Promise.all(
        acts.map(async a => {
          let subs: ActivitySubmission[] = [];
          try { subs = await getSubmissionsByActivity(a.id); } catch { /* sin datos */ }
          const submitted = subs.filter(s => s.status === 'submitted' || s.status === 'graded');
          const scores = submitted
            .map(s => s.score ?? s.autoScore)
            .filter((n): n is number => n !== null && n !== undefined);
          return {
            ...a,
            submitted: submitted.length,
            avgScore: scores.length ? scores.reduce((x, y) => x + y, 0) / scores.length : null,
          };
        })
      );
      setActivities(withStats);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [user]);

  if (!user) return null;

  const handleToggleStatus = async (a: Activity) => {
    await updateActivityStatus(a.id, a.status === 'closed' ? 'published' : 'closed');
    load();
  };

  const handleDelete = async (a: Activity) => {
    if (!window.confirm(`¿Eliminar "${a.title}"? Se pierden las entregas y la huella digital.`)) return;
    await deleteActivity(a.id);
    load();
  };

  return (
    <div className="acts-container animate-in">
      <div className="acts-header">
        <div>
          <h2 className="flex items-center gap-2"><ClipboardList size={22} className="text-cyan" /> Actividades</h2>
          <p className="text-secondary text-sm">
            Publicá contenido desde el <Link to="/ia-lab">Laboratorio IA</Link> y seguí el trabajo de tus estudiantes acá.
          </p>
        </div>
      </div>

      {loading && <p className="text-secondary p-6">Cargando actividades...</p>}

      {!loading && activities.length === 0 && (
        <div className="card acts-empty">
          <Sparkles size={36} className="text-ia-accent" />
          <h3>Todavía no publicaste actividades</h3>
          <p className="text-secondary text-sm">
            Generá una actividad o evaluación en el Laboratorio IA y usá el botón <strong>"Publicar actividad"</strong>:
            tus estudiantes la reciben al instante y vos ves su huella digital.
          </p>
          <Link to="/ia-lab" className="btn btn-primary btn-sm">Ir al Laboratorio IA</Link>
        </div>
      )}

      <div className="acts-list">
        {activities.map(a => (
          <div key={a.id} className={`card acts-card ${a.status === 'closed' ? 'closed' : ''}`}>
            <div className="acts-card-main">
              <Link to={`/actividades/${a.id}`} className="acts-card-title">
                {a.title}
                <ChevronRight size={16} />
              </Link>
              <div className="acts-card-meta">
                <span className="badge badge-cyan">{a.subjectName}</span>
                <span className="badge badge-neutral">{a.courseName}</span>
                {a.sourceTool && <span className="badge badge-ia">IA</span>}
                {a.status === 'closed'
                  ? <span className="badge badge-danger">Cerrada</span>
                  : <span className="badge badge-success"><CircleDot size={10} /> Publicada</span>}
                {a.dueDate && (
                  <span className="text-xs text-subtle flex items-center gap-1">
                    <Clock size={12} /> Vence {new Date(a.dueDate).toLocaleDateString('es-AR')}
                  </span>
                )}
                {a.questions.length > 0 && (
                  <span className="text-xs text-subtle">{a.questions.length} preguntas</span>
                )}
              </div>
            </div>
            <div className="acts-card-stats">
              <div className="acts-stat">
                <span className="acts-stat-value"><CheckCircle size={14} className="text-success" /> {a.submitted}</span>
                <span className="acts-stat-label">entregas</span>
              </div>
              <div className="acts-stat">
                <span className="acts-stat-value">{a.avgScore !== null ? a.avgScore.toFixed(1) : '—'}</span>
                <span className="acts-stat-label">promedio</span>
              </div>
              <div className="acts-card-actions">
                <button
                  className="btn-icon"
                  title="QR para el aula: escanean y entran directo"
                  onClick={() => setQrFor(a)}
                >
                  <QrCode size={16} />
                </button>
                <button
                  className="btn-icon"
                  title={a.status === 'closed' ? 'Reabrir' : 'Cerrar entregas'}
                  onClick={() => handleToggleStatus(a)}
                >
                  {a.status === 'closed' ? <Unlock size={16} /> : <Lock size={16} />}
                </button>
                <button className="btn-icon" title="Eliminar" onClick={() => handleDelete(a)}>
                  <Trash2 size={16} />
                </button>
                <Link to={`/actividades/${a.id}`} className="btn btn-secondary btn-sm">
                  <Users size={14} /> Resultados
                </Link>
              </div>
            </div>
          </div>
        ))}
      </div>

      {qrFor && (
        <QrModal
          path={`/mis-actividades/${qrFor.id}`}
          title={qrFor.title}
          onClose={() => setQrFor(null)}
        />
      )}
    </div>
  );
}
