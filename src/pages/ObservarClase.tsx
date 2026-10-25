/**
 * Observación de clase (081): la dirección acompaña a un docente.
 *
 *   /acompanamiento/<docente>/nueva   · una nueva
 *   /acompanamiento/<docente>/<id>    · una que ya existe
 *
 * Es formativa: una pauta (lo que marca quien observó, nunca la app),
 * fortalezas, sugerencias y acuerdos. Borrador: solo la dirección. "Cerrar y
 * compartir": el docente la ve completa, le llega un aviso, puede
 * notificarse y responder; lo escrito ya no cambia, solo se tildan acuerdos.
 * Migue ayuda a redactar con lo que se marcó; no evalúa.
 */

import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft, Sparkles, Loader2, Plus, Trash2, Save, Send, Undo2, Eye, CheckCircle2, MessageSquareReply,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { getTeacherUsers } from '../services/profiles.service';
import { getSubjects } from '../services/subjects.service';
import { todayISO } from '../services/attendance.service';
import {
  DIMENSIONES, VALORES_PAUTA, ETIQUETA_VALOR, fechaLarga,
  getObservacion, crearObservacion, guardarObservacion, tildarAcuerdos, borrarBorrador, redactarConMigue,
  type Observacion, type DatosObservacion, type Pauta, type Acuerdo,
} from '../services/acompanamiento.service';
import FichaDocente from '../components/FichaDocente';
import { avisar, confirmar } from '../components/ui/avisar';
import { Esqueleto } from '../components/ui/Esqueleto';
import EstadoVacio from '../components/ui/EstadoVacio';
import { useSinGuardar } from '../lib/sinGuardar';
import type { Subject, User } from '../types';
import './ObservarClase.css';

const vacio = (): DatosObservacion => ({
  fecha: todayISO(), subjectId: null, courseId: null,
  pauta: Object.fromEntries(DIMENSIONES.map(d => [d.clave, { valor: null, nota: '' }])),
  fortalezas: '', sugerencias: '', acuerdos: [],
});

const desde = (o: Observacion): DatosObservacion => ({
  fecha: o.fecha, subjectId: o.subjectId, courseId: o.courseId,
  pauta: Object.fromEntries(DIMENSIONES.map(d => [d.clave, o.pauta[d.clave] ?? { valor: null, nota: '' }])),
  fortalezas: o.fortalezas, sugerencias: o.sugerencias, acuerdos: o.acuerdos,
});

export default function ObservarClase() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { docente: docenteId = '', obs = 'nueva' } = useParams();
  const esNueva = obs === 'nueva';

  const [docente, setDocente] = useState<User | null>(null);
  const [materias, setMaterias] = useState<Subject[]>([]);
  const [obsGuardada, setObsGuardada] = useState<Observacion | null>(null);
  const [datos, setDatos] = useState<DatosObservacion>(vacio);
  const [original, setOriginal] = useState<string>(JSON.stringify(vacio()));
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [intento, setIntento] = useState(0);
  const [guardando, setGuardando] = useState(false);
  const [redactando, setRedactando] = useState(false);
  // Lo que había antes de que Migue redactara, para volver
  const [antesDeMigue, setAntesDeMigue] = useState<Pick<DatosObservacion, 'fortalezas' | 'sugerencias' | 'acuerdos'> | null>(null);
  // Un acuerdo tildándose: los demás esperan (sin pedidos cruzados)
  const [tildando, setTildando] = useState(false);

  // Deps primitivas: el objeto user cambia cada vez que se vuelve a la pestaña
  // (SIGNED_IN) y recargar acá borraba lo que se estaba escribiendo
  const escuela = user?.schoolId;
  useEffect(() => {
    if (!escuela) return;
    let vigente = true;
    setCargando(true);
    setError('');
    Promise.all([
      getTeacherUsers(escuela),
      getSubjects(escuela),
      esNueva ? Promise.resolve(null) : getObservacion(obs),
    ]).then(([docentes, subs, o]) => {
      if (!vigente) return;
      const d = docentes.find(t => t.id === docenteId) ?? null;
      setDocente(d);
      setMaterias(subs);
      if (!esNueva && (!o || o.docenteId !== docenteId)) {
        setError('No se encontró esa observación.');
        return;
      }
      const inicial = o ? desde(o) : vacio();
      // Una sola materia y curso: ya queda elegida
      if (!o && d?.subjects?.length === 1) {
        inicial.subjectId = d.subjects[0].subjectId;
        inicial.courseId = d.subjects[0].courseId;
      }
      setObsGuardada(o);
      setDatos(inicial);
      setOriginal(JSON.stringify(inicial));
    }).catch(err => {
      if (vigente) setError(err instanceof Error && err.message ? err.message : 'No se pudo cargar.');
    }).finally(() => { if (vigente) setCargando(false); });
    return () => { vigente = false; };
  }, [escuela, docenteId, obs, esNueva, intento]);

  const cerrada = obsGuardada?.estado === 'cerrada';
  // Otra persona de la dirección la puede leer, no cambiar (la base lo hace cumplir)
  const esMia = !obsGuardada || obsGuardada.observadorId === user?.id;
  const editable = esMia && !cerrada;
  const sucio = editable && JSON.stringify(datos) !== original;
  useSinGuardar('observar-clase', sucio);

  const opcionesClase = useMemo(() => (docente?.subjects ?? []).map(s => ({
    valor: `${s.subjectId}|${s.courseId}`,
    etiqueta: `${materias.find(m => m.id === s.subjectId)?.name ?? 'Materia'} — ${s.courseName}`,
  })), [docente, materias]);

  if (!user) return null;
  const nombre = docente ? `${docente.firstName} ${docente.lastName}` : 'el docente';
  const volver = `/docentes?docente=${encodeURIComponent(docenteId)}`;

  if (cargando) return <div className="obs-contenedor"><Esqueleto tipo="tarjetas" cantidad={3} etiqueta="Cargando la observación…" /></div>;
  if (error || !docente) {
    return (
      <div className="obs-contenedor">
        <EstadoVacio titulo={error || 'Ese docente no está en tu escuela'}
          texto={error ? 'Puede ser la conexión. Probá de nuevo en un momento.' : 'Volvé al equipo docente y elegilo de la lista.'}
          accion={error ? { etiqueta: 'Reintentar', alTocar: () => setIntento(n => n + 1) } : { etiqueta: 'Volver al equipo docente', a: '/docentes' }}
          accionSecundaria={error ? { etiqueta: 'Volver', a: volver } : undefined} />
      </div>
    );
  }

  const cambiarPauta = (clave: string, cambio: Partial<Pauta[string]>) =>
    setDatos(d => ({ ...d, pauta: { ...d.pauta, [clave]: { ...d.pauta[clave], ...cambio } } }));
  const cambiarAcuerdo = (i: number, cambio: Partial<Acuerdo>) =>
    setDatos(d => ({ ...d, acuerdos: d.acuerdos.map((a, j) => (j === i ? { ...a, ...cambio } : a)) }));

  const marcadas = DIMENSIONES.filter(d => datos.pauta[d.clave]?.valor).length;

  const redactar = async () => {
    const hayTexto = datos.fortalezas.trim() || datos.sugerencias.trim() || datos.acuerdos.some(a => a.texto.trim());
    if (hayTexto && !(await confirmar({
      titulo: '¿Migue reescribe la devolución?',
      mensaje: 'Arma fortalezas, sugerencias y acuerdos con la pauta y con lo que ya escribiste. Después podés volver a lo que tenías.',
      accion: 'Redactar',
    }))) return;
    setRedactando(true);
    try {
      const notas = [datos.fortalezas.trim() && `Fortalezas anotadas: ${datos.fortalezas.trim()}`,
        datos.sugerencias.trim() && `Sugerencias anotadas: ${datos.sugerencias.trim()}`,
        datos.acuerdos.some(a => a.texto.trim()) && `Acuerdos anotados: ${datos.acuerdos.map(a => a.texto.trim()).filter(Boolean).join('; ')}`,
      ].filter(Boolean).join('\n');
      const r = await redactarConMigue(user.schoolId, datos.pauta, notas);
      setAntesDeMigue({ fortalezas: datos.fortalezas, sugerencias: datos.sugerencias, acuerdos: datos.acuerdos });
      setDatos(d => ({
        ...d,
        fortalezas: r.fortalezas || d.fortalezas,
        sugerencias: r.sugerencias || d.sugerencias,
        acuerdos: r.acuerdos.length ? r.acuerdos.map(texto => ({ texto, cumplido: false })) : d.acuerdos,
      }));
      avisar.exito('Listo el borrador', 'Revisalo y cambiá lo que quieras: lo que se comparte es lo que vos dejes.');
    } catch (err) {
      avisar.error('Migue no pudo redactar', err instanceof Error ? err.message : 'Probá de nuevo.');
    } finally {
      setRedactando(false);
    }
  };

  const guardar = async (cerrar: boolean) => {
    if (guardando || redactando) return;
    if (cerrar) {
      if (marcadas === 0 && !datos.fortalezas.trim() && !datos.sugerencias.trim()) {
        avisar.error('Falta la devolución', 'Marcá la pauta o escribí fortalezas o sugerencias antes de compartirla.');
        return;
      }
      if (!(await confirmar({
        titulo: `¿Compartir con ${docente.firstName}?`,
        mensaje: `${docente.firstName} la va a ver completa y le llega un aviso. Después ya no se puede cambiar lo escrito: solo tildar los acuerdos que se cumplan.`,
        accion: 'Cerrar y compartir',
      }))) return;
    }
    setGuardando(true);
    try {
      const o = obsGuardada
        ? await guardarObservacion(obsGuardada.id, datos, cerrar)
        : await crearObservacion(user.schoolId, docente.id, user.id, datos, cerrar);
      const listo = desde(o);
      setObsGuardada(o);
      setDatos(listo);
      setOriginal(JSON.stringify(listo));
      setAntesDeMigue(null);
      avisar.exito(cerrar ? `Compartida con ${docente.firstName}` : 'Borrador guardado',
        cerrar ? 'Le llegó un aviso. Cuando se notifique o responda, lo vas a ver acá.' : `${docente.firstName} todavía no la ve.`);
      // La nueva ya tiene su dirección: recargar no la pierde
      if (esNueva) navigate(`/acompanamiento/${docente.id}/${o.id}`, { replace: true });
    } catch (err) {
      avisar.error('No se pudo guardar', err instanceof Error ? err.message : 'Probá de nuevo.');
    } finally {
      setGuardando(false);
    }
  };

  const borrar = async () => {
    if (!obsGuardada) return;
    if (!(await confirmar({ titulo: '¿Borrar el borrador?', mensaje: `${docente.firstName} nunca lo vio. No se puede deshacer.`, accion: 'Borrar', peligro: true }))) return;
    try {
      await borrarBorrador(obsGuardada.id);
      setOriginal(JSON.stringify(datos));
      avisar.exito('Borrador borrado');
      navigate(volver);
    } catch (err) {
      avisar.error('No se pudo borrar', err instanceof Error ? err.message : 'Probá de nuevo.');
    }
  };

  // Cerrada: tildar un acuerdo se guarda enseguida
  const tildar = async (i: number) => {
    if (!obsGuardada || !esMia || tildando) return;
    const antes = datos.acuerdos[i].cumplido;
    const nuevos = datos.acuerdos.map((a, j) => (j === i ? { ...a, cumplido: !antes } : a));
    setTildando(true);
    setDatos(d => ({ ...d, acuerdos: nuevos }));
    try {
      await tildarAcuerdos(obsGuardada.id, nuevos);
    } catch (err) {
      setDatos(d => ({ ...d, acuerdos: d.acuerdos.map((a, j) => (j === i ? { ...a, cumplido: antes } : a)) }));
      avisar.error('No se pudo guardar', err instanceof Error ? err.message : 'Probá de nuevo.');
    } finally {
      setTildando(false);
    }
  };

  const estado = !obsGuardada ? 'Nueva' : cerrada ? 'Compartida' : 'Borrador';

  return (
    <div className="obs-contenedor">
      <Link to={volver} className="obs-volver"><ArrowLeft size={16} aria-hidden="true" /> Volver al equipo docente</Link>

      <section className="card obs-cabecera" aria-labelledby="obs-t">
        <div className="obs-cabecera-fila">
          <h2 id="obs-t">Observación de clase</h2>
          <span className={`obs-estado ${cerrada ? 'cerrada' : ''}`}>{estado}</span>
        </div>
        <p className="obs-sub">
          {nombre}
          {obsGuardada?.observadorNombre && !esMia ? ` · la escribió ${obsGuardada.observadorNombre}` : ''}
        </p>
        <p className="obs-ayuda">
          Es acompañamiento, no una calificación: sirve para conversar y acordar próximos pasos.
          {!cerrada && ` ${docente.firstName} la ve completa recién cuando la compartís.`}
        </p>
        {cerrada && obsGuardada && (
          <p className="obs-seguimiento" role="status">
            <Eye size={15} aria-hidden="true" />
            Compartida el {fechaLarga(obsGuardada.cerradaAt ?? obsGuardada.fecha)}.{' '}
            {obsGuardada.notificadoAt
              ? <>Se notificó el {fechaLarga(obsGuardada.notificadoAt)}.</>
              : <>Todavía no se notificó.</>}
          </p>
        )}
      </section>

      {/* ── La clase ── */}
      <section className="card obs-seccion" aria-labelledby="obs-clase">
        <h3 id="obs-clase">La clase</h3>
        <div className="obs-fila">
          <label className="obs-campo obs-campo-corto">
            <span>Fecha</span>
            <input type="date" className="form-input" value={datos.fecha} max={todayISO()} disabled={!editable}
              onChange={e => setDatos(d => ({ ...d, fecha: e.target.value || d.fecha }))} />
          </label>
          <label className="obs-campo">
            <span>Materia y curso</span>
            <select className="form-select" disabled={!editable}
              value={datos.subjectId && datos.courseId ? `${datos.subjectId}|${datos.courseId}` : ''}
              onChange={e => {
                const [s, c] = e.target.value ? e.target.value.split('|') : [null, null];
                setDatos(d => ({ ...d, subjectId: s, courseId: c }));
              }}>
              <option value="">Sin especificar</option>
              {opcionesClase.map(o => <option key={o.valor} value={o.valor}>{o.etiqueta}</option>)}
              {/* Una que ya no está entre sus materias (cambió de curso): igual se muestra */}
              {obsGuardada?.subjectId && obsGuardada.courseId && !opcionesClase.some(o => o.valor === `${obsGuardada.subjectId}|${obsGuardada.courseId}`) && (
                <option value={`${obsGuardada.subjectId}|${obsGuardada.courseId}`}>{obsGuardada.materia ?? 'Materia'} — {obsGuardada.curso ?? 'Curso'}</option>
              )}
            </select>
          </label>
        </div>
      </section>

      {/* ── La pauta ── */}
      <section className="card obs-seccion" aria-labelledby="obs-pauta">
        <div className="obs-seccion-cabecera">
          <h3 id="obs-pauta">Lo que observaste</h3>
          <span className="obs-total">{marcadas} de {DIMENSIONES.length} marcadas</span>
        </div>
        <p className="obs-ayuda">Marcá solo lo que pudiste ver en esta clase; lo demás queda como "No observado" o sin marcar.</p>
        {DIMENSIONES.map(d => {
          const it = datos.pauta[d.clave] ?? { valor: null, nota: '' };
          if (!editable && !it.valor && !it.nota) return null;
          return (
            <fieldset key={d.clave} className="obs-dimension">
              <legend>{d.titulo}</legend>
              <p className="obs-mirar">{d.mirar}</p>
              {editable ? (
                <div className="obs-valores" role="radiogroup" aria-label={d.titulo}>
                  {VALORES_PAUTA.map(v => (
                    <button key={v.valor} type="button" role="radio" aria-checked={it.valor === v.valor}
                      className={`obs-valor ${v.valor} ${it.valor === v.valor ? 'on' : ''}`}
                      onClick={() => cambiarPauta(d.clave, { valor: it.valor === v.valor ? null : v.valor })}>
                      {it.valor === v.valor && <CheckCircle2 size={14} aria-hidden="true" />} {v.etiqueta}
                    </button>
                  ))}
                </div>
              ) : it.valor && (
                <p className={`obs-valor-leido ${it.valor}`}>{ETIQUETA_VALOR[it.valor]}</p>
              )}
              {editable ? (
                <textarea className="form-textarea obs-nota" rows={2} maxLength={1000}
                  aria-label={`Nota sobre ${d.titulo.toLowerCase()} (opcional)`}
                  placeholder="Lo que viste (opcional): un ejemplo concreto ayuda a conversar"
                  value={it.nota} onChange={e => cambiarPauta(d.clave, { nota: e.target.value })} />
              ) : it.nota && <p className="obs-texto">{it.nota}</p>}
            </fieldset>
          );
        })}
      </section>

      {/* ── La devolución ── */}
      <section className="card obs-seccion" aria-labelledby="obs-devolucion">
        <div className="obs-seccion-cabecera">
          <h3 id="obs-devolucion">La devolución</h3>
          {editable && (
            <div className="obs-migue">
              {antesDeMigue && (
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => {
                  setDatos(d => ({ ...d, ...antesDeMigue }));
                  setAntesDeMigue(null);
                }}>
                  <Undo2 size={14} aria-hidden="true" /> Volver a lo que tenía
                </button>
              )}
              <button type="button" className="btn btn-outline btn-sm" onClick={() => void redactar()} disabled={redactando}>
                {redactando ? <Loader2 size={14} className="spin" aria-hidden="true" /> : <Sparkles size={14} aria-hidden="true" />}
                {redactando ? ' Redactando…' : ' Redactar con Migue'}
              </button>
            </div>
          )}
        </div>
        {editable && (
          <p className="obs-ayuda">
            Migue redacta con lo que marcaste y anotaste; no evalúa ni agrega nada. Lo que se comparte es lo que vos dejes.
          </p>
        )}
        <label className="obs-campo">
          <span>Fortalezas</span>
          {editable
            ? <textarea className="form-textarea" rows={4} maxLength={4000} value={datos.fortalezas} readOnly={redactando}
                placeholder="Lo que salió bien en la clase, con ejemplos"
                onChange={e => setDatos(d => ({ ...d, fortalezas: e.target.value }))} />
            : <p className="obs-texto">{datos.fortalezas || '—'}</p>}
        </label>
        <label className="obs-campo">
          <span>Sugerencias</span>
          {editable
            ? <textarea className="form-textarea" rows={4} maxLength={4000} value={datos.sugerencias} readOnly={redactando}
                placeholder="Propuestas concretas para probar en las próximas clases"
                onChange={e => setDatos(d => ({ ...d, sugerencias: e.target.value }))} />
            : <p className="obs-texto">{datos.sugerencias || '—'}</p>}
        </label>
      </section>

      {/* ── Acuerdos ── */}
      <section className="card obs-seccion" aria-labelledby="obs-acuerdos">
        <div className="obs-seccion-cabecera">
          <h3 id="obs-acuerdos">Acuerdos</h3>
          {cerrada && datos.acuerdos.length > 0 && (
            <span className="obs-total">{datos.acuerdos.filter(a => a.cumplido).length} de {datos.acuerdos.length} cumplidos</span>
          )}
        </div>
        {editable ? (
          <>
            <p className="obs-ayuda">Próximos pasos concretos, que se puedan revisar en la próxima visita.</p>
            {datos.acuerdos.map((a, i) => (
              <div key={i} className="obs-acuerdo-edit">
                <input className="form-input" maxLength={500} value={a.texto} aria-label={`Acuerdo ${i + 1}`} readOnly={redactando}
                  placeholder="Ej: cerrar cada clase con una pregunta para ver qué se entendió"
                  onChange={e => cambiarAcuerdo(i, { texto: e.target.value })} />
                <button type="button" className="btn-icon" aria-label={`Quitar el acuerdo ${i + 1}`} disabled={redactando}
                  onClick={() => setDatos(d => ({ ...d, acuerdos: d.acuerdos.filter((_, j) => j !== i) }))}>
                  <Trash2 size={15} aria-hidden="true" />
                </button>
              </div>
            ))}
            {datos.acuerdos.length < 6 && (
              <button type="button" className="btn btn-ghost btn-sm obs-agregar" disabled={redactando}
                onClick={() => setDatos(d => ({ ...d, acuerdos: [...d.acuerdos, { texto: '', cumplido: false }] }))}>
                <Plus size={14} aria-hidden="true" /> Agregar un acuerdo
              </button>
            )}
          </>
        ) : datos.acuerdos.length === 0 ? (
          <p className="obs-ayuda">Sin acuerdos.</p>
        ) : (
          <ul className="obs-acuerdos">
            {datos.acuerdos.map((a, i) => (
              <li key={i}>
                <label className={`obs-acuerdo ${a.cumplido ? 'cumplido' : ''}`}>
                  <input type="checkbox" checked={a.cumplido} disabled={!esMia || tildando} onChange={() => void tildar(i)} />
                  <span>{a.texto}</span>
                  <small>{a.cumplido ? 'Cumplido' : 'Pendiente'}</small>
                </label>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ── Lo que respondió ── */}
      {cerrada && obsGuardada?.respuestaDocente && (
        <section className="card obs-seccion" aria-labelledby="obs-respuesta">
          <h3 id="obs-respuesta"><MessageSquareReply size={17} aria-hidden="true" /> Lo que respondió {docente.firstName}</h3>
          <p className="obs-texto">{obsGuardada.respuestaDocente}</p>
          {obsGuardada.respondidaAt && <p className="obs-ayuda">{fechaLarga(obsGuardada.respondidaAt)}</p>}
        </section>
      )}

      {/* ── Lo que muestra la app: contexto para conversar, sin puntaje ── */}
      <details className="card obs-contexto">
        <summary>Lo que muestra la app de {docente.firstName} (contexto)</summary>
        <p className="obs-ayuda">
          Para tener a mano al conversar. No es una evaluación: la app no califica ni compara docentes, y esto no
          entra en la observación.
        </p>
        <FichaDocente teacherId={docente.id} voz="direccion" />
      </details>

      {editable && (
        <div className="obs-barra">
          {obsGuardada && (
            <button type="button" className="btn btn-ghost btn-sm obs-borrar" onClick={() => void borrar()} disabled={guardando || redactando}>
              <Trash2 size={15} aria-hidden="true" /> Borrar borrador
            </button>
          )}
          <button type="button" className="btn btn-outline" onClick={() => void guardar(false)} disabled={guardando || redactando || (!sucio && Boolean(obsGuardada))}>
            <Save size={16} aria-hidden="true" /> Guardar borrador
          </button>
          <button type="button" className="btn btn-primary" onClick={() => void guardar(true)} disabled={guardando || redactando}>
            {guardando ? <Loader2 size={16} className="spin" aria-hidden="true" /> : <Send size={16} aria-hidden="true" />} Cerrar y compartir
          </button>
        </div>
      )}
    </div>
  );
}
