/**
 * Texto largo que arranca recortado a unas líneas, con "Ver más".
 * Para fragmentos de normativa y NAP: se muestran tal cual se cargaron.
 */

import { useState } from 'react';
import './TextoRecortable.css';

interface Props {
  texto: string;
  /** A partir de cuántos caracteres se recorta. */
  largo?: number;
  /** Más chico, para adentro de una lista. */
  compacto?: boolean;
}

export default function TextoRecortable({ texto, largo = 320, compacto }: Props) {
  const [abierto, setAbierto] = useState(false);
  const recortable = texto.length > largo;
  return (
    <div className={`txt-recorte${compacto ? ' compacto' : ''}`}>
      <p className={`txt-recorte-texto ${recortable && !abierto ? 'recortado' : ''}`}>{texto}</p>
      {recortable && (
        <button type="button" className="txt-recorte-boton" onClick={() => setAbierto(!abierto)} aria-expanded={abierto}>
          {abierto ? 'Ver menos' : 'Ver más'}
        </button>
      )}
    </div>
  );
}
