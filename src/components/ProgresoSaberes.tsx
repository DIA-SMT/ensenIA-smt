/**
 * "Qué van logrando" en Seguimiento (080): por cada saber (los NAP de los
 * temas, o el tema si no tiene NAP), cuántos lo lograron, cuántos están en
 * proceso y quiénes todavía no, con lo que entregaron y se corrigió.
 */

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Target } from 'lucide-react';
import { getProgresoSaberes, nivelDe, NIVEL, type Nivel, type ProgresoSaberes as Datos } from '../services/saberes.service';
import { Esqueleto } from './ui/Esqueleto';
import './ProgresoSaberes.css';

const ORDEN: Nivel[] = ['logrado', 'proceso', 'todavia', 'sin'];

export default function ProgresoSaberes({ subjectId, courseId }: { subjectId: string; courseId: string }) {
  const [datos, setDatos] = useState<Datos | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let vivo = true;
    getProgresoSaberes(subjectId, courseId)
      .then(d => { if (vivo) { setDatos(d); setError(''); } })
      .catch(e => { if (vivo) { setDatos(null); setError(e instanceof Error ? e.message : 'No se pudo calcular.'); } });
    return () => { vivo = false; };
  }, [subjectId, courseId]);

  const conEvidencia = (datos?.saberes ?? []).filter(s => s.actividades > 0);
  const sinActividades = (datos?.saberes ?? []).filter(s => s.actividades === 0);
  const hayNap = (datos?.saberes ?? []).some(s => s.tipo === 'nap');

  return (
    <section id="seg-saberes" className="card seg-seccion" aria-labelledby="seg-sab-t">
      <h3 id="seg-sab-t"><Target size={17} aria-hidden="true" /> Qué van logrando</h3>
      <p className="seg-vacio">
        Por cada saber (los NAP de tus temas o, si todavía no los vinculaste, el tema), el promedio de lo
        que entregó cada uno en las actividades corregidas.
      </p>

      {error && <p className="seg-vacio" role="alert">{error}</p>}
      {!datos && !error && <Esqueleto tipo="filas" cantidad={3} etiqueta="Calculando…" />}

      {datos && conEvidencia.length === 0 && (
        <p className="seg-vacio">
          Cuando publiques actividades de los temas de tu planificación y las corrijas, acá vas a ver qué
          logró cada uno.
        </p>
      )}

      {datos && conEvidencia.length > 0 && (
        <>
          <ul className="sab-leyenda" aria-label="Qué quiere decir cada color">
            <li className="logrado">Logrado (60% o más)</li>
            <li className="proceso">En proceso (40 a 59%)</li>
            <li className="todavia">Todavía no</li>
            <li className="sin">Sin evidencia</li>
          </ul>
          <ul className="sab-lista">
            {conEvidencia.map(s => {
              const porNivel = Object.fromEntries(ORDEN.map(n => [n, datos.estudiantes.filter(e => nivelDe(e.valores[s.id]) === n)])) as Record<Nivel, Datos['estudiantes']>;
              const total = datos.estudiantes.length || 1;
              return (
                <li key={s.id}>
                  <details className="sab-item">
                    <summary>
                      <span className="sab-textos">
                        <strong>{s.titulo}</strong>
                        <small>
                          {s.tipo === 'nap' ? `NAP${s.documento ? ` · ${s.documento}` : ''}` : 'Tema'}
                          {s.tipo === 'nap' && s.temas.length ? ` · en ${s.temas.join(', ')}` : ''}
                          {` · ${s.actividades} actividad${s.actividades !== 1 ? 'es' : ''}`}
                        </small>
                      </span>
                      <span className="sab-barra" role="img"
                        aria-label={ORDEN.map(n => `${porNivel[n].length} ${NIVEL[n].toLowerCase()}`).join(', ')}>
                        {ORDEN.map(n => porNivel[n].length > 0 && (
                          <span key={n} className={n} style={{ width: `${(100 * porNivel[n].length) / total}%` }} />
                        ))}
                      </span>
                      <span className="sab-cuentas">
                        {ORDEN.filter(n => porNivel[n].length > 0).map(n => `${porNivel[n].length} ${NIVEL[n].toLowerCase()}`).join(' · ')}
                      </span>
                    </summary>
                    <ul className="sab-estudiantes">
                      {ORDEN.flatMap(n => porNivel[n].map(e => (
                        <li key={e.id} className={n} title={e.valores[s.id] ? `${e.valores[s.id].n} evidencia${e.valores[s.id].n !== 1 ? 's' : ''}` : 'Sin entregas corregidas'}>
                          {e.apellido}, {e.nombre}{e.valores[s.id] ? ` · ${e.valores[s.id].pct}%` : ''}
                        </li>
                      )))}
                    </ul>
                  </details>
                </li>
              );
            })}
          </ul>
          {sinActividades.length > 0 && (
            <p className="seg-vacio">Sin actividades todavía: {sinActividades.map(s => s.titulo).join(' · ')}.</p>
          )}
          {!hayNap && (
            <p className="seg-vacio">
              Se ve por tema. Si vinculás tus temas con los NAP (en <Link to="/libreta">Libreta</Link> → "Temario y
              criterios"), se agrupa por NAP.
            </p>
          )}
        </>
      )}
    </section>
  );
}
