import { useState } from 'react';
import { UserPlus, KeyRound, UserMinus, Plus, X, Users, AlertCircle, ShieldCheck } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import {
  createAccount, resetPassword, removeMember, addAssignment, removeAssignment, type AdminMember, type AdminAssignment,
} from '../../services/admin.service';
import { loginLabel } from '../../lib/dni';
import { avisar, confirmar } from '../../components/ui/avisar';
import { Barra, Campo, DialogoForm, Iniciales, Vacio } from './ui';
import type { TabProps } from './GestionEscuela';

type StaffRole = 'docente' | 'director';

export default function PersonalTab(props: TabProps) {
  const { data, isSuperadmin, run, showCredentials, irA } = props;
  const { user } = useAuth();
  const [alta, setAlta] = useState(false);

  const directors = data.members.filter(m => m.role === 'director');
  const teachers = data.members.filter(m => m.role === 'docente');
  const sinCursos = data.courses.length === 0 || data.subjects.length === 0;

  // El director no toca a otros directores (la base tampoco lo deja)
  const canManage = (m: AdminMember) => m.userId !== user?.id && (isSuperadmin || m.role !== 'director');

  const handleReset = async (m: AdminMember) => {
    const si = await confirmar({
      titulo: `¿Generar una clave nueva para ${m.firstName} ${m.lastName}?`,
      mensaje: 'La clave que usa ahora deja de funcionar en el momento. Vas a ver la nueva para entregársela.',
      accion: 'Generar clave',
    });
    if (!si) return;
    run(async () => {
      const r = await resetPassword(m.userId);
      showCredentials([{ name: `${m.firstName} ${m.lastName}`, login: r.login, password: r.password }]);
    });
  };

  const handleRemove = async (m: AdminMember) => {
    const nombre = `${m.firstName} ${m.lastName}`;
    const si = await confirmar({
      titulo: `¿Quitar a ${nombre} de ${data.school.name}?`,
      mensaje: m.role === 'docente'
        ? 'Deja de entrar a esta escuela y se borran sus materias asignadas acá: sus cursos quedan sin ese docente. Su cuenta sigue existiendo.'
        : 'Deja de entrar a esta escuela. Su cuenta sigue existiendo.',
      accion: 'Quitar de la escuela',
      peligro: true,
    });
    if (si && await run(() => removeMember(m.membershipId))) avisar.exito(`${nombre} ya no está en ${data.school.name}`);
  };

  return (
    <div className="adm-seccion">
      <Barra detalle={`${directors.length} en dirección · ${teachers.length} docente${teachers.length !== 1 ? 's' : ''}`}>
        <button type="button" className="btn btn-primary" onClick={() => setAlta(true)}>
          <UserPlus size={16} aria-hidden="true" /> Sumar persona
        </button>
      </Barra>

      <section className="card adm-tarjeta" aria-labelledby="t-direccion">
        <h4 id="t-direccion" className="adm-subtitulo"><ShieldCheck size={16} aria-hidden="true" /> Dirección</h4>
        {directors.length === 0 ? (
          isSuperadmin ? (
            <Vacio icono={ShieldCheck} titulo="Todavía no tiene director/a"
              texto="Sumá a quien dirige la escuela con el rol Director/a: va a poder armar cursos, docentes y estudiantes."
              accion={{ etiqueta: 'Sumar persona', icono: UserPlus, alTocar: () => setAlta(true) }} />
          ) : <p className="adm-ayuda">Sin director/a asignado/a.</p>
        ) : directors.map(m => (
          <PersonRow key={m.membershipId} m={m} canManage={canManage(m)} onReset={handleReset} onRemove={handleRemove} />
        ))}
      </section>

      <section className="card adm-tarjeta" aria-labelledby="t-docentes">
        <h4 id="t-docentes" className="adm-subtitulo"><Users size={16} aria-hidden="true" /> Docentes</h4>
        {sinCursos && teachers.length > 0 && (
          <p className="adm-aviso">
            <AlertCircle size={14} aria-hidden="true" /> Para asignar materias primero cargá cursos y materias.{' '}
            <button type="button" className="adm-link" onClick={() => irA('cursos')}>Ir a Cursos y materias</button>
          </p>
        )}
        {teachers.length === 0 ? (
          <Vacio icono={Users} titulo="Sin docentes" texto="Sumá a los docentes y asignales sus materias en cada curso."
            accion={{ etiqueta: 'Sumar docente', icono: UserPlus, alTocar: () => setAlta(true) }} />
        ) : teachers.map(m => (
          <PersonRow key={m.membershipId} m={m} canManage={canManage(m)} onReset={handleReset} onRemove={handleRemove}>
            <Assignments teacherId={m.userId} data={data} run={run} />
          </PersonRow>
        ))}
      </section>

      <AltaPersonal abierto={alta} alCerrar={() => setAlta(false)} {...props} />
    </div>
  );
}

function AltaPersonal({ abierto, alCerrar, data, isSuperadmin, reload, showCredentials }: TabProps & {
  abierto: boolean;
  alCerrar: () => void;
}) {
  const [role, setRole] = useState<StaffRole>('docente');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [dni, setDni] = useState('');
  const [email, setEmail] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const listo = firstName.trim() && lastName.trim() && (dni.trim() || email.trim());

  // El error va adentro del diálogo: arriba de la página quedaría tapado
  const crear = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!listo || creating) return;
    setCreating(true);
    setError('');
    try {
      const c = await createAccount({
        schoolId: data.school.id, role, firstName, lastName,
        dni: dni.trim() || undefined, email: email.trim() || undefined,
      });
      await reload();
      setFirstName(''); setLastName(''); setDni(''); setEmail('');
      alCerrar();
      showCredentials([{ name: `${firstName.trim()} ${lastName.trim()}`, ...c }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo crear la cuenta.');
    } finally {
      setCreating(false);
    }
  };

  return (
    <DialogoForm abierto={abierto} alCerrar={alCerrar} id="alta-personal" titulo="Sumar al personal"
      bajada="Si ya tiene cuenta en otra escuela, se la suma a esta y sigue con su clave."
      pie={<>
        <button type="button" className="btn btn-ghost" onClick={alCerrar}>Cancelar</button>
        <button type="submit" form="form-alta-personal" className="btn btn-primary" disabled={!listo || creating}>
          {creating ? 'Creando...' : 'Crear cuenta'}
        </button>
      </>}>
      <form id="form-alta-personal" className="adm-form" onSubmit={crear}>
        {error && <div className="adm-error" role="alert"><AlertCircle size={15} aria-hidden="true" /> {error}</div>}
        {isSuperadmin && (
          <fieldset className="adm-roles">
            <legend>Rol</legend>
            {(['docente', 'director'] as StaffRole[]).map(r => (
              <label key={r} className={`adm-rol ${role === r ? 'activo' : ''}`}>
                <input type="radio" name="rol" value={r} checked={role === r} onChange={() => setRole(r)} />
                {r === 'docente' ? 'Docente' : 'Director/a'}
              </label>
            ))}
          </fieldset>
        )}
        <div className="adm-fila">
          <Campo label="Nombre" htmlFor="per-nombre">
            <input id="per-nombre" className="form-input" data-inicial value={firstName} onChange={e => setFirstName(e.target.value)} autoComplete="off" />
          </Campo>
          <Campo label="Apellido" htmlFor="per-apellido">
            <input id="per-apellido" className="form-input" value={lastName} onChange={e => setLastName(e.target.value)} autoComplete="off" />
          </Campo>
        </div>
        <div className="adm-fila">
          <Campo label="DNI" htmlFor="per-dni">
            <input id="per-dni" className="form-input" inputMode="numeric" value={dni} onChange={e => setDni(e.target.value)} autoComplete="off" />
          </Campo>
          <Campo label="Email (opcional)" htmlFor="per-email">
            <input id="per-email" className="form-input" type="email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="off" />
          </Campo>
        </div>
        <p className="adm-ayuda">Con email entra con el email; si no, con el DNI.</p>
      </form>
    </DialogoForm>
  );
}

export function PersonRow({ m, canManage, onReset, onRemove, children }: {
  m: AdminMember;
  canManage: boolean;
  onReset: (m: AdminMember) => void;
  onRemove: (m: AdminMember) => void;
  children?: React.ReactNode;
}) {
  return (
    <div className="adm-persona">
      <div className="adm-persona-fila">
        <Iniciales nombre={m.firstName} apellido={m.lastName} />
        <div className="adm-persona-texto">
          <strong>{m.lastName}, {m.firstName}</strong>
          <span>
            <code>{loginLabel(m.email, m.dni)}</code>
            {m.mustChangePassword && <span className="badge badge-warning">todavía no entró</span>}
          </span>
        </div>
        {canManage && (
          <div className="adm-persona-acciones">
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => onReset(m)} title="Generar una clave inicial nueva">
              <KeyRound size={14} aria-hidden="true" /> <span className="adm-solo-ancho">Nueva clave</span>
            </button>
            <button type="button" className="btn-icon" onClick={() => onRemove(m)} aria-label={`Quitar a ${m.firstName} ${m.lastName} de la escuela`} title="Quitar de la escuela">
              <UserMinus size={16} aria-hidden="true" />
            </button>
          </div>
        )}
      </div>
      {children}
    </div>
  );
}

function Assignments({ teacherId, data, run }: { teacherId: string; data: TabProps['data']; run: TabProps['run'] }) {
  const [abierto, setAbierto] = useState(false);
  const [subjectId, setSubjectId] = useState('');
  const [courseId, setCourseId] = useState('');
  const mine = data.assignments.filter(a => a.teacherId === teacherId);
  const puede = data.subjects.length > 0 && data.courses.length > 0;

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subjectId || !courseId) return;
    if (await run(() => addAssignment(teacherId, subjectId, courseId))) {
      setSubjectId(''); setCourseId(''); setAbierto(false);
    }
  };

  const quitar = async (a: AdminAssignment) => {
    const si = await confirmar({
      titulo: `¿Quitarle ${a.subjectName} en ${a.courseName}?`,
      mensaje: `Deja de ver esa materia en ${a.courseName} y, si nadie más la tiene, el curso se queda sin docente para ${a.subjectName}.`,
      accion: 'Quitar materia',
      peligro: true,
    });
    if (si && await run(() => removeAssignment(a.id))) avisar.exito(`Se quitó ${a.subjectName} en ${a.courseName}`);
  };

  return (
    <div className="adm-asignaciones">
      <div className="adm-chips">
        {mine.length === 0 && <span className="adm-ayuda">Sin materias asignadas</span>}
        {mine.map(a => (
          <span key={a.id} className="adm-chip">
            {a.subjectName} · {a.courseName}
            <button type="button" onClick={() => quitar(a)}
              aria-label={`Quitar ${a.subjectName} en ${a.courseName}`}><X size={12} aria-hidden="true" /></button>
          </span>
        ))}
        {puede && !abierto && (
          <button type="button" className="adm-chip adm-chip-agregar" onClick={() => setAbierto(true)}>
            <Plus size={12} aria-hidden="true" /> Asignar materia
          </button>
        )}
      </div>
      {abierto && (
        <form className="adm-alta" onSubmit={add}>
          <select className="form-select" value={subjectId} onChange={e => setSubjectId(e.target.value)} aria-label="Materia" autoFocus>
            <option value="">Materia...</option>
            {data.subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <select className="form-select" value={courseId} onChange={e => setCourseId(e.target.value)} aria-label="Curso">
            <option value="">Curso...</option>
            {data.courses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <button type="submit" className="btn btn-primary btn-sm" disabled={!subjectId || !courseId}>Asignar</button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setAbierto(false)}>Cancelar</button>
        </form>
      )}
    </div>
  );
}
