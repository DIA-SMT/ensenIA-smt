/**
 * La semana de lunes a viernes con sus clases. La usan la dirección al
 * armar el horario, la Agenda del docente y el horario de la escuela.
 * En la compu es una grilla por horas; en el celular, una lista por día.
 */

import type { ReactNode } from 'react';
import type { ScheduleBlock } from '../types';
import { horaTexto } from '../services/schedule.service';
import { DIAS, colorDe } from '../lib/horario';
import './HorarioSemanal.css';

const PX_HORA = 56;

export default function HorarioSemanal({ bloques, etiqueta, onBloque, hoy, vacio }: {
  bloques: ScheduleBlock[];
  /** qué dice cada clase: en la vista de un curso, la materia y el docente; en la de un docente, la materia y el curso */
  etiqueta: (b: ScheduleBlock) => { titulo: string; detalle: string };
  onBloque?: (b: ScheduleBlock) => void;
  /** índice del día de hoy (0 = lunes), para marcarlo */
  hoy?: number;
  vacio?: ReactNode;
}) {
  if (bloques.length === 0 && vacio) return <>{vacio}</>;

  const desde = Math.min(8, ...bloques.map(b => Math.floor(b.startHour)));
  const hasta = Math.max(13, ...bloques.map(b => Math.ceil(b.startHour + b.duration)));
  const horas = Array.from({ length: hasta - desde }, (_, i) => desde + i);
  const alto = (hasta - desde) * PX_HORA;

  const Bloque = ({ b, enGrilla }: { b: ScheduleBlock; enGrilla: boolean }) => {
    const e = etiqueta(b);
    const contenido = <>
      <span className="hs-hora">{horaTexto(b.startHour)} – {horaTexto(b.startHour + b.duration)}</span>
      <strong className="hs-titulo">{e.titulo}</strong>
      <span className="hs-detalle">{e.detalle}{b.room ? ` · ${b.room}` : ''}</span>
    </>;
    const props = {
      className: `hs-bloque hs-${colorDe(b.subjectId)}`,
      style: enGrilla ? { top: (b.startHour - desde) * PX_HORA, height: Math.max(b.duration * PX_HORA - 3, 22) } : undefined,
    };
    return onBloque
      ? <button type="button" {...props} onClick={() => onBloque(b)} aria-label={`${DIAS[b.dayIndex]} ${horaTexto(b.startHour)}: ${e.titulo}, ${e.detalle}`}>{contenido}</button>
      : <div {...props}>{contenido}</div>;
  };

  return (
    <div className="hs">
      {/* Grilla (compu y tablet) */}
      <div className="hs-grilla" role="table" aria-label="Horario semanal">
        <div className="hs-horas" aria-hidden="true">
          <div className="hs-cab" />
          <div style={{ height: alto, position: 'relative' }}>
            {horas.map(h => <span key={h} className="hs-hora-lbl" style={{ top: (h - desde) * PX_HORA }}>{h}:00</span>)}
          </div>
        </div>
        {DIAS.map((d, i) => (
          <div key={d} className={`hs-dia ${hoy === i ? 'hoy' : ''}`} role="rowgroup">
            <div className="hs-cab" role="columnheader">{d}</div>
            <div className="hs-col" style={{ height: alto }}>
              {horas.map(h => <i key={h} className="hs-linea" style={{ top: (h - desde) * PX_HORA }} />)}
              {bloques.filter(b => b.dayIndex === i).map(b => <Bloque key={b.id} b={b} enGrilla />)}
            </div>
          </div>
        ))}
      </div>

      {/* Lista por día (celular) */}
      <div className="hs-lista">
        {DIAS.map((d, i) => {
          const del = bloques.filter(b => b.dayIndex === i).sort((a, b) => a.startHour - b.startHour);
          return (
            <section key={d} className={`hs-lista-dia ${hoy === i ? 'hoy' : ''}`}>
              <h4>{d}{hoy === i ? ' · hoy' : ''}</h4>
              {del.length === 0
                ? <p className="hs-sin">Sin clases</p>
                : del.map(b => <Bloque key={b.id} b={b} enGrilla={false} />)}
            </section>
          );
        })}
      </div>
    </div>
  );
}
