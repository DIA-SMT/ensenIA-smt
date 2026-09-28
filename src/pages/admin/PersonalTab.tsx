import { useState } from 'react';
import { UserPlus, KeyRound, UserMinus, Plus, X } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import {
  createAccount, resetPassword, removeMember, addAssignment, removeAssignment, type AdminMember,
} from '../../services/admin.service';
import { loginLabel } from '../../lib/dni';
import type { TabProps } from './GestionEscuela';

type StaffRole = 'docente' | 'director';

export default function PersonalTab({ data, isSuperadmin, run, showCredentials }: TabProps) {
  const { user } = useAuth();
  const [role, setRole] = useState<StaffRole>('docente');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [dni, setDni] = useState('');
  const [email, setEmail] = useState('');
  const [creating, setCreating] = useState(false);

  const staff = data.members.filter(m => m.role === 'director' || m.role === 'docente');
  const directors = staff.filter(m => m.role === 'director');
  const teachers = staff.filter(m => m.role === 'docente');
  const canCreate = firstName.trim() && lastName.trim() && (dni.trim() || email.trim());

  const handleCreate = async () => {
    if (!canCreate || creating) return;
    setCreating(true);
    await run(async () => {
      const c = await createAccount({
        schoolId: data.school.id, role, firstName, lastName,
        dni: dni.trim() || undefined, email: email.trim() || undefined,
      });
      showCredentials([{ name: `${firstName.trim()} ${lastName.trim()}`, ...c }]);
      setFirstName(''); setLastName(''); setDni(''); setEmail('');
    });
    setCreating(false);
  };

  // El director no toca a otros directores (la base tampoco lo deja)
  const canManage = (m: AdminMember) => m.userId !== user?.id && (isSuperadmin || m.role !== 'director');

  const handleReset = (m: AdminMember) => {
    if (!window.confirm(`¿Generar una clave nueva para ${m.firstName} ${m.lastName}? La actual deja de funcionar.`)) return;
    run(async () => {
      const r = await resetPassword(m.userId);
      showCredentials([{ name: `${m.firstName} ${m.lastName}`, login: r.login, password: r.password }]);
    });
  };

  const handleRemove = (m: AdminMember) => {
    const extra = m.role === 'docente' ? ' Se borran sus materias asignadas en esta escuela.' : '';
    if (!window.confirm(`¿Quitar a ${m.firstName} ${m.lastName} de ${data.school.name}? Su cuenta sigue existiendo.${extra}`)) return;
    run(() => removeMember(m.membershipId));
  };

  return (
    <div className="adm-grid">
      <div className="card adm-form">
        <h3 className="adm-card-title"><UserPlus size={16} /> Sumar al personal</h3>
        <div className="em-field">
          <label>Rol</label>
          <select className="form-select" value={role} onChange={e => setRole(e.target.value as StaffRole)}>
            <option value="docente">Docente</option>
            {isSuperadmin && <option value="director">Director/a</option>}
          </select>
        </div>
        <div className="em-row">
          <div className="em-field"><label>Nombre</label><input value={firstName} onChange={e => setFirstName(e.target.value)} /></div>
          <div className="em-field"><label>Apellido</label><input value={lastName} onChange={e => setLastName(e.target.value)} /></div>
        </div>
        <div className="em-row">
          <div className="em-field"><label>DNI</label><input inputMode="numeric" value={dni} onChange={e => setDni(e.target.value)} /></div>
          <div className="em-field"><label>Email</label><input type="email" value={email} onChange={e => setEmail(e.target.value)} /></div>
        </div>
        <span className="em-hint">
          Con email entra con el email; si no, con el DNI. Si ya tiene cuenta en otra escuela, se la suma a esta
          y sigue con su clave.
        </span>
        <button className="btn btn-primary" onClick={handleCreate} disabled={!canCreate || creating}>
          <UserPlus size={15} /> {creating ? 'Creando...' : 'Crear cuenta'}
        </button>
      </div>

      <div className="adm-stack">
        <div className="card">
          <h3 className="adm-card-title">Dirección</h3>
          {directors.length === 0 && <p className="text-secondary text-sm">Sin director/a asignado/a.</p>}
          {directors.map(m => (
            <PersonRow key={m.membershipId} m={m} canManage={canManage(m)} onReset={handleReset} onRemove={handleRemove} />
          ))}
        </div>

        <div className="card">
          <h3 className="adm-card-title">Docentes</h3>
          {teachers.length === 0 && <p className="text-secondary text-sm">Todavía no hay docentes.</p>}
          {teachers.map(m => (
            <PersonRow key={m.membershipId} m={m} canManage={canManage(m)} onReset={handleReset} onRemove={handleRemove}>
              <Assignments teacherId={m.userId} data={data} run={run} />
            </PersonRow>
          ))}
        </div>
      </div>
    </div>
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
    <div className="adm-person">
      <div className="adm-person-head">
        <div>
          <strong>{m.lastName}, {m.firstName}</strong>
          <span className="text-subtle text-xs adm-login">{loginLabel(m.email, m.dni)}</span>
          {m.mustChangePassword && <span className="badge badge-warning text-xs">todavía no entró</span>}
        </div>
        {canManage && (
          <div className="adm-actions">
            <button className="btn btn-ghost btn-sm" onClick={() => onReset(m)} title="Generar una clave inicial nueva">
              <KeyRound size={14} /> Nueva clave
            </button>
            <button className="btn-icon" onClick={() => onRemove(m)} title="Quitar de la escuela">
              <UserMinus size={15} />
            </button>
          </div>
        )}
      </div>
      {children}
    </div>
  );
}

function Assignments({ teacherId, data, run }: { teacherId: string; data: TabProps['data']; run: TabProps['run'] }) {
  const [subjectId, setSubjectId] = useState('');
  const [courseId, setCourseId] = useState('');
  const mine = data.assignments.filter(a => a.teacherId === teacherId);

  const add = async () => {
    if (!subjectId || !courseId) return;
    if (await run(() => addAssignment(teacherId, subjectId, courseId))) { setSubjectId(''); setCourseId(''); }
  };

  return (
    <div className="adm-assign">
      <div className="adm-chips">
        {mine.length === 0 && <span className="text-subtle text-xs">Sin materias asignadas</span>}
        {mine.map(a => (
          <span key={a.id} className="badge badge-cyan adm-chip">
            {a.subjectName} · {a.courseName}
            <button onClick={() => window.confirm(`¿Quitar ${a.subjectName} en ${a.courseName}?`) && run(() => removeAssignment(a.id))}
              aria-label={`Quitar ${a.subjectName} en ${a.courseName}`}><X size={11} /></button>
          </span>
        ))}
      </div>
      {data.subjects.length > 0 && data.courses.length > 0 && (
        <div className="adm-inline">
          <select className="form-select" value={subjectId} onChange={e => setSubjectId(e.target.value)} aria-label="Materia">
            <option value="">Materia...</option>
            {data.subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <select className="form-select" value={courseId} onChange={e => setCourseId(e.target.value)} aria-label="Curso">
            <option value="">Curso...</option>
            {data.courses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <button className="btn btn-secondary btn-sm" onClick={add} disabled={!subjectId || !courseId}><Plus size={14} /> Asignar</button>
        </div>
      )}
    </div>
  );
}
