/**
 * Gestión de una escuela: cursos y materias, personal (con sus
 * asignaciones), estudiantes, familias y datos.
 *
 * La usan dos personas con la misma pantalla:
 *  - el superadmin, en /admin/escuelas/:id (cualquier escuela);
 *  - el director, en /mi-escuela (la suya), sin poder tocar directores.
 * Lo que no le corresponde a cada uno lo frena la base (migración 039);
 * acá solo se esconde para no ofrecer botones que van a fallar.
 *
 * Una escuela nueva se arma en un orden (sin cursos no hay a qué asignar
 * docentes; sin docentes no hay materias que cursar), así que mientras
 * falte algo se muestran los primeros pasos y se abre en el que sigue.
 */

import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ArrowLeft, ArrowRight, Building2, BookOpen, Users, GraduationCap, HeartHandshake, AlertCircle, Check, MapPin, CalendarClock, type LucideIcon,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import {
  getAdminSchool, listCourses, listSubjects, listMembers, listAssignments, listStudents, listGuardianLinks,
  type AdminSchool, type AdminCourse, type AdminSubject, type AdminMember, type AdminAssignment,
  type AdminStudent, type AdminGuardianLink,
} from '../../services/admin.service';
import DatosTab from './DatosTab';
import CursosTab from './CursosTab';
import PersonalTab from './PersonalTab';
import EstudiantesTab from './EstudiantesTab';
import HorarioTab from './HorarioTab';
import FamiliasTab from './FamiliasTab';
import CredencialesModal, { type Credencial } from './CredencialesModal';
import { avisar } from '../../components/ui/avisar';
import { Esqueleto } from '../../components/ui/Esqueleto';
import EstadoVacio from '../../components/ui/EstadoVacio';
import './Admin.css';

export interface SchoolData {
  school: AdminSchool;
  courses: AdminCourse[];
  subjects: AdminSubject[];
  members: AdminMember[];
  assignments: AdminAssignment[];
  students: AdminStudent[];
  links: AdminGuardianLink[];
}

export type Tab = 'cursos' | 'personal' | 'horario' | 'estudiantes' | 'familias' | 'datos';

/** Lo que recibe cada pestaña */
export interface TabProps {
  data: SchoolData;
  isSuperadmin: boolean;
  reload: () => Promise<void>;
  /** corre una acción y recarga; si falla, avisa el error y devuelve false */
  run: (fn: () => Promise<void>) => Promise<boolean>;
  showCredentials: (items: Credencial[]) => void;
  /** para los atajos entre pestañas ("primero creá los cursos") */
  irA: (tab: Tab) => void;
}

const TABS: { id: Tab; label: string; icon: LucideIcon }[] = [
  { id: 'cursos', label: 'Cursos y materias', icon: BookOpen },
  { id: 'personal', label: 'Personal', icon: Users },
  { id: 'horario', label: 'Horario', icon: CalendarClock },
  { id: 'estudiantes', label: 'Estudiantes', icon: GraduationCap },
  { id: 'familias', label: 'Familias', icon: HeartHandshake },
  { id: 'datos', label: 'Datos', icon: Building2 },
];

interface Paso { id: string; label: string; hecho: boolean; tab: Tab }

function pasosDe(d: SchoolData): Paso[] {
  const docentes = d.members.filter(m => m.role === 'docente');
  return [
    { id: 'cursos', label: 'Cursos y materias', hecho: d.courses.length > 0 && d.subjects.length > 0, tab: 'cursos' },
    { id: 'direccion', label: 'Dirección', hecho: d.members.some(m => m.role === 'director'), tab: 'personal' },
    { id: 'docentes', label: 'Docentes con sus materias', hecho: docentes.length > 0 && d.assignments.length > 0, tab: 'personal' },
    { id: 'estudiantes', label: 'Estudiantes', hecho: d.students.length > 0, tab: 'estudiantes' },
    { id: 'familias', label: 'Familias', hecho: d.links.length > 0, tab: 'familias' },
  ];
}

export default function GestionEscuela() {
  const { id: paramId } = useParams<{ id: string }>();
  const { user, isSuperadmin } = useAuth();
  // Superadmin: la de la URL. Director: la suya (activa).
  const schoolId = isSuperadmin ? paramId : user?.schoolId;

  const [data, setData] = useState<SchoolData | null>(null);
  // `loading` arranca en true: solo cubre la primera carga (después, cada
  // acción recarga por debajo sin tapar la pantalla)
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<Tab | null>(null);
  const [credentials, setCredentials] = useState<Credencial[] | null>(null);

  const reload = useCallback(async () => {
    if (!schoolId) return;
    const school = await getAdminSchool(schoolId);
    if (!school) { setData(null); return; }
    const [courses, subjects, members, assignments, students, links] = await Promise.all([
      listCourses(schoolId), listSubjects(schoolId), listMembers(schoolId),
      listAssignments(schoolId), listStudents(schoolId), listGuardianLinks(schoolId),
    ]);
    setData({ school, courses, subjects, members, assignments, students, links });
  }, [schoolId]);

  useEffect(() => {
    reload()
      .catch(err => setError(err instanceof Error ? err.message : 'No se pudo cargar la escuela.'))
      .finally(() => setLoading(false));
  }, [reload]);

  // El error de una acción va en un aviso: un banner arriba de todo no se
  // ve si la acción fue en la fila 40 de la lista de estudiantes.
  const run = useCallback(async (fn: () => Promise<void>) => {
    try {
      await fn();
      await reload();
      return true;
    } catch (err) {
      avisar.error(err instanceof Error ? err.message : 'No se pudo completar. Probá de nuevo.');
      return false;
    }
  }, [reload]);

  if (loading) {
    return (
      <div className="adm-container">
        <Esqueleto tipo="filas" cantidad={5} etiqueta="Cargando la escuela…" />
      </div>
    );
  }
  if (!data) {
    return (
      <div className="adm-container">
        {error && <div className="adm-error" role="alert"><AlertCircle size={15} aria-hidden="true" /> {error}</div>}
        <EstadoVacio icono={Building2} titulo="No se encontró la escuela"
          texto="Puede que la hayan dado de baja o que tu cuenta no tenga acceso a ella."
          accion={isSuperadmin ? { etiqueta: 'Ver todas las escuelas', a: '/admin', icono: ArrowLeft } : undefined} />
      </div>
    );
  }

  const pasos = pasosDe(data);
  const pendiente = pasos.find(p => !p.hecho);
  // Sin elegir todavía: se abre en lo que falta (o en Personal si ya está todo)
  const activa: Tab = tab ?? pendiente?.tab ?? 'personal';
  const docentes = data.members.filter(m => m.role === 'docente').length;
  const familias = data.members.filter(m => m.role === 'padre').length;

  const props: TabProps = { data, isSuperadmin, reload, run, showCredentials: setCredentials, irA: setTab };

  return (
    <div className="adm-container animate-in">
      {isSuperadmin && (
        <Link to="/admin" className="adm-volver"><ArrowLeft size={15} aria-hidden="true" /> Todas las escuelas</Link>
      )}

      <header className="adm-head">
        <div>
          <h2><Building2 size={20} aria-hidden="true" /> {data.school.name}</h2>
          <p>
            {data.school.district && <><MapPin size={13} aria-hidden="true" /> {data.school.district} · </>}
            {data.courses.length} curso{data.courses.length !== 1 ? 's' : ''} · {docentes} docente{docentes !== 1 ? 's' : ''} · {data.students.length} estudiante{data.students.length !== 1 ? 's' : ''} · {familias} familia{familias !== 1 ? 's' : ''}
          </p>
        </div>
      </header>

      {pendiente && (
        <section className="card adm-pasos" aria-label="Primeros pasos para armar la escuela">
          <div className="adm-pasos-titulo">
            <strong>Armá la escuela</strong>
            <span>{pasos.filter(p => p.hecho).length} de {pasos.length}</span>
          </div>
          {/* En el celular, los cinco pasos no entran: progreso + el que sigue */}
          <div className="adm-pasos-movil">
            <div className="adm-progreso" role="progressbar" aria-valuemin={0} aria-valuemax={pasos.length}
              aria-valuenow={pasos.filter(p => p.hecho).length} aria-label="Avance">
              <span style={{ width: `${(pasos.filter(p => p.hecho).length / pasos.length) * 100}%` }} />
            </div>
            {activa === pendiente.tab ? (
              <span className="adm-paso-ahora">Paso {pasos.indexOf(pendiente) + 1} de {pasos.length}: {pendiente.label}</span>
            ) : (
              <button type="button" className="btn btn-primary btn-sm" onClick={() => setTab(pendiente.tab)}>
                Sigue: {pendiente.label} <ArrowRight size={15} aria-hidden="true" />
              </button>
            )}
          </div>
          <ol>
            {pasos.map((p, i) => (
              <li key={p.id}>
                <button type="button" onClick={() => setTab(p.tab)}
                  className={`adm-paso ${p.hecho ? 'hecho' : ''} ${p === pendiente ? 'actual' : ''}`}
                  aria-current={p === pendiente ? 'step' : undefined}>
                  <span className="adm-paso-num" aria-hidden="true">{p.hecho ? <Check size={13} /> : i + 1}</span>
                  <span>{p.label}</span>
                </button>
              </li>
            ))}
          </ol>
        </section>
      )}

      <div className="adm-tabs" role="tablist" aria-label="Secciones de la escuela">
        {TABS.map(t => (
          <button key={t.id} type="button" role="tab" aria-selected={activa === t.id}
            className={`adm-tab ${activa === t.id ? 'active' : ''}`} onClick={() => setTab(t.id)}>
            <t.icon size={15} aria-hidden="true" /> {t.label}
          </button>
        ))}
      </div>

      <div role="tabpanel" className="adm-panel">
        {activa === 'cursos' && <CursosTab {...props} />}
        {activa === 'personal' && <PersonalTab {...props} />}
        {activa === 'horario' && <HorarioTab {...props} />}
        {activa === 'estudiantes' && <EstudiantesTab {...props} />}
        {activa === 'familias' && <FamiliasTab {...props} />}
        {activa === 'datos' && <DatosTab {...props} />}
      </div>

      <CredencialesModal items={credentials} schoolName={data.school.name} onClose={() => setCredentials(null)} />
    </div>
  );
}
