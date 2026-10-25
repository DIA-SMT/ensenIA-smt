/**
 * "Repasá con Migue" en Estudiar (079): los repasos que abrieron sus docentes.
 * Si no hay ninguno, no se muestra nada.
 */

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { MessagesSquare, ArrowRight } from 'lucide-react';
import { getTutoresAbiertos, type TutorAbierto } from '../services/tutor.service';
import './RepasoConMigue.css';

export default function RepasosAbiertos() {
  const [repasos, setRepasos] = useState<TutorAbierto[]>([]);

  useEffect(() => {
    let vivo = true;
    getTutoresAbiertos().then(r => { if (vivo) setRepasos(r); }).catch(() => { /* sin señal: no se muestra */ });
    return () => { vivo = false; };
  }, []);

  if (repasos.length === 0) return null;

  return (
    <section aria-labelledby="repasos-titulo">
      <h3 className="sp-section-title" id="repasos-titulo"><MessagesSquare size={17} /> Repasá con Migue</h3>
      <ul className="repasos-lista">
        {repasos.map(r => (
          <li key={r.classId}>
            <Link to={`/migue?tema=${r.classId}`} className="card repaso-item">
              <span className="repaso-textos">
                <strong>{r.titulo}</strong>
                <small>{r.materia}{r.unidad ? ` · ${r.unidad}` : ''}</small>
                {r.consigna && <small className="repaso-consigna">{r.consigna}</small>}
              </span>
              <span className="repaso-ir">{r.yaEmpezo ? 'Seguir' : 'Repasar'} <ArrowRight size={15} aria-hidden="true" /></span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
