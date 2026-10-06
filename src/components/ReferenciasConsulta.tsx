/**
 * Consulta de la biblioteca de referencia (050): normativa nacional,
 * provincial y municipal, NAP, ESI, diseño curricular y técnicas.
 *
 * La carga la Dirección de Innovación; el equipo solo la lee. Sin
 * búsqueda se ven los documentos agrupados por capa; con búsqueda, los
 * fragmentos que mejor coinciden (buscar_referencias, con la RLS de quien
 * pregunta). Lo que se muestra es el texto cargado tal cual: esta pantalla
 * no resume ni completa nada.
 */

import { useEffect, useMemo, useState } from 'react';
import { Library, Search, ExternalLink, ChevronDown, ChevronUp } from 'lucide-react';
import {
  buscarReferencias, getReferenciasPublicadas, getFragmentos,
  CAPAS, CAPA_LABELS, TIPO_LABELS, FILTROS_TIPO,
  type CapaReferencia, type FragmentoHallado, type ReferenciaDoc, type FragmentoRef,
} from '../services/nap.service';
import TextoRecortable from './TextoRecortable';
import EstadoVacio from './ui/EstadoVacio';
import { Esqueleto, Cargando } from './ui/Esqueleto';
// Tarjetas, buscador y pastillas de filtro son las de Normativa y la
// Libreta: se importan acá para que se vean bien donde se monte.
import './ui/ui.css';
import '../pages/Libreta.css';
import '../pages/Normativa.css';
import './ReferenciasConsulta.css';

function FuenteOficial({ url }: { url: string | null }) {
  if (!url) return null;
  return (
    <a className="ref-fuente" href={url} target="_blank" rel="noopener noreferrer">
      <ExternalLink size={13} aria-hidden="true" /> Fuente oficial
    </a>
  );
}

function Encabezado({ numero, titulo }: { numero: string | null; titulo: string }) {
  return (
    <h4 className="ref-titulo">
      {numero && <span className="ref-numero">{numero}</span>}
      {numero && ' · '}
      {titulo}
    </h4>
  );
}

export default function ReferenciasConsulta() {
  const [texto, setTexto] = useState('');
  const [q, setQ] = useState('');
  const [capa, setCapa] = useState<CapaReferencia | 'todas'>('todas');
  const [tipo, setTipo] = useState<string>('todos');

  const [docs, setDocs] = useState<ReferenciaDoc[] | null>(null);
  const [errorDocs, setErrorDocs] = useState('');
  const [hallados, setHallados] = useState<FragmentoHallado[] | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [errorBusqueda, setErrorBusqueda] = useState('');

  const [abierto, setAbierto] = useState<string | null>(null);
  const [fragmentos, setFragmentos] = useState<Record<string, FragmentoRef[] | 'error'>>({});

  const tiposFiltro = FILTROS_TIPO.find(f => f.id === tipo)?.tipos ?? null;

  // Lo que se escribe se busca cuando se deja de tipear un momento.
  useEffect(() => {
    const t = window.setTimeout(() => setQ(texto.trim()), 400);
    return () => window.clearTimeout(t);
  }, [texto]);

  useEffect(() => {
    let cancelado = false;
    getReferenciasPublicadas()
      .then(d => { if (!cancelado) setDocs(d); })
      .catch(err => {
        console.error(err);
        if (!cancelado) { setDocs([]); setErrorDocs('No se pudo cargar la biblioteca de referencia.'); }
      });
    return () => { cancelado = true; };
  }, []);

  useEffect(() => {
    if (!q) { setHallados(null); setErrorBusqueda(''); return; }
    let cancelado = false;
    setBuscando(true);
    setErrorBusqueda('');
    buscarReferencias({ q, tipos: tiposFiltro, max: 12 })
      .then(r => { if (!cancelado) setHallados(r); })
      .catch(err => {
        console.error(err);
        if (!cancelado) { setHallados([]); setErrorBusqueda('No se pudo hacer la búsqueda. Probá de nuevo.'); }
      })
      .finally(() => { if (!cancelado) setBuscando(false); });
    return () => { cancelado = true; };
    // tiposFiltro se deriva de `tipo`
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, tipo]);

  const abrirDoc = (id: string) => {
    if (abierto === id) { setAbierto(null); return; }
    setAbierto(id);
    const previo = fragmentos[id];
    if (previo && previo !== 'error') return;
    getFragmentos(id)
      .then(f => setFragmentos(prev => ({ ...prev, [id]: f })))
      .catch(err => {
        console.error(err);
        setFragmentos(prev => ({ ...prev, [id]: 'error' }));
      });
  };

  const docsFiltrados = useMemo(() => (docs ?? []).filter(d =>
    (capa === 'todas' || d.capa === capa) && (!tiposFiltro || tiposFiltro.includes(d.tipo)),
  ), [docs, capa, tiposFiltro]);

  const halladosFiltrados = (hallados ?? []).filter(h => capa === 'todas' || h.capa === capa);

  const limpiar = () => { setTexto(''); setQ(''); setCapa('todas'); setTipo('todos'); };

  const bibliotecaVacia = docs !== null && docs.length === 0 && !errorDocs;

  return (
    <div className="ref-consulta">
      <p className="text-secondary text-sm ref-intro">
        Leyes, resoluciones, NAP, ESI y diseño curricular comunes a todas las escuelas
        municipales. Los carga la Dirección de Innovación con el texto oficial y el link a la fuente.
      </p>

      {bibliotecaVacia ? (
        <EstadoVacio
          icono={Library}
          titulo="Todavía no se cargó la normativa nacional, provincial ni municipal"
          texto="La carga la Dirección de Innovación. Cuando esté, la vas a poder buscar y leer acá."
        />
      ) : (
        <>
          <div className="norm-filters">
            <div className="norm-search">
              <Search size={15} className="text-subtle" aria-hidden="true" />
              <input
                className="form-input"
                type="search"
                aria-label="Buscar en la normativa nacional, provincial y municipal"
                placeholder="Buscar: evaluación, convivencia, ESI…"
                value={texto}
                onChange={e => setTexto(e.target.value)}
              />
            </div>
            <select
              className="form-select"
              aria-label="Filtrar por alcance"
              value={capa}
              onChange={e => setCapa(e.target.value as CapaReferencia | 'todas')}
            >
              <option value="todas">Todos los alcances</option>
              {CAPAS.map(c => <option key={c} value={c}>{CAPA_LABELS[c]}</option>)}
            </select>
          </div>

          <div className="fila-desplazable" role="group" aria-label="Filtrar por tipo">
            <button
              type="button"
              className={`libreta-tab ${tipo === 'todos' ? 'active' : ''}`}
              aria-pressed={tipo === 'todos'}
              onClick={() => setTipo('todos')}
            >
              Todo
            </button>
            {FILTROS_TIPO.map(f => (
              <button
                key={f.id}
                type="button"
                className={`libreta-tab ${tipo === f.id ? 'active' : ''}`}
                aria-pressed={tipo === f.id}
                onClick={() => setTipo(f.id)}
              >
                {f.etiqueta}
              </button>
            ))}
          </div>
        </>
      )}

      {errorDocs && <div className="em-error">{errorDocs}</div>}

      {/* ── Con búsqueda: fragmentos ── */}
      {q && (
        <>
          {buscando && <Cargando texto="Buscando…" />}
          {errorBusqueda && <div className="em-error">{errorBusqueda}</div>}
          {!buscando && hallados !== null && halladosFiltrados.length === 0 && !errorBusqueda && (
            <EstadoVacio
              compacto
              icono={Search}
              titulo="No encontramos nada con esas palabras"
              texto="Probá con otra palabra o sacá los filtros."
              accion={{ etiqueta: 'Ver todo', alTocar: limpiar }}
            />
          )}
          <div className="ref-lista">
            {!buscando && halladosFiltrados.map(h => (
              <article key={h.fragmentoId} className="card ref-hallado">
                <Encabezado numero={h.numero} titulo={h.titulo} />
                <div className="norm-card-meta">
                  <span className="badge badge-cyan">{CAPA_LABELS[h.capa]}</span>
                  <span className="badge badge-neutral">{TIPO_LABELS[h.tipo]}</span>
                </div>
                {h.seccion && <p className="ref-seccion">{h.seccion}</p>}
                <TextoRecortable texto={h.texto} />
                <FuenteOficial url={h.fuenteUrl} />
              </article>
            ))}
          </div>
        </>
      )}

      {/* ── Sin búsqueda: documentos por capa ── */}
      {!q && docs === null && <Esqueleto tipo="filas" cantidad={4} etiqueta="Cargando la biblioteca…" />}

      {!q && docs !== null && docs.length > 0 && docsFiltrados.length === 0 && (
        <EstadoVacio
          compacto
          icono={Library}
          titulo="No hay documentos cargados con ese filtro"
          texto="Probá con otro alcance o tipo."
          accion={{ etiqueta: 'Ver todo', alTocar: limpiar }}
        />
      )}

      {!q && CAPAS.map(c => {
        const deCapa = docsFiltrados.filter(d => d.capa === c);
        if (deCapa.length === 0) return null;
        return (
          <section key={c} className="ref-capa" aria-labelledby={`ref-capa-${c}`}>
            <h3 id={`ref-capa-${c}`} className="ref-capa-titulo">{CAPA_LABELS[c]}</h3>
            <div className="ref-lista">
              {deCapa.map(d => {
                const frags = fragmentos[d.id];
                const estaAbierto = abierto === d.id;
                return (
                  <div key={d.id} className={`card norm-card ${estaAbierto ? 'open' : ''}`}>
                    <button
                      type="button"
                      className="norm-card-head"
                      onClick={() => abrirDoc(d.id)}
                      aria-expanded={estaAbierto}
                    >
                      <div className="norm-card-main">
                        <Encabezado numero={d.numero} titulo={d.titulo} />
                        {d.resumen && <p className="text-sm text-secondary">{d.resumen}</p>}
                        <div className="norm-card-meta">
                          <span className="badge badge-neutral">{TIPO_LABELS[d.tipo]}</span>
                          {d.organismo && <span className="text-xs text-subtle">{d.organismo}</span>}
                        </div>
                      </div>
                      {estaAbierto
                        ? <ChevronUp size={16} className="text-subtle" aria-hidden="true" />
                        : <ChevronDown size={16} className="text-subtle" aria-hidden="true" />}
                    </button>

                    {estaAbierto && (
                      <div className="norm-card-body">
                        {frags === undefined && <Cargando texto="Cargando el texto…" />}
                        {frags === 'error' && <div className="em-error">No se pudo cargar el texto del documento.</div>}
                        {Array.isArray(frags) && frags.length === 0 && (
                          <p className="text-sm text-secondary">Este documento todavía no tiene el texto cargado.</p>
                        )}
                        {Array.isArray(frags) && frags.map(f => (
                          <div key={f.id} className="ref-fragmento">
                            {f.seccion && <p className="ref-seccion">{f.seccion}</p>}
                            <TextoRecortable texto={f.texto} />
                          </div>
                        ))}
                        <FuenteOficial url={d.fuenteUrl} />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
