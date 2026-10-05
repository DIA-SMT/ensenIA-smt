/**
 * Superadmin: cuánto se usa la IA en todo el sistema y cuánto cuesta.
 *
 * Usos y tokens tienen historia (ia_usage, la tabla del tope diario). El
 * costo en dólares y el detalle por función llegan desde que se
 * despliegan las funciones que anotan cada llamada (ia_events, 040): hasta
 * entonces la pantalla lo dice en vez de mostrar ceros que parecen datos.
 *
 * Por persona solo aparece el personal; estudiantes y familias, sumados.
 */

import { useEffect, useState } from 'react';
import { Activity, AlertCircle, Info } from 'lucide-react';
import { getConsumoIA, type ConsumoIA as Datos } from '../../services/consumo-ia.service';
import './Admin.css';
import './ConsumoIA.css';

const PERIODOS = [7, 30, 90] as const;

const ROL: Record<string, string> = {
  docente: 'Docentes', director: 'Dirección', estudiante: 'Estudiantes',
  padre: 'Familias', superadmin: 'Superadmin',
};
const FUNCION: Record<string, string> = {
  chat: 'Laboratorio IA (chat)', migue: 'Migue', migue_riesgo: 'Migue · detección de riesgo',
  documentos: 'Documentos (lectura, resúmenes, placas)', podcast: 'Podcast',
};

const num = (n: number) => n.toLocaleString('es-AR');
const usd = (n: number | null | undefined) =>
  n == null ? '—' : `US$ ${n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: n < 1 ? 4 : 2 })}`;
const fechaCorta = (iso: string) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' });
const modeloCorto = (m: string | null) => (m ?? '—').replace(/^[a-z-]+\//, '');

export default function ConsumoIA() {
  const [dias, setDias] = useState<number>(30);
  const [datos, setDatos] = useState<Datos | null>(null);
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    let cancelado = false;
    getConsumoIA(dias)
      .then(d => { if (!cancelado) setDatos(d); })
      .catch(err => { if (!cancelado) setError(err instanceof Error ? err.message : 'No se pudo cargar el consumo.'); })
      .finally(() => { if (!cancelado) setCargando(false); });
    return () => { cancelado = true; };
  }, [dias]);

  const cambiarPeriodo = (p: number) => {
    if (p === dias) return;
    setCargando(true);
    setError('');
    setDias(p);
  };

  const t = datos?.totales;
  const hayCosto = Boolean(t?.costo_desde);
  const maxUsos = Math.max(1, ...(datos?.por_dia.map(d => d.usos) ?? [0]));

  return (
    <div className="adm-container animate-in">
      <header className="adm-head">
        <div>
          <h2><Activity size={20} aria-hidden="true" /> Consumo de IA</h2>
          <p>Todas las escuelas{datos ? ` · del ${fechaCorta(datos.desde)} al ${fechaCorta(datos.hasta)}` : ''}</p>
        </div>
        <div className="cia-periodo" role="group" aria-label="Período">
          {PERIODOS.map(p => (
            <button key={p} type="button" className={`btn btn-sm ${dias === p ? 'btn-primary' : 'btn-ghost'}`}
              aria-pressed={dias === p} onClick={() => cambiarPeriodo(p)} disabled={cargando && dias !== p}>
              {p} días
            </button>
          ))}
        </div>
      </header>

      {error && <div className="adm-error" role="alert"><AlertCircle size={15} aria-hidden="true" /> {error}</div>}
      {cargando && !datos && <p className="text-secondary adm-cargando">Cargando…</p>}

      {datos && t && (
        <>
          <section className="cia-tiles" aria-label="Resumen">
            <div className="card cia-tile">
              <span className="cia-tile-label">Usos</span>
              <strong className="cia-tile-valor">{num(t.usos)}</strong>
              <span className="cia-tile-sub">{num(t.personas)} persona{t.personas !== 1 ? 's' : ''}</span>
            </div>
            <div className="card cia-tile">
              <span className="cia-tile-label">Hoy</span>
              <strong className="cia-tile-valor">{num(t.usos_hoy)}</strong>
              <span className="cia-tile-sub">{num(t.personas_hoy)} persona{t.personas_hoy !== 1 ? 's' : ''}</span>
            </div>
            <div className="card cia-tile">
              <span className="cia-tile-label">Tokens</span>
              <strong className="cia-tile-valor">{num(t.tokens)}</strong>
              <span className="cia-tile-sub">entrada + salida</span>
            </div>
            <div className="card cia-tile">
              <span className="cia-tile-label">Costo</span>
              <strong className="cia-tile-valor">{hayCosto ? usd(t.costo_usd ?? 0) : '—'}</strong>
              <span className="cia-tile-sub">{hayCosto ? `hoy ${usd(t.costo_hoy_usd ?? 0)}` : 'todavía sin registro'}</span>
            </div>
          </section>

          {!hayCosto && (
            <div className="adm-aviso" role="status">
              <Info size={15} aria-hidden="true" />
              <span>
                El costo en dólares y el detalle por función se registran desde que se despliegan las
                funciones de IA actualizadas. Hasta entonces se ven los usos y los tokens.
              </span>
            </div>
          )}
          {hayCosto && t.costo_desde && datos.desde < t.costo_desde.slice(0, 10) && (
            <p className="cia-nota">El costo se registra desde el {fechaCorta(t.costo_desde.slice(0, 10))}: los días anteriores muestran usos pero no costo.</p>
          )}

          <section className="card cia-bloque">
            <h3>Usos por día</h3>
            <div className="cia-barras" role="img"
              aria-label={`Usos por día: máximo ${num(maxUsos)} en un día. La tabla de abajo tiene el detalle.`}>
              {datos.por_dia.map(d => (
                <div key={d.dia} className="cia-barra-col" tabIndex={0}
                  aria-label={`${fechaCorta(d.dia)}: ${num(d.usos)} usos`}>
                  <div className="cia-barra" style={{ height: `${(d.usos / maxUsos) * 100}%` }} />
                  <span className="cia-tooltip" role="tooltip">
                    <strong>{fechaCorta(d.dia)}</strong>
                    {num(d.usos)} usos · {num(d.tokens)} tokens
                    {d.costo_usd != null && <> · {usd(d.costo_usd)}</>}
                  </span>
                </div>
              ))}
            </div>
            <div className="cia-eje" aria-hidden="true">
              <span>{fechaCorta(datos.desde)}</span>
              <span>{fechaCorta(datos.hasta)}</span>
            </div>
            <details className="cia-detalle">
              <summary>Ver la tabla por día</summary>
              <div className="cia-tabla-wrap">
                <table className="cia-tabla">
                  <thead><tr><th>Día</th><th>Usos</th><th>Tokens</th><th>Costo</th></tr></thead>
                  <tbody>
                    {[...datos.por_dia].reverse().map(d => (
                      <tr key={d.dia}><td>{fechaCorta(d.dia)}</td><td>{num(d.usos)}</td><td>{num(d.tokens)}</td><td>{usd(d.costo_usd)}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          </section>

          <div className="cia-grilla">
            <Tabla titulo="Por escuela" columna="Escuela" filas={datos.por_escuela.map(f => [f.escuela, f])} />
            <Tabla titulo="Por rol" columna="Rol" filas={datos.por_rol.map(f => [ROL[f.rol] ?? f.rol, f])} />
          </div>

          {hayCosto && (
            <section className="card cia-bloque">
              <h3>Por función y modelo</h3>
              <div className="cia-tabla-wrap">
                <table className="cia-tabla">
                  <thead><tr><th>Función</th><th>Modelo</th><th>Llamadas</th><th>Tokens</th><th>Costo</th></tr></thead>
                  <tbody>
                    {datos.por_funcion.map(f => (
                      <tr key={`${f.funcion}-${f.modelo}`}>
                        <td>{FUNCION[f.funcion] ?? f.funcion}</td>
                        <td className="cia-mono">{modeloCorto(f.modelo)}</td>
                        <td>{num(f.llamadas)}</td>
                        <td>{f.caracteres_voz ? `${num(f.caracteres_voz)} caracteres de voz` : num(f.tokens)}</td>
                        <td>{f.caracteres_voz && f.costo_usd == null ? 'según plan de voz' : usd(f.costo_usd)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          <section className="card cia-bloque">
            <h3>Personal que más la usa</h3>
            <p className="cia-nota">Docentes y dirección. Estudiantes y familias se ven solo sumados, por rol y por escuela.</p>
            {datos.personas.length === 0 ? (
              <p className="text-secondary text-sm">Nadie del personal usó la IA en este período.</p>
            ) : (
              <div className="cia-tabla-wrap">
                <table className="cia-tabla">
                  <thead><tr><th>Persona</th><th>Escuela</th><th>Usos</th><th>Hoy</th><th>Tokens</th>{hayCosto && <th>Costo</th>}</tr></thead>
                  <tbody>
                    {datos.personas.map(p => (
                      <tr key={p.email}>
                        <td><span className="cia-persona">{p.nombre || p.email}</span><span className="cia-sub">{ROL[p.rol] ?? p.rol} · {p.email}</span></td>
                        <td>{p.escuela}</td>
                        <td>{num(p.usos)}</td>
                        <td>{num(p.usos_hoy)}</td>
                        <td>{num(p.tokens)}</td>
                        {hayCosto && <td>{usd(p.costo_usd)}</td>}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}

function Tabla({ titulo, columna, filas }: {
  titulo: string;
  columna: string;
  filas: [string, { usos: number; tokens: number; personas: number; costo_usd: number | null }][];
}) {
  return (
    <section className="card cia-bloque">
      <h3>{titulo}</h3>
      {filas.length === 0 ? (
        <p className="text-secondary text-sm">Sin uso en este período.</p>
      ) : (
        <div className="cia-tabla-wrap">
          <table className="cia-tabla">
            <thead><tr><th>{columna}</th><th>Usos</th><th>Personas</th><th>Costo</th></tr></thead>
            <tbody>
              {filas.map(([nombre, f]) => (
                <tr key={nombre}><td>{nombre}</td><td>{num(f.usos)}</td><td>{num(f.personas)}</td><td>{usd(f.costo_usd)}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
