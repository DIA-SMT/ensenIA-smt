/**
 * Memoria de estudio de EstudIA — la pantalla de la dirección (061).
 *
 * Decisiones del usuario: el docente no ve la memoria de nadie; la dirección
 * la puede auditar. Por eso acá:
 *  - El estado de la autorización de cada chico (familia y estudiante) y la
 *    carga de las autorizaciones firmadas en papel.
 *  - Revisar la memoria de un chico pide un motivo y queda registrado. El
 *    chico y su familia ven la fecha (no el motivo).
 *  - El registro completo de revisiones de la escuela, para que las
 *    direcciones se controlen entre sí.
 *
 * Nada de esto lo decide la pantalla: lo validan las funciones de la base.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Brain, Search, ScrollText, FileSignature, Eye, Trash2, X, Copy, WifiOff } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import Dialogo from '../components/shell/Dialogo';
import MarkdownRenderer from '../components/MarkdownRenderer';
import EstadoVacio from '../components/ui/EstadoVacio';
import { Esqueleto } from '../components/ui/Esqueleto';
import { avisar, pedirTexto, confirmar } from '../components/ui/avisar';
import { Campo, DialogoForm } from './admin/ui';
import { coincideBusqueda } from '../services/busqueda.service';
import {
  agruparPorMateria, borrarNotaDireccion, ETIQUETA_TIPO, getMemoriaEscuela, getRevisionesEscuela,
  getTextoVigente, registrarPapel, revisarMemoria,
  type EstudianteMemoria, type MemoriaEscuela, type NotaMemoria, type RespuestaConsentimiento,
  type RevisionMemoria, type TextoConsentimiento,
} from '../services/memoria.service';
import './Students.css';
import './admin/Admin.css';
import '../components/MemoriaEstudio.css';
import './MemoriaEstudio.css';

function fecha(iso: string): string {
  // Una fecha sola ("2026-10-10") se lee como UTC y en Argentina sería el día anterior
  return new Date(iso.length === 10 ? iso + 'T12:00' : iso)
    .toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

function fechaHora(iso: string): string {
  return new Date(iso).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
}

/** Una respuesta, en una etiqueta honesta. */
function Respuesta({ r }: { r: RespuestaConsentimiento | null }) {
  if (!r) return <span className="badge badge-neutral">Sin respuesta</span>;
  if (r.acepta && !r.vigente) return <span className="badge badge-warning" title="Autorizó un texto anterior: hay que volver a pedirla">Texto anterior</span>;
  if (r.acepta) {
    return (
      <span className="badge badge-success" title={r.firmante ? `Firmó ${r.firmante}${r.vinculo ? ` (${r.vinculo})` : ''}` : undefined}>
        Sí · {r.via === 'papel' ? 'papel' : 'app'} · {fecha(r.fecha)}
      </span>
    );
  }
  return <span className="badge badge-neutral">No · {fecha(r.fecha)}</span>;
}

export default function MemoriaEstudio() {
  const { user } = useAuth();
  const [datos, setDatos] = useState<MemoriaEscuela | null>(null);
  const [fallo, setFallo] = useState(false);
  const [revisiones, setRevisiones] = useState<RevisionMemoria[] | null>(null);
  const [busqueda, setBusqueda] = useState('');
  const [curso, setCurso] = useState('');
  const [papelDe, setPapelDe] = useState<EstudianteMemoria | null>(null);
  const [revisando, setRevisando] = useState<{ est: EstudianteMemoria; motivo: string; notas: NotaMemoria[] } | null>(null);
  const [texto, setTexto] = useState<TextoConsentimiento | null>(null);
  const [verTexto, setVerTexto] = useState(false);

  const cargar = useCallback(() => {
    getMemoriaEscuela()
      .then(d => { setDatos(d); setFallo(false); })
      .catch(err => { console.error(err); setFallo(true); });
    getRevisionesEscuela().then(setRevisiones).catch(err => { console.error(err); setRevisiones([]); });
  }, []);

  useEffect(() => { if (user) cargar(); }, [user, cargar]);

  const cursos = useMemo(
    () => [...new Set((datos?.estudiantes ?? []).map(e => e.curso))],
    [datos],
  );

  const lista = useMemo(() => (datos?.estudiantes ?? []).filter(e =>
    (!curso || e.curso === curso)
    && (!busqueda.trim() || coincideBusqueda(`${e.nombre} ${e.apellido} ${e.curso}`, busqueda)),
  ), [datos, curso, busqueda]);

  const resumen = useMemo(() => {
    const est = datos?.estudiantes ?? [];
    return {
      total: est.length,
      activas: est.filter(e => e.activa).length,
      familias: est.filter(e => e.familia?.acepta && e.familia.vigente).length,
      estudiantes: est.filter(e => e.estudiante?.acepta && e.estudiante.vigente).length,
    };
  }, [datos]);

  if (!user) return null;

  const abrirTexto = async () => {
    try {
      setTexto(await getTextoVigente());
      setVerTexto(true);
    } catch (err) {
      avisar.error((err as Error).message);
    }
  };

  const revisar = async (est: EstudianteMemoria) => {
    const motivo = await pedirTexto({
      titulo: `Revisar la memoria de ${est.nombre} ${est.apellido}`,
      etiqueta: 'Motivo de la revisión',
      mensaje: `Queda registrado con tu nombre y la fecha. ${est.nombre} y su familia ven que la dirección la revisó (no el motivo).`,
      accion: 'Abrir',
      maxLength: 300,
    });
    if (!motivo) return;
    if (motivo.length < 5) {
      avisar.error('Escribí el motivo con un poco más de detalle.');
      return;
    }
    try {
      const notas = await revisarMemoria(est.id, motivo);
      setRevisando({ est, motivo, notas });
      cargar();
    } catch (err) {
      avisar.error((err as Error).message);
    }
  };

  const borrarNota = async (n: NotaMemoria) => {
    if (!revisando) return;
    const motivo = await pedirTexto({
      titulo: 'Borrar esta nota',
      etiqueta: 'Motivo',
      valor: revisando.motivo,
      mensaje: 'Se borra en el momento y queda registrado (la materia y el tipo, no el texto).',
      accion: 'Borrar',
      maxLength: 300,
    });
    if (!motivo) return;
    try {
      await borrarNotaDireccion(n.id, motivo);
      setRevisando(r => (r ? { ...r, notas: r.notas.filter(x => x.id !== n.id) } : r));
      avisar.exito('Nota borrada.');
      cargar();
    } catch (err) {
      avisar.error((err as Error).message);
    }
  };

  return (
    <div className="mem-pantalla">
      <section className="card mem-encabezado">
        <div className="mem-encabezado-texto">
          <h2><Brain size={20} aria-hidden="true" /> Memoria de estudio de EstudIA</h2>
          <p>
            Con la autorización de la familia y del estudiante, EstudIA recuerda cómo estudia cada chico: qué le cuesta,
            qué ya maneja y qué ejemplos le sirven. No guarda nada personal ni nombres. Los docentes no la ven; la dirección
            puede revisarla y cada revisión queda registrada.
          </p>
        </div>
        {datos?.version && (
          <button type="button" className="btn btn-secondary btn-sm" onClick={abrirTexto}>
            <ScrollText size={14} aria-hidden="true" /> Texto para las familias
          </button>
        )}
      </section>

      {datos && !datos.version && (
        <div className="mem-aviso" role="note">
          Todavía no hay un texto de consentimiento publicado. Lo publica la administración municipal cuando legal lo apruebe.
          Hasta entonces nadie puede autorizar y EstudIA funciona sin memoria.
        </div>
      )}

      {fallo && (
        <div role="alert">
          <EstadoVacio icono={WifiOff} titulo="No pudimos traer el estado de la memoria" texto="Revisá la conexión y volvé a entrar." />
        </div>
      )}

      {!datos && !fallo && <Esqueleto tipo="tabla" cantidad={6} etiqueta="Cargando el estado de la memoria…" />}

      {datos && (
        <>
          <dl className="mem-resumen">
            <div><dt>Memoria activa</dt><dd>{resumen.activas}<span> de {resumen.total}</span></dd></div>
            <div><dt>Familias que autorizaron</dt><dd>{resumen.familias}</dd></div>
            <div><dt>Estudiantes que aceptaron</dt><dd>{resumen.estudiantes}</dd></div>
          </dl>

          <section className="card">
            <div className="mem-filtros">
              <div className="search-bar">
                <Search size={16} className="search-icon" aria-hidden="true" />
                <input
                  className="search-input"
                  aria-label="Buscar estudiante"
                  placeholder="Buscar estudiante…"
                  value={busqueda}
                  onChange={e => setBusqueda(e.target.value)}
                />
              </div>
              <select className="form-select" aria-label="Curso" value={curso} onChange={e => setCurso(e.target.value)}>
                <option value="">Todos los cursos</option>
                {cursos.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>

            {datos.estudiantes.length === 0 ? (
              <EstadoVacio compacto icono={Brain} titulo="Todavía no hay estudiantes en la escuela" texto="Cuando los sumes desde Mi escuela, acá vas a ver el estado de su autorización." />
            ) : lista.length === 0 ? (
              <EstadoVacio compacto icono={Search} titulo="Nadie coincide con la búsqueda" texto="Probá con otra parte del nombre o con otro curso."
                accion={{ etiqueta: 'Ver a todos', alTocar: () => { setBusqueda(''); setCurso(''); } }} />
            ) : (
              <div className="table-responsive">
                <table className="modern-table">
                  <thead>
                    <tr>
                      <th>Estudiante</th>
                      <th>Curso</th>
                      <th>Familia</th>
                      <th>Estudiante</th>
                      <th>Memoria</th>
                      <th><span className="sr-only">Acciones</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {lista.map(e => (
                      <tr key={e.id}>
                        <td className="font-medium">{e.apellido}, {e.nombre}</td>
                        <td className="text-secondary">{e.curso}</td>
                        <td><Respuesta r={e.familia} /></td>
                        <td><Respuesta r={e.estudiante} /></td>
                        <td>
                          {e.activa
                            ? <span className="badge badge-cyan">Activa · {e.items} {e.items === 1 ? 'nota' : 'notas'}</span>
                            : <span className="text-subtle text-sm">{e.items > 0 ? `En pausa · ${e.items}` : 'Apagada'}</span>}
                          {e.ultimaRevision && <span className="mem-ultima-revision">Revisada {fecha(e.ultimaRevision)}</span>}
                        </td>
                        <td>
                          <div className="mem-acciones">
                            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setPapelDe(e)} disabled={!datos.version && !(e.familia?.acepta || e.estudiante?.acepta)}
                              title="Cargar una autorización o un retiro firmado en papel">
                              <FileSignature size={14} aria-hidden="true" /> Papel
                            </button>
                            <button type="button" className="btn btn-secondary btn-sm" onClick={() => revisar(e)} disabled={e.items === 0}
                              title={e.items === 0 ? 'No hay nada guardado' : 'Pide un motivo y queda registrado'}>
                              <Eye size={14} aria-hidden="true" /> Revisar
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="card">
            <h3 className="mem-subtitulo"><ScrollText size={16} aria-hidden="true" /> Registro de revisiones</h3>
            <p className="text-secondary text-sm">Cada vez que alguien de la dirección abre la memoria de un estudiante o borra algo, queda acá. No se puede borrar.</p>
            {revisiones === null ? (
              <Esqueleto tipo="tabla" cantidad={3} etiqueta="Cargando el registro…" />
            ) : revisiones.length === 0 ? (
              <p className="text-subtle text-sm mem-vacio">Nadie revisó todavía la memoria de ningún estudiante.</p>
            ) : (
              <div className="table-responsive">
                <table className="modern-table">
                  <thead>
                    <tr><th>Cuándo</th><th>Quién</th><th>Estudiante</th><th>Qué hizo</th><th>Motivo</th></tr>
                  </thead>
                  <tbody>
                    {revisiones.map(r => (
                      <tr key={r.id}>
                        <td className="text-secondary">{fechaHora(r.fecha)}</td>
                        <td>{r.director}</td>
                        <td>{r.estudiante}{r.curso ? <span className="text-subtle"> · {r.curso}</span> : null}</td>
                        <td>{r.accion === 'leer' ? 'Leyó la memoria' : `Borró una nota${r.detalle ? ` (${r.detalle})` : ''}`}</td>
                        <td className="mem-motivo">{r.motivo}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}

      {papelDe && datos && (
        <DialogoPapel
          est={papelDe}
          version={datos.version}
          alCerrar={() => setPapelDe(null)}
          alGuardar={() => { setPapelDe(null); cargar(); }}
        />
      )}

      <Dialogo abierto={Boolean(revisando)} alCerrar={() => setRevisando(null)} etiquetadoPor="mem-revision-titulo" className="mem-dialogo">
        {revisando && (
          <>
            <div className="dialogo-encabezado">
              <h2 id="mem-revision-titulo">Memoria de {revisando.est.nombre} {revisando.est.apellido}</h2>
              <button type="button" className="btn-icon" onClick={() => setRevisando(null)} aria-label="Cerrar">
                <X size={18} aria-hidden="true" />
              </button>
            </div>
            <p className="dialogo-bajada">Motivo registrado: {revisando.motivo}</p>
            <div className="mem-dialogo-cuerpo">
              {revisando.notas.length === 0 && <p className="text-secondary">No queda nada guardado.</p>}
              {agruparPorMateria(revisando.notas).map(([materia, notas]) => (
                <section key={materia || 'general'} className="mem-grupo">
                  <h3>{materia || 'Cómo aprende'}</h3>
                  {notas.map(n => (
                    <div key={n.id} className="mem-nota">
                      <div className="mem-nota-texto">
                        <span className="mem-nota-tipo">{ETIQUETA_TIPO[n.tipo]}:</span>
                        {n.texto}
                        <span className="mem-nota-fecha">Desde {fecha(n.primeraVez)} · última vez {fecha(n.ultimaVez)} · {n.veces} {n.veces === 1 ? 'vez' : 'veces'}</span>
                      </div>
                      <button type="button" className="btn-icon" onClick={() => borrarNota(n)} aria-label={`Borrar: ${n.texto}`} title="Borrar (pide motivo)">
                        <Trash2 size={15} aria-hidden="true" />
                      </button>
                    </div>
                  ))}
                </section>
              ))}
            </div>
            <div className="mem-dialogo-pie">
              <button type="button" className="btn btn-primary" onClick={() => setRevisando(null)} data-inicial>Listo</button>
            </div>
          </>
        )}
      </Dialogo>

      <Dialogo abierto={verTexto} alCerrar={() => setVerTexto(false)} etiquetadoPor="mem-texto-titulo" className="mem-dialogo">
        {texto && (
          <>
            <div className="dialogo-encabezado">
              <h2 id="mem-texto-titulo">{texto.titulo}</h2>
              <button type="button" className="btn-icon" onClick={() => setVerTexto(false)} aria-label="Cerrar">
                <X size={18} aria-hidden="true" />
              </button>
            </div>
            <p className="dialogo-bajada">Es el texto que firma la familia (versión {texto.version}). Copialo para imprimir la autorización en papel.</p>
            <div className="mem-dialogo-cuerpo"><MarkdownRenderer content={texto.paraFamilia} /></div>
            <div className="mem-dialogo-pie">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  navigator.clipboard.writeText(`${texto.titulo} (versión ${texto.version})\n\n${texto.paraFamilia.replace(/\*\*/g, '')}`)
                    .then(() => avisar.exito('Texto copiado.'))
                    .catch(() => avisar.error('No se pudo copiar. Seleccionalo a mano.'));
                }}
              >
                <Copy size={14} aria-hidden="true" /> Copiar texto
              </button>
              <button type="button" className="btn btn-primary" onClick={() => setVerTexto(false)} data-inicial>Listo</button>
            </div>
          </>
        )}
      </Dialogo>
    </div>
  );
}

/** Autorización o retiro firmado en papel. El papel queda en el legajo. */
function DialogoPapel({ est, version, alCerrar, alGuardar }: {
  est: EstudianteMemoria;
  version: string | null;
  alCerrar: () => void;
  alGuardar: () => void;
}) {
  const [quien, setQuien] = useState<'familia' | 'estudiante'>('familia');
  const [acepta, setAcepta] = useState(Boolean(version));
  const [firmante, setFirmante] = useState('');
  const [vinculo, setVinculo] = useState('');
  const [guardando, setGuardando] = useState(false);

  // El chico acepta desde su cuenta; en papel solo se carga que la retira.
  // Sin texto vigente tampoco se puede autorizar: solo retirar.
  const puedeAutorizar = quien === 'familia' && Boolean(version);
  const aceptaReal = acepta && puedeAutorizar;
  const falta = quien === 'familia' && !firmante.trim();

  const guardar = async () => {
    if (!aceptaReal) {
      const si = await confirmar({
        titulo: 'Registrar el retiro',
        mensaje: `La memoria de estudio de ${est.nombre} se borra en el momento y deja de recordar.`,
        accion: 'Retirar y borrar',
        peligro: true,
      });
      if (!si) return;
    }
    setGuardando(true);
    try {
      await registrarPapel({ studentId: est.id, quien, acepta: aceptaReal, firmante, vinculo, version });
      avisar.exito(aceptaReal ? 'Autorización registrada.' : 'Retiro registrado: la memoria se borró.');
      alGuardar();
    } catch (err) {
      avisar.error((err as Error).message);
    } finally {
      setGuardando(false);
    }
  };

  return (
    <DialogoForm
      abierto
      alCerrar={alCerrar}
      id="mem-papel-titulo"
      titulo={`Papel firmado · ${est.nombre} ${est.apellido}`}
      bajada={version ? `El papel firmado tiene que ser de la versión vigente (${version}). Guardalo en el legajo.` : 'No hay un texto publicado: solo se puede registrar un retiro.'}
      pie={(
        <>
          <button type="button" className="btn btn-secondary" onClick={alCerrar}>Cancelar</button>
          <button type="button" className="btn btn-primary" onClick={guardar} disabled={guardando || falta}>
            {aceptaReal ? 'Registrar autorización' : 'Registrar retiro'}
          </button>
        </>
      )}
    >
      <div className="adm-form">
        <Campo label="¿Quién firmó?" htmlFor="mem-papel-quien">
          <select id="mem-papel-quien" className="form-select" value={quien} onChange={e => setQuien(e.target.value as 'familia' | 'estudiante')}>
            <option value="familia">Un familiar o tutor</option>
            <option value="estudiante">El estudiante (pidió retirarla)</option>
          </select>
        </Campo>
        <Campo label="¿Qué firmó?" htmlFor="mem-papel-que"
          ayuda={!puedeAutorizar ? 'El estudiante acepta desde su cuenta, en Mi guía. En papel solo se carga que la retira.' : undefined}>
          <select id="mem-papel-que" className="form-select" value={aceptaReal ? 'si' : 'no'} onChange={e => setAcepta(e.target.value === 'si')}>
            {puedeAutorizar && <option value="si">Autoriza la memoria de estudio</option>}
            <option value="no">Retira la autorización</option>
          </select>
        </Campo>
        {quien === 'familia' && (
          <div className="adm-fila">
            <Campo label="Nombre de quien firmó" htmlFor="mem-papel-firmante">
              <input id="mem-papel-firmante" className="form-input" maxLength={120} value={firmante} onChange={e => setFirmante(e.target.value)} data-inicial />
            </Campo>
            <Campo label="Vínculo (opcional)" htmlFor="mem-papel-vinculo">
              <input id="mem-papel-vinculo" className="form-input" maxLength={60} placeholder="madre, padre, tutora…" value={vinculo} onChange={e => setVinculo(e.target.value)} />
            </Campo>
          </div>
        )}
      </div>
    </DialogoForm>
  );
}
