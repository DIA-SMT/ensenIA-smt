/**
 * Los cuatro ajustes de lectura y datos. Se usa en el diálogo rápido de la
 * barra superior y en la pantalla de Ajustes: es el mismo control en los
 * dos lugares, así lo que se cambia en uno se ve en el otro.
 *
 * Controles nativos a propósito (radios dentro de fieldset y botones con
 * role="switch"): el lector de pantalla los anuncia bien sin trucos.
 */

import { useEffect, useState } from 'react';
import { Type, Contrast, Wind, Wifi, RotateCcw } from 'lucide-react';
import { usePreferencias, type TamanoLetra, type AhorroDatos } from '../../contexts/PreferencesContext';

const LETRAS: { valor: TamanoLetra; etiqueta: string; muestra: string }[] = [
  { valor: 'normal', etiqueta: 'Normal', muestra: '1rem' },
  { valor: 'grande', etiqueta: 'Grande', muestra: '1.2rem' },
  { valor: 'muy-grande', etiqueta: 'Muy grande', muestra: '1.4rem' },
];

const AHORROS: { valor: AhorroDatos; etiqueta: string }[] = [
  { valor: 'auto', etiqueta: 'Automático' },
  { valor: 'si', etiqueta: 'Siempre' },
  { valor: 'no', etiqueta: 'Nunca' },
];

function useSistemaReduceMovimiento(): boolean {
  const [reduce, setReduce] = useState(() => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false);
  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (!mq) return;
    const alCambiar = () => setReduce(mq.matches);
    mq.addEventListener('change', alCambiar);
    return () => mq.removeEventListener('change', alCambiar);
  }, []);
  return reduce;
}

interface InterruptorProps {
  id: string;
  activo: boolean;
  alCambiar: (v: boolean) => void;
  etiqueta: string;
  detalle: string;
  icono: typeof Type;
  bloqueado?: boolean;
}

function Interruptor({ id, activo, alCambiar, etiqueta, detalle, icono: Icono, bloqueado }: InterruptorProps) {
  return (
    <div className="pref-fila">
      <Icono size={18} aria-hidden="true" className="pref-icono" />
      <div className="pref-texto">
        <span className="pref-etiqueta" id={`${id}-et`}>{etiqueta}</span>
        <span className="pref-detalle" id={`${id}-det`}>{detalle}</span>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={activo}
        aria-labelledby={`${id}-et`}
        aria-describedby={`${id}-det`}
        disabled={bloqueado}
        className="interruptor"
        onClick={() => alCambiar(!activo)}
      >
        <span className="interruptor-perilla" aria-hidden="true" />
      </button>
    </div>
  );
}

export default function PanelPreferencias({ primerFoco = false }: { primerFoco?: boolean }) {
  const { preferencias, cambiar, restablecer, ahorroActivo, sistemaAhorra } = usePreferencias();
  const sistemaReduce = useSistemaReduceMovimiento();

  const detalleAhorro = preferencias.ahorro === 'auto'
    ? (sistemaAhorra
        ? 'Tu dispositivo pide ahorrar datos, así que está activo.'
        : 'Se activa solo si tu celular tiene el ahorro de datos prendido.')
    : preferencias.ahorro === 'si'
      ? 'Activo. Las pantallas se bajan recién cuando las abrís y los videos piden confirmación.'
      : 'Apagado. La app baja por adelantado las pantallas de tu rol para que anden sin conexión.';

  return (
    <div className="panel-prefs">
      <fieldset className="pref-grupo">
        <legend className="pref-leyenda"><Type size={16} aria-hidden="true" /> Tamaño de letra</legend>
        <div className="segmentado" role="presentation">
          {LETRAS.map((l, i) => (
            <label key={l.valor} className="segmentado-opcion">
              <input
                type="radio"
                name="pref-letra"
                value={l.valor}
                checked={preferencias.letra === l.valor}
                onChange={() => cambiar('letra', l.valor)}
                data-inicial={primerFoco && (preferencias.letra === l.valor || (i === 0 && !LETRAS.some(x => x.valor === preferencias.letra))) ? '' : undefined}
              />
              <span className="segmentado-caja">
                <span className="segmentado-muestra" style={{ fontSize: l.muestra }} aria-hidden="true">Aa</span>
                <span>{l.etiqueta}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <Interruptor
        id="pref-contraste"
        icono={Contrast}
        etiqueta="Contraste alto"
        detalle="Textos más oscuros, bordes marcados y enlaces subrayados."
        activo={preferencias.contraste === 'alto'}
        alCambiar={v => cambiar('contraste', v ? 'alto' : 'normal')}
      />

      <Interruptor
        id="pref-movimiento"
        icono={Wind}
        etiqueta="Reducir movimiento"
        detalle={sistemaReduce
          ? 'Tu dispositivo ya pide menos movimiento: la app lo respeta.'
          : 'Apaga las animaciones y los desplazamientos suaves.'}
        activo={sistemaReduce || preferencias.movimiento === 'reducido'}
        bloqueado={sistemaReduce}
        alCambiar={v => cambiar('movimiento', v ? 'reducido' : 'auto')}
      />

      <fieldset className="pref-grupo">
        <legend className="pref-leyenda">
          <Wifi size={16} aria-hidden="true" /> Ahorro de datos
          <span className={`pref-estado ${ahorroActivo ? 'pref-estado-si' : ''}`}>
            {ahorroActivo ? 'Activo' : 'Apagado'}
          </span>
        </legend>
        <div className="segmentado" role="presentation">
          {AHORROS.map(a => (
            <label key={a.valor} className="segmentado-opcion">
              <input
                type="radio"
                name="pref-ahorro"
                value={a.valor}
                checked={preferencias.ahorro === a.valor}
                onChange={() => cambiar('ahorro', a.valor)}
                aria-describedby="pref-ahorro-det"
              />
              <span className="segmentado-caja"><span>{a.etiqueta}</span></span>
            </label>
          ))}
        </div>
        <p className="pref-detalle" id="pref-ahorro-det" aria-live="polite">{detalleAhorro}</p>
      </fieldset>

      <button type="button" className="btn btn-ghost btn-sm pref-restablecer" onClick={restablecer}>
        <RotateCcw size={14} aria-hidden="true" /> Volver a los valores de fábrica
      </button>
    </div>
  );
}
