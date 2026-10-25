/**
 * Preguntas del público en el panel del docente (074): las abre o las
 * cierra, decide si las revisa antes de que las vean todos, las muestra en
 * el proyector de a una, las marca como respondidas o las saca.
 *
 * Quién preguntó queda oculto hasta que lo pide: este panel suele estar
 * espejado en el proyector, y con el nombre a la vista nadie se anima. Por
 * lo mismo, una pregunta que espera revisión no se lee hasta que la abre.
 */

import { useState } from 'react';
import { ChevronUp, MessageCircleQuestion, MonitorPlay, Check, X, Eye, Undo2 } from 'lucide-react';
import {
    setPreguntasAbiertas, setPreguntasModeradas, moderarPregunta,
    type LiveSession, type PreguntaPublico, type PreguntasDelPublico, type AccionPregunta,
} from '../services/live.service';
import { avisar } from './ui/avisar';
import './PreguntasEnVivo.css';

interface Props {
    session: LiveSession;
    preguntas: PreguntasDelPublico;
    onSession: (s: LiveSession) => void;
    /** Cambio optimista de una pregunta (la próxima vuelta trae lo de verdad) */
    onPregunta: (id: string, cambio: Partial<PreguntaPublico> | null) => void;
    refrescar: () => void;
}

export default function ModerarPreguntas({ session, preguntas, onSession, onPregunta, refrescar }: Props) {
    const [verAutor, setVerAutor] = useState(false);
    // Las que esperan revisión que ya abrió (las demás no muestran el texto)
    const [leidas, setLeidas] = useState<Set<string>>(() => new Set());
    const abiertas = session.preguntasAbiertas;
    const { lista, retenidas } = preguntas;

    const alternarAbiertas = async () => {
        const next = !abiertas;
        onSession({ ...session, preguntasAbiertas: next });
        try {
            await setPreguntasAbiertas(session.id, next);
        } catch (err) {
            console.error(err);
            onSession({ ...session, preguntasAbiertas: !next });
            avisar.error('No se pudo cambiar. Probá de nuevo.');
        }
    };

    const alternarModeradas = async () => {
        const next = !session.preguntasModeradas;
        onSession({ ...session, preguntasModeradas: next });
        try {
            await setPreguntasModeradas(session.id, next);
        } catch (err) {
            console.error(err);
            onSession({ ...session, preguntasModeradas: !next });
            avisar.error('No se pudo cambiar. Probá de nuevo.');
        }
    };

    const hacer = async (p: PreguntaPublico, accion: AccionPregunta) => {
        const cambio: Partial<PreguntaPublico> | null =
            accion === 'mostrar' ? { estado: 'visible' }
            : accion === 'destacar' ? { destacada: true, estado: 'visible' }
            : accion === 'no_destacar' ? { destacada: false }
            : accion === 'respondida' ? { estado: 'respondida', destacada: false }
            : accion === 'volver' ? { estado: 'visible' }
            : null; // ocultar: sale de la lista
        // Una sola en pantalla a la vez
        if (accion === 'destacar') lista.filter(x => x.destacada && x.id !== p.id).forEach(x => onPregunta(x.id, { destacada: false }));
        onPregunta(p.id, cambio);
        try {
            await moderarPregunta(p.id, accion);
            // Otra vez: una vuelta que salió antes de que se guardara no lo pisa
            onPregunta(p.id, cambio);
        } catch (err) {
            console.error(err);
            avisar.error('No se pudo. Probá de nuevo.');
        } finally {
            refrescar();
        }
    };

    const pendientes = lista.filter(p => p.estado === 'pendiente');
    const visibles = lista.filter(p => p.estado === 'visible');
    const respondidas = lista.filter(p => p.estado === 'respondida');

    const fila = (p: PreguntaPublico) => {
        // Espera revisión y todavía no la abrió: ni el texto ni quién (puede estar proyectado)
        if (p.estado === 'pendiente' && !leidas.has(p.id)) {
            return (
                <li key={p.id} className="pq-item pq-cerrada">
                    <span className="pq-texto"><em>Pregunta para revisar</em></span>
                    <span className="pq-acciones">
                        <button type="button" className="btn btn-outline btn-sm" onClick={() => setLeidas(s => new Set(s).add(p.id))}>
                            <Eye size={13} aria-hidden="true" /> Leerla
                        </button>
                        <button type="button" className="btn-icon" aria-label="Sacar esta pregunta sin leerla" title="Sacarla (nadie más la ve)"
                            onClick={() => hacer(p, 'ocultar')}>
                            <X size={14} aria-hidden="true" />
                        </button>
                    </span>
                </li>
            );
        }
        return (
            <li key={p.id} className={`pq-item ${p.destacada ? 'destacada' : ''}`}>
                <span className="pq-votos" aria-label={`${p.votos} votos`}><ChevronUp size={14} aria-hidden="true" />{p.votos}</span>
                <span className="pq-texto">
                    {p.texto}
                    {verAutor && p.autor && <small>{p.autor}</small>}
                    {p.destacada && <small className="pq-en-pantalla">En el proyector</small>}
                </span>
                <span className="pq-acciones">
                    {p.estado === 'pendiente' && (
                        <button type="button" className="btn btn-primary btn-sm" onClick={() => hacer(p, 'mostrar')}>
                            <Eye size={13} aria-hidden="true" /> Mostrar
                        </button>
                    )}
                    {p.estado !== 'respondida' && (
                        <button type="button" className="btn btn-outline btn-sm" onClick={() => hacer(p, p.destacada ? 'no_destacar' : 'destacar')}
                            title={p.destacada ? 'Sacarla del proyector' : 'Mostrarla grande en el proyector'}>
                            <MonitorPlay size={13} aria-hidden="true" /> {p.destacada ? 'Sacar de pantalla' : 'Proyectar'}
                        </button>
                    )}
                    {p.estado === 'visible' && (
                        <button type="button" className="btn btn-outline btn-sm" onClick={() => hacer(p, 'respondida')}>
                            <Check size={13} aria-hidden="true" /> Respondida
                        </button>
                    )}
                    {p.estado === 'respondida' && (
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => hacer(p, 'volver')}>
                            <Undo2 size={13} aria-hidden="true" /> Volver a la lista
                        </button>
                    )}
                    <button type="button" className="btn-icon" aria-label={`Sacar la pregunta: ${p.texto}`} title="Sacarla (nadie más la ve)"
                        onClick={() => hacer(p, 'ocultar')}>
                        <X size={14} aria-hidden="true" />
                    </button>
                </span>
            </li>
        );
    };

    return (
        <section className="card pq pq-docente" aria-labelledby="pqd-titulo">
            <div className="pq-head">
                <h4 id="pqd-titulo"><MessageCircleQuestion size={16} aria-hidden="true" /> Preguntas del público</h4>
                <button type="button" className={`cv-toggle ${abiertas ? 'on' : ''}`} onClick={alternarAbiertas}
                    aria-pressed={abiertas}
                    title={abiertas ? 'Abiertas: mandan preguntas desde el celular. Tocá para cerrarlas.' : 'Cerradas. Tocá para abrirlas.'}>
                    <span>{abiertas ? 'Abiertas' : 'Cerradas'}</span>
                    <span className={`cv-toggle-pill ${abiertas ? 'on' : ''}`} />
                </button>
            </div>
            {!abiertas && lista.length === 0 && (
                <p className="text-xs text-subtle">
                    Abrilas y mandan preguntas desde el celular, anónimas para el resto (vos sí ves quién). Votan las de los
                    demás y las más votadas suben. Sirve para cerrar un tema o para una charla con invitados.
                </p>
            )}
            {(abiertas || lista.length > 0) && (
                <div className="pq-opciones">
                    {abiertas && (
                        <label className="cv-groupmode">
                            <input type="checkbox" checked={session.preguntasModeradas} onChange={alternarModeradas} />
                            Revisarlas antes de que las vean todos
                        </label>
                    )}
                    {/* Siempre a mano para apagarlo (también con las preguntas cerradas) */}
                    {lista.length > 0 && (
                        <label className="cv-groupmode">
                            <input type="checkbox" checked={verAutor} onChange={e => setVerAutor(e.target.checked)} />
                            Ver quién preguntó
                        </label>
                    )}
                </div>
            )}
            {/* Sin quién ni qué: el panel puede estar proyectado (como en la 067) */}
            {retenidas > 0 && (
                <p className="cv-retenidas" role="status">
                    {retenidas === 1 ? '1 pregunta retenida' : `${retenidas} preguntas retenidas`}: puede ser algo que preocupa.
                    No la ve nadie más. Está en Alertas.
                </p>
            )}
            {pendientes.length > 0 && (
                <>
                    <p className="pq-subtitulo">Esperan que las revises ({pendientes.length})</p>
                    <ol className="pq-lista">{pendientes.map(fila)}</ol>
                </>
            )}
            {visibles.length > 0 && <ol className="pq-lista">{visibles.map(fila)}</ol>}
            {abiertas && pendientes.length === 0 && visibles.length === 0 && (
                <p className="text-xs text-subtle">Todavía no llegó ninguna.</p>
            )}
            {respondidas.length > 0 && (
                <details className="pq-respondidas">
                    <summary>Respondidas ({respondidas.length})</summary>
                    <ol className="pq-lista">{respondidas.map(fila)}</ol>
                </details>
            )}
        </section>
    );
}
