/**
 * SMT EstudIA — Para corregir
 *
 * Corregir era la tarea más tediosa: había que entrar actividad por
 * actividad, abrir estudiante por estudiante. Acá está todo lo pendiente
 * junto, con las respuestas a la vista y la nota sugerida por el
 * autocorregido ya cargada: el docente confirma o ajusta y sigue.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    ClipboardCheck, Check, ChevronDown, ChevronUp, Loader2, ArrowLeft,
    Sparkles, PartyPopper, X,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { getPendingGrading, gradeSubmission, setSubmissionReaction, type PendingGrading } from '../services/activities.service';
import MarkdownRenderer from '../components/MarkdownRenderer';
import SugerirDevolucion from '../components/SugerirDevolucion';
import { sugerirDevolucion, type Devolucion } from '../components/devolucion-ia';
import { avisar, confirmar } from '../components/ui/avisar';
import EstadoVacio from '../components/ui/EstadoVacio';
import { Esqueleto, Cargando } from '../components/ui/Esqueleto';
import './Corregir.css';

const QUICK_FEEDBACK = ['👏 Excelente', '👍 Muy bien', '💪 Seguí así', '🤝 Hablemos'];

/** Lo que va a la IA: la actividad y las respuestas. Nunca el nombre del estudiante. */
function pedirPara(p: PendingGrading, teacherId: string, signal: AbortSignal): Promise<Devolucion | null> {
    return sugerirDevolucion({
        teacherId,
        materia: p.subjectName,
        curso: p.courseName,
        titulo: p.activityTitle,
        descripcion: p.activityDescription,
        consigna: p.activityContent,
        preguntas: p.questions,
        respuestas: p.answers,
        textoLibre: p.responseText,
        puntos: p.points,
        signal,
    });
}

export default function Corregir() {
    const { user } = useAuth();
    const navigate = useNavigate();

    const [pending, setPending] = useState<PendingGrading[]>([]);
    const [loading, setLoading] = useState(true);
    const [expanded, setExpanded] = useState<string | null>(null);
    const [scores, setScores] = useState<Record<string, string>>({});
    const [feedbacks, setFeedbacks] = useState<Record<string, string>>({});
    const [savingId, setSavingId] = useState<string | null>(null);
    const [doneCount, setDoneCount] = useState(0);
    // Devolución sugerida por IA: cuál está escribiendo, qué notas vinieron
    // de la IA (hasta que el docente las toca) y el avance del lote.
    const [sugiriendoId, setSugiriendoId] = useState<string | null>(null);
    const [notaSugerida, setNotaSugerida] = useState<Record<string, boolean>>({});
    const [lote, setLote] = useState<{ hechas: number; total: number } | null>(null);
    const unoRef = useRef<AbortController | null>(null);
    const loteRef = useRef<AbortController | null>(null);
    // El lote corre varios minutos: lee lo vigente, no lo de cuando arrancó
    const pendingRef = useRef<PendingGrading[]>([]);
    const feedbacksRef = useRef<Record<string, string>>({});
    useEffect(() => { pendingRef.current = pending; }, [pending]);
    useEffect(() => { feedbacksRef.current = feedbacks; }, [feedbacks]);
    useEffect(() => () => { unoRef.current?.abort(); loteRef.current?.abort(); }, []);

    const load = useCallback(async () => {
        if (!user) return;
        setLoading(true);
        try {
            const list = await getPendingGrading(user.id);
            setPending(list);
            // La nota del autocorregido viene precargada: confirmar es un toque
            const preset: Record<string, string> = {};
            list.forEach(p => {
                if (p.autoScore != null) preset[p.submissionId] = String(p.autoScore);
            });
            setScores(preset);
            if (list.length > 0) setExpanded(list[0].submissionId);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    }, [user]);

    useEffect(() => { load(); }, [load]);

    if (!user) return null;

    const handleGrade = async (p: PendingGrading) => {
        const raw = scores[p.submissionId];
        if (raw === undefined || raw === '' || savingId) return;
        const score = Number(raw);
        if (Number.isNaN(score)) return;

        setSavingId(p.submissionId);
        try {
            await gradeSubmission(p.submissionId, score, feedbacks[p.submissionId]?.trim() || undefined);
            // Se va de la lista: lo pendiente es lo que queda
            setPending(prev => {
                const next = prev.filter(x => x.submissionId !== p.submissionId);
                const idx = prev.findIndex(x => x.submissionId === p.submissionId);
                setExpanded(next[idx]?.submissionId ?? next[0]?.submissionId ?? null);
                return next;
            });
            setDoneCount(n => n + 1);
        } catch (err) {
            console.error(err);
            avisar.error(`No se pudo guardar la nota de ${p.studentName}`, 'Probá de nuevo.');
        } finally {
            setSavingId(null);
        }
    };

    const handleQuickFeedback = (p: PendingGrading, text: string) => {
        setFeedbacks(prev => ({ ...prev, [p.submissionId]: text }));
        setSubmissionReaction(p.submissionId, text).catch(console.error);
    };

    // ── Devolución sugerida por IA (borrador: nunca se guarda sola) ──
    const aplicarSugerencia = (id: string, d: Devolucion) => {
        setFeedbacks(prev => ({ ...prev, [id]: d.devolucion }));
        if (d.puntaje != null) {
            setScores(prev => ({ ...prev, [id]: String(d.puntaje) }));
            setNotaSugerida(prev => ({ ...prev, [id]: true }));
        }
    };

    const handleSugerir = async (p: PendingGrading) => {
        if (sugiriendoId || lote) return;
        const actual = feedbacks[p.submissionId]?.trim();
        if (actual && !QUICK_FEEDBACK.includes(actual)) {
            const ok = await confirmar({
                titulo: '¿Reemplazar lo que escribiste?',
                mensaje: 'La IA escribe un borrador nuevo en lugar de tu devolución. Usa 1 uso de IA.',
                accion: 'Reemplazar',
            });
            if (!ok) return;
        }
        const controller = new AbortController();
        unoRef.current = controller;
        setSugiriendoId(p.submissionId);
        try {
            const d = await pedirPara(p, user.id, controller.signal);
            if (!d) return;
            aplicarSugerencia(p.submissionId, d);
            // Directo a revisar el borrador
            requestAnimationFrame(() => document.getElementById(`corr-fb-${p.submissionId}`)?.focus());
        } catch (err) {
            avisar.error('No se pudo sugerir la devolución', err instanceof Error ? err.message : 'Probá de nuevo.');
        } finally {
            if (unoRef.current === controller) unoRef.current = null;
            setSugiriendoId(null);
        }
    };

    const sinDevolucion = pending.filter(p => !feedbacks[p.submissionId]?.trim());

    const handleSugerirLote = async () => {
        if (sugiriendoId || lote) return;
        const ids = sinDevolucion.map(p => p.submissionId);
        if (ids.length === 0) return;
        const ok = await confirmar({
            titulo: `¿Sugerir la devolución de ${ids.length} entregas?`,
            mensaje: `Usa 1 uso de IA por entrega: ${ids.length} en total. Van de a una y podés cortar cuando quieras. Nada se guarda solo: después revisás y guardás cada una.`,
            accion: 'Sugerir',
        });
        if (!ok) return;

        const controller = new AbortController();
        loteRef.current = controller;
        let hechas = 0;
        let error: string | null = null;
        try {
            for (let i = 0; i < ids.length; i++) {
                if (controller.signal.aborted) break;
                setLote({ hechas: i, total: ids.length });
                const p = pendingRef.current.find(x => x.submissionId === ids[i]);
                // Ya la corrigió o le escribió algo mientras tanto: no se pisa
                if (!p || feedbacksRef.current[p.submissionId]?.trim()) continue;
                setSugiriendoId(p.submissionId);
                try {
                    const d = await pedirPara(p, user.id, controller.signal);
                    if (!d) break;
                    if (feedbacksRef.current[p.submissionId]?.trim()) continue;
                    aplicarSugerencia(p.submissionId, d);
                    hechas++;
                } catch (err) {
                    // Cuota, red o lo que sea: se corta acá, no se sigue gastando
                    error = err instanceof Error ? err.message : 'Probá de nuevo.';
                    break;
                }
            }
        } finally {
            if (loteRef.current === controller) loteRef.current = null;
            setSugiriendoId(null);
            setLote(null);
        }

        const listas = `${hechas} devolución${hechas !== 1 ? 'es' : ''} sugerida${hechas !== 1 ? 's' : ''}`;
        if (error) avisar.error('Se cortó la sugerencia en lote', `${error} Quedaron ${listas}.`);
        else if (controller.signal.aborted) avisar.info(`Cortaste: ${listas}`, 'Revisalas y guardá cada una.');
        else if (hechas > 0) avisar.exito(`Listas: ${listas}`, 'Revisalas y guardá cada una.');
    };

    const answerFor = (p: PendingGrading, questionId: string) => p.answers?.[questionId];

    return (
        <div className="corr-container animate-in">
            <button className="corr-back" onClick={() => navigate('/hoy')}>
                <ArrowLeft size={15} /> Volver a Hoy
            </button>

            <header className="card corr-header">
                <div className="corr-header-main">
                    <div className="corr-icon"><ClipboardCheck size={22} /></div>
                    <div>
                        <h2>Para corregir</h2>
                        <p className="text-sm text-secondary">
                            {loading
                                ? 'Buscando entregas...'
                                : pending.length === 0
                                    ? 'No tenés nada pendiente'
                                    : `${pending.length} entrega${pending.length !== 1 ? 's' : ''} esperando tu nota`}
                        </p>
                    </div>
                </div>
                {doneCount > 0 && (
                    <span className="corr-done-count">
                        <Check size={14} /> {doneCount} corregida{doneCount !== 1 ? 's' : ''} recién
                    </span>
                )}
            </header>

            {loading && <Esqueleto tipo="filas" cantidad={4} etiqueta="Buscando entregas…" />}

            {/* Borradores para todas las que todavía no tienen devolución */}
            {!loading && (lote || sinDevolucion.length >= 2) && (
                <div className="card corr-lote">
                    {lote ? (
                        <>
                            <Cargando
                                className="corr-lote-texto"
                                texto={`Sugiriendo devoluciones: ${Math.min(lote.hechas + 1, lote.total)} de ${lote.total}…`}
                            />
                            <button type="button" className="btn btn-ghost btn-sm" onClick={() => loteRef.current?.abort()}>
                                <X size={14} aria-hidden="true" /> Cortar
                            </button>
                        </>
                    ) : (
                        <>
                            <p className="corr-lote-texto">
                                <strong>{sinDevolucion.length} entregas sin devolución.</strong>{' '}
                                La IA te deja un borrador en cada una; usa 1 uso de IA por entrega.
                            </p>
                            <button
                                type="button"
                                className="btn btn-outline btn-sm corr-lote-btn"
                                onClick={handleSugerirLote}
                                disabled={sugiriendoId !== null}
                            >
                                <Sparkles size={14} aria-hidden="true" /> Sugerir para todas las que faltan
                            </button>
                        </>
                    )}
                </div>
            )}

            {!loading && pending.length === 0 && (
                <EstadoVacio
                    icono={PartyPopper}
                    titulo={doneCount > 0 ? '¡Terminaste!' : 'Estás al día'}
                    texto={doneCount > 0
                        ? 'Corregiste todo lo que había pendiente. Tus estudiantes ya pueden ver sus notas.'
                        : 'Cuando tus estudiantes entreguen, las entregas aparecen acá para corregir de una.'}
                    accion={{ etiqueta: 'Volver a Hoy', a: '/hoy', icono: ArrowLeft }}
                />
            )}

            <div className="corr-list">
                {pending.map(p => {
                    const open = expanded === p.submissionId;
                    const saving = savingId === p.submissionId;
                    return (
                        <div key={p.submissionId} className={`card corr-item ${open ? 'open' : ''}`}>
                            <button
                                className="corr-item-head"
                                onClick={() => setExpanded(open ? null : p.submissionId)}
                            >
                                <span className="corr-avatar">{p.avatarInitials}</span>
                                <div className="corr-item-info">
                                    <strong>{p.studentName}</strong>
                                    <span className="corr-item-meta">
                                        {p.activityTitle} · {p.subjectName} {p.courseName}
                                        {p.submittedAt && ` · entregó el ${new Date(p.submittedAt).toLocaleDateString('es-AR')}`}
                                    </span>
                                </div>
                                {p.autoScore != null && (
                                    <span className="corr-auto" title="Nota del autocorregido">
                                        <Sparkles size={12} /> {p.autoScore}{p.points ? `/${p.points}` : ''}
                                    </span>
                                )}
                                {open ? <ChevronUp size={17} className="text-subtle" /> : <ChevronDown size={17} className="text-subtle" />}
                            </button>

                            {open && (
                                <div className="corr-item-body">
                                    {/* Respuestas */}
                                    {p.questions.length > 0 ? (
                                        <div className="corr-answers">
                                            {p.questions.map((q, i) => {
                                                const ans = answerFor(p, q.id);
                                                const isMc = q.type === 'multiple_choice';
                                                const chosen = typeof ans?.answer === 'number' ? ans.answer : null;
                                                return (
                                                    <div key={q.id ?? i} className="corr-answer">
                                                        <p className="corr-q">{i + 1}. {q.prompt}</p>
                                                        {isMc ? (
                                                            <p className={`corr-a ${ans?.correct ? 'ok' : 'no'}`}>
                                                                {ans?.correct ? '✅' : '❌'}{' '}
                                                                {chosen != null && q.options?.[chosen]
                                                                    ? q.options[chosen]
                                                                    : <em className="text-subtle">sin responder</em>}
                                                                {!ans?.correct && q.correct_index != null && q.options?.[q.correct_index] && (
                                                                    <span className="corr-correct"> · correcta: {q.options[q.correct_index]}</span>
                                                                )}
                                                            </p>
                                                        ) : (
                                                            <p className="corr-a corr-a-open">
                                                                {ans?.answer
                                                                    ? String(ans.answer)
                                                                    : <em className="text-subtle">sin responder</em>}
                                                            </p>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    ) : p.responseText ? (
                                        <div className="corr-response">
                                            <MarkdownRenderer content={p.responseText} />
                                        </div>
                                    ) : (
                                        <p className="text-sm text-subtle">Esta actividad no tenía cuestionario.</p>
                                    )}

                                    {/* Nota + devolución */}
                                    <div className="corr-grade">
                                        <div className="corr-grade-row">
                                            <label>
                                                Nota {p.points != null && <span className="text-subtle">(sobre {p.points})</span>}
                                            </label>
                                            <input
                                                type="number"
                                                className="corr-score"
                                                min={0}
                                                max={p.points ?? 100}
                                                value={scores[p.submissionId] ?? ''}
                                                onChange={e => {
                                                    setScores(prev => ({ ...prev, [p.submissionId]: e.target.value }));
                                                    setNotaSugerida(prev => ({ ...prev, [p.submissionId]: false }));
                                                }}
                                                onKeyDown={e => { if (e.key === 'Enter') handleGrade(p); }}
                                            />
                                            <button
                                                className="btn btn-primary btn-sm"
                                                onClick={() => handleGrade(p)}
                                                disabled={saving || (scores[p.submissionId] ?? '') === ''}
                                            >
                                                {saving
                                                    ? <><Loader2 size={14} className="spin" /> Guardando...</>
                                                    : <><Check size={14} /> Guardar y seguir</>}
                                            </button>
                                        </div>
                                        {notaSugerida[p.submissionId] && (
                                            <p className="sdev-aviso">Nota sugerida por la IA: revisala antes de guardar.</p>
                                        )}

                                        <div className="corr-quick">
                                            {QUICK_FEEDBACK.map(f => (
                                                <button
                                                    key={f}
                                                    className={`corr-quick-btn ${feedbacks[p.submissionId] === f ? 'on' : ''}`}
                                                    onClick={() => handleQuickFeedback(p, f)}
                                                >
                                                    {f}
                                                </button>
                                            ))}
                                        </div>

                                        <SugerirDevolucion
                                            cargando={sugiriendoId === p.submissionId}
                                            alTocar={() => handleSugerir(p)}
                                            alCancelar={lote ? undefined : () => unoRef.current?.abort()}
                                            disabled={sugiriendoId !== null || lote !== null}
                                            motivo={lote
                                                ? 'Esperá a que termine la sugerencia en lote.'
                                                : sugiriendoId ? 'Esperá: la IA está escribiendo otra devolución.' : undefined}
                                        />

                                        <textarea
                                            id={`corr-fb-${p.submissionId}`}
                                            className="corr-feedback"
                                            rows={sugiriendoId === p.submissionId || (feedbacks[p.submissionId]?.length ?? 0) > 120 ? 4 : 2}
                                            aria-label="Devolución para el estudiante"
                                            aria-busy={sugiriendoId === p.submissionId}
                                            placeholder="Devolución para el estudiante (opcional)"
                                            value={feedbacks[p.submissionId] ?? ''}
                                            onChange={e => setFeedbacks(prev => ({ ...prev, [p.submissionId]: e.target.value }))}
                                        />
                                    </div>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
