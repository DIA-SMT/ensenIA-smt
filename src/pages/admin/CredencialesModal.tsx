/**
 * Usuario y clave inicial de una cuenta recién creada (o reseteada).
 * La clave se ve una sola vez: no queda guardada en ningún lado que la
 * app pueda volver a mostrar, así que se imprime, se copia o se anota acá.
 */

import { useState } from 'react';
import { Printer, Copy, Check, KeyRound, UserCheck } from 'lucide-react';
import { DialogoForm } from './ui';
import { printCredenciales, type Credencial } from './credenciales';

export type { Credencial };

export default function CredencialesModal({ items, schoolName, onClose }: {
  /** null: cerrado */
  items: Credencial[] | null;
  schoolName: string;
  onClose: () => void;
}) {
  const nuevas = (items ?? []).filter(c => !c.existing);
  return (
    <DialogoForm abierto={!!items} alCerrar={onClose} id="credenciales"
      titulo={nuevas.length ? 'Cuenta creada' : 'Listo'}
      bajada={nuevas.length ? 'Entregale estos datos. La clave se muestra una sola vez.' : undefined}
      pie={<button type="button" className="btn btn-primary" onClick={onClose} data-inicial>Listo</button>}>
      {(items ?? []).map(c => <Tarjeta key={c.login} c={c} schoolName={schoolName} />)}
      {nuevas.length > 0 && (
        <p className="adm-ayuda">
          Al entrar por primera vez elige una clave propia. Si pierde esta, generá otra con "Nueva clave".
        </p>
      )}
    </DialogoForm>
  );
}

export function Tarjeta({ c, schoolName }: { c: Credencial; schoolName: string }) {
  const [copiado, setCopiado] = useState(false);

  if (c.existing) {
    return (
      <div className="adm-cred">
        <strong className="adm-cred-nombre"><UserCheck size={16} aria-hidden="true" /> {c.name}</strong>
        <p className="text-sm text-secondary">
          Ya tenía cuenta (<code>{c.login}</code>): quedó sumada a esta escuela y sigue entrando con su clave de siempre.
        </p>
      </div>
    );
  }

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(`Usuario: ${c.login}\nClave inicial: ${c.password ?? ''}`);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch { /* sin permiso de portapapeles: queda a la vista para anotarla */ }
  };

  return (
    <div className="adm-cred">
      <strong className="adm-cred-nombre"><KeyRound size={16} aria-hidden="true" /> {c.name}</strong>
      <dl className="adm-cred-datos">
        <div><dt>Usuario</dt><dd><code>{c.login}</code></dd></div>
        <div><dt>Clave inicial</dt><dd><code>{c.password}</code></dd></div>
      </dl>
      <div className="adm-cred-acciones">
        <button type="button" className="btn btn-secondary btn-sm" onClick={copiar}>
          {copiado ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />} {copiado ? 'Copiado' : 'Copiar'}
        </button>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => printCredenciales([c], schoolName)}>
          <Printer size={14} aria-hidden="true" /> Imprimir
        </button>
      </div>
    </div>
  );
}
