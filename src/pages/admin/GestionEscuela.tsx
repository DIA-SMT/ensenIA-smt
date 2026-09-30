/**
 * Gestión de una escuela: datos, cursos y materias, personal (con sus
 * asignaciones), estudiantes y familias.
 *
 * La usan dos personas con la misma pantalla:
 *  - el superadmin, en /admin/escuelas/:id (cualquier escuela);
 *  - el director, en /mi-escuela (la suya), sin poder tocar directores.
 * Lo que no le corresponde a cada uno lo frena la base (migración 039);
 * acá solo se esconde para no ofrecer botones que van a fallar.
 */

import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Building2, BookOpen, Users, GraduationCap, HeartHandshake, AlertCircle } from 'lucide-react';
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
import FamiliasTab from './FamiliasTab';
import CredencialesModal, { type Credencial } from './CredencialesModal';
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

/** Lo que recibe cada pestaña */
export interface TabProps {
  data: SchoolData;
  isSuperadmin: boolean;
  reload: () => Promise<void>;
  /** corre una acción mostrando el error arriba si falla */
  run: (fn: () => Promise<void>) => Promise<boolean>;
  showCredentials: (items: Credencial[]) => void;
}

type Tab = 'datos' | 'cursos' | 'personal' | 'estudiantes' | 'familias';

const TABS: { id: Tab; label: string; icon: typeof Users }[] = [
  { id: 'personal', label: 'Personal', icon: Users },
  { id: 'estudiantes', label: 'Estudiantes', icon: GraduationCap },
  { id: 'familias', label: 'Familias', icon: HeartHandshake },
  { id: 'cursos', label: 'Cursos y materias', icon: BookOpen },
  { id: 'datos', label: 'Datos de la escuela', icon: Building2 },
];

export default function GestionEscuela() {
  const { id: paramId } = useParams<{ id: string }>();
  const { user, isSuperadmin } = useAuth();
  // Superadmin: la de la URL. Director: la suya (activa).
  const schoolId = isSuperadmin ? paramId : user?.schoolId;

  const [data, setData] = useState<SchoolData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<Tab>('personal');
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

  // `loading` arranca en true: solo cubre la primera carga (después, cada
  // acción recarga por debajo sin tapar la pantalla)
  useEffect(() => {
    reload()
      .catch(err => setError(err instanceof Error ? err.message : 'No se pudo cargar la escuela.'))
      .finally(() => setLoading(false));
  }, [reload]);

  const run = useCallback(async (fn: () => Promise<void>) => {
    setError('');
    try {
      await fn();
      await reload();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo completar.');
      return false;
    }
  }, [reload]);

  if (loading) return <p className="text-secondary p-6">Cargando escuela...</p>;
  if (!data) {
    return (
      <div className="adm-container">
        {error && <div className="em-error"><AlertCircle size={14} /> {error}</div>}
        <p className="text-secondary">No se encontró la escuela o no tenés acceso.</p>
      </div>
    );
  }

  const props: TabProps = { data, isSuperadmin, reload, run, showCredentials: setCredentials };

  return (
    <div className="adm-container animate-in">
      {isSuperadmin && (
        <Link to="/admin" className="acts-back"><ArrowLeft size={15} /> Escuelas</Link>
      )}
      <div>
        <h2 className="flex items-center gap-2"><Building2 size={20} className="text-cyan" /> {data.school.name}</h2>
        <p className="text-secondary text-sm">
          {data.courses.length} cursos · {data.members.filter(m => m.role === 'docente').length} docentes · {data.students.length} estudiantes
        </p>
      </div>

      <div className="adm-tabs" role="tablist">
        {TABS.map(t => (
          <button key={t.id} role="tab" aria-selected={tab === t.id}
            className={`adm-tab ${tab === t.id ? 'active' : ''}`} onClick={() => setTab(t.id)}>
            <t.icon size={15} /> {t.label}
          </button>
        ))}
      </div>

      {error && <div className="em-error"><AlertCircle size={14} /> {error}</div>}

      {tab === 'datos' && <DatosTab {...props} />}
      {tab === 'cursos' && <CursosTab {...props} />}
      {tab === 'personal' && <PersonalTab {...props} />}
      {tab === 'estudiantes' && <EstudiantesTab {...props} />}
      {tab === 'familias' && <FamiliasTab {...props} />}

      {credentials && (
        <CredencialesModal items={credentials} schoolName={data.school.name} onClose={() => setCredentials(null)} />
      )}
    </div>
  );
}
