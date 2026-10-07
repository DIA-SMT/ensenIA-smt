/**
 * Una materia, todo junto (estudiante): lo que viene (tareas por entregar y
 * evaluaciones), las clases que mandó el docente, todas las tareas, el
 * material, las notas y el temario.
 *
 * Antes cada cosa vivía en su pantalla, mezclada con las demás materias: las
 * tareas en Mi escuela, el material en Mis materiales, las notas y el temario
 * abajo de todo. Para "¿qué tengo de Lengua?" había que recorrer tres lugares.
 *
 * Pide lo mismo que esas pantallas (mismas funciones, mismos argumentos):
 * así la copia sin conexión de una sirve para la otra.
 */

import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ArrowLeft, CalendarClock, ClipboardList, BookOpen, BookMarked, ListTree, CheckCircle2, Clock, AlertCircle, Eye, FileText,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { getStudentByUserId, getEnrollmentsByStudent, getActivitiesForStudent, getMySubmissions } from '../services/activities.service';
import { getSharedMaterialsForStudent } from '../services/library.service';
import { getClasesEnviadas, type ClaseEnviada } from '../services/clases.service';
import { getTerms, pickCurrentTerm } from '../services/gradebook.service';
import { getThresholds, DEFAULT_THRESHOLDS } from '../services/thresholds.service';
import { getEvaluacionesDelTrimestre, TIPOS_EVALUACION, type Evaluacion } from '../services/evaluaciones.service';
import ClasesEnviadas from '../components/ClasesEnviadas';
import MaterialViewer from '../components/MaterialViewer';
import GradesPanel from '../components/GradesPanel';
import SyllabusPanel from '../components/SyllabusPanel';
import EstadoVacio from '../components/ui/EstadoVacio';
import { Esqueleto } from '../components/ui/Esqueleto';
import type { Activity, ActivitySubmission, AcademicTerm, AlertThresholds, Enrollment, LibraryMaterial, Student } from '../types';
import './Actividades.css';
import './StudentPortal.css';
import './Libreta.css';
import './MiMateria.css';

const hoyISO = () => new Date().toLocaleDateString('en-CA');

/** "hoy", "mañana", "vie 10/10" */
function cuando(fecha: string): string {
  const d = new Date(fecha.length === 10 ? fecha + 'T12:00' : fecha);
  const dias = Math.round((new Date(d.toDateString()).getTime() - new Date(new Date().toDateString()).getTime()) / 86400000);
  if (dias === 0) return 'hoy';
  if (dias === 1) return 'mañana';
  return d.toLocaleDateString('es-AR', { weekday: 'short', day: 'numeric', month: 'numeric' });
}

/** En qué anda cada tarea, para el estudiante. */
function estadoTarea(a: Activity, sub: ActivitySubmission | undefined): { texto: string; clase: string; hecha: boolean } {
  if (sub?.status === 'graded') return { texto: sub.score != null ? `Corregida · ${sub.score}` : 'Corregida', clase: 'mm-ok', hecha: true };
  if (sub?.status === 'submitted') return { texto: sub.autoScore != null ? `Entregada · ${sub.autoScore} (auto)` : 'Entregada', clase: 'mm-ok', hecha: true };
  if (a.status === 'closed') return { texto: 'Cerrada', clase: 'mm-gris', hecha: true };
  if (a.dueDate && new Date(a.dueDate) < new Date()) return { texto: 'Vencida', clase: 'mm-alerta', hecha: false };
  if (sub?.status === 'in_progress') return { texto: 'Empezada', clase: 'mm-curso', hecha: false };
  return { texto: 'Por hacer', clase: 'mm-curso', hecha: false };
}

export default function MiMateria() {
  const { id: subjectId } = useParams<{ id: string }>();
  const { user } = useAuth();

  const [student, setStudent] = useState<Student | null>(null);
  const [inscripcion, setInscripcion] = useState<Enrollment | null>(null);
  const [actividades, setActividades] = useState<Activity[]>([]);
  const [entregas, setEntregas] = useState<ActivitySubmission[]>([]);
  const [materiales, setMateriales] = useState<LibraryMaterial[]>([]);
  const [clases, setClases] = useState<ClaseEnviada[]>([]);
  const [evaluaciones, setEvaluaciones] = useState<Evaluacion[]>([]);
  const [terms, setTerms] = useState<AcademicTerm[] | null>(null);
  const [termId, setTermId] = useState<string | null>(null);
  const [thresholds, setThresholds] = useState<Pick<AlertThresholds, 'gradeRiskMax'>>(DEFAULT_THRESHOLDS);
  const [cargando, setCargando] = useState(true);
  const [fallo, setFallo] = useState(false);
  const [viendo, setViendo] = useState<LibraryMaterial | null>(null);

  useEffect(() => {
    if (!user || !subjectId) return;
    let vivo = true;
    (async () => {
      try {
        const st = await getStudentByUserId(user.id);
        if (!vivo) return;
        setStudent(st);
        if (!st) return;
        const [enr, acts, subs, mats] = await Promise.all([
          getEnrollmentsByStudent(st.id),
          getActivitiesForStudent(),
          getMySubmissions(st.id),
          getSharedMaterialsForStudent(),
        ]);
        if (!vivo) return;
        const ins = enr.find(e => e.subjectId === subjectId) ?? null;
        setInscripcion(ins);
        setActividades(acts.filter(a => a.subjectId === subjectId));
        setEntregas(subs);
        setMateriales(mats.filter(m => m.subjectId === subjectId));

        // Lo que sigue no frena la pantalla: si falla, esa parte no aparece
        getClasesEnviadas(10).then(c => { if (vivo) setClases(c.filter(x => x.subjectId === subjectId)); }).catch(console.error);
        getThresholds(user.schoolId).then(t => { if (vivo) setThresholds(t); }).catch(console.error);
        getTerms(user.schoolId, new Date().getFullYear())
          .then(ts => {
            if (!vivo) return;
            setTerms(ts);
            const actual = pickCurrentTerm(ts);
            setTermId(actual?.id ?? null);
            if (actual && ins) {
              getEvaluacionesDelTrimestre(subjectId, ins.courseId, actual.id)
                .then(ev => { if (vivo) setEvaluaciones(ev); })
                .catch(console.error);
            }
          })
          .catch(err => { console.error(err); if (vivo) setTerms([]); });
      } catch (err) {
        console.error(err);
        if (vivo) setFallo(true);
      } finally {
        if (vivo) setCargando(false);
      }
    })();
    return () => { vivo = false; };
  }, [user, subjectId]);

  const subPorActividad = useMemo(() => new Map(entregas.map(s => [s.activityId, s])), [entregas]);

  // Tareas: primero lo que hay que hacer (por fecha de entrega), después lo hecho
  const tareas = useMemo(() => actividades
    .map(a => ({ a, estado: estadoTarea(a, subPorActividad.get(a.id)) }))
    .sort((x, y) => {
      if (x.estado.hecha !== y.estado.hecha) return x.estado.hecha ? 1 : -1;
      const fx = x.a.dueDate ?? '9999';
      const fy = y.a.dueDate ?? '9999';
      return x.estado.hecha ? fy.localeCompare(fx) : fx.localeCompare(fy);
    }), [actividades, subPorActividad]);

  const porHacer = tareas.filter(t => !t.estado.hecha);
  const proximas = evaluaciones.filter(e => e.fecha >= hoyISO());

  // El material que ya está dentro de una clase se ve en la clase
  const enClases = new Set(clases.flatMap(c => c.materialIds));
  const sueltos = materiales.filter(m => !enClases.has(m.id));

  if (!user) return null;
  const nombre = inscripcion?.subjectName ?? materiales[0]?.subjectName ?? 'Materia';

  if (cargando) return <div className="sp-container"><Esqueleto tipo="filas" cantidad={5} etiqueta="Cargando la materia…" /></div>;

  if (fallo || !student || !inscripcion) {
    return (
      <div className="sp-container">
        <Link to="/mis-actividades" className="mm-volver"><ArrowLeft size={16} /> Mi escuela</Link>
        <EstadoVacio
          icono={AlertCircle}
          titulo={fallo ? 'No se pudo cargar la materia' : 'No estás en esta materia'}
          texto={fallo ? 'Revisá la conexión y volvé a entrar.' : 'Elegí una de tus materias desde Mi escuela.'}
        />
      </div>
    );
  }

  return (
    <div className="sp-container animate-in mm">
      <Link to="/mis-actividades" className="mm-volver"><ArrowLeft size={16} /> Mi escuela</Link>

      <header className="card mm-cabeza">
        <h2>{nombre}</h2>
        <p>{inscripcion.courseName}</p>
        <div className="mm-resumen">
          <span><ClipboardList size={15} aria-hidden="true" /> {porHacer.length === 0 ? 'Nada por entregar' : `${porHacer.length} tarea${porHacer.length > 1 ? 's' : ''} por hacer`}</span>
          {proximas[0] && (
            <span><CalendarClock size={15} aria-hidden="true" /> {TIPOS_EVALUACION[proximas[0].tipo].label} {cuando(proximas[0].fecha)}</span>
          )}
        </div>
      </header>

      {/* ── Lo que viene ── */}
      {(porHacer.length > 0 || proximas.length > 0) && (
        <section aria-labelledby="mm-viene">
          <h3 id="mm-viene" className="sp-section-title" aria-level={2}><Clock size={17} aria-hidden="true" /> Lo que viene</h3>
          <ul className="mm-lista">
            {proximas.map(e => (
              <li key={e.id} className="card mm-fila mm-evaluacion">
                <span className="mm-fecha">{cuando(e.fecha)}</span>
                <div className="mm-fila-texto">
                  <strong>{TIPOS_EVALUACION[e.tipo].emoji} {e.titulo}</strong>
                  <span>{TIPOS_EVALUACION[e.tipo].label}</span>
                </div>
              </li>
            ))}
            {porHacer.map(({ a, estado }) => (
              <li key={a.id}>
                <Link to={`/mis-actividades/${a.id}`} className="card card-interactive mm-fila">
                  <span className="mm-fecha">{a.dueDate ? cuando(a.dueDate) : 'sin fecha'}</span>
                  <div className="mm-fila-texto">
                    <strong>{a.title}</strong>
                    <span className={estado.clase}>{estado.texto}</span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ── Clases ── */}
      <ClasesEnviadas clases={clases} materiales={materiales} userId={user.id} alAbrir={setViendo} titulo="Clases" />

      {/* ── Tareas hechas ── */}
      {tareas.some(t => t.estado.hecha) && (
        <section aria-labelledby="mm-tareas">
          <h3 id="mm-tareas" className="sp-section-title" aria-level={2}><CheckCircle2 size={17} aria-hidden="true" /> Tareas hechas</h3>
          <ul className="mm-lista">
            {tareas.filter(t => t.estado.hecha).map(({ a, estado }) => (
              <li key={a.id}>
                <Link to={`/mis-actividades/${a.id}`} className="card card-interactive mm-fila">
                  <div className="mm-fila-texto">
                    <strong>{a.title}</strong>
                    <span className={estado.clase}>{estado.texto}</span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ── Material suelto (lo que no vino dentro de una clase) ── */}
      <section aria-labelledby="mm-material">
        <h3 id="mm-material" className="sp-section-title" aria-level={2}><BookOpen size={17} aria-hidden="true" /> Material</h3>
        {sueltos.length === 0 ? (
          <p className="text-sm text-secondary">
            {clases.length > 0 ? 'Todo el material de la materia está en sus clases.' : 'Tu docente todavía no compartió material de esta materia.'}
          </p>
        ) : (
          <ul className="mm-lista">
            {sueltos.map(m => (
              <li key={m.id}>
                <button className="card card-interactive mm-fila mm-boton" onClick={() => setViendo(m)}>
                  <FileText size={18} className="text-cyan" aria-hidden="true" />
                  <div className="mm-fila-texto">
                    <strong>{m.title}</strong>
                    {m.description && <span>{m.description}</span>}
                  </div>
                  <Eye size={16} className="text-subtle" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        )}
        <Link to="/mi-biblioteca" className="mm-mas">Practicar y repasar con el material →</Link>
      </section>

      {/* ── Notas ── */}
      <section aria-labelledby="mm-notas">
        <h3 id="mm-notas" className="sp-section-title" aria-level={2}><BookMarked size={17} aria-hidden="true" /> Notas</h3>
        <div className="card">
          <GradesPanel studentId={student.id} thresholds={thresholds} voice="propia" subjectId={subjectId} />
        </div>
      </section>

      {/* ── Temario ── */}
      <section aria-labelledby="mm-temario">
        <h3 id="mm-temario" className="sp-section-title" aria-level={2}><ListTree size={17} aria-hidden="true" /> Temario</h3>
        <div className="card">
          <SyllabusPanel terms={terms} initialTermId={termId} voice="propia" courseId={inscripcion.courseId} subjectId={subjectId} />
        </div>
      </section>

      {viendo && <MaterialViewer material={viendo} onClose={() => setViendo(null)} />}
    </div>
  );
}
