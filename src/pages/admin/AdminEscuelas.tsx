/**
 * Superadmin: todas las escuelas. Desde acá se crea una escuela nueva y se
 * entra a gestionar cada una (director/a, docentes, cursos, alumnos...).
 */

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Building2, Plus, AlertCircle, ChevronRight } from 'lucide-react';
import { listSchools, createSchool, type AdminSchool } from '../../services/admin.service';
import './Admin.css';

export default function AdminEscuelas() {
  const navigate = useNavigate();
  const [schools, setSchools] = useState<AdminSchool[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [name, setName] = useState('');
  const [shortName, setShortName] = useState('');
  const [address, setAddress] = useState('');
  const [district, setDistrict] = useState('');
  const [creating, setCreating] = useState(false);

  const load = () => listSchools()
    .then(setSchools)
    .catch(err => setError(err instanceof Error ? err.message : 'No se pudieron cargar las escuelas.'))
    .finally(() => setLoading(false));

  useEffect(() => { load(); }, []);

  const handleCreate = async () => {
    if (!name.trim() || !shortName.trim() || creating) return;
    setCreating(true);
    setError('');
    try {
      const id = await createSchool({ name: name.trim(), shortName: shortName.trim(), address, district });
      // Lo siguiente es nombrar al director/a: se va directo a la escuela
      navigate(`/admin/escuelas/${id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo crear la escuela.');
      setCreating(false);
    }
  };

  return (
    <div className="adm-container animate-in">
      <div>
        <h2 className="flex items-center gap-2"><Building2 size={20} className="text-cyan" /> Escuelas</h2>
        <p className="text-secondary text-sm">Cada escuela con su dirección, docentes, cursos, estudiantes y familias.</p>
      </div>

      {error && <div className="em-error"><AlertCircle size={14} /> {error}</div>}

      <div className="adm-grid">
        <div className="card adm-form">
          <h3 className="adm-card-title"><Plus size={16} /> Nueva escuela</h3>
          <div className="em-field"><label>Nombre</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="Escuela Municipal ..." />
          </div>
          <div className="em-field"><label>Nombre corto</label>
            <input value={shortName} onChange={e => setShortName(e.target.value)} placeholder="Ej: Gabriela Mistral" />
          </div>
          <div className="em-row">
            <div className="em-field"><label>Dirección</label><input value={address} onChange={e => setAddress(e.target.value)} /></div>
            <div className="em-field"><label>Barrio / zona</label><input value={district} onChange={e => setDistrict(e.target.value)} /></div>
          </div>
          <button className="btn btn-primary" onClick={handleCreate} disabled={!name.trim() || !shortName.trim() || creating}>
            <Plus size={15} /> {creating ? 'Creando...' : 'Crear escuela'}
          </button>
        </div>

        <div className="adm-stack">
          {loading && <p className="text-secondary">Cargando...</p>}
          {!loading && schools.length === 0 && <p className="text-secondary">Todavía no hay escuelas.</p>}
          {schools.map(s => (
            <button key={s.id} className="card card-interactive adm-school" onClick={() => navigate(`/admin/escuelas/${s.id}`)}>
              <div>
                <strong>{s.name}</strong>
                <span className="text-subtle text-xs">
                  {[s.district, `${s.courseCount} cursos`, `${s.memberCount} personas`].filter(Boolean).join(' · ')}
                </span>
              </div>
              <ChevronRight size={18} className="text-secondary" />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
