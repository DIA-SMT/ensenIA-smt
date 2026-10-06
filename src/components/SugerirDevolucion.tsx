/**
 * Botón "Sugerir devolución": pide a la IA un borrador de la devolución
 * (ver devolucion-ia.ts). Muestra lo que cuesta antes de tocarlo y la
 * espera mientras escribe. El borrador lo pone la pantalla en su campo.
 */

import { useId } from 'react';
import { Sparkles, X } from 'lucide-react';
import { Cargando } from './ui/Esqueleto';
import './SugerirDevolucion.css';

interface Props {
  cargando: boolean;
  alTocar: () => void;
  /** Si está, mientras escribe se puede cortar. */
  alCancelar?: () => void;
  disabled?: boolean;
  /** Por qué está deshabilitado (se lee en lugar del costo). */
  motivo?: string;
  className?: string;
}

export default function SugerirDevolucion({ cargando, alTocar, alCancelar, disabled = false, motivo, className = '' }: Props) {
  const idCosto = useId();
  return (
    <div className={`sdev ${className}`}>
      {cargando ? (
        <>
          <Cargando texto="La IA está escribiendo un borrador…" className="sdev-cargando" />
          {alCancelar && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={alCancelar}>
              <X size={14} aria-hidden="true" /> Cancelar
            </button>
          )}
        </>
      ) : (
        <>
          <button
            type="button"
            className="btn btn-outline btn-sm sdev-boton"
            onClick={alTocar}
            disabled={disabled}
            aria-describedby={idCosto}
          >
            <Sparkles size={14} aria-hidden="true" /> Sugerir devolución
          </button>
          <span id={idCosto} className="sdev-costo">
            {disabled && motivo ? motivo : 'Usa 1 uso de IA. Vos la revisás antes de guardar.'}
          </span>
        </>
      )}
    </div>
  );
}
