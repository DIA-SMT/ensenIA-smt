/**
 * La escuela en números (tablero de dirección): asistencia, notas del
 * trimestre y cómo viene la escuela semana a semana, con el detalle por curso.
 *
 * Los números vienen ya calculados en la base (resumen_escuela, 057). Un
 * curso sin listas tomadas dice "sin listas" y no "0 %": un 0 haría creer que
 * nadie fue a clase.
 */

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CalendarCheck, GraduationCap, UserX, TrendingUp } from 'lucide-react';
import { getResumenEscuela, type ResumenEscuela, type SemanaEnNumeros } from '../services/resumen-escuela.service';
import { Esqueleto } from './ui/Esqueleto';
import './EscuelaEnNumeros.css';

/** Un decimal alcanza: "3,2", no "3,203". */
const unDecimal = (v: number) => v.toLocaleString('es-AR', { maximumFractionDigits: 1 });

const CARITA = (animo: number | null) =>
  animo === null ? '—' : animo >= 4.2 ? '😄' : animo >= 3.5 ? '🙂' : animo >= 2.8 ? '😐' : animo >= 2 ? '😕' : '😣';

const fechaCorta = (iso: string) => {
  const d = new Date(iso + 'T12:00');
  return d.toLocaleDateString('es-AR', { day: 'numeric', month: 'numeric' });
};

/**
 * Una serie semanal como línea fina. Un solo color (el acento del rol): no
 * hace falta leyenda, el título dice qué es. Al pasar el dedo o el mouse se
 * ve el valor de esa semana.
 */
function Evolucion({ titulo, semanas, valor, formato, vacio, escala }: {
  titulo: string;
  semanas: SemanaEnNumeros[];
  valor: (s: SemanaEnNumeros) => number | null;
  formato: (v: number) => string;
  vacio: string;
  /**
   * Escala fija y honesta: si cada línea se estirara entre su mínimo y su
   * máximo, pasar de 88 % a 76 % de asistencia parecería un derrumbe.
   * Sin max, va de min al mayor valor (para conteos, desde 0).
   */
  escala: { min: number; max?: number };
}) {
  const [activa, setActiva] = useState<number | null>(null);
  const puntos = semanas.map(valor);
  const conDato = puntos.filter((v): v is number => v !== null);
  const ultimo = [...puntos].reverse().find((v): v is number => v !== null) ?? null;

  const W = 240;
  const H = 64;
  const PAD = 6;
  const min = Math.min(escala.min, ...conDato);
  const max = Math.max(escala.max ?? 0, ...conDato, min + 1);
  const rango = max - min || 1;
  const x = (i: number) => PAD + (i * (W - 2 * PAD)) / Math.max(semanas.length - 1, 1);
  const y = (v: number) => H - PAD - ((v - min) / rango) * (H - 2 * PAD);

  // La línea se corta donde no hay dato (una semana sin listas no es un 0)
  const tramos: string[] = [];
  let actual = '';
  puntos.forEach((v, i) => {
    if (v === null) { if (actual) tramos.push(actual); actual = ''; return; }
    actual += `${actual ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)} `;
  });
  if (actual) tramos.push(actual);

  const mostrada = activa !== null ? puntos[activa] : ultimo;
  const etiqueta = activa !== null ? `semana del ${fechaCorta(semanas[activa].semana)}` : 'esta semana';

  return (
    <figure className="een-evo">
      <figcaption className="een-evo-cabeza">
        <span className="een-evo-titulo">{titulo}</span>
        <span className="een-evo-valor">
          {mostrada !== null ? formato(mostrada) : '—'}
          <small>{mostrada !== null ? etiqueta : ''}</small>
        </span>
      </figcaption>
      {conDato.length === 0 ? (
        <p className="een-evo-vacio">{vacio}</p>
      ) : (
        <svg viewBox={`0 0 ${W} ${H}`} className="een-evo-svg" role="img"
          aria-label={`${titulo}: ${conDato.length} semanas con datos, la última ${ultimo !== null ? formato(ultimo) : 'sin dato'}`}
          onMouseLeave={() => setActiva(null)}>
          <line x1={PAD} x2={W - PAD} y1={H - PAD} y2={H - PAD} className="een-evo-base" />
          {tramos.map((d, i) => <path key={i} d={d} className="een-evo-linea" />)}
          {puntos.map((v, i) => v !== null && (
            <circle key={i} cx={x(i)} cy={y(v)} r={activa === i ? 4 : 2.5} className={`een-evo-punto ${activa === i ? 'activo' : ''}`} />
          ))}
          {/* Zonas para el puntero, más anchas que el punto */}
          {semanas.map((s, i) => (
            <rect key={s.semana} x={x(i) - (W / semanas.length) / 2} y={0} width={W / semanas.length} height={H}
              fill="transparent" onMouseEnter={() => setActiva(i)} onTouchStart={() => setActiva(i)} />
          ))}
        </svg>
      )}
    </figure>
  );
}

export default function EscuelaEnNumeros() {
  const navigate = useNavigate();
  const [datos, setDatos] = useState<ResumenEscuela | null | undefined>(undefined);
  const [fallo, setFallo] = useState(false);

  useEffect(() => {
    let vivo = true;
    getResumenEscuela(12)
      .then(d => { if (vivo) setDatos(d); })
      .catch(err => { console.error(err); if (vivo) setFallo(true); });
    return () => { vivo = false; };
  }, []);

  if (fallo) return <p className="text-sm text-danger" role="alert">No se pudieron calcular los números de la escuela. Probá de nuevo en un rato.</p>;
  if (datos === undefined) return <Esqueleto tipo="tarjetas" cantidad={3} etiqueta="Calculando los números de la escuela…" />;
  if (datos === null) return null;

  const { escuela, cursos, notas, semanas } = datos;
  const conFaltas = cursos.reduce((t, c) => t + c.conFaltasReiteradas, 0);
  const maxRango = Math.max(1, ...notas.rangos.map(r => r.n));

  return (
    <section className="een" aria-labelledby="een-titulo">
      <h2 id="een-titulo" className="een-titulo">La escuela en números</h2>

      <div className="een-cifras">
        <div className="card een-cifra">
          <span className="een-cifra-icono" aria-hidden="true"><CalendarCheck size={18} /></span>
          <span className="een-cifra-valor">{escuela.asistenciaPct !== null ? `${escuela.asistenciaPct}%` : '—'}</span>
          <span className="een-cifra-texto">
            {escuela.asistenciaPct !== null ? 'de asistencia en los últimos 30 días' : 'Todavía no hay listas tomadas este mes'}
          </span>
        </div>
        <div className="card een-cifra">
          <span className="een-cifra-icono" aria-hidden="true"><UserX size={18} /></span>
          <span className="een-cifra-valor">{escuela.registrosAsistencia ? conFaltas : '—'}</span>
          <span className="een-cifra-texto">
            {escuela.registrosAsistencia ? `estudiante${conFaltas !== 1 ? 's' : ''} con 3 faltas o más este mes` : 'Sin listas, no se pueden contar faltas'}
          </span>
        </div>
        <div className="card een-cifra">
          <span className="een-cifra-icono" aria-hidden="true"><GraduationCap size={18} /></span>
          <span className="een-cifra-valor">{notas.promedio !== null ? notas.promedio.toLocaleString('es-AR') : '—'}</span>
          <span className="een-cifra-texto">
            {notas.total
              ? `promedio ${notas.trimestre ? `del ${notas.trimestre}` : 'del trimestre'} · ${notas.total} nota${notas.total !== 1 ? 's' : ''} publicada${notas.total !== 1 ? 's' : ''}`
              : `Todavía no hay notas publicadas${notas.trimestre ? ` del ${notas.trimestre}` : ''}`}
          </span>
          {notas.total > 0 && (
            <ul className="een-rangos" aria-label="Cómo se reparten las notas">
              {notas.rangos.map(r => (
                <li key={r.rango}>
                  <span className="een-rango-nombre">{r.rango}</span>
                  <span className="een-rango-barra"><span style={{ width: `${(r.n / maxRango) * 100}%` }} /></span>
                  <span className="een-rango-n">{r.n}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Semana a semana */}
      <div className="card een-evolucion">
        <h3 className="een-sub"><TrendingUp size={16} aria-hidden="true" /> Cómo viene (últimas 12 semanas)</h3>
        <div className="een-evo-grilla">
          <Evolucion titulo="Asistencia" semanas={semanas} valor={s => s.asistenciaPct} formato={v => `${v}%`} escala={{ min: 50, max: 100 }}
            vacio="Sin listas tomadas en estas semanas." />
          <Evolucion titulo="Ánimo (1 a 5)" semanas={semanas} valor={s => (s.checkins >= 3 ? s.animo : null)}
            formato={v => `${unDecimal(v)} ${CARITA(v)}`} escala={{ min: 1, max: 5 }} vacio="Menos de 3 check-ins por semana: pocos para sacar un promedio." />
          <Evolucion titulo="Entregas" semanas={semanas} valor={s => s.entregas} formato={v => `${v}`} escala={{ min: 0 }}
            vacio="Sin entregas en estas semanas." />
          <Evolucion titulo="Actividades publicadas" semanas={semanas} valor={s => s.actividades} formato={v => `${v}`} escala={{ min: 0 }}
            vacio="Sin actividades en estas semanas." />
        </div>
        <details className="een-tabla-semanas">
          <summary>Ver como tabla</summary>
          <table>
            <thead><tr><th scope="col">Semana del</th><th scope="col">Asistencia</th><th scope="col">Ánimo</th><th scope="col">Entregas</th><th scope="col">Actividades</th></tr></thead>
            <tbody>
              {semanas.map(s => (
                <tr key={s.semana}>
                  <td>{fechaCorta(s.semana)}</td>
                  <td>{s.asistenciaPct !== null ? `${s.asistenciaPct}%` : '—'}</td>
                  <td>{s.checkins >= 3 && s.animo !== null ? unDecimal(s.animo) : '—'}</td>
                  <td>{s.entregas}</td>
                  <td>{s.actividades}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      </div>

      {/* Por curso */}
      <div className="card een-cursos">
        <h3 className="een-sub">Por curso</h3>
        <div className="een-tabla-scroll">
          <table className="een-tabla">
            <thead>
              <tr>
                <th scope="col">Curso</th>
                <th scope="col">Estudiantes</th>
                <th scope="col">Asistencia</th>
                <th scope="col">Con 3+ faltas</th>
                <th scope="col">Promedio</th>
                <th scope="col">Desaprobadas</th>
                <th scope="col">Ánimo</th>
              </tr>
            </thead>
            <tbody>
              {cursos.map(c => (
                <tr key={c.courseId} onClick={() => navigate(`/cursos/${c.courseId}`)} className="een-fila">
                  <th scope="row">
                    <button type="button" className="een-curso-link" onClick={e => { e.stopPropagation(); navigate(`/cursos/${c.courseId}`); }}>
                      {c.nombre}
                    </button>
                  </th>
                  <td>{c.estudiantes}</td>
                  <td>{c.asistenciaPct !== null ? <span className={c.asistenciaPct < 75 ? 'een-bajo' : ''}>{c.asistenciaPct}%</span> : <span className="een-gris">sin listas</span>}</td>
                  <td>{c.registrosAsistencia ? <span className={c.conFaltasReiteradas ? 'een-bajo' : ''}>{c.conFaltasReiteradas}</span> : '—'}</td>
                  <td>{c.promedio !== null ? <span className={c.promedio < 6 ? 'een-bajo' : ''}>{c.promedio.toLocaleString('es-AR')}</span> : '—'}</td>
                  <td>{c.notas ? <span className={c.desaprobadas / c.notas > 0.2 ? 'een-bajo' : ''}>{c.desaprobadas} de {c.notas}</span> : '—'}</td>
                  <td>{c.checkins >= 3 && c.animo !== null ? <span title={`${c.animo} sobre 5 · ${c.checkins} check-ins`}>{CARITA(c.animo)} {unDecimal(c.animo)}</span> : <span className="een-gris">pocos datos</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="een-nota">Asistencia y ánimo: últimos 30 días. Notas: las publicadas del trimestre en curso. Tocá un curso para ver su ficha.</p>
      </div>
    </section>
  );
}
