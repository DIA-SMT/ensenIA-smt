/**
 * Superadmin (Dirección de IA): si se usa la herramienta. Quién entra, qué
 * hace cada docente y qué herramientas se usan, por escuela y por persona.
 * "Consumo de IA" mira la IA; esta pantalla, todo lo demás.
 *
 * Los datos los calcula la base (uso_plataforma, 065). Los ingresos por
 * día existen desde la mudanza al servidor propio: antes de esa fecha la
 * pantalla lo aclara en vez de mostrar ceros que parecen datos.
 *
 * Por persona solo aparece el personal; los estudiantes, contados.
 */

import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, ArrowDown, ArrowUp, BarChart3, Download, Info, Users } from 'lucide-react';
import {
  getUsoPlataforma, type Herramienta, type UsoPlataforma as Datos,
} from '../../services/uso-plataforma.service';
import { Esqueleto } from '../../components/ui/Esqueleto';
import EstadoVacio from '../../components/ui/EstadoVacio';
import './Admin.css';
import './ConsumoIA.css';
import './UsoPlataforma.css';

const PERIODOS = [7, 30, 90] as const;

// En el orden en que trabaja un docente; el nombre largo va en la lista de
// herramientas y el corto en las columnas de las tablas
const HERRAMIENTAS: { clave: Herramienta; nombre: string; corto: string }[] = [
  { clave: 'planificacion',   nombre: 'Unidades de planificación',     corto: 'Planif.' },
  { clave: 'clases_enviadas', nombre: 'Clases armadas y enviadas',     corto: 'Clases' },
  { clave: 'actividades',     nombre: 'Actividades publicadas',        corto: 'Activ.' },
  { clave: 'correcciones',    nombre: 'Entregas corregidas',           corto: 'Correc.' },
  { clave: 'clases_en_vivo',  nombre: 'Clases en vivo',                corto: 'En vivo' },
  { clave: 'asistencia',      nombre: 'Listas tomadas',                corto: 'Listas' },
  { clave: 'evaluaciones',    nombre: 'Evaluaciones en la libreta',    corto: 'Evaluac.' },
  { clave: 'materiales',      nombre: 'Materiales subidos',            corto: 'Mater.' },
  { clave: 'migue',           nombre: 'Preguntas a Migue',             corto: 'Migue' },
  { clave: 'ia',              nombre: 'Usos de la IA para crear',      corto: 'IA' },
];

const num = (n: number) => n.toLocaleString('es-AR');
const usd = (n: number | null | undefined) =>
  n == null ? '—' : `US$ ${n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: n < 1 ? 3 : 2 })}`;
const fechaCorta = (iso: string) =>
  new Date(`${iso.slice(0, 10)}T12:00:00`).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' });

/** "hoy", "ayer", "hace 5 días" o la fecha */
function haceCuanto(iso: string): string {
  const dias = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (dias <= 0) return 'hoy';
  if (dias === 1) return 'ayer';
  if (dias < 30) return `hace ${dias} días`;
  return new Date(iso).toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric' });
}

// Para abrir en Excel: punto y coma y BOM, igual que la planilla de estudiantes
function descargarCsv(nombre: string, filas: (string | number)[][]) {
  const esc = (v: string | number) => {
    const s = String(v);
    return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const contenido = '﻿' + filas.map(f => f.map(esc).join(';')).join('\r\n') + '\r\n';
  const url = URL.createObjectURL(new Blob([contenido], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url; a.download = nombre; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

type Persona = Datos['por_persona'][number];
type Filtro = 'todos' | 'nunca' | 'sin_uso';
type Orden = { clave: 'nombre' | 'ultimo_ingreso' | 'dias_activo' | 'total' | Herramienta; desc: boolean };

export default function UsoPlataforma() {
  const [dias, setDias] = useState<number>(30);
  const [datos, setDatos] = useState<Datos | null>(null);
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(true);
  const [filtro, setFiltro] = useState<Filtro>('todos');
  const [orden, setOrden] = useState<Orden>({ clave: 'total', desc: true });

  useEffect(() => {
    let cancelado = false;
    getUsoPlataforma(dias)
      .then(d => { if (!cancelado) setDatos(d); })
      .catch(err => { if (!cancelado) setError(err instanceof Error ? err.message : 'No se pudo cargar el uso de la plataforma.'); })
      .finally(() => { if (!cancelado) setCargando(false); });
    return () => { cancelado = true; };
  }, [dias]);

  const cambiarPeriodo = (p: number) => {
    if (p === dias) return;
    setCargando(true);
    setError('');
    setDias(p);
  };

  const personas = useMemo(() => {
    if (!datos) return [];
    // Sin uso en el período: nunca entró, o su último ingreso es anterior al período
    const sinUso = (p: Persona) => !p.ultimo_ingreso || (p.ultimo_ingreso.slice(0, 10) < datos.desde && p.dias_activo === 0);
    const valor = (p: Persona): number | string => {
      if (orden.clave === 'nombre') return p.nombre.toLocaleLowerCase('es');
      if (orden.clave === 'ultimo_ingreso') return p.ultimo_ingreso ?? '';
      if (orden.clave === 'dias_activo') return p.dias_activo;
      if (orden.clave === 'total') return p.total;
      if (orden.clave === 'ia') return p.usos_ia;
      return p.herramientas[orden.clave] ?? 0;
    };
    return datos.por_persona
      .filter(p => filtro === 'todos' || (filtro === 'nunca' ? !p.ultimo_ingreso : sinUso(p)))
      .sort((a, b) => {
        const va = valor(a), vb = valor(b);
        const c = va < vb ? -1 : va > vb ? 1 : 0;
        return orden.desc ? -c : c;
      });
  }, [datos, filtro, orden]);

  const t = datos?.totales;
  const maxDia = Math.max(1, ...(datos?.por_dia.map(d => d.personal) ?? [0]));
  const ingresosDesde = datos?.ingresos_desde ?? null;
  const faltanIngresos = datos != null && ingresosDesde != null && datos.desde < ingresosDesde;

  const descargarPersonas = () => {
    if (!datos) return;
    descargarCsv(`uso-por-docente-${datos.desde}-a-${datos.hasta}.csv`, [
      ['Persona', 'Rol', 'Escuelas', 'Último ingreso', 'Días con la app abierta', ...HERRAMIENTAS.map(h => h.nombre)],
      ...datos.por_persona.map(p => [
        p.nombre, p.rol === 'director' ? 'Dirección' : 'Docente', p.escuelas ?? '',
        p.ultimo_ingreso ? p.ultimo_ingreso.slice(0, 10) : 'Nunca entró', p.dias_activo,
        ...HERRAMIENTAS.map(h => (h.clave === 'ia' ? p.usos_ia : p.herramientas[h.clave] ?? 0)),
      ]),
    ]);
  };
  const descargarEscuelas = () => {
    if (!datos) return;
    descargarCsv(`uso-por-escuela-${datos.desde}-a-${datos.hasta}.csv`, [
      ['Escuela', 'Personal', 'Personal que entró', 'Nunca entraron', 'Estudiantes', 'Estudiantes que entraron',
        'Entregas', ...HERRAMIENTAS.map(h => h.nombre), 'Costo de IA (US$)'],
      ...datos.por_escuela.map(e => [
        e.escuela, e.personal_total, e.personal_activo, e.personal_nunca, e.alumnos_total, e.alumnos_activos,
        e.entregas, ...HERRAMIENTAS.map(h => e.herramientas[h.clave] ?? 0),
        e.costo_ia_usd == null ? '' : e.costo_ia_usd.toFixed(3).replace('.', ','),
      ]),
    ]);
  };

  const ordenarPor = (clave: Orden['clave']) =>
    setOrden(o => (o.clave === clave ? { clave, desc: !o.desc } : { clave, desc: clave !== 'nombre' }));

  return (
    <div className="adm-container animate-in">
      <header className="adm-head">
        <div>
          <h2><BarChart3 size={20} aria-hidden="true" /> Uso de la plataforma</h2>
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
      {cargando && !datos && <Esqueleto tipo="tarjetas" cantidad={4} etiqueta="Cargando el uso de la plataforma…" />}

      {datos && t && (
        <>
          <section className="cia-tiles" aria-label="Resumen">
            <div className="card cia-tile">
              <span className="cia-tile-label">Docentes y dirección que entraron</span>
              <strong className="cia-tile-valor">{num(t.personal_activo)} <span className="upl-de">de {num(t.personal_total)}</span></strong>
              <span className="cia-tile-sub">{t.personal_nunca ? `${num(t.personal_nunca)} nunca entraron` : 'Todos entraron alguna vez'}</span>
            </div>
            <div className="card cia-tile">
              <span className="cia-tile-label">Estudiantes que entraron</span>
              <strong className="cia-tile-valor">{num(t.alumnos_activos)} <span className="upl-de">de {num(t.alumnos_total)}</span></strong>
              <span className="cia-tile-sub">entraron o entregaron algo</span>
            </div>
            <div className="card cia-tile">
              <span className="cia-tile-label">Entregas de estudiantes</span>
              <strong className="cia-tile-valor">{num(t.entregas)}</strong>
              <span className="cia-tile-sub">actividades entregadas</span>
            </div>
            <div className="card cia-tile">
              <span className="cia-tile-label">Usos de IA</span>
              <strong className="cia-tile-valor">{num(t.usos_ia)}</strong>
              <span className="cia-tile-sub">{usd(t.costo_ia_usd)} · <Link to="/admin/consumo-ia">ver el detalle</Link></span>
            </div>
          </section>

          <section className="card cia-bloque">
            <h3>Docentes y dirección con la app abierta, por día</h3>
            {faltanIngresos && (
              <p className="cia-nota">
                Los ingresos se registran desde el {fechaCorta(ingresosDesde!)} (la mudanza al servidor propio): antes de esa fecha las barras quedan vacías.
              </p>
            )}
            <div className="cia-barras" role="img"
              aria-label={`Docentes y dirección con la app abierta por día: máximo ${num(maxDia)} en un día. La tabla de abajo tiene el detalle.`}>
              {datos.por_dia.map(d => (
                <div key={d.dia} className="cia-barra-col" tabIndex={0}
                  aria-label={`${fechaCorta(d.dia)}: ${num(d.personal)} del personal, ${num(d.estudiantes)} estudiantes`}>
                  <div className="cia-barra" style={{ height: `${(d.personal / maxDia) * 100}%` }} />
                  <span className="cia-tooltip" role="tooltip">
                    <strong>{fechaCorta(d.dia)}</strong>
                    {num(d.personal)} del personal · {num(d.estudiantes)} estudiantes · {num(d.familias)} familias
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
                  <thead><tr><th>Día</th><th>Personal</th><th>Estudiantes</th><th>Familias</th></tr></thead>
                  <tbody>
                    {[...datos.por_dia].reverse().map(d => (
                      <tr key={d.dia}><td>{fechaCorta(d.dia)}</td><td>{num(d.personal)}</td><td>{num(d.estudiantes)}</td><td>{num(d.familias)}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          </section>

          <section className="card cia-bloque">
            <div className="upl-titulo">
              <h3>Por escuela</h3>
              <button type="button" className="btn btn-ghost btn-sm" onClick={descargarEscuelas}>
                <Download size={14} aria-hidden="true" /> Descargar (Excel)
              </button>
            </div>
            <div className="cia-tabla-wrap">
              <table className="cia-tabla">
                <thead>
                  <tr>
                    <th>Escuela</th><th>Personal que entró</th><th>Nunca entraron</th><th>Estudiantes que entraron</th>
                    <th>Entregas</th>
                    {HERRAMIENTAS.map(h => <th key={h.clave} title={h.nombre}>{h.corto}</th>)}
                    <th>Costo IA</th>
                  </tr>
                </thead>
                <tbody>
                  {datos.por_escuela.map(e => (
                    <tr key={e.escuela}>
                      <td><span className="cia-persona">{e.escuela}</span></td>
                      <td>{num(e.personal_activo)} de {num(e.personal_total)}</td>
                      <td>{e.personal_nunca ? <span className="badge badge-warning">{num(e.personal_nunca)}</span> : '0'}</td>
                      <td>{num(e.alumnos_activos)} de {num(e.alumnos_total)}</td>
                      <td>{num(e.entregas)}</td>
                      {HERRAMIENTAS.map(h => <td key={h.clave}>{num(e.herramientas[h.clave] ?? 0)}</td>)}
                      <td>{usd(e.costo_ia_usd)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="card cia-bloque">
            <h3>Qué herramientas se usan</h3>
            <p className="cia-nota">Cuántas personas del personal usaron cada una en el período, y cuántas veces.</p>
            <ul className="upl-herr">
              {HERRAMIENTAS.map(h => {
                const u = datos.herramientas.find(x => x.herramienta === h.clave) ?? { usos: 0, personas: 0 };
                const pct = t.personal_total ? (u.personas / t.personal_total) * 100 : 0;
                return (
                  <li key={h.clave} className={u.personas ? '' : 'upl-herr-cero'}>
                    <span className="upl-herr-nombre">{h.nombre}</span>
                    <span className="upl-herr-barra" aria-hidden="true"><span style={{ width: `${pct}%` }} /></span>
                    <span className="upl-herr-dato">
                      {u.personas
                        ? `${num(u.personas)} de ${num(t.personal_total)} · ${num(u.usos)} ${u.usos === 1 ? 'vez' : 'veces'}`
                        : 'Nadie la usó'}
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>

          <section className="card cia-bloque">
            <div className="upl-titulo">
              <h3>Por docente</h3>
              <button type="button" className="btn btn-ghost btn-sm" onClick={descargarPersonas}>
                <Download size={14} aria-hidden="true" /> Descargar (Excel)
              </button>
            </div>
            <div className="cia-periodo" role="group" aria-label="Mostrar">
              {([['todos', 'Todos'], ['nunca', 'Nunca entraron'], ['sin_uso', 'Sin entrar en el período']] as [Filtro, string][]).map(([f, etiqueta]) => (
                <button key={f} type="button" className={`btn btn-sm ${filtro === f ? 'btn-primary' : 'btn-ghost'}`}
                  aria-pressed={filtro === f} onClick={() => setFiltro(f)}>
                  {etiqueta}
                </button>
              ))}
            </div>
            <p className="cia-nota">
              Lo que hizo cada uno en el período. Tocá una columna para ordenar.
              {ingresosDesde && ` "Días" cuenta los días con la app abierta desde el ${fechaCorta(ingresosDesde)}.`}
            </p>
            {personas.length === 0 ? (
              <EstadoVacio compacto icono={Users} titulo={filtro === 'todos' ? 'Todavía no hay docentes cargados' : 'Nadie en esta lista'}
                texto={filtro === 'todos' ? 'Se suman desde Escuelas → la escuela → Personal.' : 'Probá con otro filtro o período.'} />
            ) : (
              <div className="cia-tabla-wrap">
                <table className="cia-tabla upl-personas">
                  <thead>
                    <tr>
                      <Encabezado clave="nombre" orden={orden} alOrdenar={ordenarPor}>Persona</Encabezado>
                      <Encabezado clave="ultimo_ingreso" orden={orden} alOrdenar={ordenarPor}>Último ingreso</Encabezado>
                      <Encabezado clave="dias_activo" orden={orden} alOrdenar={ordenarPor} titulo="Días con la app abierta en el período">Días</Encabezado>
                      {HERRAMIENTAS.map(h => <Encabezado key={h.clave} clave={h.clave} orden={orden} alOrdenar={ordenarPor} titulo={h.nombre}>{h.corto}</Encabezado>)}
                    </tr>
                  </thead>
                  <tbody>
                    {personas.map((p, i) => (
                      <tr key={`${p.nombre}-${i}`}>
                        <td>
                          <span className="cia-persona">{p.nombre || 'Sin nombre'}</span>
                          <span className="cia-sub">{p.rol === 'director' ? 'Dirección' : 'Docente'}{p.escuelas ? ` · ${p.escuelas}` : ''}</span>
                        </td>
                        <td>{p.ultimo_ingreso ? haceCuanto(p.ultimo_ingreso) : <span className="badge badge-warning">Nunca entró</span>}</td>
                        <td>{num(p.dias_activo)}</td>
                        {HERRAMIENTAS.map(h => {
                          const n = h.clave === 'ia' ? p.usos_ia : p.herramientas[h.clave] ?? 0;
                          return <td key={h.clave} className={n ? '' : 'upl-cero'}>{num(n)}</td>;
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <div className="adm-aviso" role="note">
            <Info size={15} aria-hidden="true" />
            <span>
              De los estudiantes solo se muestran números por escuela, nunca nombres. Lo cargado a nombre de un docente
              por la Dirección (por ejemplo, su planificación) cuenta en sus herramientas, pero no como que entró.
            </span>
          </div>
        </>
      )}
    </div>
  );
}

/** Encabezado de columna que ordena la tabla de personas */
function Encabezado({ clave, orden, alOrdenar, titulo, children }: {
  clave: Orden['clave'];
  orden: Orden;
  alOrdenar: (clave: Orden['clave']) => void;
  titulo?: string;
  children: React.ReactNode;
}) {
  const activo = orden.clave === clave;
  return (
    <th aria-sort={activo ? (orden.desc ? 'descending' : 'ascending') : 'none'}>
      <button type="button" className="upl-orden" onClick={() => alOrdenar(clave)} title={titulo}>
        {children}
        {activo && (orden.desc ? <ArrowDown size={12} aria-hidden="true" /> : <ArrowUp size={12} aria-hidden="true" />)}
      </button>
    </th>
  );
}
