/**
 * Mensajes: la bandeja donde se trabaja toda la información (060).
 *
 * Junta en un solo lugar:
 *  · las conversaciones (con respuestas);
 *  · los comunicados de la dirección, que se responden abriendo una
 *    conversación con quien lo mandó;
 *  · para las familias, comunicados y citaciones (con "Asistiré / No puedo").
 *
 * Las conversaciones con un estudiante nunca son privadas: la dirección las
 * puede leer y los mensajes no se borran. Eso se dice arriba de cada una, a
 * todos los que participan (decisión del usuario).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  MessagesSquare, Megaphone, CalendarClock, Plus, Send, Loader2, ArrowLeft, Archive, ArchiveRestore,
  ShieldCheck, Eye, Search, X, Inbox, Reply, Check,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import {
  misConversaciones, conversacionesSupervisadas, verConversacion, misContactos, iniciarConversacion,
  enviarMensaje, marcarLeida, archivar, EVENTO_MENSAJES, NOMBRE_ROL,
  type ResumenConversacion, type Conversacion, type Persona,
} from '../services/mensajes.service';
import { getCommunicationsBySchool, markCommunicationRead, EVENTO_COMUNICADO_LEIDO } from '../services/communications.service';
import { getNoticesForGuardian, markNoticeRead, respondToNotice } from '../services/guardians.service';
import { coincideBusqueda } from '../services/busqueda.service';
import Dialogo from '../components/shell/Dialogo';
import EstadoVacio from '../components/ui/EstadoVacio';
import { Esqueleto } from '../components/ui/Esqueleto';
import { avisar } from '../components/ui/avisar';
import type { Communication, GuardianNotice } from '../types';
import './Mensajes.css';

type Pestania = 'bandeja' | 'archivadas' | 'supervision';

type Item =
  | { tipo: 'conv'; id: string; fecha: string; sinLeer: boolean; c: ResumenConversacion }
  | { tipo: 'com'; id: string; fecha: string; sinLeer: boolean; c: Communication }
  | { tipo: 'aviso'; id: string; fecha: string; sinLeer: boolean; n: GuardianNotice };

const hora = (iso: string) => {
  const d = new Date(iso);
  const hoy = new Date();
  if (d.toDateString() === hoy.toDateString()) return d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
  return d.toLocaleDateString('es-AR', { day: 'numeric', month: 'short' });
};

const nombresDe = (c: ResumenConversacion, yo: string) =>
  c.participantes.filter(p => p.id !== yo).map(p => p.nombre).join(', ') || 'Solo vos';

/** El aviso de que la conversación la puede leer la dirección: se dice siempre. */
function AvisoSupervision({ soyParticipante }: { soyParticipante: boolean }) {
  return (
    <p className="msj-supervision" role="note">
      <ShieldCheck size={15} aria-hidden="true" />
      {soyParticipante
        ? 'En esta conversación hay un estudiante: la dirección de la escuela la puede leer y los mensajes no se borran. Así se cuida a todos.'
        : 'Estás viendo esta conversación como dirección (supervisión). No participás: no podés escribir acá.'}
    </p>
  );
}

// ── Una conversación abierta ──
function VistaConversacion({ id, yo, alVolver, alCambiar }: { id: string; yo: string; alVolver: () => void; alCambiar: () => void }) {
  const [conv, setConv] = useState<Conversacion | null | undefined>(undefined);
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);
  const finRef = useRef<HTMLDivElement>(null);
  const cantidad = useRef(0);

  const cargar = useCallback(async () => {
    try {
      const c = await verConversacion(id);
      setConv(c);
      if (c?.soyParticipante && c.sinLeer) marcarLeida(id).catch(console.error);
    } catch (err) {
      console.error(err);
      setConv(prev => (prev === undefined ? null : prev));
    }
  }, [id]);

  useEffect(() => {
    void cargar();
    // Mientras está abierta, se fija si llegó algo cada 8 s
    const t = window.setInterval(() => { if (document.visibilityState === 'visible') void cargar(); }, 8000);
    return () => window.clearInterval(t);
  }, [cargar]);

  // Bajar al último cuando llega uno nuevo
  useEffect(() => {
    const n = conv?.mensajes.length ?? 0;
    if (n !== cantidad.current) {
      cantidad.current = n;
      finRef.current?.scrollIntoView({ block: 'end' });
    }
  }, [conv?.mensajes.length]);

  if (conv === undefined) return <div className="msj-vista"><Esqueleto tipo="filas" cantidad={4} etiqueta="Cargando la conversación…" /></div>;
  if (conv === null) return <div className="msj-vista"><EstadoVacio compacto icono={MessagesSquare} titulo="No encontramos esta conversación" texto="Puede que no participes en ella." /></div>;

  const enviar = async () => {
    if (!texto.trim() || enviando) return;
    setEnviando(true);
    try {
      await enviarMensaje(id, yo, texto);
      setTexto('');
      await cargar();
      alCambiar();
    } catch (err) {
      avisar.error('No se pudo enviar', err instanceof Error ? err.message : '');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="msj-vista">
      <header className="msj-vista-cabeza">
        <button className="btn-icon msj-volver" onClick={alVolver} aria-label="Volver a la bandeja"><ArrowLeft size={18} /></button>
        <div className="msj-vista-titulo">
          <h3>{conv.asunto}</h3>
          <p>{conv.participantes.map(p => `${p.nombre}${p.id === yo ? ' (vos)' : ''} · ${p.detalle || NOMBRE_ROL[p.rol] || ''}`).join('  —  ')}</p>
        </div>
        {conv.soyParticipante && (
          <button className="btn btn-ghost btn-sm" onClick={async () => { await archivar(id, !conv.archivada); alCambiar(); alVolver(); }}
            title={conv.archivada ? 'Volver a la bandeja' : 'Archivar: vuelve sola si alguien escribe'}>
            {conv.archivada ? <ArchiveRestore size={15} /> : <Archive size={15} />} {conv.archivada ? 'Desarchivar' : 'Archivar'}
          </button>
        )}
      </header>

      {conv.conEstudiante && <AvisoSupervision soyParticipante={conv.soyParticipante} />}

      <div className="msj-mensajes" aria-live="polite">
        {conv.mensajes.map(m => {
          const mio = m.autorId === yo;
          return (
            <div key={m.id} className={`msj-burbuja ${mio ? 'mia' : ''}`}>
              {!mio && <span className="msj-autor">{m.autor}</span>}
              <p>{m.cuerpo}</p>
              <time dateTime={m.createdAt}>{hora(m.createdAt)}</time>
            </div>
          );
        })}
        <div ref={finRef} />
      </div>

      {conv.soyParticipante && (
        <div className="msj-escribir">
          <textarea
            value={texto}
            rows={2}
            maxLength={4000}
            placeholder="Escribí tu respuesta…"
            aria-label="Tu mensaje"
            onChange={e => setTexto(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); void enviar(); } }}
          />
          <button className="btn btn-primary" onClick={enviar} disabled={enviando || !texto.trim()} aria-label="Enviar">
            {enviando ? <Loader2 size={16} className="girando" /> : <Send size={16} />}
          </button>
        </div>
      )}
    </div>
  );
}

// ── Escribir un mensaje nuevo ──
function NuevoMensaje({ inicial, alCerrar, alCrear }: {
  inicial: { para: string[]; asunto: string; origen: 'mensaje' | 'comunicado' | 'citacion' };
  alCerrar: () => void;
  alCrear: (id: string) => void;
}) {
  const [contactos, setContactos] = useState<Persona[] | null>(null);
  const [para, setPara] = useState<string[]>(inicial.para);
  const [buscar, setBuscar] = useState('');
  const [asunto, setAsunto] = useState(inicial.asunto);
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { misContactos().then(setContactos).catch(() => setContactos([])); }, []);

  const elegidos = (contactos ?? []).filter(c => para.includes(c.id));
  const sugeridos = (contactos ?? [])
    .filter(c => !para.includes(c.id) && (!buscar.trim() || coincideBusqueda(`${c.nombre} ${c.detalle ?? ''} ${NOMBRE_ROL[c.rol] ?? ''}`, buscar)))
    .slice(0, 30);

  const enviar = async () => {
    if (!para.length || !asunto.trim() || !texto.trim() || enviando) return;
    setEnviando(true);
    setError('');
    try {
      alCrear(await iniciarConversacion(para, asunto, texto, inicial.origen));
    } catch (e) {
      // La base explica por qué no (por ejemplo, dos estudiantes en la misma conversación)
      setError(e instanceof Error ? e.message : 'No se pudo enviar.');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Dialogo abierto alCerrar={alCerrar} etiquetadoPor="msj-nuevo-titulo" className="msj-dialogo">
      <div className="msj-nuevo">
        <div className="msj-nuevo-cabeza">
          <h3 id="msj-nuevo-titulo">Nuevo mensaje</h3>
          <button className="btn-icon" onClick={alCerrar} aria-label="Cerrar"><X size={18} /></button>
        </div>

        <label className="msj-campo">
          <span>Para</span>
          {elegidos.length > 0 && (
            <span className="msj-elegidos">
              {elegidos.map(c => (
                <span key={c.id} className="msj-elegido">
                  {c.nombre}
                  <button onClick={() => setPara(p => p.filter(x => x !== c.id))} aria-label={`Quitar a ${c.nombre}`}><X size={12} /></button>
                </span>
              ))}
            </span>
          )}
          <span className="search-bar">
            <Search size={15} className="search-icon" aria-hidden="true" />
            <input className="search-input" value={buscar} onChange={e => setBuscar(e.target.value)}
              placeholder="Buscá por nombre, materia o curso…" aria-label="Buscar a quién escribirle" />
          </span>
        </label>
        {contactos === null ? <Esqueleto tipo="filas" cantidad={3} etiqueta="Cargando contactos…" /> : (
          <ul className="msj-contactos" aria-label="Personas a las que les podés escribir">
            {sugeridos.length === 0 && <li className="msj-vacio">{contactos.length === 0 ? 'Todavía no hay a quién escribirle.' : 'Nadie coincide con la búsqueda.'}</li>}
            {sugeridos.map(c => (
              <li key={c.id}>
                <button onClick={() => { setPara(p => [...p, c.id]); setBuscar(''); }}>
                  <strong>{c.nombre}</strong>
                  <span>{c.detalle || NOMBRE_ROL[c.rol]}</span>
                </button>
              </li>
            ))}
          </ul>
        )}

        <label className="msj-campo">
          <span>Asunto</span>
          <input className="msj-input" value={asunto} maxLength={160} onChange={e => setAsunto(e.target.value)} placeholder="De qué se trata" />
        </label>
        <label className="msj-campo">
          <span>Mensaje</span>
          <textarea className="msj-input" rows={5} maxLength={4000} value={texto} onChange={e => setTexto(e.target.value)} placeholder="Escribí tu mensaje…" />
        </label>

        {elegidos.some(c => c.rol === 'estudiante') && (
          <p className="msj-supervision"><ShieldCheck size={15} aria-hidden="true" /> Con un estudiante adentro, la conversación la puede leer la dirección y los mensajes no se borran.</p>
        )}
        {error && <p className="msj-error" role="alert">{error}</p>}

        <div className="msj-nuevo-pie">
          <button className="btn btn-outline btn-sm" onClick={alCerrar}>Cancelar</button>
          <button className="btn btn-primary btn-sm" onClick={enviar} disabled={enviando || !para.length || !asunto.trim() || !texto.trim()}>
            {enviando ? <Loader2 size={14} className="girando" /> : <Send size={14} />} Enviar
          </button>
        </div>
      </div>
    </Dialogo>
  );
}

export default function Mensajes() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const [pestania, setPestania] = useState<Pestania>('bandeja');
  const [convs, setConvs] = useState<ResumenConversacion[] | null>(null);
  const [comunicados, setComunicados] = useState<Communication[]>([]);
  const [avisos, setAvisos] = useState<GuardianNotice[]>([]);
  // ?c=<id> abre una conversación; ?para=<id>&asunto=… abre "Nuevo mensaje" ya completo
  const [abierto, setAbierto] = useState<Item | null>(() => {
    const c = params.get('c');
    return c ? { tipo: 'conv', id: `v-${c}`, fecha: '', sinLeer: false, c: { id: c } as ResumenConversacion } : null;
  });
  const [nuevo, setNuevo] = useState<{ para: string[]; asunto: string; origen: 'mensaje' | 'comunicado' | 'citacion' } | null>(() => {
    const para = params.get('para');
    if (!para) return null;
    const origen = params.get('origen');
    return { para: para.split(','), asunto: params.get('asunto') ?? '', origen: origen === 'comunicado' || origen === 'citacion' ? origen : 'mensaje' };
  });
  const [fallo, setFallo] = useState(false);
  const [buscar, setBuscar] = useState('');

  const esFamilia = user?.role === 'padre';
  const esDireccion = user?.role === 'director';

  const cargar = useCallback((): Promise<void> => {
    if (!user) return Promise.resolve();
    if (pestania === 'bandeja') {
      // Lo que llega de una sola vía también vive acá
      if (esFamilia) getNoticesForGuardian(user.id).then(setAvisos).catch(console.error);
      else getCommunicationsBySchool(user.schoolId).then(c => setComunicados(c.filter(x => x.fromUserId !== user.id))).catch(console.error);
    }
    const pedido = pestania === 'supervision' ? conversacionesSupervisadas() : misConversaciones(pestania === 'archivadas');
    return pedido
      .then(lista => { setConvs(lista); setFallo(false); })
      .catch(err => { console.error(err); setFallo(true); setConvs(prev => prev ?? []); });
  }, [user, pestania, esFamilia]);

  useEffect(() => {
    void cargar();
    const t = window.setInterval(() => { if (document.visibilityState === 'visible') void cargar(); }, 30000);
    return () => window.clearInterval(t);
  }, [cargar]);

  // Ya leídos: se limpian de la dirección para que recargar no los repita
  useEffect(() => {
    if (params.get('c') || params.get('para')) setParams({}, { replace: true });
  }, [params, setParams]);

  const items = useMemo<Item[]>(() => {
    if (!user) return [];
    const lista: Item[] = (convs ?? []).map(c => ({ tipo: 'conv', id: `v-${c.id}`, fecha: c.ultimoMensajeAt, sinLeer: c.sinLeer, c }));
    if (pestania === 'bandeja') {
      lista.push(...comunicados.map(c => ({ tipo: 'com' as const, id: `c-${c.id}`, fecha: c.sentAt, sinLeer: !c.readBy.includes(user.id), c })));
      lista.push(...avisos.map(n => ({ tipo: 'aviso' as const, id: `a-${n.id}`, fecha: n.createdAt, sinLeer: !n.readAt, n })));
    }
    return lista
      .filter(it => !buscar.trim() || coincideBusqueda(
        it.tipo === 'conv' ? `${it.c.asunto} ${it.c.participantes.map(p => p.nombre).join(' ')} ${it.c.ultimo?.cuerpo ?? ''}`
          : it.tipo === 'com' ? `${it.c.subject} ${it.c.fromName} ${it.c.body}` : `${it.n.title} ${it.n.fromName ?? ''} ${it.n.body}`, buscar))
      .sort((a, b) => b.fecha.localeCompare(a.fecha));
  }, [convs, comunicados, avisos, pestania, buscar, user]);

  if (!user) return null;

  const abrir = (it: Item) => {
    setAbierto(it);
    if (it.tipo === 'com' && it.sinLeer) {
      markCommunicationRead(it.c.id, user.id).then(() => {
        setComunicados(prev => prev.map(c => (c.id === it.c.id ? { ...c, readBy: [...c.readBy, user.id] } : c)));
        window.dispatchEvent(new Event(EVENTO_COMUNICADO_LEIDO));
      }).catch(console.error);
    }
    if (it.tipo === 'aviso' && it.sinLeer) {
      markNoticeRead(it.n.id, user.id).then(() => setAvisos(prev => prev.map(n => (n.id === it.n.id ? { ...n, readAt: new Date().toISOString() } : n)))).catch(console.error);
    }
  };

  const responder = (deQuien: string, asunto: string, origen: 'comunicado' | 'citacion') =>
    setNuevo({ para: [deQuien], asunto: asunto.startsWith('Re:') ? asunto : `Re: ${asunto}`.slice(0, 160), origen });

  const icono = (it: Item) => it.tipo === 'com' ? <Megaphone size={16} /> : it.tipo === 'aviso'
    ? (it.n.type === 'citacion' ? <CalendarClock size={16} /> : <Megaphone size={16} />)
    : it.c.conEstudiante ? <ShieldCheck size={16} /> : <MessagesSquare size={16} />;

  const sinLeer = items.filter(i => i.sinLeer).length;

  return (
    <div className={`msj ${abierto ? 'con-abierto' : ''}`}>
      {/* ── La bandeja ── */}
      <section className="card msj-lista" aria-label="Bandeja">
        <div className="msj-lista-cabeza">
          <div className="msj-pestanias" role="tablist" aria-label="Qué ver">
            <button role="tab" aria-selected={pestania === 'bandeja'} className={pestania === 'bandeja' ? 'activa' : ''} onClick={() => { setPestania('bandeja'); setAbierto(null); setConvs(null); }}>
              <Inbox size={14} /> Bandeja{sinLeer > 0 && pestania === 'bandeja' ? ` (${sinLeer})` : ''}
            </button>
            <button role="tab" aria-selected={pestania === 'archivadas'} className={pestania === 'archivadas' ? 'activa' : ''} onClick={() => { setPestania('archivadas'); setAbierto(null); setConvs(null); }}>
              <Archive size={14} /> Archivadas
            </button>
            {esDireccion && (
              <button role="tab" aria-selected={pestania === 'supervision'} className={pestania === 'supervision' ? 'activa' : ''} onClick={() => { setPestania('supervision'); setAbierto(null); setConvs(null); }}
                title="Conversaciones de docentes con estudiantes">
                <Eye size={14} /> Supervisión
              </button>
            )}
          </div>
          <button className="btn btn-primary btn-sm" onClick={() => setNuevo({ para: [], asunto: '', origen: 'mensaje' })}>
            <Plus size={15} /> Nuevo
          </button>
        </div>
        <div className="search-bar msj-buscar">
          <Search size={15} className="search-icon" aria-hidden="true" />
          <input className="search-input" value={buscar} onChange={e => setBuscar(e.target.value)} placeholder="Buscar en mensajes…" aria-label="Buscar en mensajes" />
        </div>
        {pestania === 'supervision' && (
          <p className="msj-supervision"><ShieldCheck size={15} aria-hidden="true" /> Las conversaciones con estudiantes de la escuela. Las podés leer, pero no escribir si no participás.</p>
        )}

        {convs === null ? <Esqueleto tipo="filas" cantidad={5} etiqueta="Cargando mensajes…" /> : (
          <ul className="msj-items">
            {fallo && <li className="msj-error" role="alert">No se pudieron traer los mensajes. Revisá la conexión.</li>}
            {items.length === 0 && !fallo && (
              <li>
                <EstadoVacio compacto icono={MessagesSquare}
                  titulo={buscar ? 'Nada coincide' : pestania === 'archivadas' ? 'No hay conversaciones archivadas' : pestania === 'supervision' ? 'No hay conversaciones con estudiantes' : 'Todavía no hay mensajes'}
                  texto={pestania === 'bandeja' && !buscar ? 'Acá llega todo: mensajes, comunicados y avisos de la escuela. Para escribir, tocá Nuevo.' : ''} />
              </li>
            )}
            {items.map(it => (
              <li key={it.id}>
                <button className={`msj-item ${it.sinLeer ? 'sin-leer' : ''} ${abierto?.id === it.id ? 'activo' : ''}`} onClick={() => abrir(it)}>
                  <span className="msj-item-icono" aria-hidden="true">{icono(it)}</span>
                  <span className="msj-item-cuerpo">
                    <span className="msj-item-fila">
                      <strong>{it.tipo === 'conv' ? nombresDe(it.c, user.id) : it.tipo === 'com' ? it.c.fromName || 'Dirección' : it.n.fromName || 'La escuela'}</strong>
                      <time>{hora(it.fecha)}</time>
                    </span>
                    <span className="msj-item-asunto">
                      {it.tipo !== 'conv' && <em className="msj-tipo">{it.tipo === 'com' ? 'Comunicado' : it.n.type === 'citacion' ? 'Citación' : 'Comunicado'}</em>}
                      {it.tipo === 'conv' ? it.c.asunto : it.tipo === 'com' ? it.c.subject : it.n.title}
                    </span>
                    <span className="msj-item-previa">
                      {it.tipo === 'conv' ? `${it.c.ultimo?.autor ?? ''}: ${it.c.ultimo?.cuerpo ?? ''}` : it.tipo === 'com' ? it.c.body.slice(0, 120) : it.n.body.slice(0, 120)}
                    </span>
                  </span>
                  {it.sinLeer && <span className="msj-punto" aria-label="Sin leer" />}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ── Lo abierto ── */}
      <section className="card msj-detalle" aria-label="Mensaje abierto">
        {!abierto ? (
          <EstadoVacio className="msj-nada" icono={MessagesSquare} titulo="Elegí un mensaje"
            texto="O escribí uno nuevo a un docente, a la dirección o a quien corresponda."
            accion={{ etiqueta: 'Nuevo mensaje', icono: Plus, alTocar: () => setNuevo({ para: [], asunto: '', origen: 'mensaje' }) }} />
        ) : abierto.tipo === 'conv' ? (
          <VistaConversacion key={abierto.c.id} id={abierto.c.id} yo={user.id} alVolver={() => setAbierto(null)} alCambiar={() => { void cargar(); window.dispatchEvent(new Event(EVENTO_MENSAJES)); }} />
        ) : abierto.tipo === 'com' ? (
          <div className="msj-vista">
            <header className="msj-vista-cabeza">
              <button className="btn-icon msj-volver" onClick={() => setAbierto(null)} aria-label="Volver a la bandeja"><ArrowLeft size={18} /></button>
              <div className="msj-vista-titulo">
                <h3>{abierto.c.subject}</h3>
                <p>Comunicado de {abierto.c.fromName || 'la dirección'} · {hora(abierto.c.sentAt)} · {abierto.c.toNames.join(', ')}</p>
              </div>
            </header>
            <div className="msj-comunicado">{abierto.c.body.split('\n').map((l, i) => <p key={i}>{l || <br />}</p>)}</div>
            <div className="msj-acciones">
              <button className="btn btn-primary btn-sm" onClick={() => responder(abierto.c.fromUserId, abierto.c.subject, 'comunicado')}>
                <Reply size={14} /> Responder a {abierto.c.fromName || 'la dirección'}
              </button>
            </div>
          </div>
        ) : (
          <div className="msj-vista">
            <header className="msj-vista-cabeza">
              <button className="btn-icon msj-volver" onClick={() => setAbierto(null)} aria-label="Volver a la bandeja"><ArrowLeft size={18} /></button>
              <div className="msj-vista-titulo">
                <h3>{abierto.n.title}</h3>
                <p>
                  {abierto.n.type === 'citacion' ? 'Citación' : 'Comunicado'} de {abierto.n.fromName || 'la escuela'}
                  {abierto.n.studentName ? ` · sobre ${abierto.n.studentName}` : ''}{abierto.n.subjectName ? ` · ${abierto.n.subjectName}` : ''}
                </p>
              </div>
            </header>
            {abierto.n.type === 'citacion' && abierto.n.meetingAt && (
              <p className="msj-cita"><CalendarClock size={15} aria-hidden="true" />
                {new Date(abierto.n.meetingAt).toLocaleString('es-AR', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}
                {abierto.n.meetingPlace ? ` · ${abierto.n.meetingPlace}` : ''}
              </p>
            )}
            <div className="msj-comunicado">{abierto.n.body.split('\n').map((l, i) => <p key={i}>{l || <br />}</p>)}</div>
            <div className="msj-acciones">
              {abierto.n.type === 'citacion' && (['asistire', 'no_puedo'] as const).map(r => (
                <button key={r} className={`btn btn-sm ${abierto.n.response === r ? 'btn-primary' : 'btn-outline'}`}
                  onClick={async () => {
                    try {
                      await respondToNotice(abierto.n.id, user.id, r);
                      setAvisos(prev => prev.map(n => (n.id === abierto.n.id ? { ...n, response: r } : n)));
                      setAbierto({ ...abierto, n: { ...abierto.n, response: r } });
                      avisar.exito('Respuesta enviada');
                    } catch { avisar.error('No se pudo enviar la respuesta'); }
                  }}>
                  {abierto.n.response === r && <Check size={14} />} {r === 'asistire' ? 'Asistiré' : 'No puedo'}
                </button>
              ))}
              <button className="btn btn-outline btn-sm" onClick={() => responder(abierto.n.fromUserId, abierto.n.title, abierto.n.type === 'citacion' ? 'citacion' : 'comunicado')}>
                <Reply size={14} /> Escribirle a {abierto.n.fromName || 'la escuela'}
              </button>
            </div>
          </div>
        )}
      </section>

      {nuevo && (
        <NuevoMensaje
          inicial={nuevo}
          alCerrar={() => setNuevo(null)}
          alCrear={async id => {
            setNuevo(null);
            setPestania('bandeja');
            await cargar();
            setAbierto({ tipo: 'conv', id: `v-${id}`, fecha: '', sinLeer: false, c: { id } as ResumenConversacion });
            avisar.exito('Mensaje enviado');
          }}
        />
      )}
    </div>
  );
}
