/**
 * Tablero de dirección (/dashboard, solo director). El docente arranca en
 * /hoy: acá no hay rama docente.
 */

import { useState, useEffect, useRef, useId, lazy, Suspense, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
    Clock, AlertTriangle, CheckCircle, CheckCircle2, Info, Users, BookOpen,
    ArrowRight, Sparkles, MessageSquare, AlertCircle, HeartPulse, Megaphone,
    ChevronDown, ChevronUp, Sunrise, ArrowUpRight, RotateCw, PenLine,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { getAlertsBySchool } from '../services/alerts.service';
import { getCommunicationsBySchool } from '../services/communications.service';
import { getDirectorInsights } from '../services/director-insights.service';
import { computeDailyBrief, briefToPrompt } from '../services/director-brief.service';
import { getOrCreateSession, getSessionsByTeacher } from '../services/chat-history.service';
import { streamChat } from '../services/ia-chat.service';
import { formatRelative, formatLatencyHours } from '../lib/format';
import CourseHeatmap from '../components/CourseHeatmap';
import { Esqueleto, Cargando } from '../components/ui/Esqueleto';
import EstadoVacio from '../components/ui/EstadoVacio';
// El lector de Markdown pesa ~47 KB y solo se usa si dirección pide la
// redacción con IA del Parte del día: se baja recién entonces.
const MarkdownRenderer = lazy(() => import('../components/MarkdownRenderer'));
import {
    type Alert as AlertType, type Communication, type DirectorInsights, type DailyBrief,
} from '../types';
import './Dashboard.css';

/**
 * Por debajo de esta cantidad de respuestas, un porcentaje engaña: un solo
 * check-in positivo daba "100 % de bienestar".
 */
const MUESTRA_MINIMA = 5;

/** Tarjeta KPI con drill-down opcional: un clic revela la lista de nombres detrás del número. */
function KpiCard({
    borderClass, icon, title, value, caption, drilldownLabel, children,
}: {
    borderClass: string;
    icon: ReactNode;
    title: string;
    value: string;
    caption: string;
    drilldownLabel?: string;
    children?: ReactNode;
}) {
    const [open, setOpen] = useState(false);
    const idDetalle = useId();

    return (
        <section className={`card kpi-card ${borderClass}${open ? ' abierta' : ''}`} aria-label={title}>
            <div className="kpi-header">
                <h2 className="kpi-title">{title}</h2>
                <span aria-hidden="true">{icon}</span>
            </div>
            <div className="kpi-value-row">
                <p className="kpi-value">{value}</p>
            </div>
            <p className="kpi-caption">{caption}</p>
            {children && (
                <>
                    <button
                        type="button"
                        className="kpi-drilldown-toggle"
                        onClick={() => setOpen(o => !o)}
                        aria-expanded={open}
                        aria-controls={open ? idDetalle : undefined}
                    >
                        {open ? 'Ocultar' : (drilldownLabel ?? 'Ver detalle')}
                        {open ? <ChevronUp size={13} aria-hidden="true" /> : <ChevronDown size={13} aria-hidden="true" />}
                    </button>
                    {open && <div className="kpi-drilldown" id={idDetalle}>{children}</div>}
                </>
            )}
        </section>
    );
}

/** Parte del día: hechos de las últimas 24 h + redacción IA opcional. */
function DailyBriefWidget({ brief }: { brief: DailyBrief }) {
    const { user, school } = useAuth();
    const [aiText, setAiText] = useState('');
    const [aiStreaming, setAiStreaming] = useState(false);
    const [aiError, setAiError] = useState('');
    const abortRef = useRef<AbortController | null>(null);
    // Una sola sesión de chat por directora: getOrCreateSession con
    // classId null siempre crea, así que la buscamos por título primero.
    const sessionIdRef = useRef<string | null>(null);

    useEffect(() => () => abortRef.current?.abort(), []);

    const resolveSessionId = async (userId: string): Promise<string> => {
        if (sessionIdRef.current) return sessionIdRef.current;
        const existing = (await getSessionsByTeacher(userId)).find(s => s.title === 'Parte del día');
        const session = existing ?? await getOrCreateSession(userId, null, { title: 'Parte del día' });
        sessionIdRef.current = session.id;
        return session.id;
    };

    const handleRedact = async () => {
        if (!user || aiStreaming) return;
        // El controller nace ANTES del primer await: un desmonte temprano
        // también tiene que poder abortar la preparación del stream.
        const controller = new AbortController();
        abortRef.current = controller;
        setAiStreaming(true);
        setAiError('');
        setAiText('');
        try {
            const sessionId = await resolveSessionId(user.id);
            if (controller.signal.aborted) return;
            const prompt = briefToPrompt(brief, school?.name ?? 'la escuela');
            await streamChat(
                [{ role: 'user', content: prompt }],
                { subjectName: 'Gestión institucional', courseName: school?.shortName ?? '' },
                { sessionId },
                {
                    onToken: t => setAiText(prev => prev + t),
                    onDone: () => setAiStreaming(false),
                    onError: e => { setAiError(e.message); setAiStreaming(false); },
                },
                controller.signal,
            );
        } catch {
            setAiError('No se pudo generar el parte. Probá de nuevo.');
        } finally {
            // streamChat puede resolver sin emitir 'done' ni 'error' (stream
            // cortado limpio o abort): nunca dejar el botón clavado.
            setAiStreaming(false);
        }
    };

    const counts = [
        { n: brief.escalatedAlerts, label: 'escaladas' },
        { n: brief.newAlerts, label: 'alertas nuevas' },
        { n: brief.negativeCheckins, label: 'check-ins negativos' },
        { n: brief.pendingCitations, label: 'citaciones sin confirmar' },
        { n: brief.newSubmissions, label: 'entregas' },
        { n: brief.newActivities, label: 'actividades' },
    ];

    return (
        <section className="card widget brief-widget animate-in stagger-1">
            <div className="widget-header">
                <h2 className="widget-title">
                    <Sunrise size={16} aria-hidden="true" />
                    Parte del día
                </h2>
                <button type="button" className="btn btn-outline btn-sm" onClick={handleRedact} disabled={aiStreaming}>
                    <Sparkles size={14} aria-hidden="true" />
                    {aiStreaming ? 'Redactando…' : 'Redactar con IA'}
                </button>
            </div>

            <div className="brief-counts">
                {counts.filter(c => c.n > 0).map(c => (
                    <span key={c.label} className="brief-count">
                        <b>{c.n}</b> {c.label}
                    </span>
                ))}
                {counts.every(c => c.n === 0) && (
                    <span className="brief-count quiet">Sin novedades en las últimas 24 horas.</span>
                )}
            </div>

            {brief.items.length > 0 && (
                <ul className="brief-items">
                    {brief.items.slice(0, 8).map((item, i) => (
                        <li key={i} className={`brief-item brief-${item.kind}`}>{item.text}</li>
                    ))}
                    {brief.items.length > 8 && (
                        <li className="brief-item quiet">+ {brief.items.length - 8} novedades más</li>
                    )}
                </ul>
            )}

            {(aiText || aiError) && (
                <div className="brief-ai">
                    {aiError
                        ? <p className="text-danger text-sm">{aiError}</p>
                        : <Suspense fallback={<Cargando texto="Preparando el texto…" />}><MarkdownRenderer content={aiText} /></Suspense>}
                </div>
            )}
        </section>
    );
}

function DirectorDashboardContent() {
    const { user } = useAuth();
    const navigate = useNavigate();
    const [insights, setInsights] = useState<DirectorInsights | null>(null);
    const [brief, setBrief] = useState<DailyBrief | null>(null);
    const [schoolAlerts, setSchoolAlerts] = useState<AlertType[]>([]);
    const [openAlertCount, setOpenAlertCount] = useState(0);
    const [recentComms, setRecentComms] = useState<Communication[]>([]);
    const [loadError, setLoadError] = useState(false);
    const [reloadKey, setReloadKey] = useState(0);

    useEffect(() => {
        if (!user) return;
        const schoolId = user.schoolId;
        setLoadError(false);

        Promise.all([
            getDirectorInsights(schoolId),
            computeDailyBrief(schoolId),
            getAlertsBySchool(schoolId),
            getCommunicationsBySchool(schoolId),
        ]).then(([ins, db, alerts, comms]) => {
            setInsights(ins);
            setBrief(db);
            const open = alerts.filter(a => a.status !== 'cerrada');
            setOpenAlertCount(open.length);
            setSchoolAlerts(open.slice(0, 4));
            setRecentComms(comms.slice(0, 3));
        }).catch(err => {
            console.error(err);
            setLoadError(true);
        });
    }, [user, reloadKey]);

    if (loadError) {
        return (
            <div className="dashboard-container">
                <EstadoVacio icono={AlertTriangle} titulo="No se pudo cargar el tablero"
                    texto="Revisá la conexión y probá de nuevo."
                    accion={{ etiqueta: 'Reintentar', icono: RotateCw, alTocar: () => setReloadKey(k => k + 1) }} />
            </div>
        );
    }

    if (!insights) {
        return (
            <div className="dashboard-container">
                <Esqueleto tipo="tarjetas" cantidad={6} etiqueta="Cargando el tablero…" />
            </div>
        );
    }

    const { riskIndex, curriculumCoverage, wellbeingPulse, teacherAdoption, familyResponse, feedbackLatency, heatmap } = insights;
    const worstCoverage = [...curriculumCoverage.bySubjectCourse].sort((a, b) => (a.pct ?? 0) - (b.pct ?? 0));

    return (
        <div className="dashboard-container tablero-dir">
            {/* Parte del día */}
            {brief && <DailyBriefWidget brief={brief} />}

            {/* KPI Row */}
            <div className="kpi-grid">
                <KpiCard
                    borderClass="border-left-danger"
                    icon={<AlertCircle size={20} className="text-danger" />}
                    title="En riesgo"
                    value={`${riskIndex.pct}%`}
                    caption={`${riskIndex.atRiskCount} de ${riskIndex.totalStudents} estudiantes con 2+ señales`}
                >
                    {riskIndex.atRiskStudents.length === 0
                        ? <p className="kpi-empty">Nadie con 2 o más señales activas.</p>
                        : riskIndex.atRiskStudents.slice(0, 8).map(s => (
                            <button type="button" key={s.studentId} className="kpi-row" onClick={() => navigate(`/cursos/${s.courseId}`)}>
                                <span>{s.firstName} {s.lastName}</span>
                                <span className="kpi-row-meta">{s.courseName} · {s.signalCount} señales</span>
                            </button>
                        ))}
                </KpiCard>

                <KpiCard
                    borderClass="border-left-primary"
                    icon={<BookOpen size={20} className="text-primary" />}
                    title="Cobertura curricular"
                    value={curriculumCoverage.pct !== null ? `${curriculumCoverage.pct}%` : '—'}
                    caption="clases dictadas del programa"
                >
                    {worstCoverage.length === 0
                        ? <p className="kpi-empty">Sin planificación cargada todavía.</p>
                        : worstCoverage.slice(0, 8).map(c => (
                            <button type="button" key={`${c.subjectId}-${c.courseId}`} className="kpi-row" onClick={() => navigate(`/cursos/${c.courseId}`)}>
                                <span>{c.subjectName} · {c.courseName}</span>
                                <span className="kpi-row-meta">{c.numerator}/{c.denominator} clases</span>
                            </button>
                        ))}
                </KpiCard>

                <KpiCard
                    borderClass="border-left-success"
                    icon={<HeartPulse size={20} className="text-success" />}
                    title="Pulso de bienestar"
                    value={wellbeingPulse.pct !== null && wellbeingPulse.totalCheckins >= MUESTRA_MINIMA ? `${wellbeingPulse.pct}%` : '—'}
                    caption={wellbeingPulse.totalCheckins >= MUESTRA_MINIMA
                        ? `positivos, sobre ${wellbeingPulse.totalCheckins} check-ins esta semana`
                        : wellbeingPulse.totalCheckins === 0
                            ? 'sin check-ins esta semana'
                            : `${wellbeingPulse.totalCheckins === 1 ? 'un check-in' : `${wellbeingPulse.totalCheckins} check-ins`} esta semana: pocos para sacar un porcentaje`}
                >
                    {wellbeingPulse.byCourse.length === 0
                        ? <p className="kpi-empty">Sin check-ins esta semana.</p>
                        : wellbeingPulse.byCourse.slice(0, 8).map(c => (
                            <button type="button" key={c.courseId} className="kpi-row" onClick={() => navigate(`/cursos/${c.courseId}`)}>
                                <span>{c.courseName}</span>
                                <span className="kpi-row-meta">{c.positivePct}% positivos · {c.totalCheckins}</span>
                            </button>
                        ))}
                </KpiCard>

                <KpiCard
                    borderClass="border-left-warning"
                    icon={<Users size={20} className="text-warning" />}
                    title="Adopción docente"
                    value={`${teacherAdoption.pct}%`}
                    caption={`${teacherAdoption.activeCount} de ${teacherAdoption.totalTeachers} activos (14 días)`}
                    drilldownLabel="Ver quién necesita acompañamiento"
                >
                    {teacherAdoption.inactiveTeachers.length === 0
                        ? <p className="kpi-empty">Todo el equipo activo.</p>
                        : teacherAdoption.inactiveTeachers.slice(0, 8).map(t => (
                            <div key={t.teacherId} className="kpi-row kpi-row-static">
                                <span>{t.firstName} {t.lastName}</span>
                                <span className="kpi-row-meta">{t.lastActiveAt ? formatRelative(t.lastActiveAt) : 'Nunca publicó'}</span>
                            </div>
                        ))}
                </KpiCard>

                <KpiCard
                    borderClass="border-left-violet"
                    icon={<Megaphone size={20} style={{ color: 'var(--accent-ia)' }} />}
                    title="Respuesta de familias"
                    value={familyResponse.readPct !== null ? `${familyResponse.readPct}%` : '—'}
                    caption={familyResponse.citationConfirmedPct !== null
                        ? `${familyResponse.citationConfirmedPct}% de citaciones respondidas a 72h`
                        : 'sin citaciones recientes'}
                >
                    {familyResponse.recentNotices.length === 0
                        ? <p className="kpi-empty">Sin comunicados recientes.</p>
                        : familyResponse.recentNotices.map(n => (
                            <div key={n.noticeId} className="kpi-row kpi-row-static">
                                <span>{n.title}</span>
                                <span className="kpi-row-meta">{n.readPct !== null ? `${n.readCount}/${n.audienceSize} leídos` : 'sin destinatarios'}</span>
                            </div>
                        ))}
                </KpiCard>

                <KpiCard
                    borderClass="border-left-info"
                    icon={<Clock size={20} className="text-subtle" />}
                    title="Latencia de devolución"
                    value={feedbackLatency.medianHours !== null ? formatLatencyHours(feedbackLatency.medianHours) : '—'}
                    caption={`mediana sobre ${feedbackLatency.sampleSize} entregas corregidas (30 días)`}
                >
                    {feedbackLatency.pendingReview.length === 0
                        ? <p className="kpi-empty">Nada esperando devolución.</p>
                        : feedbackLatency.pendingReview.map(p => (
                            <div key={p.submissionId} className="kpi-row kpi-row-static">
                                <span>{p.studentName} · {p.activityTitle}</span>
                                <span className="kpi-row-meta">{formatLatencyHours(p.hoursWaiting)} esperando</span>
                            </div>
                        ))}
                </KpiCard>
            </div>

            <div className="director-main-grid">
                {/* Left: Mapa institucional curso × materia */}
                <div className="card padding-xl animate-in stagger-5">
                    <h2 className="mb-1 text-lg font-semibold">Mapa institucional</h2>
                    <p className="text-sm text-secondary mb-6">Curso × materia. Un clic en una celda o en el curso abre su ficha.</p>
                    <CourseHeatmap cellsByMetric={heatmap} />
                </div>

                {/* Right: Alerts Summary + Recent Comms */}
                <div className="director-right-col">
                    {/* Alerts Summary */}
                    <section className="card widget animate-in stagger-6">
                        <div className="widget-header">
                            <h2 className="widget-title">
                                Alertas pendientes
                                {openAlertCount > 0 && <span className="badge badge-danger">{openAlertCount}</span>}
                            </h2>
                            {openAlertCount > 0 && (
                                <Link to="/alerts" className="btn btn-ghost btn-sm">Ver todas <ArrowRight size={14} aria-hidden="true" /></Link>
                            )}
                        </div>
                        {schoolAlerts.length === 0 ? (
                            <EstadoVacio compacto icono={CheckCircle2} titulo="No hay alertas abiertas"
                                texto="Cuando un docente o el sistema marque algo para seguir, aparece acá." />
                        ) : (
                            <ul className="alerts-list">
                                {schoolAlerts.map(alert => (
                                    <li key={alert.id} className={`alert-item alert-${alert.type}`}>
                                        <div className="alert-icon-wrap" aria-hidden="true">
                                            {alert.type === 'danger' && <AlertTriangle size={16} />}
                                            {alert.type === 'warning' && <Info size={16} />}
                                            {alert.type === 'success' && <CheckCircle size={16} />}
                                            {alert.type === 'info' && <Info size={16} />}
                                        </div>
                                        <div className="alert-content">
                                            <p className="alert-msg">
                                                <span className="sr-only">{alert.type === 'danger' ? 'Urgente: ' : alert.type === 'warning' ? 'Atención: ' : ''}</span>
                                                {alert.escalatedAt && (
                                                    <span className="badge badge-escalada" style={{ marginRight: 6 }}>
                                                        <ArrowUpRight size={11} aria-hidden="true" /> Escalada
                                                    </span>
                                                )}
                                                {alert.message}
                                            </p>
                                            <span className="alert-date">{alert.date}</span>
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </section>

                    {/* Recent Communications */}
                    <section className="card widget animate-in stagger-7">
                        <div className="widget-header">
                            <h2 className="widget-title">
                                <MessageSquare size={16} aria-hidden="true" />
                                Últimos comunicados
                            </h2>
                            {recentComms.length > 0 && (
                                <Link to="/comunicaciones" className="btn btn-ghost btn-sm">Ver todos <ArrowRight size={14} aria-hidden="true" /></Link>
                            )}
                        </div>
                        {recentComms.length === 0 ? (
                            <EstadoVacio compacto icono={MessageSquare} titulo="Todavía no mandaste comunicados"
                                texto="Le llegan al equipo docente como aviso en su panel."
                                accion={{ etiqueta: 'Escribir un comunicado', icono: PenLine, a: '/comunicaciones' }} />
                        ) : (
                            <ul className="comms-widget-list">
                                {recentComms.map(comm => (
                                    <li key={comm.id} className="comms-widget-item">
                                        <div className="comms-widget-body">
                                            <span className="comms-widget-subject">{comm.subject}</span>
                                            <span className="comms-widget-to">Para: {comm.toNames.join(', ')}</span>
                                        </div>
                                        <span className="comms-widget-date">
                                            {new Date(comm.sentAt).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })}
                                        </span>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </section>
                </div>
            </div>
        </div>
    );
}

export default function Dashboard() {
    return <DirectorDashboardContent />;
}
