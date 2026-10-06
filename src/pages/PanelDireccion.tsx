/**
 * SMT EstudIA — Panel de dirección
 *
 * Lo que está pasando en la escuela, en una pantalla: qué clases están
 * en vivo ahora, cómo viene cada curso anímicamente, y qué hizo cada
 * docente con la herramienta.
 *
 * No es para controlar gente: es para que dirección sepa dónde hace
 * falta acompañar — a un curso que viene mal o a un docente que todavía
 * no arrancó.
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Radio, HeartPulse, Users, Layers, ClipboardList, CheckSquare,
    ClipboardCheck, AlertTriangle, Activity, Bell, CheckCircle2, ArrowRight, UserX, RotateCw,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import {
    getTeacherPulse, getSchoolClimate, getLiveNow,
    type TeacherPulse, type CourseClimateRow,
} from '../services/stats.service';
import { Esqueleto } from '../components/ui/Esqueleto';
import EstadoVacio from '../components/ui/EstadoVacio';
import '../components/ui/ui.css';
import './PanelDireccion.css';

const RANGES = [
    { days: 7, label: 'Última semana' },
    { days: 30, label: 'Último mes' },
    { days: 90, label: 'Trimestre' },
];

function moodClass(mood: number | null): string {
    if (mood === null) return 'none';
    if (mood >= 4.2) return 'great';
    if (mood >= 3.5) return 'good';
    if (mood >= 2.8) return 'mid';
    return 'low';
}

function relativeDate(iso: string | null): string {
    if (!iso) return 'Nunca usó la app';
    const diff = Date.now() - new Date(iso).getTime();
    const days = Math.floor(diff / 86400_000);
    if (days <= 0) return 'Hoy';
    if (days === 1) return 'Ayer';
    if (days < 7) return `Hace ${days} días`;
    if (days < 30) return `Hace ${Math.floor(days / 7)} semana(s)`;
    return `Hace ${Math.floor(days / 30)} mes(es)`;
}

export default function PanelDireccion() {
    const { user } = useAuth();
    const navigate = useNavigate();

    const [days, setDays] = useState(30);
    const [pulse, setPulse] = useState<TeacherPulse[]>([]);
    const [climate, setClimate] = useState<CourseClimateRow[]>([]);
    const [liveNow, setLiveNow] = useState<{ id: string; title: string; teacherId: string }[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [reintento, setReintento] = useState(0);

    useEffect(() => {
        if (!user) return;
        setLoading(true);
        setError('');
        Promise.all([
            getTeacherPulse(days),
            getSchoolClimate(days),
            getLiveNow().catch(() => []),
        ]).then(([p, c, l]) => {
            setPulse(p);
            setClimate(c);
            setLiveNow(l);
        }).catch(err => {
            console.error(err);
            setError('No se pudieron cargar los datos de la escuela.');
        }).finally(() => setLoading(false));
    }, [user, days, reintento]);

    if (!user) return null;

    /** Baja hasta una sección de la misma pantalla y le pasa el foco. */
    const irA = (id: string) => {
        const destino = document.getElementById(id);
        if (!destino) return;
        destino.scrollIntoView({ behavior: 'smooth', block: 'start' });
        destino.focus({ preventScroll: true });
    };

    const teacherName = (id: string) => pulse.find(t => t.teacherId === id)?.teacherName ?? 'Docente';
    const totalPending = pulse.reduce((a, t) => a + t.pendingGrading, 0);
    const atRisk = climate.reduce((a, c) => a + c.studentsAtRisk, 0);
    const inactive = pulse.filter(t => !t.lastActive).length;
    const withCheckins = climate.filter(c => c.checkins > 0);
    const schoolMood = withCheckins.length > 0
        ? withCheckins.reduce((a, c) => a + (c.mood ?? 0), 0) / withCheckins.length
        : null;

    // Lo primero que ve dirección: qué pide atención ahora, armado con lo
    // que ya llegó (sin pedidos extra). Lo más urgente arriba.
    const cursosAAcompanar = [...climate]
        .filter(c => c.studentsAtRisk > 0 || moodClass(c.mood) === 'low')
        .sort((a, b) => b.studentsAtRisk - a.studentsAtRisk || (a.mood ?? 5) - (b.mood ?? 5));
    const docentesConPendientes = pulse.filter(t => t.pendingGrading > 0).length;
    const hayAlgo = cursosAAcompanar.length > 0 || totalPending > 0 || inactive > 0 || liveNow.length > 0;

    return (
        <div className="pd-container animate-in">
            <header className="pd-header">
                <p className="pd-bajada">El pulso de la escuela: cursos, docentes y aulas en vivo.</p>
                <div className="pd-ranges fila-desplazable" role="group" aria-label="Período">
                    {RANGES.map(r => (
                        <button
                            key={r.days}
                            type="button"
                            className={`pd-range ${days === r.days ? 'active' : ''}`}
                            aria-pressed={days === r.days}
                            onClick={() => setDays(r.days)}
                        >
                            {r.label}
                        </button>
                    ))}
                </div>
            </header>

            {error && (
                <div className="pd-error" role="alert">
                    <AlertTriangle size={15} aria-hidden="true" /> {error}
                    <button type="button" className="btn btn-outline btn-sm" onClick={() => setReintento(n => n + 1)}>
                        <RotateCw size={14} aria-hidden="true" /> Reintentar
                    </button>
                </div>
            )}
            {loading && <Esqueleto tipo="tarjetas" cantidad={4} etiqueta="Leyendo el pulso de la escuela…" />}

            {!loading && !error && (
                <>
                    {/* Qué pide atención ahora */}
                    <section className="card pd-section pd-atencion" aria-labelledby="pd-atencion-titulo">
                        <h2 className="pd-title" id="pd-atencion-titulo"><Bell size={16} aria-hidden="true" /> Para atender ahora</h2>
                        {!hayAlgo ? (
                            <p className="pd-tranqui"><CheckCircle2 size={16} aria-hidden="true" /> Nada urgente en este período: ningún curso viene mal y no hay entregas esperando.</p>
                        ) : (
                            <ul className="pd-atencion-lista">
                                {liveNow.length > 0 && (
                                    <li className="pd-atencion-item vivo">
                                        <Radio size={16} aria-hidden="true" />
                                        <span>
                                            <strong>{liveNow.length === 1 ? '1 clase en vivo' : `${liveNow.length} clases en vivo`}</strong> en este momento
                                        </span>
                                        <button type="button" className="pd-atencion-ir" onClick={() => irA('pd-vivo')}>Ver <ArrowRight size={14} aria-hidden="true" /></button>
                                    </li>
                                )}
                                {cursosAAcompanar.slice(0, 4).map(c => (
                                    <li key={c.courseId} className="pd-atencion-item riesgo">
                                        <AlertTriangle size={16} aria-hidden="true" />
                                        <span>
                                            <strong>{c.courseName}</strong>
                                            {c.studentsAtRisk > 0
                                                ? `: ${c.studentsAtRisk === 1 ? '1 estudiante' : `${c.studentsAtRisk} estudiantes`} a acompañar`
                                                : ': el ánimo del curso viene bajo'}
                                        </span>
                                        <button type="button" className="pd-atencion-ir" onClick={() => navigate(`/cursos/${c.courseId}`)}>
                                            Ver curso <ArrowRight size={14} aria-hidden="true" />
                                        </button>
                                    </li>
                                ))}
                                {totalPending > 0 && (
                                    <li className="pd-atencion-item">
                                        <ClipboardCheck size={16} aria-hidden="true" />
                                        <span>
                                            <strong>{totalPending === 1 ? '1 entrega' : `${totalPending} entregas`} sin corregir</strong>
                                            {` de ${docentesConPendientes === 1 ? '1 docente' : `${docentesConPendientes} docentes`}`}
                                        </span>
                                        <button type="button" className="pd-atencion-ir" onClick={() => irA('pd-docentes')}>Ver <ArrowRight size={14} aria-hidden="true" /></button>
                                    </li>
                                )}
                                {inactive > 0 && (
                                    <li className="pd-atencion-item">
                                        <UserX size={16} aria-hidden="true" />
                                        <span>
                                            <strong>{inactive === 1 ? '1 docente' : `${inactive} docentes`}</strong> todavía no {inactive === 1 ? 'usó' : 'usaron'} la app
                                        </span>
                                        <button type="button" className="pd-atencion-ir" onClick={() => irA('pd-docentes')}>Ver <ArrowRight size={14} aria-hidden="true" /></button>
                                    </li>
                                )}
                            </ul>
                        )}
                        <button type="button" className="btn btn-outline btn-sm pd-more" onClick={() => navigate('/alerts')}>
                            <Activity size={14} aria-hidden="true" /> Ver las alertas de la escuela
                        </button>
                    </section>

                    {/* Resumen */}
                    <div className="pd-summary">
                        <div className={`pd-sum-card mood-${moodClass(schoolMood)}`}>
                            <HeartPulse size={17} />
                            <span className="pd-sum-val">{schoolMood !== null ? schoolMood.toFixed(1) : '—'}</span>
                            <span className="pd-sum-label">ánimo de la escuela</span>
                        </div>
                        <div className="pd-sum-card">
                            <Radio size={17} className={liveNow.length > 0 ? 'text-danger' : ''} />
                            <span className="pd-sum-val">{liveNow.length}</span>
                            <span className="pd-sum-label">clases en vivo ahora</span>
                        </div>
                        <div className="pd-sum-card">
                            <AlertTriangle size={17} className={atRisk > 0 ? 'text-warning' : ''} />
                            <span className="pd-sum-val">{atRisk}</span>
                            <span className="pd-sum-label">estudiantes a acompañar</span>
                        </div>
                        <div className="pd-sum-card">
                            <ClipboardCheck size={17} />
                            <span className="pd-sum-val">{totalPending}</span>
                            <span className="pd-sum-label">entregas sin corregir</span>
                        </div>
                    </div>

                    {/* En vivo ahora */}
                    {liveNow.length > 0 && (
                        <section className="card pd-section pd-live" id="pd-vivo" tabIndex={-1} aria-labelledby="pd-vivo-titulo">
                            <h2 className="pd-title" id="pd-vivo-titulo"><Radio size={16} className="text-danger" aria-hidden="true" /> Aulas en vivo en este momento</h2>
                            <div className="pd-live-list">
                                {liveNow.map(l => (
                                    <div key={l.id} className="pd-live-item">
                                        <span className="pd-live-dot" aria-hidden="true" />
                                        <div>
                                            <strong>{l.title}</strong>
                                            <span>{teacherName(l.teacherId)}</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </section>
                    )}

                    {/* Clima por curso */}
                    <section className="card pd-section">
                        <h2 className="pd-title"><HeartPulse size={16} aria-hidden="true" /> Cómo viene cada curso</h2>
                        <p className="text-sm text-secondary">
                            Sale de lo que los propios estudiantes dicen sentir. No es una nota ni una evaluación.
                        </p>
                        {climate.length === 0 && (
                            <EstadoVacio compacto icono={HeartPulse} titulo="Todavía no hay cursos con datos"
                                texto="El clima aparece cuando los estudiantes empiezan a contar cómo llegan a clase." />
                        )}
                        <div className="pd-courses">
                            {climate.map(c => (
                                <div key={c.courseId} className={`pd-course mood-${moodClass(c.mood)}`}>
                                    <div className="pd-course-head">
                                        <strong>{c.courseName}</strong>
                                        <span className="pd-course-mood">
                                            {c.mood !== null ? c.mood.toFixed(1) : 'sin datos'}
                                        </span>
                                    </div>
                                    <div className="pd-course-bar">
                                        <div
                                            className="pd-course-fill"
                                            style={{ width: c.mood !== null ? `${(c.mood / 5) * 100}%` : '0%' }}
                                        />
                                    </div>
                                    <div className="pd-course-meta">
                                        <span>{c.checkins} check-in{c.checkins !== 1 ? 's' : ''}</span>
                                        {c.studentsAtRisk > 0 && (
                                            <span className="pd-course-risk">
                                                <AlertTriangle size={11} /> {c.studentsAtRisk} a acompañar
                                            </span>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </section>

                    {/* Docentes */}
                    <section className="card pd-section" id="pd-docentes" tabIndex={-1} aria-labelledby="pd-docentes-titulo">
                        <h2 className="pd-title" id="pd-docentes-titulo"><Users size={16} aria-hidden="true" /> Qué hizo cada docente</h2>
                        <p className="text-sm text-secondary">
                            Para saber a quién hay que acompañar, no para controlar.
                            {inactive === 1 && ' 1 docente todavía no usó la app.'}
                            {inactive > 1 && ` ${inactive} docentes todavía no usaron la app.`}
                        </p>
                        {pulse.length === 0 && (
                            <EstadoVacio compacto icono={Users} titulo="Todavía no hay docentes en la escuela"
                                texto="Sumalos desde Mi escuela y asignales sus materias."
                                accion={{ etiqueta: 'Ir a Mi escuela', a: '/mi-escuela' }} />
                        )}
                        <div className="pd-teachers">
                            {pulse.map(t => {
                                const total = t.materials + t.activities + t.liveClasses + t.attendanceTaken;
                                return (
                                    <div key={t.teacherId} className={`pd-teacher ${total === 0 ? 'quiet' : ''}`}>
                                        <div className="pd-teacher-head">
                                            <strong>{t.teacherName}</strong>
                                            <span className={`pd-last ${!t.lastActive ? 'never' : ''}`}>
                                                {relativeDate(t.lastActive)}
                                            </span>
                                        </div>
                                        <div className="pd-teacher-stats">
                                            <span title="Materiales subidos o generados">
                                                <Layers size={12} /> {t.materials} <em>materiales</em>
                                            </span>
                                            <span title="Actividades creadas">
                                                <ClipboardList size={12} /> {t.activities} <em>actividades</em>
                                            </span>
                                            <span title="Clases en vivo dadas">
                                                <Radio size={12} /> {t.liveClasses} <em>en vivo</em>
                                            </span>
                                            <span title="Veces que pasó lista">
                                                <CheckSquare size={12} /> {t.attendanceTaken} <em>listas</em>
                                            </span>
                                            <span title="Entregas corregidas">
                                                <ClipboardCheck size={12} /> {t.graded} <em>corregidas</em>
                                            </span>
                                            {t.pendingGrading > 0 && (
                                                <span className="pd-teacher-pending" title="Entregas esperando corrección">
                                                    {t.pendingGrading} sin corregir
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </section>
                </>
            )}
        </div>
    );
}
