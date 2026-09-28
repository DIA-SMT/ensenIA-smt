import { useState } from 'react';
import { UserPlus, Plus, X } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import {
  createAccount, resetPassword, removeMember, addGuardianLink, removeGuardianLink, type AdminMember,
} from '../../services/admin.service';
import { PersonRow } from './PersonalTab';
import type { TabProps } from './GestionEscuela';

const RELATIONSHIPS = ['madre', 'padre', 'tutor', 'abuela', 'abuelo', 'otro'];

export default function FamiliasTab({ data, run, showCredentials }: TabProps) {
  const { user } = useAuth();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [dni, setDni] = useState('');
  const [email, setEmail] = useState('');
  const [studentId, setStudentId] = useState('');
  const [relationship, setRelationship] = useState('madre');
  const [creating, setCreating] = useState(false);

  const guardians = data.members.filter(m => m.role === 'padre');
  const canCreate = firstName.trim() && lastName.trim() && (dni.trim() || email.trim()) && studentId;
  const studentLabel = (id: string) => {
    const s = data.students.find(x => x.id === id);
    return s ? `${s.firstName} ${s.lastName} (${s.courseName})` : '—';
  };

  const handleCreate = async () => {
    if (!canCreate || creating) return;
    setCreating(true);
    await run(async () => {
      const c = await createAccount({
        schoolId: data.school.id, role: 'padre', firstName, lastName,
        dni: dni.trim() || undefined, email: email.trim() || undefined,
      });
      await addGuardianLink(studentId, c.userId, relationship);
      showCredentials([{ name: `${firstName.trim()} ${lastName.trim()}`, ...c }]);
      setFirstName(''); setLastName(''); setDni(''); setEmail(''); setStudentId('');
    });
    setCreating(false);
  };

  const handleReset = (m: AdminMember) => {
    if (!window.confirm(`¿Generar una clave nueva para ${m.firstName} ${m.lastName}? La actual deja de funcionar.`)) return;
    run(async () => {
      const r = await resetPassword(m.userId);
      showCredentials([{ name: `${m.firstName} ${m.lastName}`, login: r.login, password: r.password }]);
    });
  };

  const handleRemove = (m: AdminMember) => {
    if (!window.confirm(`¿Quitar a ${m.firstName} ${m.lastName} de ${data.school.name}? Se desvincula de sus hijos en esta escuela.`)) return;
    run(() => removeMember(m.membershipId));
  };

  return (
    <div className="adm-grid">
      <div className="card adm-form">
        <h3 className="adm-card-title"><UserPlus size={16} /> Nueva familia</h3>
        {data.students.length === 0 ? (
          <p className="text-secondary text-sm">Primero cargá a los estudiantes.</p>
        ) : (
          <>
            <div className="em-row">
              <div className="em-field"><label>Nombre</label><input value={firstName} onChange={e => setFirstName(e.target.value)} /></div>
              <div className="em-field"><label>Apellido</label><input value={lastName} onChange={e => setLastName(e.target.value)} /></div>
            </div>
            <div className="em-row">
              <div className="em-field"><label>DNI</label><input inputMode="numeric" value={dni} onChange={e => setDni(e.target.value)} /></div>
              <div className="em-field"><label>Email</label><input type="email" value={email} onChange={e => setEmail(e.target.value)} /></div>
            </div>
            <div className="em-row">
              <div className="em-field">
                <label>Estudiante</label>
                <select className="form-select" value={studentId} onChange={e => setStudentId(e.target.value)}>
                  <option value="">Elegir...</option>
                  {data.students.map(s => <option key={s.id} value={s.id}>{studentLabel(s.id)}</option>)}
                </select>
              </div>
              <div className="em-field">
                <label>Parentesco</label>
                <select className="form-select" value={relationship} onChange={e => setRelationship(e.target.value)}>
                  {RELATIONSHIPS.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
            </div>
            <span className="em-hint">Si tiene más hijos en la escuela, se vinculan después desde la lista.</span>
            <button className="btn btn-primary" onClick={handleCreate} disabled={!canCreate || creating}>
              <UserPlus size={15} /> {creating ? 'Creando...' : 'Crear cuenta'}
            </button>
          </>
        )}
      </div>

      <div className="card">
        <h3 className="adm-card-title">Familias</h3>
        {guardians.length === 0 && <p className="text-secondary text-sm">Todavía no hay familias.</p>}
        {guardians.map(m => (
          <PersonRow key={m.membershipId} m={m} canManage={m.userId !== user?.id} onReset={handleReset} onRemove={handleRemove}>
            <Links guardianId={m.userId} data={data} run={run} studentLabel={studentLabel} />
          </PersonRow>
        ))}
      </div>
    </div>
  );
}

function Links({ guardianId, data, run, studentLabel }: {
  guardianId: string;
  data: TabProps['data'];
  run: TabProps['run'];
  studentLabel: (id: string) => string;
}) {
  const [studentId, setStudentId] = useState('');
  const [relationship, setRelationship] = useState('madre');
  const mine = data.links.filter(l => l.guardianUserId === guardianId);

  const add = async () => {
    if (!studentId) return;
    if (await run(() => addGuardianLink(studentId, guardianId, relationship))) setStudentId('');
  };

  return (
    <div className="adm-assign">
      <div className="adm-chips">
        {mine.length === 0 && <span className="text-subtle text-xs">Sin estudiantes vinculados</span>}
        {mine.map(l => (
          <span key={l.id} className="badge badge-cyan adm-chip">
            {studentLabel(l.studentId)} · {l.relationship}
            <button onClick={() => window.confirm('¿Desvincular?') && run(() => removeGuardianLink(l.id))} aria-label="Desvincular">
              <X size={11} />
            </button>
          </span>
        ))}
      </div>
      <div className="adm-inline">
        <select className="form-select" value={studentId} onChange={e => setStudentId(e.target.value)} aria-label="Estudiante">
          <option value="">Vincular con...</option>
          {data.students.filter(s => !mine.some(l => l.studentId === s.id)).map(s => (
            <option key={s.id} value={s.id}>{studentLabel(s.id)}</option>
          ))}
        </select>
        <select className="form-select" value={relationship} onChange={e => setRelationship(e.target.value)} aria-label="Parentesco">
          {RELATIONSHIPS.map(r => <option key={r} value={r}>{r}</option>)}
        </select>
        <button className="btn btn-secondary btn-sm" onClick={add} disabled={!studentId}><Plus size={14} /> Vincular</button>
      </div>
    </div>
  );
}
