/**
 * "Instalá EstudIA en tu teléfono": tarjeta en Hoy (solo celular, se puede
 * cerrar) y sección en Ajustes (siempre). En Android instala con un toque;
 * en iPhone y otros navegadores muestra los pasos. Ver lib/instalarApp.ts.
 */

import { useState } from 'react';
import { Check, Download, EllipsisVertical, Share, SquarePlus, Smartphone, X } from 'lucide-react';
import Dialogo from './shell/Dialogo';
import { avisar } from './ui/avisar';
import { instalar, ocultarTarjeta, tarjetaOculta, useInstalacion, type EstadoInstalacion } from '../lib/instalarApp';
import './InstalarApp.css';

export default function InstalarApp({ variante }: { variante: 'tarjeta' | 'ajustes' }) {
  const estado = useInstalacion();
  const [pasos, setPasos] = useState(false);
  const [oculta, setOculta] = useState(tarjetaOculta);

  const tocar = async () => {
    if (estado === 'lista') {
      if (await instalar()) avisar.exito('¡Listo! EstudIA quedó instalada', 'La encontrás con su ícono, como cualquier app.');
      return;
    }
    setPasos(true);
  };

  if (variante === 'tarjeta') {
    // En Hoy, solo en el celular, si falta instalarla y no la cerraron
    if (estado === 'instalada' || estado === 'no' || oculta || !matchMedia('(pointer: coarse)').matches) return null;
    return (
      <>
        <section className="card instalar-tarjeta" aria-labelledby="instalar-tarjeta-titulo">
          <span className="instalar-icono" aria-hidden="true"><Smartphone size={20} /></span>
          <div className="instalar-texto">
            <h3 id="instalar-tarjeta-titulo">Instalá EstudIA en tu teléfono</h3>
            <p>Se abre como una app, con su ícono, y anda mejor sin señal.</p>
          </div>
          <button type="button" className="btn btn-primary btn-sm" onClick={tocar}>
            <Download size={15} aria-hidden="true" /> {estado === 'lista' ? 'Instalar' : 'Cómo instalarla'}
          </button>
          <button type="button" className="btn-icon instalar-cerrar" aria-label="Ahora no"
            title="Ahora no" onClick={() => { ocultarTarjeta(); setOculta(true); }}>
            <X size={16} aria-hidden="true" />
          </button>
        </section>
        <Pasos abierto={pasos} alCerrar={() => setPasos(false)} estado={estado} />
      </>
    );
  }

  // Ajustes: siempre, con el estado de este dispositivo
  return (
    <section className="card settings-section" aria-labelledby="ajustes-instalar">
      <h2 className="settings-section-title" id="ajustes-instalar">
        <Smartphone size={18} aria-hidden="true" /> Instalar la app
      </h2>
      {estado === 'instalada' ? (
        <p className="instalar-lista"><Check size={16} aria-hidden="true" /> Ya la tenés instalada en este dispositivo.</p>
      ) : estado === 'no' ? (
        <p className="settings-session-hint">
          En la computadora se usa desde el navegador. Para instalarla, abrí estudia.smt.gob.ar en tu teléfono.
        </p>
      ) : (
        <>
          <p className="settings-session-hint">
            Queda con su ícono en la pantalla de inicio, se abre como una app y anda mejor sin señal.
          </p>
          <button type="button" className="btn btn-primary instalar-boton" onClick={tocar}>
            <Download size={16} aria-hidden="true" /> {estado === 'lista' ? 'Instalar EstudIA' : 'Cómo instalarla'}
          </button>
        </>
      )}
      <Pasos abierto={pasos} alCerrar={() => setPasos(false)} estado={estado} />
    </section>
  );
}

/** Los pasos para quien no puede instalar con un toque (iPhone y otros navegadores) */
function Pasos({ abierto, alCerrar, estado }: { abierto: boolean; alCerrar: () => void; estado: EstadoInstalacion }) {
  const ios = estado === 'ios';
  return (
    <Dialogo abierto={abierto} alCerrar={alCerrar} etiquetadoPor="instalar-pasos-titulo" className="dialogo-hoja">
      <div className="hoja-agarre" aria-hidden="true" />
      <div className="instalar-pasos">
        <h2 id="instalar-pasos-titulo">{ios ? 'Instalar en iPhone' : 'Instalar en tu teléfono'}</h2>
        {ios ? (
          <ol>
            <li>
              <span className="instalar-paso-icono" aria-hidden="true"><Share size={18} /></span>
              <span>Tocá <strong>Compartir</strong>: el cuadrado con la flecha hacia arriba. En Safari está abajo; en Chrome, arriba a la derecha.</span>
            </li>
            <li>
              <span className="instalar-paso-icono" aria-hidden="true"><SquarePlus size={18} /></span>
              <span>Bajá y elegí <strong>"Agregar a pantalla de inicio"</strong>.</span>
            </li>
            <li>
              <span className="instalar-paso-icono" aria-hidden="true"><Check size={18} /></span>
              <span>Tocá <strong>"Agregar"</strong>. EstudIA aparece con su ícono, como cualquier app.</span>
            </li>
          </ol>
        ) : (
          <ol>
            <li>
              <span className="instalar-paso-icono" aria-hidden="true"><EllipsisVertical size={18} /></span>
              <span>Abrí el <strong>menú del navegador</strong>: los tres puntitos, arriba a la derecha.</span>
            </li>
            <li>
              <span className="instalar-paso-icono" aria-hidden="true"><SquarePlus size={18} /></span>
              <span>Elegí <strong>"Instalar app"</strong> o <strong>"Agregar a la pantalla principal"</strong>.</span>
            </li>
            <li>
              <span className="instalar-paso-icono" aria-hidden="true"><Check size={18} /></span>
              <span>Confirmá. EstudIA aparece con su ícono, como cualquier app.</span>
            </li>
          </ol>
        )}
        <p className="instalar-nota">Después abrila desde ese ícono: entrás con tu usuario de siempre.</p>
        <button type="button" className="btn btn-primary" onClick={alCerrar} data-inicial>Entendido</button>
      </div>
    </Dialogo>
  );
}
