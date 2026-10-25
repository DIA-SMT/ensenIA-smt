/**
 * SMT EstudIA — Clase en vivo (invitado por QR)
 *
 * Pantalla pública: el que llega escaneó un QR proyectado y no tiene
 * cuenta ni la va a crear en el momento. Pone un nombre de pila y entra.
 *
 * Todo está pensado para un celular prestado, con datos flojos y en el
 * medio de una charla: un solo llamado por poll, nada que instalar, y
 * si se recarga la página sigue siendo el mismo participante.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { Radio, Send, Loader2, LogIn, CloudUpload } from 'lucide-react';
import {
    joinLiveSession, getGuestState, submitGuestResponse, sendGuestReaction,
    loadGuestSession, saveGuestSession, clearGuestSession, GuestError, getCompetenciaInvitado,
    preguntarInvitado, votarPreguntaInvitado,
    type GuestSession, type GuestState, type GuestPayload,
} from '../services/live-guest.service';
import { LIVE_KIND_META, LIVE_REACTIONS, type VistaCompetencia } from '../services/live.service';
import { useDesfaseServidor, useCuentaRegresiva, finDePregunta } from '../lib/competencia';
import { RelojCompetencia, MiResultado } from '../components/CompetenciaEnVivo';
import PreguntarEnVivo from '../components/PreguntarEnVivo';
import { LiveResultsView } from './ClaseEnVivo';
import { FEELING_META, type CheckinFeeling } from '../types';
import { Cargando } from '../components/ui/Esqueleto';
import SenialEnVivo from '../components/SenialEnVivo';
import { useSondeo } from '../lib/sondeo';
import './ClaseEnVivo.css';
import './ClaseEnVivoInvitado.css';

const POLL_MS = 2500;
const REACTION_COOLDOWN_MS = 3000;

export default function ClaseEnVivoInvitado() {
    const { codigo = '' } = useParams<{ codigo: string }>();
    const code = codigo.trim().toUpperCase();

    // undefined = todavía no miramos el localStorage
    const [guest, setGuest] = useState<GuestSession | null | undefined>(undefined);
    const [name, setName] = useState('');
    const [joining, setJoining] = useState(false);
    const [joinError, setJoinError] = useState('');

    const [state, setState] = useState<GuestState | null>(null);
    const [sending, setSending] = useState(false);
    const [sendError, setSendError] = useState('');

    const [textDraft, setTextDraft] = useState('');
    const [wordDraft, setWordDraft] = useState('');
    const lastActivityId = useRef<string | null>(null);
    const lastReactionAt = useRef(0);
    const [reactionFlash, setReactionFlash] = useState<string | null>(null);

    // ── Retomar la sala si ya había entrado desde este celular ──
    useEffect(() => {
        setGuest(loadGuestSession(code));
    }, [code]);

    // Sin señal, la respuesta queda acá y sale en la primera vuelta que ande
    // (071). En sessionStorage: si se recarga la página, sigue ahí.
    const [pendiente, setPendiente] = useState<{ activityId: string; payload: GuestPayload } | null>(null);
    const pendienteRef = useRef<typeof pendiente>(null);
    const clavePendiente = guest ? `estudia_vivo_pendiente_invitado:${guest.token}` : null;
    const ponerPendiente = useCallback((p: typeof pendiente) => {
        pendienteRef.current = p;
        setPendiente(p);
        if (!clavePendiente) return;
        try {
            if (p) sessionStorage.setItem(clavePendiente, JSON.stringify(p));
            else sessionStorage.removeItem(clavePendiente);
        } catch { /* sin almacenamiento: queda en memoria */ }
    }, [clavePendiente]);
    useEffect(() => {
        if (!clavePendiente) return;
        try {
            const v = sessionStorage.getItem(clavePendiente);
            const p = v ? JSON.parse(v) as { activityId: string; payload: GuestPayload } : null;
            pendienteRef.current = p;
            setPendiente(p);
        } catch { /* nada guardado */ }
    }, [clavePendiente]);
    // Lo último que eligió: una vuelta que salió antes trae lo de antes y no lo pisa
    const versionRef = useRef(0);
    const elegidaRef = useRef<{ activityId: string; payload: GuestPayload } | null>(null);

    // Competencia (073): el reloj va con la hora del servidor; revelada cada
    // pregunta, cómo le fue (se pide una vez por pregunta)
    const { desfase, medir } = useDesfaseServidor();
    const [miComp, setMiComp] = useState<{ actividad: string; ronda: string; vista: VistaCompetencia | null } | null>(null);
    const miCompPedidaRef = useRef<string | null>(null);

    // ── Una vuelta: un solo llamado, sin encimarse (lib/sondeo) ──
    const vuelta = useCallback(async (senal: AbortSignal) => {
        if (!guest) return;
        const version = versionRef.current;
        let s: GuestState;
        try {
            s = await getGuestState(guest.token, senal);
        } catch (err) {
            // El token dejó de existir (se reinició la sala): volvemos a
            // la puerta en vez de dejarlo mirando una pantalla muerta.
            if (err instanceof GuestError && err.code === 'INVITADO_DESCONOCIDO') {
                clearGuestSession(code);
                setGuest(null);
                setJoinError(err.message);
                return;
            }
            throw err;
        }
        if (s.status === 'active' || s.status === 'idle') medir(s.ahora);
        if (s.status === 'active') {
            const act = s.activity;
            const comp = act.config.competencia;
            if (comp && act.status === 'revealed' && miCompPedidaRef.current !== act.id) {
                miCompPedidaRef.current = act.id;
                getCompetenciaInvitado(guest.token, comp.ronda)
                    .then(vista => setMiComp({ actividad: act.id, ronda: comp.ronda, vista }))
                    .catch(() => { miCompPedidaRef.current = null; });
            }
            // Otra actividad que no es de esa ronda: lo de la competencia ya pasó
            setMiComp(prev => (prev && comp?.ronda !== prev.ronda ? null : prev));
        }
        // Actividad nueva → limpiamos los borradores de la anterior
        const actId = s.status === 'active' ? s.activity.id : null;
        if (actId !== lastActivityId.current) {
            lastActivityId.current = actId;
            setTextDraft('');
            setWordDraft('');
            setSendError('');
        }
        // Lo que el servidor tiene de verdad (antes de mostrar lo recién elegido)
        const delServidor = s.status === 'active' ? s.myAnswer : null;
        // Eligió algo mientras viajaba esta vuelta: se ve lo que eligió
        const elegida = elegidaRef.current;
        if (versionRef.current !== version && elegida && s.status === 'active' && s.activity.id === elegida.activityId) {
            s = { ...s, myAnswer: elegida.payload as Record<string, unknown> };
        }
        // Hay señal: la respuesta que quedó esperando sale ahora (con los
        // botones quietos, para que no se cruce con otra)
        const p = pendienteRef.current;
        if (p) {
            if (s.status !== 'active' || s.activity.id !== p.activityId || s.activity.status !== 'active') {
                ponerPendiente(null);
                // Si el servidor ya la tiene, llegó (se había perdido solo la confirmación)
                if (!(s.status === 'active' && s.activity.id === p.activityId && delServidor)) {
                    setSendError('Tu respuesta no llegó a salir: la actividad se cerró mientras no había señal.');
                }
            } else {
                setSending(true);
                try {
                    await submitGuestResponse(guest.token, p.activityId, p.payload);
                    if (pendienteRef.current === p) ponerPendiente(null);
                    s = { ...s, myAnswer: p.payload as Record<string, unknown> };
                } catch (err) {
                    if (err instanceof GuestError && err.code === 'SIN_SENIAL') throw err;
                    if (pendienteRef.current === p) ponerPendiente(null);
                    // Ya había llegado (en la competencia vale la primera): no es un error
                    if (!(err instanceof GuestError && err.code === 'RESPUESTA_YA_ENVIADA')) {
                        setSendError(err instanceof Error ? err.message : 'No se pudo enviar.');
                    }
                } finally {
                    setSending(false);
                }
            }
        }
        setState(s);
    }, [guest, code, ponerPendiente, medir]);

    const sondeo = useSondeo(vuelta, POLL_MS, Boolean(guest));
    const actividadEnPantalla = state?.status === 'active' ? state.activity : null;
    const quedan = useCuentaRegresiva(finDePregunta(actividadEnPantalla, actividadEnPantalla?.creada), desfase);

    // ── Entrar ──
    const handleJoin = async () => {
        if (joining) return;
        setJoining(true);
        setJoinError('');
        try {
            const g = await joinLiveSession(code, name);
            saveGuestSession(code, g);
            setGuest(g);
        } catch (err) {
            setJoinError(err instanceof GuestError && err.code === 'SIN_SENIAL'
                ? 'Sin señal. Probá de nuevo en unos segundos.'
                : err instanceof Error ? err.message : 'No se pudo entrar.');
        } finally {
            setJoining(false);
        }
    };

    const submit = async (payload: GuestPayload) => {
        if (!guest || state?.status !== 'active' || sending) return;
        const activityId = state.activity.id;
        versionRef.current++;
        elegidaRef.current = { activityId, payload };
        setSending(true);
        setSendError('');
        try {
            await submitGuestResponse(guest.token, activityId, payload);
            ponerPendiente(null);
            // Optimista: el poll confirma en menos de 3 segundos
            setState({ ...state, myAnswer: payload as Record<string, unknown> });
            sondeo.ahora();
        } catch (err) {
            if (err instanceof GuestError && err.code === 'SIN_SENIAL') {
                // Queda guardada y sale sola cuando vuelva la señal
                ponerPendiente({ activityId, payload });
            } else if (err instanceof GuestError && err.code === 'RESPUESTA_YA_ENVIADA') {
                // Ya había llegado (un reintento): en la competencia vale la primera
                ponerPendiente(null);
                sondeo.ahora();
            } else {
                // La rechazó el servidor: no se muestra como elegida
                if (elegidaRef.current?.activityId === activityId) elegidaRef.current = null;
                setSendError(err instanceof Error ? err.message : 'No se pudo enviar.');
            }
        } finally {
            setSending(false);
        }
    };

    const react = (emoji: string) => {
        if (!guest) return;
        const now = Date.now();
        if (now - lastReactionAt.current < REACTION_COOLDOWN_MS) return;
        lastReactionAt.current = now;
        setReactionFlash(emoji);
        setTimeout(() => setReactionFlash(null), 900);
        sendGuestReaction(guest.token, emoji).catch(() => { /* el servidor ya frena el spam */ });
    };

    // ══════════════════════════════════════
    // Puerta: nombre y a la sala
    // ══════════════════════════════════════
    if (guest === undefined) {
        return <div className="inv-shell"><Cargando texto="Abriendo la sala…" /></div>;
    }

    if (guest === null) {
        return (
            <div className="inv-shell">
                <div className="inv-card animate-in">
                    <div className="inv-brand">
                        <span className="inv-logo">SMT EstudIA</span>
                        <span className="inv-code">Sala {code}</span>
                    </div>
                    <h1 className="inv-title">Entrá a la clase</h1>
                    <p className="inv-sub">
                        Poné tu nombre para que el docente sepa quién está. Lo que respondas
                        es anónimo para el resto de los participantes.
                    </p>
                    <input
                        className="inv-input"
                        placeholder="Tu nombre"
                        value={name}
                        maxLength={40}
                        autoFocus
                        onChange={e => setName(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') handleJoin(); }}
                    />
                    {joinError && <p className="inv-error">{joinError}</p>}
                    <button className="inv-btn" onClick={handleJoin} disabled={joining}>
                        {joining ? <Loader2 size={17} className="spin" /> : <LogIn size={17} />}
                        {joining ? 'Entrando...' : 'Entrar'}
                    </button>
                    <p className="inv-foot">No hace falta crear cuenta ni instalar nada.</p>
                </div>
            </div>
        );
    }

    // ══════════════════════════════════════
    // Adentro
    // ══════════════════════════════════════
    if (state?.status === 'ended' || state?.status === 'cerrada' || state?.status === 'expulsado') {
        const [titulo, texto] = state.status === 'ended'
            ? ['Terminó la clase', `Gracias por participar, ${guest.displayName}.`]
            : state.status === 'cerrada' || (state.status === 'expulsado' && state.motivo === 'sala_cerrada')
                ? ['La sala se cerró a invitados', 'El docente cerró la participación sin cuenta. Gracias por participar.']
                : ['Ya no estás en la sala', 'El docente te sacó de la clase.'];
        return (
            <div className="inv-shell">
                <div className="inv-card animate-in">
                    <div className="inv-brand"><span className="inv-logo">SMT EstudIA</span></div>
                    <h1 className="inv-title">{titulo}</h1>
                    <p className="inv-sub">{texto}</p>
                </div>
            </div>
        );
    }

    const activity = state?.status === 'active' ? state.activity : null;
    // La que espera señal se ve elegida igual
    const esperandoSenial = pendiente !== null && pendiente.activityId === activity?.id;
    const myAnswer = esperandoSenial ? pendiente.payload as Record<string, unknown>
        : state?.status === 'active' ? state.myAnswer : null;
    const results = state?.status === 'active' ? state.results : null;
    const reactionsEnabled = state?.status === 'active' || state?.status === 'idle'
        ? state.reactionsEnabled : false;
    const title = state?.status === 'active' || state?.status === 'idle' ? state.title : '';
    // Preguntas del público (074)
    const preguntasAbiertas = state?.status === 'active' || state?.status === 'idle' ? Boolean(state.preguntasAbiertas) : false;
    const preguntas = state?.status === 'active' || state?.status === 'idle' ? state.preguntas?.lista ?? [] : [];
    const answered = myAnswer !== null && myAnswer !== undefined;
    // Competencia: una sola respuesta, y con tiempo
    const comp = activity?.config.competencia ?? null;
    const sinTiempo = Boolean(comp) && quedan !== null && quedan <= 0;
    const canChange = activity?.status === 'active' && !(comp && (answered || sinTiempo));

    return (
        <div className="inv-live cv-container animate-in">
            <div className="card cv-header cv-header-student">
                <div className="cv-header-info">
                    <span className="cv-live-dot" />
                    <div>
                        <h3>{title || 'Clase en vivo'}</h3>
                        <p className="text-xs text-subtle">
                            Entraste como {guest.displayName} · tus respuestas son anónimas
                        </p>
                    </div>
                </div>
            </div>

            <SenialEnVivo fallas={sondeo.fallas} deRed={sondeo.deRed} ultimaOk={sondeo.ultimaOk} detalle="Seguí en esta pantalla: lo que respondas sale solo cuando se pueda." />

            {activity ? (
                <div className="card cv-activity">
                    <div className="cv-activity-head">
                        <span className="badge badge-ia">
                            {comp ? '🏆 Competencia' : `${LIVE_KIND_META[activity.kind].emoji} ${LIVE_KIND_META[activity.kind].label}`}
                        </span>
                        {esperandoSenial
                            ? <span className="badge badge-warning">Esperando señal</span>
                            : answered && <span className="badge badge-success">✓ Respondiste</span>}
                    </div>
                    {esperandoSenial && (
                        <p className="cv-pendiente" role="status">
                            <CloudUpload size={14} aria-hidden="true" /> Tu respuesta quedó guardada en el celular y sale sola cuando vuelva la señal.
                        </p>
                    )}
                    {activity.config.question && <h3 className="cv-question">{activity.config.question}</h3>}
                    {comp && activity.status === 'active' && <RelojCompetencia quedan={quedan} total={comp.segundos} />}

                    {activity.kind === 'checkin' && (
                        <div className="cv-feelings">
                            {(Object.entries(FEELING_META) as [CheckinFeeling, typeof FEELING_META[CheckinFeeling]][]).map(([key, meta]) => (
                                <button
                                    key={key}
                                    className={`cv-feeling-btn ${myAnswer?.feeling === key ? 'selected' : ''}`}
                                    disabled={!canChange || sending}
                                    onClick={() => submit({ feeling: key })}
                                >
                                    <span className="cv-feeling-emoji">{meta.emoji}</span>
                                    <span className="cv-feeling-label">{meta.label}</span>
                                </button>
                            ))}
                        </div>
                    )}

                    {(activity.kind === 'quiz' || activity.kind === 'encuesta') && (
                        <div className="cv-answer-options">
                            {(activity.config.options ?? []).map((opt, i) => {
                                const mine = myAnswer?.opcion === opt.id;
                                const revealed = activity.status === 'revealed';
                                // correctId solo llega cuando el docente reveló
                                const correct = activity.config.correctId === opt.id;
                                const cls = revealed && activity.kind === 'quiz'
                                    ? (correct ? 'correct' : mine ? 'wrong' : 'dim')
                                    : mine ? 'selected' : '';
                                return (
                                    <button
                                        key={opt.id}
                                        className={`cv-answer-option ${cls}`}
                                        disabled={!canChange || sending}
                                        onClick={() => submit({ opcion: opt.id })}
                                    >
                                        <span className="sc-option-letter">{String.fromCharCode(65 + i)}</span>
                                        <span>{opt.label}</span>
                                        {revealed && correct && ' ✅'}
                                    </button>
                                );
                            })}
                            {canChange && answered && (
                                <p className="text-xs text-subtle">Podés cambiar tu respuesta hasta que se cierre.</p>
                            )}
                            {comp && activity.status === 'active' && (answered || sinTiempo) && (
                                <p className="text-xs text-subtle">
                                    {!answered ? 'Se terminó el tiempo.'
                                        : esperandoSenial ? 'Tu respuesta espera señal: si llega cuando ya terminó el tiempo, no cuenta.'
                                        : 'Listo: vale la primera. Esperá a que termine el tiempo.'}
                                </p>
                            )}
                        </div>
                    )}

                    {activity.kind === 'chips' && (
                        <div className="cv-answer-options">
                            {(activity.config.options ?? []).map(opt => {
                                const base = (myAnswer?.selected as string[] | undefined) ?? [];
                                const on = base.includes(opt.id);
                                return (
                                    <button
                                        key={opt.id}
                                        className={`cv-chip ${on ? 'selected' : ''}`}
                                        disabled={!canChange || sending}
                                        onClick={() => submit({
                                            selected: on ? base.filter(x => x !== opt.id) : [...base, opt.id],
                                        })}
                                    >
                                        {opt.label}
                                    </button>
                                );
                            })}
                        </div>
                    )}

                    {activity.kind === 'nube' && canChange && (
                        <div className="cv-text-form">
                            <input
                                className="cv-input"
                                placeholder="Una palabra..."
                                value={wordDraft || String(myAnswer?.palabra ?? '')}
                                maxLength={24}
                                onChange={e => setWordDraft(e.target.value.replace(/\s+/g, ' '))}
                            />
                            <button
                                className="btn btn-primary btn-sm"
                                disabled={sending || !(wordDraft.trim() || myAnswer?.palabra)}
                                onClick={() => submit({ palabra: wordDraft.trim().split(' ')[0] })}
                            >
                                {sending ? <Loader2 size={14} className="spin" /> : <Send size={14} />}
                            </button>
                        </div>
                    )}

                    {activity.kind === 'texto' && canChange && (
                        <div className="cv-text-form cv-text-form-multi">
                            <textarea
                                className="cv-input"
                                rows={2}
                                placeholder="Escribí tu respuesta..."
                                value={textDraft || String(myAnswer?.texto ?? '')}
                                maxLength={280}
                                onChange={e => setTextDraft(e.target.value)}
                            />
                            <button
                                className="btn btn-primary btn-sm"
                                disabled={sending || !(textDraft.trim() || myAnswer?.texto)}
                                onClick={() => submit({ texto: textDraft.trim() })}
                            >
                                {sending ? <Loader2 size={14} className="spin" /> : <Send size={14} />}
                            </button>
                        </div>
                    )}

                    {sendError && <p className="inv-error">{sendError}</p>}

                    {answered && !comp && (
                        <div className="cv-student-results">
                            <p className="cv-results-label">Así viene la sala:</p>
                            <LiveResultsView activity={activity} results={results} />
                        </div>
                    )}

                    {/* Competencia: revelada, cómo le fue y en qué puesto va (solo el suyo) */}
                    {comp && activity.status === 'revealed' && (
                        <div className="cv-comp-mio">
                            <MiResultado
                                vista={miComp?.actividad === activity.id ? miComp.vista : null}
                                acerto={Boolean(activity.config.correctId) && myAnswer?.opcion === activity.config.correctId}
                                respondio={answered}
                            />
                        </div>
                    )}
                </div>
            ) : (
                <div className="card cv-idle">
                    <div className="inv-idle-icon"><Radio size={22} /></div>
                    <p className="text-secondary">
                        Listo, ya estás adentro. Cuando lancen una actividad, aparece sola acá.
                    </p>
                    {miComp?.vista && (
                        <div className="cv-comp-mio">
                            <MiResultado vista={miComp.vista} acerto={false} respondio={false} final />
                        </div>
                    )}
                </div>
            )}

            <PreguntarEnVivo
                abiertas={preguntasAbiertas}
                preguntas={preguntas}
                enviar={texto => preguntarInvitado(guest.token, texto)}
                votar={(id, voto) => votarPreguntaInvitado(guest.token, id, voto)}
                motivo={err => (err instanceof GuestError
                    ? (err.code === 'SIN_SENIAL' ? 'Sin señal: no salió. Probá de nuevo cuando vuelva.' : err.message)
                    : 'No se pudo. Probá de nuevo.')}
                refrescar={sondeo.ahora}
                invitado
            />

            {reactionsEnabled && (
                <div className="cv-reaction-bar card">
                    {LIVE_REACTIONS.map(r => (
                        <button
                            key={r.emoji}
                            className={`cv-reaction-btn ${reactionFlash === r.emoji ? 'flash' : ''}`}
                            title={r.label}
                            onClick={() => react(r.emoji)}
                        >
                            <span>{r.emoji}</span>
                            <span className="cv-reaction-label">{r.label}</span>
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}
