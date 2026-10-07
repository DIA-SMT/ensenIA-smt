import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  Users, CheckCircle, Clock, ChevronRight, Sparkles,
  CircleDot, Lock, Unlock, Trash2, QrCode, Search,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { getSubjects } from '../services/subjects.service';
import { asignacionesDe, claveAsignacion } from '../lib/asignaciones';
import {
  getActivitiesByTeacher, getSubmissionsByActivity, updateActivityStatus, deleteActivity,
} from '../services/activities.service';
import QrModal from '../components/QrModal';
import BotonCopiarActividad from '../components/CopiarActividad';
import { avisar, confirmar } from '../components/ui/avisar';
import EstadoVacio from '../components/ui/EstadoVacio';
import EmojiMateria from '../components/ui/EmojiMateria';
import { Esqueleto } from '../components/ui/Esqueleto';
import type { Activity, ActivitySubmission, Subject } from '../types';
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
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'todas' | 'abiertas' | 'pendientes' | 'cerradas'>('todas');
  // Materia · curso elegido ("materia|curso"); null = todos, agrupados por curso
  const [curso, setCurso] = useState<string | null>(null);
  const [materias, setMaterias] = useState<Subject[]>([]);

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
  useEffect(() => {
    if (user) getSubjects(user.schoolId).then(setMaterias).catch(console.error);
  }, [user]);

  // Los cursos del docente, más los de actividades viejas de cursos que ya no tiene
  const asignaciones = useMemo(() => {
    const nombre = (id: string) => materias.find(m => m.id === id)?.name
      ?? activities.find(a => a.subjectId === id)?.subjectName ?? '';
    const propias = [...(user?.subjects ?? [])];
    for (const a of activities) {
      if (!propias.some(x => x.subjectId === a.subjectId && x.courseId === a.courseId)) {
        propias.push({ subjectId: a.subjectId, courseId: a.courseId, courseName: a.courseName ?? '' });
      }
    }
    return asignacionesDe(propias, nombre);
  }, [user, materias, activities]);

  // Con muchas actividades la lista se volvía inmanejable: buscar por
  // título/materia/curso, y filtrar por lo que el docente suele buscar.
  const filtered = useMemo(() => {
    let list = activities;
    if (curso) list = list.filter(a => claveAsignacion(a.subjectId, a.courseId) === curso);
    if (filter === 'abiertas') list = list.filter(a => a.status !== 'closed');
    else if (filter === 'cerradas') list = list.filter(a => a.status === 'closed');
    else if (filter === 'pendientes') list = list.filter(a => a.submitted > 0);
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(a =>
        a.title.toLowerCase().includes(q) ||
        (a.subjectName ?? '').toLowerCase().includes(q) ||
        (a.courseName ?? '').toLowerCase().includes(q)
      );
    }
    return list;
  }, [activities, filter, search, curso]);

  // Sin curso elegido ni búsqueda: una sección por materia · curso
  const agrupado = !curso && !search.trim();
  const grupos = useMemo(() => asignaciones
    .map(a => ({ ...a, items: filtered.filter(x => claveAsignacion(x.subjectId, x.courseId) === a.clave) }))
    .filter(g => g.items.length > 0), [asignaciones, filtered]);

  if (!user) return null;

  const handleToggleStatus = async (a: Activity) => {
    const reabrir = a.status === 'closed';
    try {
      await updateActivityStatus(a.id, reabrir ? 'published' : 'closed');
    } catch (err) {
      console.error(err);
      avisar.error(reabrir ? 'No se pudo reabrir la actividad' : 'No se pudieron cerrar las entregas', 'Probá de nuevo.');
      return;
    }
    avisar.exito(reabrir ? 'Actividad reabierta' : 'Entregas cerradas', a.title);
    load();
  };

  const handleDelete = async (a: Activity) => {
    const ok = await confirmar({
      titulo: `¿Eliminar "${a.title}"?`,
      mensaje: 'Se pierden las entregas y la huella digital. No se puede deshacer.',
      accion: 'Eliminar',
      peligro: true,
    });
    if (!ok) return;
    try {
      await deleteActivity(a.id);
    } catch (err) {
      console.error(err);
      avisar.error('No se pudo eliminar la actividad', 'Probá de nuevo.');
      return;
    }
    avisar.exito('Actividad eliminada', a.title);
    load();
  };

  // Una actividad; dentro de una sección no repite materia y curso
  const tarjeta = (a: ActivityWithStats, enSeccion: boolean) => (
    <div key={a.id} className={`card acts-card ${a.status === 'closed' ? 'closed' : ''}`}>
      <div className="acts-card-main">
        <Link to={`/actividades/${a.id}`} className="acts-card-title">
          {a.title}
          <ChevronRight size={16} />
        </Link>
        <div className="acts-card-meta">
          {!enSeccion && <span className="badge badge-cyan"><EmojiMateria nombre={a.subjectName} /> {a.subjectName}</span>}
          {!enSeccion && <span className="badge badge-neutral">{a.courseName}</span>}
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
          <BotonCopiarActividad activity={a} compacto alCopiar={load} />
          <button className="btn-icon" title="Eliminar" onClick={() => handleDelete(a)}>
            <Trash2 size={16} />
          </button>
          <Link to={`/actividades/${a.id}`} className="btn btn-secondary btn-sm">
            <Users size={14} /> Resultados
          </Link>
        </div>
      </div>
    </div>
  );

  return (
    <div className="acts-container animate-in">
      <div className="acts-header">
        <div>
          {/* El título ("Actividades") ya está en la barra de arriba */}
          <p className="text-secondary">
            Acá seguís el trabajo de tus estudiantes: quién entregó, qué nota sacó y cómo trabajó.
          </p>
        </div>
        {/* Con la lista vacía, el botón está en el estado vacío */}
        {(loading || activities.length > 0) && (
          <Link to="/actividad-rapida" className="btn btn-primary btn-sm">
            <Sparkles size={15} aria-hidden="true" /> Crear actividad
          </Link>
        )}
      </div>

      {activities.length > 0 && asignaciones.length > 1 && (
        <div className="acts-cursos fila-desplazable" role="group" aria-label="Materia y curso">
          <button className={`acts-filter-chip ${!curso ? 'selected' : ''}`} aria-pressed={!curso} onClick={() => setCurso(null)}>
            Todos los cursos
          </button>
          {asignaciones.map(a => {
            const n = activities.filter(x => claveAsignacion(x.subjectId, x.courseId) === a.clave).length;
            return (
              <button
                key={a.clave}
                className={`acts-filter-chip ${curso === a.clave ? 'selected' : ''}`}
                aria-pressed={curso === a.clave}
                onClick={() => setCurso(a.clave)}
              >
                {a.etiqueta} <span className="acts-chip-n">{n}</span>
              </button>
            );
          })}
        </div>
      )}

      {activities.length > 3 && (
        <div className="acts-toolbar">
          <div className="search-bar acts-search">
            <Search size={15} className="search-icon" />
            <input
              className="search-input"
              placeholder="Buscar por título, materia o curso..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <div className="acts-filters fila-desplazable">
            {([
              ['todas', 'Todas'],
              ['abiertas', 'Abiertas'],
              ['pendientes', 'Con entregas'],
              ['cerradas', 'Cerradas'],
            ] as const).map(([key, label]) => (
              <button
                key={key}
                className={`acts-filter-chip ${filter === key ? 'selected' : ''}`}
                onClick={() => setFilter(key)}
              >
                {label}
              </button>
            ))}
            <span className="acts-count">{filtered.length} de {activities.length}</span>
          </div>
        </div>
      )}

      {loading && <Esqueleto tipo="filas" cantidad={4} etiqueta="Cargando actividades…" />}

      {!loading && activities.length === 0 && (
        <EstadoVacio
          icono={Sparkles}
          titulo="Todavía no publicaste actividades"
          texto="Escribí el tema y la app arma la actividad: tus estudiantes la reciben al instante y vos ves cómo trabajaron."
          accion={{ etiqueta: 'Crear mi primera actividad', a: '/actividad-rapida', icono: Sparkles }}
        />
      )}

      <div className="acts-list">
        {!loading && activities.length > 0 && filtered.length === 0 && (
          <EstadoVacio
            compacto
            icono={Search}
            titulo="Ninguna actividad coincide"
            texto="Probá con otra palabra o mirá todas las actividades."
            accion={{ etiqueta: 'Ver todas', alTocar: () => { setSearch(''); setFilter('todas'); setCurso(null); } }}
          />
        )}
        {agrupado ? grupos.map(g => {
          const abiertas = g.items.filter(x => x.status !== 'closed').length;
          return (
            <section key={g.clave} className="acts-grupo" aria-labelledby={`acts-grupo-${g.clave}`}>
              <header className="acts-grupo-header">
                <h3 id={`acts-grupo-${g.clave}`} className="acts-grupo-titulo"><EmojiMateria nombre={g.items[0]?.subjectName} /> {g.etiqueta}</h3>
                <span className="acts-grupo-cuenta">
                  {g.items.length} actividad{g.items.length !== 1 ? 'es' : ''} · {abiertas} abierta{abiertas !== 1 ? 's' : ''}
                </span>
                {asignaciones.length > 1 && (
                  <button className="btn btn-outline btn-sm" onClick={() => setCurso(g.clave)}>Ver solo este curso</button>
                )}
              </header>
              {g.items.map(a => tarjeta(a, true))}
            </section>
          );
        }) : filtered.map(a => tarjeta(a, false))}
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
