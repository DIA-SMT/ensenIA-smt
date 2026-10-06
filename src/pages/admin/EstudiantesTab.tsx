/**
 * Estudiantes. Se cargan por curso y de a muchos, así que el alta queda
 * abierta después de cada uno: muestra ahí mismo el usuario y la clave,
 * deja el curso elegido y al final imprime todos los cartelitos juntos.
 */

import { useMemo, useState } from 'react';
import { UserPlus, KeyRound, Search, GraduationCap, AlertCircle, Printer, Check, FileSpreadsheet } from 'lucide-react';
import { createAccount, resetPassword, moveStudent, type AdminStudent } from '../../services/admin.service';
import { Barra, Campo, DialogoForm, Iniciales, Vacio } from './ui';
import { printCredenciales, type Credencial } from './credenciales';
import type { TabProps } from './GestionEscuela';
import ImportarPlanilla from './ImportarPlanilla';

export default function EstudiantesTab(props: TabProps) {
  const { data, run, showCredentials, irA } = props;
  const [alta, setAlta] = useState(false);
  const [importar, setImportar] = useState(false);
  const [filterCourse, setFilterCourse] = useState('');
  const [query, setQuery] = useState('');
  const sinCursos = data.courses.length === 0;

  const handleMove = (s: AdminStudent, newCourse: string) => {
    const course = data.courses.find(c => c.id === newCourse);
    if (!course || newCourse === s.courseId) return;
    if (!window.confirm(`¿Pasar a ${s.firstName} ${s.lastName} a ${course.name}? Deja de ver las materias de ${s.courseName}.`)) return;
    run(() => moveStudent(s.id, newCourse));
  };

  const handleReset = (s: AdminStudent) => {
    if (!s.userId) return;
    if (!window.confirm(`¿Generar una clave nueva para ${s.firstName} ${s.lastName}? La actual deja de funcionar.`)) return;
    run(async () => {
      const r = await resetPassword(s.userId!);
      showCredentials([{ name: `${s.firstName} ${s.lastName}`, login: r.login, password: r.password }]);
    });
  };

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return data.students.filter(s =>
      (!filterCourse || s.courseId === filterCourse)
      && (!q || `${s.firstName} ${s.lastName} ${s.dni ?? ''}`.toLowerCase().includes(q)));
  }, [data.students, filterCourse, query]);

  const pendientes = data.students.filter(s => s.mustChangePassword).length;

  return (
    <div className="adm-seccion">
      <Barra
        detalle={`${data.students.length} en total${pendientes ? ` · ${pendientes} todavía no entraron` : ''}`}>
        <button type="button" className="btn btn-secondary" onClick={() => setImportar(true)}
          title="Todos los cursos de una vez, desde Excel o CSV">
          <FileSpreadsheet size={16} aria-hidden="true" /> Desde planilla
        </button>
        <button type="button" className="btn btn-primary" onClick={() => setAlta(true)} disabled={sinCursos}>
          <UserPlus size={16} aria-hidden="true" /> Cargar estudiantes
        </button>
      </Barra>

      {sinCursos && (
        <p className="adm-aviso">
          <AlertCircle size={14} aria-hidden="true" /> Cada estudiante va en un curso: creá los cursos, o cargá una planilla con la columna Curso y se crean solos.{' '}
          <button type="button" className="adm-link" onClick={() => irA('cursos')}>Ir a Cursos y materias</button>
        </p>
      )}

      <section className="card adm-tarjeta">
        {data.students.length > 0 && (
          <div className="adm-filtros">
            <div className="adm-buscar">
              <Search size={16} aria-hidden="true" />
              <input className="form-input" value={query} onChange={e => setQuery(e.target.value)} placeholder="Buscar por nombre o DNI" aria-label="Buscar estudiante" />
            </div>
            <select className="form-select" value={filterCourse} onChange={e => setFilterCourse(e.target.value)} aria-label="Filtrar por curso">
              <option value="">Todos los cursos</option>
              {data.courses.map(c => <option key={c.id} value={c.id}>{c.name} ({c.studentCount})</option>)}
            </select>
          </div>
        )}

        {data.students.length === 0 ? (
          <Vacio icono={GraduationCap} titulo="Sin estudiantes"
            texto="Cargalos por curso con su DNI: entran con el DNI y quedan inscriptos solos en las materias del curso." />
        ) : visible.length === 0 ? (
          <p className="adm-ayuda">No hay estudiantes con ese filtro.</p>
        ) : visible.map(s => (
          <div key={s.id} className="adm-persona">
            <div className="adm-persona-fila">
              <Iniciales nombre={s.firstName} apellido={s.lastName} />
              <div className="adm-persona-texto">
                <strong>{s.lastName}, {s.firstName}</strong>
                <span>
                  <code>{s.dni ?? 'sin cuenta'}</code>
                  {s.mustChangePassword && <span className="badge badge-warning">todavía no entró</span>}
                </span>
              </div>
              <div className="adm-persona-acciones">
                <select className="form-select adm-select-chico" value={s.courseId} onChange={e => handleMove(s, e.target.value)}
                  aria-label={`Curso de ${s.firstName} ${s.lastName}`}>
                  {data.courses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                {s.userId && (
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => handleReset(s)} title="Generar una clave inicial nueva">
                    <KeyRound size={14} aria-hidden="true" /> <span className="adm-solo-ancho">Nueva clave</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </section>

      <AltaEstudiantes abierto={alta} alCerrar={() => setAlta(false)} cursoInicial={filterCourse} {...props} />
      <ImportarPlanilla abierto={importar} alCerrar={() => setImportar(false)} {...props} />
    </div>
  );
}

function AltaEstudiantes({ abierto, alCerrar, cursoInicial, data, reload }: TabProps & {
  abierto: boolean;
  alCerrar: () => void;
  cursoInicial: string;
}) {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [dni, setDni] = useState('');
  // Sin elegir en el diálogo, vale el curso que está filtrado en la lista
  const [elegido, setCourseId] = useState('');
  const courseId = elegido || cursoInicial;
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  // Los cargados en esta tanda, para verlos e imprimirlos juntos al final
  const [tanda, setTanda] = useState<Credencial[]>([]);
  const listo = firstName.trim() && lastName.trim() && dni.replace(/\D/g, '').length >= 6 && courseId;

  const cerrar = () => { setTanda([]); setError(''); alCerrar(); };

  const crear = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!listo || creating) return;
    setCreating(true);
    setError('');
    try {
      const c = await createAccount({ schoolId: data.school.id, role: 'estudiante', firstName, lastName, dni, courseId });
      setTanda(t => [{ name: `${firstName.trim()} ${lastName.trim()}`, ...c }, ...t]);
      // El curso queda: lo normal es cargar el curso entero de corrido
      setFirstName(''); setLastName(''); setDni('');
      document.getElementById('est-nombre')?.focus();
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo crear la cuenta.');
    } finally {
      setCreating(false);
    }
  };

  return (
    <DialogoForm abierto={abierto} alCerrar={cerrar} id="alta-estudiantes" titulo="Cargar estudiantes"
      bajada="Queda abierto para cargar varios seguidos. Entran con su DNI."
      pie={<>
        {tanda.length > 0 && (
          <button type="button" className="btn btn-secondary" onClick={() => printCredenciales(tanda, data.school.name)}>
            <Printer size={15} aria-hidden="true" /> Imprimir {tanda.length}
          </button>
        )}
        <button type="button" className="btn btn-ghost" onClick={cerrar}>{tanda.length ? 'Terminar' : 'Cancelar'}</button>
        <button type="submit" form="form-alta-estudiantes" className="btn btn-primary" disabled={!listo || creating}>
          {creating ? 'Creando...' : 'Crear'}
        </button>
      </>}>
      <form id="form-alta-estudiantes" className="adm-form" onSubmit={crear}>
        {error && <div className="adm-error" role="alert"><AlertCircle size={15} aria-hidden="true" /> {error}</div>}
        <Campo label="Curso" htmlFor="est-curso">
          <select id="est-curso" className="form-select" value={courseId} onChange={e => setCourseId(e.target.value)}>
            <option value="">Elegir...</option>
            {data.courses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Campo>
        <div className="adm-fila">
          <Campo label="Nombre" htmlFor="est-nombre">
            <input id="est-nombre" className="form-input" data-inicial value={firstName} onChange={e => setFirstName(e.target.value)} autoComplete="off" />
          </Campo>
          <Campo label="Apellido" htmlFor="est-apellido">
            <input id="est-apellido" className="form-input" value={lastName} onChange={e => setLastName(e.target.value)} autoComplete="off" />
          </Campo>
        </div>
        <Campo label="DNI" htmlFor="est-dni" ayuda="Sin puntos. Es su usuario para entrar.">
          <input id="est-dni" className="form-input" inputMode="numeric" value={dni} onChange={e => setDni(e.target.value)} autoComplete="off" />
        </Campo>
      </form>

      {tanda.length > 0 && (
        <div className="adm-tanda" aria-live="polite">
          <strong><Check size={15} aria-hidden="true" /> Cargados ahora ({tanda.length})</strong>
          <ul>
            {tanda.map(c => (
              <li key={c.login}>
                <span>{c.name}</span>
                {c.existing
                  ? <span className="adm-ayuda">ya tenía cuenta</span>
                  : <span className="adm-tanda-cred"><code>{c.login}</code> · <code>{c.password}</code></span>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </DialogoForm>
  );
}
