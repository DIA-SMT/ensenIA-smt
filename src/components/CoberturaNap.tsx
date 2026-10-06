/**
 * Cobertura de NAP del año (050): de los NAP cargados para esta materia y
 * este año, cuáles ya están vinculados a algún tema de la planificación
 * del docente en este curso. Si no hay NAP cargados, no se muestra.
 */

import { CheckCircle2, Circle, Compass, ChevronDown } from 'lucide-react';
import type { NapFragmento, VinculoNap } from '../services/nap.service';
import TextoRecortable from './TextoRecortable';
import './CoberturaNap.css';

interface Props {
  napDelAnio: NapFragmento[] | null;
  vinculos: VinculoNap[];
  /** Título de cada tema, por id: para decir dónde se trabaja cada NAP. */
  temas: Record<string, string>;
  area: string | null;
  anio: number | null;
}

export default function CoberturaNap({ napDelAnio, vinculos, temas, area, anio }: Props) {
  if (!napDelAnio || napDelAnio.length === 0) return null;

  const temasPorNap = new Map<string, string[]>();
  for (const v of vinculos) {
    const titulo = temas[v.classId];
    if (!titulo) continue;
    temasPorNap.set(v.fragmentoId, [...(temasPorNap.get(v.fragmentoId) ?? []), titulo]);
  }
  const trabajados = napDelAnio.filter(n => temasPorNap.has(n.fragmentoId)).length;
  const total = napDelAnio.length;
  const pct = Math.round((trabajados / total) * 100);

  // Agrupados por documento, en el orden en que llegan
  const grupos: { clave: string; nombre: string; items: NapFragmento[] }[] = [];
  for (const n of napDelAnio) {
    let g = grupos.find(x => x.clave === n.referenciaId);
    if (!g) {
      g = { clave: n.referenciaId, nombre: n.numero ? `${n.numero} · ${n.titulo}` : n.titulo, items: [] };
      grupos.push(g);
    }
    g.items.push(n);
  }

  return (
    <details className="nap-cob">
      <summary className="nap-cob-resumen">
        <span className="nap-cob-titulo">
          <Compass size={15} aria-hidden="true" /> Cobertura de NAP del año
          {(area || anio) && (
            <span className="nap-cob-sub">{[area, anio ? `${anio}° año` : null].filter(Boolean).join(' · ')}</span>
          )}
        </span>
        <span className="nap-cob-cuenta">
          <strong>{trabajados} de {total}</strong> NAP trabajados
          <ChevronDown size={15} className="nap-cob-flecha" aria-hidden="true" />
        </span>
        <span
          className="nap-cob-barra"
          role="progressbar"
          aria-label="NAP trabajados"
          aria-valuemin={0}
          aria-valuemax={total}
          aria-valuenow={trabajados}
        >
          <span style={{ width: `${pct}%` }} />
        </span>
      </summary>

      <div className="nap-cob-cuerpo">
        <p className="nap-cob-ayuda">
          Un NAP cuenta como trabajado cuando lo marcás en al menos un tema de tus unidades
          (abrí una unidad y usá “NAP que trabaja este tema”).
        </p>
        {grupos.map(g => (
          <section key={g.clave} className="nap-cob-grupo">
            <h4 className="nap-cob-doc">{g.nombre}</h4>
            <ul className="nap-cob-lista">
              {g.items.map(n => {
                const enTemas = temasPorNap.get(n.fragmentoId);
                return (
                  <li key={n.fragmentoId} className={enTemas ? 'trabajado' : ''}>
                    {enTemas
                      ? <CheckCircle2 size={16} className="nap-cob-icono ok" aria-label="Trabajado" />
                      : <Circle size={16} className="nap-cob-icono" aria-label="Sin trabajar" />}
                    <div className="nap-cob-item">
                      {n.seccion && <span className="nap-cob-seccion">{n.seccion}</span>}
                      <TextoRecortable texto={n.texto} largo={160} compacto />
                      {enTemas && <span className="nap-cob-temas">En: {enTemas.join(' · ')}</span>}
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
    </details>
  );
}
