/**
 * SMT EstudIA — Clase en vivo (pantalla del estudiante)
 *
 * El celular como forma de participar en el aula, sin apps ni códigos:
 * aparece la actividad que el docente lanzó, respondés (podés cambiar
 * hasta que se cierre) y ves los resultados del grupo en vivo — siempre
 * anónimos entre compañeros. Si el docente prende la botonera, también
 * podés mandar emojis (incluidos 🐢 "más despacio" y ❓ "no entiendo").
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Radio, Send, ArrowLeft, Loader2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { getStudentByUserId } from '../services/activities.service';
import {
    getLiveSessionForCourse, getSessionState, getLiveResults,
    upsertLiveResponse, getMyLiveResponse, sendLiveReaction, saveLiveCheckin,
    sendHeartbeat, LIVE_KIND_META, LIVE_REACTIONS,
    type LiveSession, type LiveActivity, type LiveResults,
} from '../services/live.service';
import { getMyGroup, type CourseGroup } from '../services/groups.service';
import { LiveResultsView } from './ClaseEnVivo';
import { FEELING_META, type Student, type CheckinFeeling } from '../types';
import './ClaseEnVivo.css';

const POLL_MS = 2500;
const REACTION_COOLDOWN_MS = 3000;

export default function ClaseEnVivoAlumno() {
    const { user } = useAuth();
    const [student, setStudent] = useState<Student | null | undefined>(undefined);
    const [session, setSession] = useState<LiveSession | null>(null);
    const [activity, setActivity] = useState<LiveActivity | null>(null);
    const [results, setResults] = useState<LiveResults | null>(null);

    // Mi respuesta local (por actividad)
    const [myAnswer, setMyAnswer] = useState<Record<string, unknown> | null>(null);
    const [textDraft, setTextDraft] = useState('');
    const [wordDraft, setWordDraft] = useState('');
    const [selectedChips, setSelectedChips] = useState<string[]>([]);
    const [sending, setSending] = useState(false);

    const lastActivityId = useRef<string | null>(null);
    const lastReactionAt = useRef(0);
    const [reactionFlash, setReactionFlash] = useState<string | null>(null);

    // Presencia: el docente ve quién está. Late cada ~30s, no en cada poll,
    // para cuidar datos y batería.
    const lastBeatAt = useRef(0);
    const [myGroup, setMyGroup] = useState<CourseGroup | null>(null);

    useEffect(() => {
        if (!user) return;
        getStudentByUserId(user.id).then(setStudent).catch(() => setStudent(null));
    }, [user]);

    const poll = useCallback(async () => {
        if (!student) return;
        try {
            if (!session) {
                const s = await getLiveSessionForCourse(student.courseId);
                setSession(s);
                return;
            }
            const state = await getSessionState(session.id);
            if (!state || state.session.status !== 'live') {
                setSession(null);
                setActivity(null);
                setResults(null);
                return;
            }
            setSession(state.session);
            setActivity(state.activity);

            if (Date.now() - lastBeatAt.current > 30_000) {
                lastBeatAt.current = Date.now();
                sendHeartbeat(session.id, student.id).catch(console.error);
            }

            // Cambió la actividad → resetear respuesta local y traer la mía si existe
            if (state.activity && state.activity.id !== lastActivityId.current) {
                lastActivityId.current = state.activity.id;
                setMyAnswer(null);
                setTextDraft('');
                setWordDraft('');
                setSelectedChips([]);
                getMyLiveResponse(state.activity.id, student.id).then(setMyAnswer).catch(console.error);
            }

            if (state.activity && state.activity.status !== 'closed') {
                getLiveResults(state.activity.id).then(setResults).catch(console.error);
            }
        } catch (err) {
            console.error('poll error:', err);
        }
    }, [student, session?.id]);

    useEffect(() => {
        if (!student) return;
        poll();
        const id = window.setInterval(poll, POLL_MS);
        return () => window.clearInterval(id);
    }, [student, poll]);

    // Mi grupo (si el docente armó grupos): para "respondé por tu grupo"
    useEffect(() => {
        if (!student || !session) return;
        getMyGroup(student.id, student.courseId).then(setMyGroup).catch(console.error);
    }, [student?.id, session?.id]);

    if (!user) return null;
    if (student === undefined) return <div className="cv-container"><p className="text-secondary">Cargando...</p></div>;
    if (!student) {
        return (
            <div className="cv-container cv-start">
                <div className="card cv-start-card">
                    <p className="text-secondary">Tu cuenta no está vinculada a un curso.</p>
                </div>
            </div>
        );
    }

    // ── Sin clase en vivo ──
    if (!session) {
        return (
            <div className="cv-container cv-start animate-in">
                <div className="card cv-start-card">
                    <div className="cv-start-icon cv-idle-icon"><Radio size={26} /></div>
                    <h2>No hay clase en vivo ahora</h2>
                    <p className="text-secondary">
                        Cuando tu docente inicie una, vas a ver el aviso acá y en tu pantalla principal.
                    </p>
                    <Link to="/mis-actividades" className="btn btn-outline btn-sm">
                        <ArrowLeft size={14} /> Volver a mis actividades
                    </Link>
                </div>
            </div>
        );
    }

    const answered = myAnswer !== null;

    const submit = async (payload: Record<string, unknown>) => {
        if (!activity || sending) return;
        setSending(true);
        try {
            await upsertLiveResponse(activity.id, session.id, student.id, payload);
            setMyAnswer(payload);
            // El check-in vivo también alimenta las señales de bienestar
            if (activity.kind === 'checkin' && payload.feeling && !answered) {
                saveLiveCheckin(student.id, payload.feeling as CheckinFeeling).catch(console.error);
            }
        } catch (err) {
            console.error(err);
            alert('No se pudo enviar. Probá de nuevo.');
        } finally {
            setSending(false);
        }
    };

    const react = async (emoji: string) => {
        const now = Date.now();
        if (now - lastReactionAt.current < REACTION_COOLDOWN_MS) return;
        lastReactionAt.current = now;
        setReactionFlash(emoji);
        setTimeout(() => setReactionFlash(null), 900);
        sendLiveReaction(session.id, student.id, emoji).catch(console.error);
    };

    const canChange = activity && activity.status === 'active';

    // Pregunta dirigida: si es para otro, este celular sigue en pausa
    const targetedToMe = activity?.targetStudentId === student.id;
    const targetedToOther = Boolean(activity?.targetStudentId) && !targetedToMe;

    return (
        <div className="cv-container cv-student animate-in">
            {/* Header compacto */}
            <div className="card cv-header cv-header-student">
                <div className="cv-header-info">
                    <span className="cv-live-dot" />
                    <div>
                        <h3>{session.title}</h3>
                        <p className="text-xs text-subtle">Clase en vivo · tus respuestas son anónimas para tus compañeros</p>
                    </div>
                </div>
            </div>

            {/* Actividad */}
            {activity && activity.status !== 'closed' && !targetedToOther ? (
                <div className="card cv-activity">
                    {targetedToMe && (
                        <div className="cv-student-note mine" role="status">
                            🎯 ¡Esta pregunta es para vos! Tus compañeros no la ven.
                        </div>
                    )}
                    {activity.config.groupMode && !targetedToMe && (
                        <div className="cv-student-note" role="status">
                            👥 Una respuesta por grupo{myGroup ? <> — el tuyo: <strong>{myGroup.emoji} {myGroup.name}</strong></> : ''}. Coordinen quién la manda.
                        </div>
                    )}
                    <div className="cv-activity-head">
                        <span className="badge badge-ia">
                            {LIVE_KIND_META[activity.kind].emoji} {LIVE_KIND_META[activity.kind].label}
                        </span>
                        {answered && <span className="badge badge-success">✓ Respondiste</span>}
                    </div>
                    {activity.config.question && <h3 className="cv-question">{activity.config.question}</h3>}

                    {/* ── Responder ── */}
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
                                const on = (myAnswer?.selected as string[] | undefined)?.includes(opt.id)
                                    ?? selectedChips.includes(opt.id);
                                return (
                                    <button
                                        key={opt.id}
                                        className={`cv-chip ${on ? 'selected' : ''}`}
                                        disabled={!canChange || sending}
                                        onClick={() => {
                                            const base = (myAnswer?.selected as string[] | undefined) ?? selectedChips;
                                            const next = on ? base.filter(x => x !== opt.id) : [...base, opt.id];
                                            setSelectedChips(next);
                                            submit({ selected: next });
                                        }}
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
                                maxLength={300}
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

                    {/* ── Resultados del grupo (después de responder) ── */}
                    {answered && (
                        <div className="cv-student-results">
                            <p className="cv-results-label">Así viene el curso:</p>
                            <LiveResultsView activity={activity} results={results} />
                        </div>
                    )}
                </div>
            ) : (
                <div className="card cv-idle">
                    <p className="text-secondary">
                        {targetedToOther
                            ? '🎯 Tu docente le mandó una pregunta directa a un compañero. Seguí atento a la clase.'
                            : 'Atendé a la clase 😄 — cuando tu docente lance una actividad, aparece sola acá.'}
                    </p>
                </div>
            )}

            {/* Botonera de emojis (la controla el docente) */}
            {session.reactionsEnabled && (
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
