import { useState } from 'react';
import { UserPlus, Plus, X, HeartHandshake, AlertCircle } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import {
  createAccount, resetPassword, removeMember, addGuardianLink, removeGuardianLink, type AdminMember,
} from '../../services/admin.service';
import { PersonRow } from './PersonalTab';
import { Barra, Campo, DialogoForm, Vacio } from './ui';
import type { SchoolData, TabProps } from './GestionEscuela';

const RELATIONSHIPS = ['madre', 'padre', 'tutor', 'tutora', 'abuela', 'abuelo', 'otro'];

/** Estudiantes agrupados por curso, para elegir en listas largas. */
function OpcionesEstudiantes({ data, excluir = [] }: { data: SchoolData; excluir?: string[] }) {
  return (
    <>
      {data.courses.map(c => {
        const alumnos = data.students.filter(s => s.courseId === c.id && !excluir.includes(s.id));
        if (!alumnos.length) return null;
        return (
          <optgroup key={c.id} label={c.name}>
            {alumnos.map(s => <option key={s.id} value={s.id}>{s.lastName}, {s.firstName}</option>)}
          </optgroup>
        );
      })}
    </>
  );
}

export default function FamiliasTab(props: TabProps) {
  const { data, run, showCredentials, irA } = props;
  const { user } = useAuth();
  const [alta, setAlta] = useState(false);

  const guardians = data.members.filter(m => m.role === 'padre');
  const sinEstudiantes = data.students.length === 0;
  const studentLabel = (id: string) => {
    const s = data.students.find(x => x.id === id);
    return s ? `${s.firstName} ${s.lastName} (${s.courseName})` : '—';
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
    <div className="adm-seccion">
      <Barra detalle={`${guardians.length} con cuenta · ven notas, asistencia y comunicados de sus hijos`}>
        <button type="button" className="btn btn-primary" onClick={() => setAlta(true)} disabled={sinEstudiantes}>
          <UserPlus size={16} aria-hidden="true" /> Sumar familia
        </button>
      </Barra>

      {sinEstudiantes && (
        <p className="adm-aviso">
          <AlertCircle size={14} aria-hidden="true" /> Cada familia se vincula con un estudiante: primero cargá a los estudiantes.{' '}
          <button type="button" className="adm-link" onClick={() => irA('estudiantes')}>Ir a Estudiantes</button>
        </p>
      )}

      <section className="card adm-tarjeta">
        {guardians.length === 0 ? (
          <Vacio icono={HeartHandshake} titulo="Sin familias"
            texto="Cada adulto responsable tiene su cuenta y ve solo lo de sus hijos. Si tiene varios en la escuela, se vinculan todos a la misma cuenta." />
        ) : guardians.map(m => (
          <PersonRow key={m.membershipId} m={m} canManage={m.userId !== user?.id} onReset={handleReset} onRemove={handleRemove}>
            <Links guardianId={m.userId} data={data} run={run} studentLabel={studentLabel} />
          </PersonRow>
        ))}
      </section>

      <AltaFamilia abierto={alta} alCerrar={() => setAlta(false)} {...props} />
    </div>
  );
}

function AltaFamilia({ abierto, alCerrar, data, reload, showCredentials }: TabProps & {
  abierto: boolean;
  alCerrar: () => void;
}) {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [dni, setDni] = useState('');
  const [email, setEmail] = useState('');
  const [studentId, setStudentId] = useState('');
  const [relationship, setRelationship] = useState('madre');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const listo = firstName.trim() && lastName.trim() && (dni.trim() || email.trim()) && studentId;

  const crear = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!listo || creating) return;
    setCreating(true);
    setError('');
    try {
      const c = await createAccount({
        schoolId: data.school.id, role: 'padre', firstName, lastName,
        dni: dni.trim() || undefined, email: email.trim() || undefined,
      });
      // Si falla el vínculo la cuenta ya existe: se vincula después desde la lista
      await addGuardianLink(studentId, c.userId, relationship).catch(() => {});
      await reload();
      setFirstName(''); setLastName(''); setDni(''); setEmail(''); setStudentId('');
      alCerrar();
      showCredentials([{ name: `${firstName.trim()} ${lastName.trim()}`, ...c }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo crear la cuenta.');
    } finally {
      setCreating(false);
    }
  };

  return (
    <DialogoForm abierto={abierto} alCerrar={alCerrar} id="alta-familia" titulo="Sumar familia"
      bajada="Si tiene más hijos en la escuela, se vinculan después desde la lista."
      pie={<>
        <button type="button" className="btn btn-ghost" onClick={alCerrar}>Cancelar</button>
        <button type="submit" form="form-alta-familia" className="btn btn-primary" disabled={!listo || creating}>
          {creating ? 'Creando...' : 'Crear cuenta'}
        </button>
      </>}>
      <form id="form-alta-familia" className="adm-form" onSubmit={crear}>
        {error && <div className="adm-error" role="alert"><AlertCircle size={15} aria-hidden="true" /> {error}</div>}
        <div className="adm-fila">
          <Campo label="Estudiante" htmlFor="fam-est">
            <select id="fam-est" className="form-select" data-inicial value={studentId} onChange={e => setStudentId(e.target.value)}>
              <option value="">Elegir...</option>
              <OpcionesEstudiantes data={data} />
            </select>
          </Campo>
          <Campo label="Parentesco" htmlFor="fam-rel">
            <select id="fam-rel" className="form-select" value={relationship} onChange={e => setRelationship(e.target.value)}>
              {RELATIONSHIPS.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </Campo>
        </div>
        <div className="adm-fila">
          <Campo label="Nombre" htmlFor="fam-nombre">
            <input id="fam-nombre" className="form-input" value={firstName} onChange={e => setFirstName(e.target.value)} autoComplete="off" />
          </Campo>
          <Campo label="Apellido" htmlFor="fam-apellido">
            <input id="fam-apellido" className="form-input" value={lastName} onChange={e => setLastName(e.target.value)} autoComplete="off" />
          </Campo>
        </div>
        <div className="adm-fila">
          <Campo label="DNI" htmlFor="fam-dni">
            <input id="fam-dni" className="form-input" inputMode="numeric" value={dni} onChange={e => setDni(e.target.value)} autoComplete="off" />
          </Campo>
          <Campo label="Email (opcional)" htmlFor="fam-email">
            <input id="fam-email" className="form-input" type="email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="off" />
          </Campo>
        </div>
        <p className="adm-ayuda">Con email entra con el email; si no, con el DNI.</p>
      </form>
    </DialogoForm>
  );
}

function Links({ guardianId, data, run, studentLabel }: {
  guardianId: string;
  data: TabProps['data'];
  run: TabProps['run'];
  studentLabel: (id: string) => string;
}) {
  const [abierto, setAbierto] = useState(false);
  const [studentId, setStudentId] = useState('');
  const [relationship, setRelationship] = useState('madre');
  const mine = data.links.filter(l => l.guardianUserId === guardianId);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!studentId) return;
    if (await run(() => addGuardianLink(studentId, guardianId, relationship))) { setStudentId(''); setAbierto(false); }
  };

  return (
    <div className="adm-asignaciones">
      <div className="adm-chips">
        {mine.length === 0 && <span className="adm-ayuda">Sin estudiantes vinculados</span>}
        {mine.map(l => (
          <span key={l.id} className="adm-chip">
            {studentLabel(l.studentId)} · {l.relationship}
            <button type="button" onClick={() => window.confirm('¿Desvincular?') && run(() => removeGuardianLink(l.id))}
              aria-label={`Desvincular de ${studentLabel(l.studentId)}`}><X size={12} aria-hidden="true" /></button>
          </span>
        ))}
        {!abierto && (
          <button type="button" className="adm-chip adm-chip-agregar" onClick={() => setAbierto(true)}>
            <Plus size={12} aria-hidden="true" /> Vincular otro
          </button>
        )}
      </div>
      {abierto && (
        <form className="adm-alta" onSubmit={add}>
          <select className="form-select" value={studentId} onChange={e => setStudentId(e.target.value)} aria-label="Estudiante" autoFocus>
            <option value="">Estudiante...</option>
            <OpcionesEstudiantes data={data} excluir={mine.map(l => l.studentId)} />
          </select>
          <select className="form-select" value={relationship} onChange={e => setRelationship(e.target.value)} aria-label="Parentesco">
            {RELATIONSHIPS.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
          <button type="submit" className="btn btn-primary btn-sm" disabled={!studentId}>Vincular</button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setAbierto(false)}>Cancelar</button>
        </form>
      )}
    </div>
  );
}
