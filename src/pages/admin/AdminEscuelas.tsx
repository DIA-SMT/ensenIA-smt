/**
 * Superadmin: todas las escuelas. La lista va primero (es lo que se mira
 * todos los días); crear una escuela es de vez en cuando y va en un
 * diálogo. Al crearla se entra directo a ella: lo siguiente es armarla.
 */

import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Building2, Plus, AlertCircle, ChevronRight, Search, MapPin } from 'lucide-react';
import { listSchools, createSchool, type AdminSchool } from '../../services/admin.service';
import { avisar } from '../../components/ui/avisar';
import { Esqueleto } from '../../components/ui/Esqueleto';
import EstadoVacio from '../../components/ui/EstadoVacio';
import { Campo, DialogoForm } from './ui';
import './Admin.css';

export default function AdminEscuelas() {
  const navigate = useNavigate();
  const [schools, setSchools] = useState<AdminSchool[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [abierto, setAbierto] = useState(false);

  useEffect(() => {
    listSchools()
      .then(setSchools)
      .catch(err => setError(err instanceof Error ? err.message : 'No se pudieron cargar las escuelas.'))
      .finally(() => setLoading(false));
  }, []);

  const visibles = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? schools.filter(s => `${s.name} ${s.shortName} ${s.district}`.toLowerCase().includes(q)) : schools;
  }, [schools, query]);

  const totalPersonas = schools.reduce((n, s) => n + s.memberCount, 0);

  return (
    <div className="adm-container animate-in">
      <header className="adm-head">
        <div>
          <h2><Building2 size={20} aria-hidden="true" /> Escuelas municipales</h2>
          <p>
            {loading ? 'Contando escuelas…' : `${schools.length} escuela${schools.length !== 1 ? 's' : ''} · ${totalPersonas} persona${totalPersonas !== 1 ? 's' : ''} con cuenta`}
          </p>
        </div>
        <button type="button" className="btn btn-primary" onClick={() => setAbierto(true)}>
          <Plus size={16} aria-hidden="true" /> Nueva escuela
        </button>
      </header>

      {error && <div className="adm-error" role="alert"><AlertCircle size={15} aria-hidden="true" /> {error}</div>}

      {schools.length > 4 && (
        <div className="adm-buscar">
          <Search size={16} aria-hidden="true" />
          <input className="form-input" value={query} onChange={e => setQuery(e.target.value)}
            placeholder="Buscar escuela" aria-label="Buscar escuela" />
        </div>
      )}

      {loading && <Esqueleto tipo="filas" cantidad={4} etiqueta="Cargando escuelas…" />}

      {!loading && !error && schools.length === 0 && (
        <EstadoVacio icono={Building2} titulo="Todavía no hay escuelas"
          texto="Creá la primera. Después vas a poder nombrar a su dirección y armar cursos, docentes y estudiantes."
          accion={{ etiqueta: 'Nueva escuela', icono: Plus, alTocar: () => setAbierto(true) }} />
      )}

      {!loading && query.trim() !== '' && visibles.length === 0 && (
        <EstadoVacio compacto icono={Search} titulo={`Ninguna escuela coincide con «${query.trim()}»`}
          texto="Probá con otra parte del nombre o con el barrio."
          accion={{ etiqueta: 'Ver todas', alTocar: () => setQuery('') }} />
      )}

      <ul className="adm-escuelas">
        {visibles.map(s => (
          <li key={s.id}>
            <button type="button" className="card card-interactive adm-escuela" onClick={() => navigate(`/admin/escuelas/${s.id}`)}>
              <span className="adm-escuela-icono" aria-hidden="true"><Building2 size={20} /></span>
              <span className="adm-escuela-texto">
                <strong>{s.name}</strong>
                <span className="adm-escuela-meta">
                  {s.district && <span><MapPin size={12} aria-hidden="true" /> {s.district}</span>}
                  <span>{s.courseCount} curso{s.courseCount !== 1 ? 's' : ''}</span>
                  <span>{s.memberCount} persona{s.memberCount !== 1 ? 's' : ''}</span>
                </span>
              </span>
              {s.courseCount === 0 && <span className="badge badge-warning adm-escuela-estado">Por armar</span>}
              <ChevronRight size={18} className="adm-escuela-flecha" aria-hidden="true" />
            </button>
          </li>
        ))}
      </ul>

      <NuevaEscuela abierto={abierto} alCerrar={() => setAbierto(false)}
        alCrear={id => navigate(`/admin/escuelas/${id}`)} />
    </div>
  );
}

function NuevaEscuela({ abierto, alCerrar, alCrear }: {
  abierto: boolean;
  alCerrar: () => void;
  alCrear: (id: string) => void;
}) {
  const [name, setName] = useState('');
  const [shortName, setShortName] = useState('');
  const [address, setAddress] = useState('');
  const [district, setDistrict] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const listo = name.trim() && shortName.trim();

  const crear = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!listo || creating) return;
    setCreating(true);
    setError('');
    try {
      const id = await createSchool({ name: name.trim(), shortName: shortName.trim(), address, district });
      avisar.exito(`Escuela creada: ${shortName.trim()}`, 'Ahora armala: cursos, dirección, docentes y estudiantes.');
      alCrear(id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo crear la escuela.');
      setCreating(false);
    }
  };

  return (
    <DialogoForm abierto={abierto} alCerrar={alCerrar} id="nueva-escuela" titulo="Nueva escuela"
      bajada="Después la armás: dirección, cursos, docentes y estudiantes."
      pie={<>
        <button type="button" className="btn btn-ghost" onClick={alCerrar}>Cancelar</button>
        <button type="submit" form="form-nueva-escuela" className="btn btn-primary" disabled={!listo || creating}>
          {creating ? 'Creando...' : 'Crear y armar'}
        </button>
      </>}>
      <form id="form-nueva-escuela" className="adm-form" onSubmit={crear}>
        {error && <div className="adm-error" role="alert"><AlertCircle size={15} /> {error}</div>}
        <Campo label="Nombre completo" htmlFor="esc-nombre">
          <input id="esc-nombre" className="form-input" data-inicial value={name} onChange={e => setName(e.target.value)}
            placeholder="Escuela Municipal ..." required />
        </Campo>
        <Campo label="Nombre corto" htmlFor="esc-corto" ayuda="Es el que aparece en el menú de la app.">
          <input id="esc-corto" className="form-input" value={shortName} onChange={e => setShortName(e.target.value)}
            placeholder="Ej: E.M. Gabriela Mistral" required />
        </Campo>
        <div className="adm-fila">
          <Campo label="Dirección" htmlFor="esc-dir">
            <input id="esc-dir" className="form-input" value={address} onChange={e => setAddress(e.target.value)} />
          </Campo>
          <Campo label="Barrio / zona" htmlFor="esc-zona">
            <input id="esc-zona" className="form-input" value={district} onChange={e => setDistrict(e.target.value)} />
          </Campo>
        </div>
      </form>
    </DialogoForm>
  );
}
