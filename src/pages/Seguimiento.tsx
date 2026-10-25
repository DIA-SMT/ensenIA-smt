/**
 * Seguimiento (fase 4): en un panel aparte, cómo vienen los estudiantes de
 * un curso, qué hay para corregir y las consultas sin responder.
 *
 * Todo sale de seguimiento_curso (066) en un pedido: con los permisos del
 * docente, solo sus actividades y sus estudiantes. Lo que no se hace acá
 * (corregir, la ficha, la conversación entera) se abre en su pantalla.
 * Las consultas se responden acá mismo: a quien preguntó o, además, para
 * todo el curso como aclaración de la actividad. Eso último pasa por una
 * vista previa: el curso ve el texto tal cual y se baja a sus celulares.
 *
 * Los envíos llevan un id elegido acá: si el pedido llegó pero la respuesta
 * se perdió, reintentar no duplica ni el mensaje ni la aclaración (ninguno
 * de los dos se borra).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  Activity as IconoActividad, AlertTriangle, ChevronRight, ClipboardCheck, HelpCircle, Megaphone,
  MessagesSquare, Send, UserRound, WifiOff,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useSenial } from '../lib/useSenial';
import { getSubjects } from '../services/subjects.service';
import {
  consultasSinResponder, getSeguimiento, publicarAclaracion,
  type ConsultaSeguimiento, type ConsultasPorCurso, type Seguimiento,
} from '../services/seguimiento.service';
import { enviarMensaje } from '../services/mensajes.service';
import { TIPOS_ACTIVIDAD } from '../lib/actividades';
import EstadoVacio from '../components/ui/EstadoVacio';
import { Esqueleto } from '../components/ui/Esqueleto';
import { avisar } from '../components/ui/avisar';
import type { Subject } from '../types';
import ProgresoSaberes from '../components/ProgresoSaberes';
import './Seguimiento.css';

const DIAS_SIN_ACTIVIDAD = 7;

function hace(iso: string | null): string {
  if (!iso) return 'Sin actividad';
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 60) return 'Hace un rato';
  const h = Math.round(min / 60);
  if (h < 24) return `Hace ${h} h`;
  const d = Math.round(h / 24);
  return d === 1 ? 'Ayer' : `Hace ${d} días`;
}

/** Materia y curso: la elección se guarda así (el perfil se recarga y el arreglo cambia) */
const clave = (a: { subjectId: string; courseId: string }) => `${a.subjectId}|${a.courseId}`;

const diasDesde = (iso: string | null) => (iso ? (Date.now() - new Date(iso).getTime()) / 86400000 : Infinity);

const sinTildes = (t: string) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

/** Si el texto nombra a quien preguntó ("Sofi" cuenta por "Sofía"): para avisar antes de publicarlo al curso. */
function nombreEn(texto: string, estudiante: string | null): string | null {
  if (!estudiante) return null;
  const palabras = sinTildes(texto).split(/[^a-z0-9]+/).filter(Boolean);
  for (const parte of estudiante.split(/\s+/)) {
    const n = sinTildes(parte);
    if (n.length < 3) continue;
    if (palabras.some(w => w === n || (w.length >= 4 && n.startsWith(w)))) return parte;
  }
  return null;
}

const NOTA_PARA_TODOS = '\n\n(Lo publiqué también como aclaración en la actividad, para todo el curso.)';

/** Un envío en curso, por consulta: los ids se reusan al reintentar lo mismo */
interface Envio { texto: string; aclaracionId: string; aclarada: boolean; cuerpo?: string; mensajeId?: string }

const venceTexto = (iso: string | null) => {
  if (!iso) return 'sin fecha de entrega';
  const dia = new Date(iso).toLocaleDateString('es-AR', { day: 'numeric', month: 'numeric' });
  return new Date(iso).getTime() < Date.now() ? `venció el ${dia}` : `vence el ${dia}`;
};

export default function Seguimiento() {
  const { user } = useAuth();
  const senial = useSenial();
  const [params, setParams] = useSearchParams();
  const asignaciones = useMemo(() => user?.subjects ?? [], [user]);
  const [materias, setMaterias] = useState<Record<string, Subject>>({});
  // null hasta saber dónde abrir: el curso del enlace, o el primero con
  // consultas sin responder (el aviso de Hoy las cuenta en todos)
  const [elegida, setElegida] = useState<string | null>(null);
  const [porCurso, setPorCurso] = useState<ConsultasPorCurso[]>([]);
  const [datos, setDatos] = useState<Seguimiento | null>(null);
  const [fallo, setFallo] = useState('');
  const [respuestas, setRespuestas] = useState<Record<string, string>>({});
  const [enviando, setEnviando] = useState<string | null>(null);
  // La consulta que muestra la vista previa de "para todos"
  const [previa, setPrevia] = useState<string | null>(null);
  // Consultas con la aclaración ya publicada y la respuesta sin salir: el
  // texto queda fijo (es el que se publicó) hasta que salga
  const [fijas, setFijas] = useState<Record<string, true>>({});
  const pedido = useRef(0);
  const envios = useRef(new Map<string, Envio>());
  const cursoActual = useRef('');

  const todas = asignaciones.map(clave).join(',');
  useEffect(() => {
    let vivo = true;
    consultasSinResponder().then(l => {
      if (!vivo) return;
      setPorCurso(l);
      setElegida(prev => {
        if (prev !== null) return prev;
        const conConsultas = asignaciones.find(a => l.some(c => clave(c) === clave(a) && c.cantidad > 0));
        const primera = conConsultas ?? asignaciones[0];
        return primera ? clave(primera) : null;
      });
    });
    return () => { vivo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `todas` resume asignaciones
  }, [todas]);

  // ?materia=&curso= (viene de un aviso o de otra pantalla)
  useEffect(() => {
    const m = params.get('materia');
    const c = params.get('curso');
    if (!m) return;
    const a = asignaciones.find(x => x.subjectId === m && x.courseId === c);
    if (a) setElegida(clave(a));
    setParams({}, { replace: true });
  }, [asignaciones, params, setParams]);

  useEffect(() => {
    if (!user) return;
    getSubjects(user.schoolId).then(l => setMaterias(Object.fromEntries(l.map(s => [s.id, s])))).catch(() => undefined);
  }, [user]);

  const asignacion = elegida === null ? undefined : (asignaciones.find(a => clave(a) === elegida) ?? asignaciones[0]);
  const subjectId = asignacion?.subjectId;
  const courseId = asignacion?.courseId;
  cursoActual.current = asignacion ? clave(asignacion) : '';
  const pendientesDe = (subjectId: string, courseId: string) =>
    porCurso.find(c => c.subjectId === subjectId && c.courseId === courseId)?.cantidad ?? 0;

  const cargar = useCallback(async () => {
    if (!subjectId || !courseId) return;
    const este = ++pedido.current;
    setFallo('');
    try {
      const d = await getSeguimiento(subjectId, courseId);
      if (este !== pedido.current) return;
      setDatos(d);
      // El chip del curso, con lo que acaba de llegar
      const n = d.consultas.filter(c => c.sinResponder).length;
      setPorCurso(prev => [...prev.filter(x => !(x.subjectId === subjectId && x.courseId === courseId)), { subjectId, courseId, cantidad: n }]);
    } catch (err) {
      if (este === pedido.current) {
        setDatos(null);
        setFallo(err instanceof Error && err.message ? err.message : 'No se pudo traer el seguimiento.');
      }
    }
  }, [subjectId, courseId]);

  useEffect(() => { setDatos(null); void cargar(); }, [cargar]);

  const estudiantes = useMemo(() => [...(datos?.estudiantes ?? [])].sort((a, b) =>
    (b.consultasSinResponder > 0 ? 1 : 0) - (a.consultasSinResponder > 0 ? 1 : 0)
    || b.atrasadas - a.atrasadas
    || diasDesde(b.ultimaActividad) - diasDesde(a.ultimaActividad)
    || `${a.apellido} ${a.nombre}`.localeCompare(`${b.apellido} ${b.nombre}`)), [datos]);

  if (!user) return null;
  if (asignaciones.length === 0) {
    return (
      <div className="seg">
        <EstadoVacio icono={IconoActividad} titulo="Todavía no tenés cursos asignados"
          texto="Cuando dirección te asigne una materia y un curso, acá ves cómo vienen tus estudiantes." />
      </div>
    );
  }

  const nombreMateria = (id: string) => materias[id]?.name ?? 'Materia';
  const sinResponder = (datos?.consultas ?? []).filter(c => c.sinResponder);
  const respondidas = (datos?.consultas ?? []).filter(c => !c.sinResponder);
  // Solo los cursos que tiene asignados (son los que se pueden elegir arriba)
  const enOtros = asignaciones.reduce((t, a) => (asignacion && clave(a) === clave(asignacion) ? t : t + pendientesDe(a.subjectId, a.courseId)), 0);
  const paraCorregir = (datos?.actividades ?? []).reduce((s, a) => s + a.sinCorregir, 0);
  const conAtrasos = (datos?.estudiantes ?? []).filter(e => e.atrasadas > 0).length;
  // "Sin actividad" recién cuando hubo tiempo: con un curso nuevo o la
  // primera actividad recién publicada, todos saldrían en rojo
  const hayParaHacer = (datos?.actividades ?? []).some(a => diasDesde(a.publicada) >= DIAS_SIN_ACTIVIDAD);
  const quieto = (iso: string | null) => hayParaHacer && diasDesde(iso) >= DIAS_SIN_ACTIVIDAD;
  const quietos = (datos?.estudiantes ?? []).filter(e => quieto(e.ultimaActividad)).length;
  const estadoDe = (activityId: string) => datos?.actividades.find(a => a.id === activityId)?.estado;
  const totalActividades = datos?.actividades.length ?? 0;

  const responder = async (c: ConsultaSeguimiento, paraTodos: boolean) => {
    const id = c.conversacionId;
    const texto = (respuestas[id] ?? '').trim();
    if (!texto || enviando) return;
    const cursoDelEnvio = asignacion ? clave(asignacion) : '';
    const deCurso = { subjectId, courseId };
    let envio = envios.current.get(id);
    if (!envio || (!envio.aclarada && envio.texto !== texto)) {
      envio = { texto, aclaracionId: crypto.randomUUID(), aclarada: false };
      envios.current.set(id, envio);
    }
    setEnviando(id);
    try {
      // Primero la aclaración: el mensaje dice que se publicó y los mensajes
      // no se borran
      if (paraTodos && !envio.aclarada) {
        await publicarAclaracion(c.activityId, envio.texto, envio.aclaracionId);
        envio.aclarada = true;
        setFijas(prev => ({ ...prev, [id]: true }));
      }
      const cuerpo = envio.aclarada ? envio.texto + NOTA_PARA_TODOS : envio.texto;
      if (envio.cuerpo !== cuerpo) { envio.cuerpo = cuerpo; envio.mensajeId = crypto.randomUUID(); }
      await enviarMensaje(id, user.id, cuerpo, envio.mensajeId);
      envios.current.delete(id);
      setFijas(prev => { const n = { ...prev }; delete n[id]; return n; });
      setRespuestas(prev => ({ ...prev, [id]: '' }));
      // Si cambió de curso mientras salía, ese panel ya no es este
      if (cursoActual.current === cursoDelEnvio) {
        setDatos(prev => prev && {
          ...prev,
          consultas: prev.consultas.map(x => (x.conversacionId === id ? { ...x, sinResponder: false, archivada: false, ultimo: envio.texto, ultimoAt: new Date().toISOString() } : x)),
          actividades: prev.actividades.map(a => (c.sinResponder && a.id === c.activityId ? { ...a, consultasSinResponder: Math.max(0, a.consultasSinResponder - 1) } : a)),
          estudiantes: prev.estudiantes.map(e => (c.sinResponder && e.id === c.studentId ? { ...e, consultasSinResponder: Math.max(0, e.consultasSinResponder - 1) } : e)),
        });
      }
      setPorCurso(prev => prev.map(x => (c.sinResponder && x.subjectId === deCurso.subjectId && x.courseId === deCurso.courseId
        ? { ...x, cantidad: Math.max(0, x.cantidad - 1) } : x)));
      avisar.exito(envio.aclarada ? 'Respondida y publicada para todos' : 'Respuesta enviada');
    } catch (err) {
      const detalle = err instanceof Error && err.message ? err.message : 'Probá de nuevo.';
      if (envio.aclarada) {
        avisar.error('La aclaración quedó publicada, pero la respuesta no salió', `${detalle} Al reintentar se manda solo la respuesta.`);
      } else {
        avisar.error('No se pudo responder', detalle);
      }
    } finally {
      setEnviando(null);
    }
  };

  return (
    <div className="seg animate-in">
      {asignaciones.length > 1 && (
        <div className="seg-cursos fila-desplazable" role="group" aria-label="Materia y curso">
          {asignaciones.map(a => (
            <button key={clave(a)} type="button"
              className={`seg-chip ${asignacion && clave(a) === clave(asignacion) ? 'elegido' : ''}`}
              aria-pressed={!!asignacion && clave(a) === clave(asignacion)}
              onClick={() => setElegida(clave(a))}>
              {nombreMateria(a.subjectId)} · {a.courseName}
              {pendientesDe(a.subjectId, a.courseId) > 0 && (
                <span className="seg-chip-n" aria-label={`${pendientesDe(a.subjectId, a.courseId)} consultas sin responder`}>
                  {pendientesDe(a.subjectId, a.courseId)}
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {!senial && (
        <p className="seg-sin-senial" role="status">
          <WifiOff size={14} aria-hidden="true" /> Sin señal: ves lo último que se bajó. Para responder hace falta conexión.
        </p>
      )}

      {fallo && <div className="seg-error" role="alert">{fallo}</div>}
      {!datos && !fallo && <Esqueleto tipo="tarjetas" cantidad={3} etiqueta="Cargando el seguimiento…" />}

      {datos && (
        <>
          {/* ── Lo que hay que mirar ── */}
          <div className="seg-numeros">
            <a href="#seg-consultas" className={`seg-numero ${sinResponder.length ? 'alerta' : ''}`}>
              <HelpCircle size={18} aria-hidden="true" />
              <strong>{sinResponder.length}</strong>
              <span>consulta{sinResponder.length !== 1 ? 's' : ''} sin responder</span>
            </a>
            <Link to="/corregir" className={`seg-numero ${paraCorregir ? 'alerta' : ''}`}>
              <ClipboardCheck size={18} aria-hidden="true" />
              <strong>{paraCorregir}</strong>
              <span>para corregir</span>
            </Link>
            <a href="#seg-estudiantes" className={`seg-numero ${conAtrasos ? 'atencion' : ''}`}>
              <AlertTriangle size={18} aria-hidden="true" />
              <strong>{conAtrasos}</strong>
              <span>con entregas atrasadas</span>
            </a>
            <a href="#seg-estudiantes" className={`seg-numero ${quietos ? 'atencion' : ''}`}>
              <UserRound size={18} aria-hidden="true" />
              <strong>{quietos}</strong>
              <span>sin actividad hace {DIAS_SIN_ACTIVIDAD}+ días</span>
            </a>
          </div>
          {enOtros > 0 && (
            <p className="seg-nota">
              Tenés {enOtros} consulta{enOtros !== 1 ? 's' : ''} más sin responder en otro{enOtros !== 1 ? 's' : ''} curso{enOtros !== 1 ? 's' : ''}: está{enOtros !== 1 ? 'n' : ''} marcada{enOtros !== 1 ? 's' : ''} arriba.
            </p>
          )}

          {/* ── Consultas ── */}
          <section id="seg-consultas" className="card seg-seccion" aria-labelledby="seg-consultas-t">
            <h3 id="seg-consultas-t"><HelpCircle size={17} aria-hidden="true" /> Consultas</h3>
            {datos.consultas.length === 0 ? (
              <p className="seg-vacio">
                Todavía nadie consultó. Los estudiantes preguntan desde cada actividad ("¿Tenés una duda?") y te llega acá y a tus mensajes.
              </p>
            ) : (
              <>
              <ul className="seg-consultas">
                {[...sinResponder, ...respondidas].map(c => (
                  <li key={c.conversacionId} className={c.sinResponder ? 'pendiente' : ''}>
                    <div className="seg-consulta-cabecera">
                      <strong>{c.estudiante ?? 'Estudiante'}</strong>
                      <span className="seg-sub">sobre <Link to={`/actividades/${c.activityId}`}>{c.actividad}</Link> · {hace(c.ultimoAt)}</span>
                      {c.sinResponder
                        ? <span className="badge badge-warning">Sin responder</span>
                        : c.archivada
                          ? <span className="badge badge-neutral">Archivada sin responder</span>
                          : <span className="badge badge-neutral">Respondida</span>}
                      <Link to={`/mensajes?c=${c.conversacionId}`} className="seg-ver-charla">
                        <MessagesSquare size={14} aria-hidden="true" /> Ver la charla
                      </Link>
                    </div>
                    <blockquote>{c.ultimo}</blockquote>
                    {(c.sinResponder || c.archivada) && (() => {
                      const texto = (respuestas[c.conversacionId] ?? '').trim();
                      const fija = !!fijas[c.conversacionId];
                      const sinPoder = !senial || enviando !== null || !texto;
                      // Los estudiantes ven solo las actividades publicadas
                      const paraTodosSePuede = estadoDe(c.activityId) === 'published';
                      const nombrado = nombreEn(texto, c.estudiante);
                      return (
                        <div className="seg-responder">
                          <label htmlFor={`resp-${c.conversacionId}`} className="sr-only">Tu respuesta a {c.estudiante ?? 'quien preguntó'}</label>
                          <textarea id={`resp-${c.conversacionId}`} rows={2} maxLength={2000}
                            value={respuestas[c.conversacionId] ?? ''}
                            readOnly={fija || previa === c.conversacionId}
                            placeholder="Tu respuesta…"
                            onChange={e => setRespuestas(prev => ({ ...prev, [c.conversacionId]: e.target.value }))} />
                          {fija && <p className="seg-nota">La aclaración ya se publicó con este texto; falta mandarle la respuesta.</p>}
                          {previa === c.conversacionId ? (
                            <div className="seg-previa" role="group" aria-label="Vista previa para todo el curso">
                              <p>
                                <strong>Así lo va a ver todo el curso</strong> en la actividad (sin la pregunta ni quién la hizo).
                                Se baja a sus celulares y no se edita ni se borra: solo se puede retirar.
                              </p>
                              <blockquote>{texto}</blockquote>
                              {nombrado && (
                                <p className="seg-alerta" role="alert">
                                  <AlertTriangle size={14} aria-hidden="true" /> Tu texto dice «{nombrado}», el nombre de quien preguntó.
                                  Si es algo personal, respondele solo a quien preguntó.
                                </p>
                              )}
                              <div className="seg-responder-acciones">
                                <button type="button" className="btn btn-outline btn-sm" onClick={() => setPrevia(null)}>
                                  Volver
                                </button>
                                <button type="button" className="btn btn-primary btn-sm" disabled={sinPoder}
                                  onClick={() => { setPrevia(null); void responder(c, true); }}>
                                  <Megaphone size={14} aria-hidden="true" /> Publicar para todos y responder
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div className="seg-responder-acciones">
                              {paraTodosSePuede && !fija && (
                                <button type="button" className="btn btn-ghost btn-sm" disabled={sinPoder}
                                  onClick={() => setPrevia(c.conversacionId)}>
                                  <Megaphone size={14} aria-hidden="true" /> También para todo el curso…
                                </button>
                              )}
                              <button type="button" className="btn btn-primary btn-sm" disabled={sinPoder}
                                onClick={() => responder(c, fija)}>
                                <Send size={14} aria-hidden="true" /> {enviando === c.conversacionId ? 'Enviando…' : 'Responder'}
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </li>
                ))}
              </ul>
              </>
            )}
          </section>

          {/* ── Estudiantes ── */}
          <section id="seg-estudiantes" className="card seg-seccion" aria-labelledby="seg-est-t">
            <h3 id="seg-est-t"><UserRound size={17} aria-hidden="true" /> Estudiantes</h3>
            {estudiantes.length === 0 ? (
              <p className="seg-vacio">Este curso todavía no tiene estudiantes inscriptos en la materia.</p>
            ) : (
              <ul className="seg-lista">
                {estudiantes.map(e => {
                  return (
                    <li key={e.id}>
                      <Link to={`/students?student=${e.id}`} className="seg-fila" title="Abrir su ficha">
                        <span className="seg-fila-texto">
                          <strong>{e.apellido}, {e.nombre}</strong>
                          <small className={quieto(e.ultimaActividad) ? 'seg-quieto' : undefined}>{hace(e.ultimaActividad)}</small>
                        </span>
                        <span className="seg-fila-datos">
                          <span title="Entregadas">{e.entregadas}/{totalActividades} entregadas</span>
                          {e.enCurso > 0 && <span className="badge badge-neutral">{e.enCurso} en curso</span>}
                          {e.atrasadas > 0 && <span className="badge badge-danger">{e.atrasadas} atrasada{e.atrasadas !== 1 ? 's' : ''}</span>}
                          {e.consultasSinResponder > 0 && <span className="badge badge-warning">consulta pendiente</span>}
                        </span>
                        <ChevronRight size={16} aria-hidden="true" className="text-subtle" />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {/* ── Qué van logrando, por saber (080) ── */}
          {subjectId && courseId && <ProgresoSaberes subjectId={subjectId} courseId={courseId} />}

          {/* ── Actividades ── */}
          <section className="card seg-seccion" aria-labelledby="seg-act-t">
            <h3 id="seg-act-t"><ClipboardCheck size={17} aria-hidden="true" /> Actividades del año</h3>
            {datos.actividades.length === 0 ? (
              <p className="seg-vacio">Todavía no publicaste actividades en este curso este año.</p>
            ) : (
              <ul className="seg-lista">
                {datos.actividades.map(a => (
                  <li key={a.id}>
                    <Link to={`/actividades/${a.id}`} className="seg-fila">
                      <span className="seg-fila-texto">
                        <strong><span aria-hidden="true">{TIPOS_ACTIVIDAD[a.tipo]?.emoji ?? '💻'}</span> {a.titulo}</strong>
                        <small>{a.estado === 'closed' ? 'cerrada' : venceTexto(a.vence)}</small>
                      </span>
                      <span className="seg-fila-datos">
                        <span>{a.entregaron}/{datos.estudiantes.length} entregaron</span>
                        {a.sinCorregir > 0 && <span className="badge badge-warning">{a.sinCorregir} para corregir</span>}
                        {a.enCurso > 0 && <span className="badge badge-neutral">{a.enCurso} en curso</span>}
                        {a.noEntrego > 0 && <span className="badge badge-danger">{a.noEntrego} no entregó</span>}
                        {a.consultasSinResponder > 0 && <span className="badge badge-warning">{a.consultasSinResponder} consulta{a.consultasSinResponder !== 1 ? 's' : ''}</span>}
                      </span>
                      <ChevronRight size={16} aria-hidden="true" className="text-subtle" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}
