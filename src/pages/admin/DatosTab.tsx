import { useState } from 'react';
import { Save } from 'lucide-react';
import { updateSchool } from '../../services/admin.service';
import { avisar } from '../../components/ui/avisar';
import { Barra, Campo } from './ui';
import type { TabProps } from './GestionEscuela';

export default function DatosTab({ data, run }: TabProps) {
  const s = data.school;
  const [name, setName] = useState(s.name);
  const [shortName, setShortName] = useState(s.shortName);
  const [address, setAddress] = useState(s.address);
  const [district, setDistrict] = useState(s.district);
  const [guardando, setGuardando] = useState(false);
  const cambio = name !== s.name || shortName !== s.shortName || address !== s.address || district !== s.district;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !shortName.trim() || guardando) return;
    setGuardando(true);
    const ok = await run(() => updateSchool(s.id, { name: name.trim(), shortName: shortName.trim(), address, district }));
    setGuardando(false);
    if (ok) avisar.exito('Datos de la escuela guardados');
  };

  return (
    <div className="adm-seccion">
      <Barra detalle="Cómo aparece la escuela en la app." />
      <form className="card adm-tarjeta adm-form adm-angosto" onSubmit={handleSave}>
        <Campo label="Nombre completo" htmlFor="dat-nombre">
          <input id="dat-nombre" className="form-input" value={name} onChange={e => setName(e.target.value)} required />
        </Campo>
        <Campo label="Nombre corto" htmlFor="dat-corto" ayuda="Es el que aparece en el menú de la app.">
          <input id="dat-corto" className="form-input" value={shortName} onChange={e => setShortName(e.target.value)} required />
        </Campo>
        <div className="adm-fila">
          <Campo label="Dirección" htmlFor="dat-dir">
            <input id="dat-dir" className="form-input" value={address} onChange={e => setAddress(e.target.value)} />
          </Campo>
          <Campo label="Barrio / zona" htmlFor="dat-zona">
            <input id="dat-zona" className="form-input" value={district} onChange={e => setDistrict(e.target.value)} />
          </Campo>
        </div>
        <div>
          <button type="submit" className="btn btn-primary" disabled={!cambio || !name.trim() || !shortName.trim() || guardando}>
            <Save size={15} aria-hidden="true" /> {guardando ? 'Guardando…' : 'Guardar cambios'}
          </button>
        </div>
      </form>
    </div>
  );
}
