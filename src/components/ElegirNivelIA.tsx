/**
 * "Ayuda de la IA" al armar una actividad (078): tres opciones y, debajo, qué
 * hace Migue con cada una.
 */

import { Bot } from 'lucide-react';
import { NIVELES_IA, NIVEL_IA, type NivelIA } from '../lib/nivelIA';
import './ElegirNivelIA.css';

export default function ElegirNivelIA({ valor, alCambiar, id = 'nivel-ia' }: {
  valor: NivelIA;
  alCambiar: (n: NivelIA) => void;
  id?: string;
}) {
  return (
    <div className="nivel-ia">
      <span className="nivel-ia-titulo" id={`${id}-titulo`}>
        <Bot size={15} aria-hidden="true" /> Ayuda de la IA
      </span>
      <div className="nivel-ia-opciones" role="radiogroup" aria-labelledby={`${id}-titulo`}>
        {NIVELES_IA.map(n => (
          <button key={n} type="button" role="radio" aria-checked={valor === n}
            className={`nivel-ia-opcion${valor === n ? ' activa' : ''}`} onClick={() => alCambiar(n)}>
            {NIVEL_IA[n].etiqueta}
          </button>
        ))}
      </div>
      <p className="nivel-ia-detalle" aria-live="polite">{NIVEL_IA[valor].docente}</p>
    </div>
  );
}
