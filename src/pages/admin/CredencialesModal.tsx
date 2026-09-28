/**
 * Usuario y clave inicial de una cuenta recién creada (o reseteada).
 * La clave se ve una sola vez: no queda guardada en ningún lado que la
 * app pueda volver a mostrar, así que se imprime o se anota acá.
 */

import { createPortal } from 'react-dom';
import { X, Printer, KeyRound } from 'lucide-react';
import '../../components/Modals.css';

export interface Credencial {
  name: string;
  login: string;
  password?: string;
  /** ya tenía cuenta: se la sumó a la escuela y sigue con su clave */
  existing?: boolean;
}

const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

function printCredencial(c: Credencial, schoolName: string) {
  const w = window.open('', '_blank', 'width=420,height=520');
  if (!w) return;
  w.document.write(`<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Acceso a SMT EstudIA</title>
<style>
  body { font-family: system-ui, sans-serif; padding: 24px; color: #111; }
  .slip { border: 2px dashed #555; border-radius: 12px; padding: 20px; max-width: 340px; }
  h1 { font-size: 18px; margin: 0 0 4px; } p { margin: 6px 0; font-size: 14px; }
  .k { color: #555; font-size: 12px; text-transform: uppercase; letter-spacing: .05em; margin-top: 14px; }
  .v { font-size: 22px; font-weight: 700; font-family: ui-monospace, monospace; }
</style></head><body><div class="slip">
  <h1>SMT EstudIA</h1><p>${esc(schoolName)}</p>
  <p><strong>${esc(c.name)}</strong></p>
  <p class="k">Usuario</p><p class="v">${esc(c.login)}</p>
  <p class="k">Clave inicial</p><p class="v">${esc(c.password ?? '')}</p>
  <p style="margin-top:16px">Entrá en <strong>${esc(window.location.host)}</strong>. La primera vez te va a pedir que elijas una clave propia.</p>
</div><script>window.onload = () => { window.print(); }</script></body></html>`);
  w.document.close();
}

export default function CredencialesModal({ items, schoolName, onClose }: {
  items: Credencial[];
  schoolName: string;
  onClose: () => void;
}) {
  return createPortal(
    <div className="em-modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="em-modal" role="dialog" aria-label="Datos de acceso">
        <div className="em-modal-header">
          <h3 className="flex items-center gap-2"><KeyRound size={18} className="text-cyan" /> Datos de acceso</h3>
          <button className="btn-icon" onClick={onClose} aria-label="Cerrar"><X size={18} /></button>
        </div>
        <div className="em-modal-body">
          {items.map(c => (
            <div key={c.login} className="adm-cred">
              <strong>{c.name}</strong>
              {c.existing ? (
                <p className="text-sm text-secondary">
                  Ya tenía cuenta (<code>{c.login}</code>): quedó sumada a esta escuela y sigue entrando con su clave de siempre.
                </p>
              ) : (
                <>
                  <div className="adm-cred-row"><span className="text-subtle text-xs">Usuario</span><code>{c.login}</code></div>
                  <div className="adm-cred-row"><span className="text-subtle text-xs">Clave inicial</span><code>{c.password}</code></div>
                  <button className="btn btn-secondary btn-sm" onClick={() => printCredencial(c, schoolName)}>
                    <Printer size={14} /> Imprimir
                  </button>
                </>
              )}
            </div>
          ))}
          {items.some(c => !c.existing) && (
            <p className="em-hint">
              La clave se muestra una sola vez: imprimila o anotala ahora. Al entrar por primera vez
              la persona elige una propia. Si se pierde, se puede generar otra con "Nueva clave".
            </p>
          )}
        </div>
        <div className="em-modal-footer">
          <button className="btn btn-primary" onClick={onClose}>Listo</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
