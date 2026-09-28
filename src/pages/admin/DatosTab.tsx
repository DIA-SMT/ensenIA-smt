import { useState } from 'react';
import { Save } from 'lucide-react';
import { updateSchool } from '../../services/admin.service';
import type { TabProps } from './GestionEscuela';

export default function DatosTab({ data, run }: TabProps) {
  const s = data.school;
  const [name, setName] = useState(s.name);
  const [shortName, setShortName] = useState(s.shortName);
  const [address, setAddress] = useState(s.address);
  const [district, setDistrict] = useState(s.district);
  const [saved, setSaved] = useState(false);

  const handleSave = async () => {
    if (!name.trim() || !shortName.trim()) return;
    const ok = await run(() => updateSchool(s.id, { name: name.trim(), shortName: shortName.trim(), address, district }));
    if (ok) { setSaved(true); setTimeout(() => setSaved(false), 2500); }
  };

  return (
    <div className="card adm-form adm-narrow">
      <div className="em-field">
        <label>Nombre</label>
        <input value={name} onChange={e => setName(e.target.value)} />
      </div>
      <div className="em-field">
        <label>Nombre corto</label>
        <input value={shortName} onChange={e => setShortName(e.target.value)} placeholder="Ej: Gabriela Mistral" />
        <span className="em-hint">Es el que aparece en el menú de la app.</span>
      </div>
      <div className="em-row">
        <div className="em-field">
          <label>Dirección</label>
          <input value={address} onChange={e => setAddress(e.target.value)} />
        </div>
        <div className="em-field">
          <label>Barrio / zona</label>
          <input value={district} onChange={e => setDistrict(e.target.value)} />
        </div>
      </div>
      <button className="btn btn-primary" onClick={handleSave} disabled={!name.trim() || !shortName.trim()}>
        <Save size={15} /> {saved ? 'Guardado' : 'Guardar'}
      </button>
    </div>
  );
}
