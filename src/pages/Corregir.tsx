/**
 * SMT EstudIA — Para corregir
 *
 * Corregir era la tarea más tediosa: había que entrar actividad por
 * actividad, abrir estudiante por estudiante. Acá está todo lo pendiente
 * junto, con las respuestas a la vista y la nota sugerida por el
 * autocorregido ya cargada: el docente confirma o ajusta y sigue.
 */

import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    ClipboardCheck, Check, ChevronDown, ChevronUp, Loader2, ArrowLeft,
    Sparkles, PartyPopper,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { getPendingGrading, gradeSubmission, setSubmissionReaction, type PendingGrading } from '../services/activities.service';
import MarkdownRenderer from '../components/MarkdownRenderer';
import './Corregir.css';

const QUICK_FEEDBACK = ['👏 Excelente', '👍 Muy bien', '💪 Seguí así', '🤝 Hablemos'];

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
            alert('No se pudo guardar la nota. Probá de nuevo.');
        } finally {
            setSavingId(null);
        }
    };

    const handleQuickFeedback = (p: PendingGrading, text: string) => {
        setFeedbacks(prev => ({ ...prev, [p.submissionId]: text }));
        setSubmissionReaction(p.submissionId, text).catch(console.error);
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

            {!loading && pending.length === 0 && (
                <div className="card corr-empty">
                    <PartyPopper size={34} className="text-success" />
                    <h3>{doneCount > 0 ? '¡Terminaste!' : 'Estás al día'}</h3>
                    <p className="text-secondary text-sm">
                        {doneCount > 0
                            ? 'Corregiste todo lo que había pendiente. Tus estudiantes ya pueden ver sus notas.'
                            : 'Cuando tus estudiantes entreguen, las entregas aparecen acá para corregir de una.'}
                    </p>
                    <button className="btn btn-outline btn-sm" onClick={() => navigate('/hoy')}>Volver a Hoy</button>
                </div>
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
                                                onChange={e => setScores(prev => ({ ...prev, [p.submissionId]: e.target.value }))}
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

                                        <textarea
                                            className="corr-feedback"
                                            rows={2}
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
