/**
 * Credenciales de acceso: el tipo y el cartelito imprimible.
 * Aparte del modal para que el archivo del componente solo exporte
 * componentes (si no, Vite pierde la recarga en caliente).
 */

import { hostPublico } from '../../lib/direccion';

export interface Credencial {
  name: string;
  login: string;
  password?: string;
  /** ya tenía cuenta: se la sumó a la escuela y sigue con su clave */
  existing?: boolean;
}

const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

/**
 * Un cartelito por persona, para recortar. Con varias (un curso entero) se
 * acomodan de a dos por fila y no se cortan entre páginas.
 */
export function printCredenciales(items: Credencial[], schoolName: string) {
  const conClave = items.filter(c => c.password);
  if (!conClave.length) return;
  const w = window.open('', '_blank', 'width=720,height=640');
  if (!w) return;
  const slips = conClave.map(c => `<div class="slip">
  <h1>SMT EstudIA</h1><p>${esc(schoolName)}</p>
  <p><strong>${esc(c.name)}</strong></p>
  <p class="k">Usuario</p><p class="v">${esc(c.login)}</p>
  <p class="k">Clave inicial</p><p class="v">${esc(c.password ?? '')}</p>
  <p class="pie">Entrá en <strong>${esc(hostPublico())}</strong>. La primera vez te va a pedir que elijas una clave propia.</p>
</div>`).join('');
  w.document.write(`<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Acceso a SMT EstudIA</title>
<style>
  body { font-family: system-ui, sans-serif; padding: 16px; color: #111; margin: 0; }
  .grilla { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
  .slip { border: 2px dashed #555; border-radius: 12px; padding: 16px; break-inside: avoid; }
  h1 { font-size: 16px; margin: 0 0 2px; } p { margin: 4px 0; font-size: 13px; }
  .k { color: #555; font-size: 11px; text-transform: uppercase; letter-spacing: .05em; margin-top: 10px; }
  .v { font-size: 20px; font-weight: 700; font-family: ui-monospace, monospace; }
  .pie { margin-top: 10px; font-size: 12px; }
</style></head><body><div class="grilla">${slips}</div>
<script>window.onload = () => { window.print(); }</script></body></html>`);
  w.document.close();
}
