/**
 * Ordenar: los pasos de un proceso o los hechos en el tiempo. Se mueven con
 * las flechas (anda en cualquier celular y con lector de pantalla). Cuenta
 * lo que quedó en su lugar al primer "Comprobar"; después se puede arreglar
 * hasta que quede bien.
 */

import { useMemo, useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { barajar, desordenar, type Secuencia } from '../../lib/juegosRepaso';
import type { FinPartida } from './tipos';

export default function JuegoOrdenar({ secuencias, alTerminar }: { secuencias: Secuencia[]; alTerminar: (fin: FinPartida) => void }) {
  const secuencia = useMemo(() => barajar(secuencias)[0], [secuencias]);
  const [orden, setOrden] = useState<string[]>(() => desordenar(secuencia.pasos));
  const [primerPuntaje, setPrimerPuntaje] = useState<number | null>(null);
  const [comprobado, setComprobado] = useState(false);
  const [aviso, setAviso] = useState('');

  const mover = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= orden.length) return;
    const nuevo = [...orden];
    [nuevo[i], nuevo[j]] = [nuevo[j], nuevo[i]];
    setOrden(nuevo);
    setComprobado(false);
    setAviso(`«${nuevo[j]}» pasó al lugar ${j + 1}.`);
  };

  const comprobar = () => {
    const bien = orden.filter((p, i) => p === secuencia.pasos[i]).length;
    const puntaje = primerPuntaje ?? bien;
    if (primerPuntaje === null) setPrimerPuntaje(bien);
    setComprobado(true);
    if (bien === orden.length) {
      alTerminar({
        score: puntaje,
        total: orden.length,
        repaso: puntaje < orden.length ? [{ pregunta: secuencia.titulo, respuesta: secuencia.pasos.map((p, i) => `${i + 1}. ${p}`).join(' · ') }] : [],
      });
    } else {
      setAviso(`${bien} de ${orden.length} en su lugar. Arreglá los que están en rojo y comprobá de nuevo.`);
    }
  };

  return (
    <div className="jr-cuerpo">
      <p className="jr-ayuda"><strong>{secuencia.titulo}</strong> Ordenalos con las flechas.</p>
      <ol className="jr-pasos">
        {orden.map((p, i) => {
          const estado = comprobado ? (p === secuencia.pasos[i] ? 'bien' : 'mal') : '';
          return (
            <li key={p} className={`jr-paso ${estado}`}>
              <span className="jr-paso-num" aria-hidden="true">{i + 1}</span>
              <span className="jr-paso-texto">{p}</span>
              <span className="jr-paso-mover">
                <button type="button" className="btn-icon" onClick={() => mover(i, -1)} disabled={i === 0} aria-label={`Subir «${p}»`}><ChevronUp size={16} /></button>
                <button type="button" className="btn-icon" onClick={() => mover(i, 1)} disabled={i === orden.length - 1} aria-label={`Bajar «${p}»`}><ChevronDown size={16} /></button>
              </span>
            </li>
          );
        })}
      </ol>
      <p className="jr-aviso" role="status" aria-live="polite">{aviso}</p>
      <button type="button" className="btn btn-primary" onClick={comprobar}>Comprobar</button>
    </div>
  );
}
