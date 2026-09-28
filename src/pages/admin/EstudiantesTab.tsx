import { useMemo, useState } from 'react';
import { UserPlus, KeyRound, Search } from 'lucide-react';
import { createAccount, resetPassword, moveStudent, type AdminStudent } from '../../services/admin.service';
import type { TabProps } from './GestionEscuela';

export default function EstudiantesTab({ data, run, showCredentials }: TabProps) {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [dni, setDni] = useState('');
  const [courseId, setCourseId] = useState('');
  const [creating, setCreating] = useState(false);
  const [filterCourse, setFilterCourse] = useState('');
  const [query, setQuery] = useState('');

  const canCreate = firstName.trim() && lastName.trim() && dni.replace(/\D/g, '').length >= 6 && courseId;

  const handleCreate = async () => {
    if (!canCreate || creating) return;
    setCreating(true);
    await run(async () => {
      const c = await createAccount({ schoolId: data.school.id, role: 'estudiante', firstName, lastName, dni, courseId });
      showCredentials([{ name: `${firstName.trim()} ${lastName.trim()}`, ...c }]);
      // El curso queda elegido: lo normal es cargar varios del mismo
      setFirstName(''); setLastName(''); setDni('');
    });
    setCreating(false);
  };

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

  return (
    <div className="adm-grid">
      <div className="card adm-form">
        <h3 className="adm-card-title"><UserPlus size={16} /> Nuevo estudiante</h3>
        {data.courses.length === 0 ? (
          <p className="text-secondary text-sm">Primero creá los cursos (en "Cursos y materias").</p>
        ) : (
          <>
            <div className="em-row">
              <div className="em-field"><label>Nombre</label><input value={firstName} onChange={e => setFirstName(e.target.value)} /></div>
              <div className="em-field"><label>Apellido</label><input value={lastName} onChange={e => setLastName(e.target.value)} /></div>
            </div>
            <div className="em-row">
              <div className="em-field">
                <label>DNI</label>
                <input inputMode="numeric" value={dni} onChange={e => setDni(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleCreate(); }} />
              </div>
              <div className="em-field">
                <label>Curso</label>
                <select className="form-select" value={courseId} onChange={e => setCourseId(e.target.value)}>
                  <option value="">Elegir...</option>
                  {data.courses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
            </div>
            <span className="em-hint">Entra con su DNI. Queda inscripto solo en todas las materias de su curso.</span>
            <button className="btn btn-primary" onClick={handleCreate} disabled={!canCreate || creating}>
              <UserPlus size={15} /> {creating ? 'Creando...' : 'Crear cuenta'}
            </button>
          </>
        )}
      </div>

      <div className="card">
        <div className="adm-inline adm-filters">
          <div className="adm-search">
            <Search size={14} />
            <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Buscar por nombre o DNI" aria-label="Buscar" />
          </div>
          <select className="form-select" value={filterCourse} onChange={e => setFilterCourse(e.target.value)} aria-label="Filtrar por curso">
            <option value="">Todos los cursos</option>
            {data.courses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        {visible.length === 0 && <p className="text-secondary text-sm">No hay estudiantes{filterCourse || query ? ' con ese filtro' : ''}.</p>}
        {visible.map(s => (
          <div key={s.id} className="adm-person">
            <div className="adm-person-head">
              <div>
                <strong>{s.lastName}, {s.firstName}</strong>
                <span className="text-subtle text-xs adm-login">{s.dni ?? 'sin cuenta'}</span>
                {s.mustChangePassword && <span className="badge badge-warning text-xs">todavía no entró</span>}
              </div>
              <div className="adm-actions">
                <select className="form-select adm-select-sm" value={s.courseId} onChange={e => handleMove(s, e.target.value)}
                  aria-label={`Curso de ${s.firstName} ${s.lastName}`}>
                  {data.courses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                {s.userId && (
                  <button className="btn btn-ghost btn-sm" onClick={() => handleReset(s)} title="Generar una clave inicial nueva">
                    <KeyRound size={14} /> Nueva clave
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
