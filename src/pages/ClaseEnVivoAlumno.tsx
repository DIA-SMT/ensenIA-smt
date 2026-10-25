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
import { createPortal } from 'react-dom';
import { Radio, Send, ArrowLeft, Loader2, BookOpen, CloudUpload } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { getStudentByUserId } from '../services/activities.service';
import {
    getEstadoAlumno, upsertLiveResponse, sendLiveReaction, saveLiveCheckin,
    LIVE_KIND_META, LIVE_REACTIONS, getLiveClassMaterial, materialParaVisor,
    type LiveSession, type LiveActivity, type LiveResults, type MaterialDeClase,
} from '../services/live.service';
import MaterialViewer from '../components/MaterialViewer';
import SenialEnVivo from '../components/SenialEnVivo';
import { getMyGroup, type CourseGroup } from '../services/groups.service';
import { useSondeo } from '../lib/sondeo';
import { esErrorDeRed } from '../lib/conexion';
import { LiveResultsView } from './ClaseEnVivo';
import { FEELING_META, AWARD_META, type Student, type CheckinFeeling, type StudentAward } from '../types';
import { avisar } from '../components/ui/avisar';
import { Esqueleto } from '../components/ui/Esqueleto';
import PedirDevolucion from '../components/PedirDevolucion';
import './ClaseEnVivo.css';

const POLL_MS = 2500;
const REACTION_COOLDOWN_MS = 3000;

/** Una respuesta que no salió por falta de señal: se manda sola cuando vuelve */
interface Pendiente {
    activityId: string;
    payload: Record<string, unknown>;
    /** Era su primer check-in de esta pregunta: también va a su bienestar */
    checkin?: CheckinFeeling;
}

/**
 * Lo que espera señal queda en sessionStorage: si se recarga la página o el
 * celular descarta la pestaña, sigue ahí. Un check-in de bienestar que no
 * salió no puede perderse sin aviso (es un camino de cuidado).
 */
const clavePendiente = (studentId: string) => `estudia_vivo_pendiente:${studentId}`;
const claveCheckin = (studentId: string) => `estudia_vivo_checkin:${studentId}`;
function leerGuardado<T>(clave: string): T | null {
    try { const v = sessionStorage.getItem(clave); return v ? JSON.parse(v) as T : null; } catch { return null; }
}
function guardar(clave: string, valor: unknown) {
    try {
        if (valor == null) sessionStorage.removeItem(clave);
        else sessionStorage.setItem(clave, JSON.stringify(valor));
    } catch { /* sin almacenamiento: queda en memoria mientras la pantalla siga abierta */ }
}

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

    const [myGroup, setMyGroup] = useState<CourseGroup | null>(null);

    // Medallas que llegan durante la clase: se festejan en el momento (solo
    // las nuevas desde que abrió esta pantalla). Vienen en el mismo pedido.
    const medallasDesde = useRef(new Date().toISOString());
    const [festejo, setFestejo] = useState<StudentAward | null>(null);

    // Sin señal, la respuesta queda acá y sale en la primera vuelta que ande
    const [pendiente, setPendiente] = useState<Pendiente | null>(null);
    const pendienteRef = useRef<Pendiente | null>(null);
    const studentId = student?.id ?? null;
    const ponerPendiente = useCallback((p: Pendiente | null) => {
        pendienteRef.current = p;
        setPendiente(p);
        if (studentId) guardar(clavePendiente(studentId), p);
    }, [studentId]);
    // Un check-in que se respondió pero no llegó a su bienestar: se reintenta
    const checkinPendienteRef = useRef<CheckinFeeling | null>(null);
    const ponerCheckinPendiente = useCallback((f: CheckinFeeling | null) => {
        checkinPendienteRef.current = f;
        if (studentId) guardar(claveCheckin(studentId), f);
    }, [studentId]);
    // Mientras sale una respuesta, la vuelta no pisa la que ya se ve elegida
    const enviandoRef = useRef(false);
    // Sube con cada respuesta que el chico elige: una vuelta que salió antes
    // trae lo de antes y no tiene que pisarlo (llega tarde con poca señal)
    const versionRef = useRef(0);
    const sessionRef = useRef<LiveSession | null>(null);

    // Lo que quedó esperando señal antes de recargar la página
    useEffect(() => {
        if (!studentId) return;
        const p = leerGuardado<Pendiente>(clavePendiente(studentId));
        pendienteRef.current = p;
        setPendiente(p);
        checkinPendienteRef.current = leerGuardado<CheckinFeeling>(claveCheckin(studentId));
    }, [studentId]);

    /** El check-in también alimenta su bienestar; sin señal, queda para la próxima vuelta */
    const guardarCheckin = useCallback(async (feeling: CheckinFeeling) => {
        if (!studentId) return;
        try {
            await saveLiveCheckin(studentId, feeling);
            if (checkinPendienteRef.current === feeling) ponerCheckinPendiente(null);
        } catch (err) {
            if (esErrorDeRed(err)) ponerCheckinPendiente(feeling);
            else { console.error(err); ponerCheckinPendiente(null); }
        }
    }, [studentId, ponerCheckinPendiente]);

    // Material de la clase: solo si el docente lo muestra (y mientras dure la clase)
    const [material, setMaterial] = useState<MaterialDeClase | null>(null);
    const [viendoMaterial, setViendoMaterial] = useState(false);

    // La clase que acaba de terminar: para preguntarle si le sirvió
    const [terminada, setTerminada] = useState<{ id: string; titulo: string } | null>(null);

    // La ficha: sin señal se reintenta (antes un error decía "Tu cuenta no
    // está vinculada a un curso" y ahí quedaba)
    const [fichaSinSenial, setFichaSinSenial] = useState(false);
    useEffect(() => {
        if (!user) return;
        let vivo = true;
        let intentos = 0;
        let timer: number | undefined;
        const buscar = () => {
            getStudentByUserId(user.id, { tirarSiFalla: true })
                .then(s => { if (vivo) { setFichaSinSenial(false); setStudent(s); } })
                .catch(err => {
                    if (!vivo) return;
                    if (!esErrorDeRed(err)) { console.error(err); setStudent(null); return; }
                    intentos++;
                    setFichaSinSenial(true);
                    timer = window.setTimeout(buscar, Math.min(2500 * 2 ** Math.min(intentos, 3), 15_000));
                });
        };
        buscar();
        const alVolver = () => { if (document.visibilityState === 'visible' && intentos > 0) { window.clearTimeout(timer); buscar(); } };
        window.addEventListener('online', alVolver);
        return () => { vivo = false; window.clearTimeout(timer); window.removeEventListener('online', alVolver); };
    }, [user]);

    /**
     * Una vuelta: un solo pedido (071). Si falla por la señal, tira el error
     * y la pantalla queda como estaba (antes salía de la clase y decía
     * "No hay clase en vivo ahora"). Solo deja la clase si el servidor dice
     * que terminó o que no hay.
     */
    const vuelta = useCallback(async (senal: AbortSignal) => {
        if (!student) return;
        const version = versionRef.current;
        const e = await getEstadoAlumno(sessionRef.current?.id ?? null, medallasDesde.current, senal);
        // Hay señal: un check-in que no había llegado a su bienestar, sale ahora
        if (checkinPendienteRef.current) void guardarCheckin(checkinPendienteRef.current);
        if (e.estado !== 'en_vivo') {
            if (e.estado === 'terminada') setTerminada({ id: e.sessionId, titulo: e.titulo });
            sessionRef.current = null;
            setSession(null);
            setActivity(null);
            setResults(null);
            // La respuesta ya no tiene dónde ir; el check-in sí (a su bienestar)
            const quedo = pendienteRef.current;
            if (quedo) {
                ponerPendiente(null);
                if (quedo.checkin) void guardarCheckin(quedo.checkin);
            }
            return;
        }
        sessionRef.current = e.session;
        setSession(e.session);
        setActivity(e.activity);
        setResults(e.results);
        if (e.medalla) {
            medallasDesde.current = e.medalla.createdAt;
            setFestejo(e.medalla);
        }

        // Cambió la actividad → se limpian los borradores de la anterior
        const actId = e.activity?.id ?? null;
        if (actId !== lastActivityId.current) {
            lastActivityId.current = actId;
            setTextDraft('');
            setWordDraft('');
            setSelectedChips([]);
        }

        // Hay señal: si quedó una respuesta sin salir, sale ahora (con los
        // botones quietos, para que no se cruce con otra)
        const p = pendienteRef.current;
        if (p && !enviandoRef.current) {
            if (!e.activity || e.activity.id !== p.activityId || e.activity.status !== 'active') {
                // Se cerró antes de que volviera la señal. El check-in igual
                // va a su bienestar: lo que sentía no deja de importar.
                ponerPendiente(null);
                if (p.checkin) void guardarCheckin(p.checkin);
                avisar.info('Tu respuesta no llegó a salir', 'La pregunta se cerró mientras no había señal.');
            } else {
                enviandoRef.current = true;
                setSending(true);
                try {
                    await upsertLiveResponse(p.activityId, e.session.id, student.id, p.payload);
                    if (pendienteRef.current === p) {
                        ponerPendiente(null);
                        setMyAnswer(p.payload);
                    }
                    if (p.checkin) void guardarCheckin(p.checkin);
                    return;
                } catch (err) {
                    if (esErrorDeRed(err)) throw err;
                    if (pendienteRef.current === p) ponerPendiente(null);
                    avisar.error('No se pudo enviar tu respuesta.', err instanceof Error ? err.message : '');
                } finally {
                    enviandoRef.current = false;
                    setSending(false);
                }
            }
        }
        // Solo si el chico no eligió nada mientras viajaba esta vuelta
        if (!enviandoRef.current && !pendienteRef.current && versionRef.current === version) setMyAnswer(e.myAnswer);
    }, [student, ponerPendiente, guardarCheckin]);

    const sondeo = useSondeo(vuelta, POLL_MS, Boolean(student));

    const materialKey = session?.materialVisible ? `${session.id}:${session.materialId ?? ''}:${session.classId ?? ''}` : null;
    useEffect(() => {
        let cancelado = false;
        if (!materialKey || !session) {
            setMaterial(null);
            setViendoMaterial(false);
            return;
        }
        getLiveClassMaterial(session.id)
            .then(m => { if (!cancelado) setMaterial(m); })
            .catch(() => { if (!cancelado) setMaterial(null); });
        return () => { cancelado = true; };
        // materialKey ya resume session.id, el material y si se muestra
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [materialKey]);

    // Mi grupo (si el docente armó grupos): para "respondé por tu grupo"
    useEffect(() => {
        if (!student || !session) return;
        getMyGroup(student.id, student.courseId).then(setMyGroup).catch(console.error);
    }, [student?.id, session?.id]);

    if (!user) return null;
    if (student === undefined) {
        return (
            <div className="cv-container">
                {fichaSinSenial && <SenialEnVivo fallas={2} ultimaOk={null} detalle="Apenas vuelva, buscamos tu clase en vivo." />}
                <Esqueleto tipo="tarjetas" cantidad={1} etiqueta="Buscando tu clase en vivo…" />
            </div>
        );
    }
    if (!student) {
        return (
            <div className="cv-container cv-start">
                <div className="card cv-start-card">
                    <p className="text-secondary">Tu cuenta no está vinculada a un curso.</p>
                </div>
            </div>
        );
    }

    // ── Todavía no se pudo preguntar: no es "no hay clase" ──
    if (!session && sondeo.ultimaOk === null) {
        if (sondeo.fallas === 0) {
            return <div className="cv-container"><Esqueleto tipo="tarjetas" cantidad={1} etiqueta="Buscando tu clase en vivo…" /></div>;
        }
        return (
            <div className="cv-container cv-start animate-in">
                <div className="card cv-start-card">
                    <SenialEnVivo fallas={Math.max(sondeo.fallas, 2)} deRed={sondeo.deRed} ultimaOk={null} detalle="Apenas se pueda, buscamos tu clase en vivo." />
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
                    {terminada && (
                        <PedirDevolucion origen="clase_en_vivo" refId={terminada.id} pregunta={`Terminó la clase: ¿te sirvió?`} />
                    )}
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
        // El check-in vivo también alimenta las señales de bienestar (el
        // primero). Si el primero todavía espera señal y cambia de emoción,
        // el que va a su bienestar es el último que eligió.
        const pendienteDeEsta = pendienteRef.current?.activityId === activity.id ? pendienteRef.current : null;
        const primero = !answered || Boolean(pendienteDeEsta?.checkin);
        const checkin = activity.kind === 'checkin' && payload.feeling && primero ? payload.feeling as CheckinFeeling : undefined;
        const anterior = myAnswer;
        versionRef.current++;
        setSending(true);
        enviandoRef.current = true;
        // Se ve elegida enseguida, aunque tarde en salir
        setMyAnswer(payload);
        try {
            await upsertLiveResponse(activity.id, session.id, student.id, payload);
            ponerPendiente(null);
            if (checkin) void guardarCheckin(checkin);
            // Que los resultados lleguen ya, sin esperar la próxima vuelta
            sondeo.ahora();
        } catch (err) {
            if (esErrorDeRed(err)) {
                // Sin señal: queda guardada y sale sola cuando vuelva
                ponerPendiente({ activityId: activity.id, payload, checkin });
            } else {
                // La rechazó el servidor (por ejemplo, se cerró justo): no se guarda
                console.error(err);
                setMyAnswer(anterior);
                avisar.error('No se pudo enviar tu respuesta.', err instanceof Error && err.message ? err.message : 'Probá de nuevo.');
            }
        } finally {
            enviandoRef.current = false;
            setSending(false);
        }
    };

    // La respuesta de esta pregunta todavía espera señal
    const esperandoSenial = pendiente !== null && pendiente.activityId === activity?.id;

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

            <SenialEnVivo fallas={sondeo.fallas} deRed={sondeo.deRed} ultimaOk={sondeo.ultimaOk} detalle="Seguí en esta pantalla: lo que respondas sale solo cuando se pueda." />

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

            {/* ¡Medalla! (se la dio el docente durante la clase) */}
            {festejo && createPortal(
                <div className="cv-festejo" role="status" aria-live="polite">
                    <div className="cv-festejo-card animate-scale">
                        <span className="cv-festejo-emoji" aria-hidden="true">{AWARD_META[festejo.badgeCode]?.emoji ?? '🏅'}</span>
                        <h3>¡Recibiste «{AWARD_META[festejo.badgeCode]?.label ?? 'una medalla'}»!</h3>
                        <p className="text-sm text-secondary">
                            {festejo.teacherName ? `De ${festejo.teacherName}` : 'De tu docente'}
                            {AWARD_META[festejo.badgeCode]?.description ? ` · ${AWARD_META[festejo.badgeCode].description}` : ''}
                        </p>
                        {festejo.message && <p className="cv-festejo-msg">“{festejo.message}”</p>}
                        <p className="text-xs text-subtle">Suma 25 de experiencia y queda en tu perfil.</p>
                        <button type="button" className="btn btn-primary btn-sm" onClick={() => setFestejo(null)}>¡Gracias!</button>
                    </div>
                </div>,
                document.body,
            )}

            {/* Material de la clase (lo muestra el docente) */}
            {material && (
                <div className="card cv-material-alumno">
                    <BookOpen size={18} aria-hidden="true" />
                    <div className="cv-material-alumno-texto">
                        <span className="text-xs text-subtle">Material de la clase</span>
                        <strong>{material.titulo}</strong>
                    </div>
                    <button type="button" className="btn btn-primary btn-sm" onClick={() => setViendoMaterial(true)}>Abrir</button>
                </div>
            )}
            {viendoMaterial && material && (
                <MaterialViewer material={materialParaVisor(material)} onClose={() => setViendoMaterial(false)} />
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
