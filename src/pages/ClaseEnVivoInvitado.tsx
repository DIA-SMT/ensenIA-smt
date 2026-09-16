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
import { Radio, Send, Loader2, LogIn } from 'lucide-react';
import {
    joinLiveSession, getGuestState, submitGuestResponse, sendGuestReaction,
    loadGuestSession, saveGuestSession, clearGuestSession, GuestError,
    type GuestSession, type GuestState, type GuestPayload,
} from '../services/live-guest.service';
import { LIVE_KIND_META, LIVE_REACTIONS } from '../services/live.service';
import { LiveResultsView } from './ClaseEnVivo';
import { FEELING_META, type CheckinFeeling } from '../types';
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

    // ── Poll ──
    const poll = useCallback(async () => {
        if (!guest) return;
        try {
            const s = await getGuestState(guest.token);
            setState(s);
            // Actividad nueva → limpiamos los borradores de la anterior
            const actId = s.status === 'active' ? s.activity.id : null;
            if (actId !== lastActivityId.current) {
                lastActivityId.current = actId;
                setTextDraft('');
                setWordDraft('');
                setSendError('');
            }
        } catch (err) {
            // El token dejó de existir (se reinició la sala): volvemos a
            // la puerta en vez de dejarlo mirando una pantalla muerta.
            if (err instanceof GuestError && err.code === 'INVITADO_DESCONOCIDO') {
                clearGuestSession(code);
                setGuest(null);
                setJoinError(err.message);
            }
        }
    }, [guest, code]);

    useEffect(() => {
        if (!guest) return;
        poll();
        const id = window.setInterval(poll, POLL_MS);
        return () => window.clearInterval(id);
    }, [guest, poll]);

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
            setJoinError(err instanceof Error ? err.message : 'No se pudo entrar.');
        } finally {
            setJoining(false);
        }
    };

    const submit = async (payload: GuestPayload) => {
        if (!guest || state?.status !== 'active' || sending) return;
        setSending(true);
        setSendError('');
        try {
            await submitGuestResponse(guest.token, state.activity.id, payload);
            // Optimista: el poll confirma en menos de 3 segundos
            setState({ ...state, myAnswer: payload as Record<string, unknown> });
        } catch (err) {
            setSendError(err instanceof Error ? err.message : 'No se pudo enviar.');
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
        return <div className="inv-shell"><Loader2 size={22} className="spin" /></div>;
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
    if (state?.status === 'ended') {
        return (
            <div className="inv-shell">
                <div className="inv-card animate-in">
                    <div className="inv-brand"><span className="inv-logo">SMT EstudIA</span></div>
                    <h1 className="inv-title">Terminó la clase</h1>
                    <p className="inv-sub">Gracias por participar, {guest.displayName}.</p>
                </div>
            </div>
        );
    }

    const activity = state?.status === 'active' ? state.activity : null;
    const myAnswer = state?.status === 'active' ? state.myAnswer : null;
    const results = state?.status === 'active' ? state.results : null;
    const reactionsEnabled = state?.status === 'active' || state?.status === 'idle'
        ? state.reactionsEnabled : false;
    const title = state?.status === 'active' || state?.status === 'idle' ? state.title : '';
    const answered = myAnswer !== null && myAnswer !== undefined;
    const canChange = activity?.status === 'active';

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

            {activity ? (
                <div className="card cv-activity">
                    <div className="cv-activity-head">
                        <span className="badge badge-ia">
                            {LIVE_KIND_META[activity.kind].emoji} {LIVE_KIND_META[activity.kind].label}
                        </span>
                        {answered && <span className="badge badge-success">✓ Respondiste</span>}
                    </div>
                    {activity.config.question && <h3 className="cv-question">{activity.config.question}</h3>}

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

                    {answered && (
                        <div className="cv-student-results">
                            <p className="cv-results-label">Así viene la sala:</p>
                            <LiveResultsView activity={activity} results={results} />
                        </div>
                    )}
                </div>
            ) : (
                <div className="card cv-idle">
                    <div className="inv-idle-icon"><Radio size={22} /></div>
                    <p className="text-secondary">
                        Listo, ya estás adentro. Cuando lancen una actividad, aparece sola acá.
                    </p>
                </div>
            )}

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
