/**
 * SMT EstudIA — Armar un módulo
 *
 * El recorrido completo en una sola pantalla: el docente escribe un tema,
 * la IA arma el módulo, y él elige qué quiere que salga de ahí — placas
 * para repasar en el celular, un podcast para escuchar en el colectivo,
 * una actividad para entregar, o una pregunta para lanzar en vivo.
 *
 * Todo lo que antes estaba desparramado en cuatro secciones distintas
 * ocurre acá, y se ve ocurrir.
 */

import { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
    Boxes, Sparkles, Layers, Headphones, ClipboardList, Radio,
    Check, Loader2, ArrowRight, Share2, Eye, AlertCircle, Square,
    BookOpen, PenLine, FolderTree,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { getSubjects } from '../services/subjects.service';
import { getOrCreateSession, saveUserMessage } from '../services/chat-history.service';
import { streamChat } from '../services/ia-chat.service';
import { createMaterial, getMaterialsByTeacher } from '../services/library.service';
import { getPlanningByTeacher } from '../services/planning.service';
import {
    updateMaterial, generateStudyCards, generatePodcast, extractQuestions,
} from '../services/documents.service';
import { createActivity } from '../services/activities.service';
import { startLiveSession, launchActivity, getMyLiveSession } from '../services/live.service';
import MarkdownRenderer from '../components/MarkdownRenderer';
import StudyCardsViewer from '../components/StudyCardsViewer';
import PodcastPlayer from '../components/PodcastPlayer';
import type { Subject, StudyCard, ActivityQuestion, LibraryMaterial, PlanningClass } from '../types';
import './ArmarModulo.css';

type PieceKey = 'placas' | 'podcast' | 'actividad' | 'vivo';
type PieceState = 'idle' | 'working' | 'done' | 'error';

const PIECES: { key: PieceKey; emoji: string; icon: typeof Layers; label: string; desc: string }[] = [
    { key: 'placas', emoji: '🃏', icon: Layers, label: 'Placas de estudio', desc: 'Tarjetas con preguntas y quiz para repasar desde el celular' },
    { key: 'podcast', emoji: '🎧', icon: Headphones, label: 'Podcast', desc: 'Un audio de 2-3 minutos para escuchar en el colectivo' },
    { key: 'actividad', emoji: '📝', icon: ClipboardList, label: 'Actividad para entregar', desc: 'Con preguntas que se corrigen solas' },
    { key: 'vivo', emoji: '📡', icon: Radio, label: 'Pregunta para la clase en vivo', desc: 'Para lanzar al curso y ver las respuestas en el momento' },
];

export default function ArmarModulo() {
    const { user } = useAuth();
    const navigate = useNavigate();

    const [step, setStep] = useState<1 | 2 | 3>(1);
    const [subjectsMap, setSubjectsMap] = useState<Record<string, Subject>>({});
    const [assignmentIdx, setAssignmentIdx] = useState(0);
    const [topic, setTopic] = useState('');

    // De dónde sale el módulo. Con material o con un tema de la planificación
    // el contenido es REAL: sale de lo que el docente ya tiene, no de lo que
    // la IA imagine sobre el título.
    const [origen, setOrigen] = useState<'material' | 'tema' | 'nuevo'>('nuevo');
    const [materials, setMaterials] = useState<LibraryMaterial[]>([]);
    const [temas, setTemas] = useState<(PlanningClass & { unitTitle: string })[]>([]);
    const [baseMaterialId, setBaseMaterialId] = useState('');
    const [temaId, setTemaId] = useState('');

    // Generación del módulo
    const [content, setContent] = useState('');
    const [generating, setGenerating] = useState(false);
    const [error, setError] = useState('');
    const abortRef = useRef<AbortController | null>(null);

    // Piezas elegidas y su progreso
    const [chosen, setChosen] = useState<Set<PieceKey>>(new Set(['placas', 'actividad']));
    const [states, setStates] = useState<Record<PieceKey, PieceState>>({
        placas: 'idle', podcast: 'idle', actividad: 'idle', vivo: 'idle',
    });
    const [building, setBuilding] = useState(false);

    // Resultados
    const [materialId, setMaterialId] = useState<string | null>(null);
    const [cards, setCards] = useState<StudyCard[] | null>(null);
    const [podcastPath, setPodcastPath] = useState<string | null>(null);
    const [activityId, setActivityId] = useState<string | null>(null);
    const [liveReady, setLiveReady] = useState(false);
    const [shared, setShared] = useState(false);

    const [showCards, setShowCards] = useState(false);
    const [showPodcast, setShowPodcast] = useState(false);

    const assignments = user?.subjects ?? [];
    const assignment = assignments[assignmentIdx];
    const subjectName = assignment ? (subjectsMap[assignment.subjectId]?.name ?? 'Materia') : '';

    const [searchParams] = useSearchParams();

    useEffect(() => {
        if (!user) return;
        getMaterialsByTeacher(user.id)
            .then(list => setMaterials(list.filter(m => m.extractedText)))
            .catch(console.error);
        getPlanningByTeacher(user.id)
            .then(units => setTemas(units.flatMap(u => u.classes.map(c => ({ ...c, unitTitle: u.title })))))
            .catch(console.error);
    }, [user]);

    // Llegado desde la planificación con ?tema=<id>
    useEffect(() => {
        const t = searchParams.get('tema');
        if (t && temas.some(x => x.id === t)) {
            setTemaId(t);
            setOrigen('tema');
        }
    }, [searchParams, temas]);

    useEffect(() => {
        getSubjects().then(list => {
            const map: Record<string, Subject> = {};
            list.forEach(s => { map[s.id] = s; });
            setSubjectsMap(map);
        }).catch(console.error);
        return () => abortRef.current?.abort();
    }, []);

    if (!user) return null;

    const setPiece = (key: PieceKey, state: PieceState) =>
        setStates(prev => ({ ...prev, [key]: state }));

    const togglePiece = (key: PieceKey) => {
        setChosen(prev => {
            const next = new Set(prev);
            next.has(key) ? next.delete(key) : next.add(key);
            return next;
        });
    };

    const baseMaterial = materials.find(m => m.id === baseMaterialId) ?? null;
    const baseTema = temas.find(t => t.id === temaId) ?? null;

    /** Título del módulo según de dónde salga. */
    const moduleName = origen === 'material' && baseMaterial ? (topic.trim() || baseMaterial.title)
        : origen === 'tema' && baseTema ? (topic.trim() || baseTema.title)
        : topic.trim();

    const canGenerate = Boolean(assignment) && (
        origen === 'material' ? Boolean(baseMaterial)
            : origen === 'tema' ? Boolean(baseTema)
            : Boolean(topic.trim())
    );

    // ── Paso 1 → 2: la IA arma el módulo ──
    const handleGenerate = async () => {
        if (!canGenerate || !assignment || generating) return;
        setGenerating(true);
        setError('');
        setContent('');
        setStep(2);

        try {
            const session = await getOrCreateSession(user.id, null, {
                subjectId: assignment.subjectId,
                courseId: assignment.courseId,
                title: 'Armar módulo',
            });
            const estructura =
                `Incluí, en este orden y con encabezados claros:\n` +
                `1. Objetivos de aprendizaje (3 a 4, empezando con verbo en infinitivo)\n` +
                `2. Desarrollo, dividido en 2 a 4 TEMAS dictables. Cada tema con su título ` +
                `como "### Tema N: <título>" y su desarrollo debajo, con ejemplos concretos ` +
                `de la vida real argentina\n` +
                `3. Ideas clave para recordar\n` +
                `4. Preguntas para pensar en clase\n\n` +
                `Lenguaje de secundaria, español rioplatense.`;

            // Con material o con un tema de la planificación, el módulo se apoya en
            // contenido real del docente en vez de en lo que la IA suponga del título.
            let prompt: string;
            if (origen === 'material' && baseMaterial) {
                const fuente = (baseMaterial.extractedText ?? '').slice(0, 18000);
                prompt =
                    `Armá un MÓDULO DE CLASE para ${assignment.courseName} A PARTIR DEL MATERIAL de abajo.\n\n` +
                    (topic.trim() ? `Enfocate en: "${topic.trim()}".\n\n` : '') +
                    estructura + '\n\n' +
                    `REGLA IMPORTANTE: basate en este material, no en lo que vos sepas del tema. ` +
                    `No agregues contenido que no esté acá. Si algo está incompleto, decilo en ` +
                    `vez de inventarlo.\n\nMATERIAL: "${baseMaterial.title}"\n---\n${fuente}\n---`;
            } else if (origen === 'tema' && baseTema) {
                const objetivos = baseTema.objectives?.length
                    ? `\nObjetivos que ya definiste: ${baseTema.objectives.join('; ')}.` : '';
                const previo = baseTema.content
                    ? `\n\nContenido que ya escribiste para este tema (respetalo y ampliá sobre eso):\n---\n${baseTema.content.slice(0, 8000)}\n---`
                    : '';
                prompt =
                    `Armá un MÓDULO DE CLASE para ${assignment.courseName} sobre el tema ` +
                    `"${baseTema.title}", que forma parte de "${baseTema.unitTitle}".${objetivos}${previo}\n\n` +
                    estructura;
            } else {
                prompt = `Armá un MÓDULO DE CLASE sobre "${moduleName}" para ${assignment.courseName}.\n\n${estructura}`;
            }
            saveUserMessage(session.id, prompt, 'act').catch(() => {});

            const controller = new AbortController();
            abortRef.current = controller;
            let full = '';

            await streamChat(
                [{ role: 'user', content: prompt }],
                { subjectName, courseName: assignment.courseName },
                { sessionId: session.id, tool: 'act' },
                {
                    onToken: t => { full += t; setContent(full); },
                    onDone: () => { setGenerating(false); abortRef.current = null; },
                    onError: e => { setError(e.message); setGenerating(false); abortRef.current = null; },
                },
                controller.signal,
            );
        } catch (err) {
            setError(err instanceof Error ? err.message : 'No se pudo armar el módulo.');
            setGenerating(false);
        }
    };

    const handleStop = () => {
        abortRef.current?.abort();
        setGenerating(false);
        abortRef.current = null;
    };

    // ── Paso 2 → 3: generar lo elegido ──
    const handleBuild = async () => {
        if (!assignment || building || chosen.size === 0 || !content.trim()) return;
        setBuilding(true);
        setError('');
        setStep(3);

        const moduleTitle = `Módulo: ${moduleName}`;

        try {
            // El módulo queda como material de la biblioteca: de ahí salen las demás piezas
            const mat = await createMaterial({
                title: moduleTitle,
                description: `Generado con IA para ${subjectName} · ${assignment.courseName}`,
                fileType: 'doc',
                fileName: '',
                fileSize: '—',
                subjectId: assignment.subjectId,
                subjectName,
                teacherId: user.id,
                schoolId: user.schoolId,
                tags: ['módulo', topic.trim().slice(0, 24)],
            });
            await updateMaterial(mat.id, { extractedText: content });
            setMaterialId(mat.id);

            // Las piezas se generan de a una, y se ve cada una completarse
            if (chosen.has('placas')) {
                setPiece('placas', 'working');
                try {
                    const generated = await generateStudyCards(content, moduleTitle);
                    await updateMaterial(mat.id, { studyCards: generated });
                    setCards(generated);
                    setPiece('placas', generated.length ? 'done' : 'error');
                } catch (err) {
                    console.error('placas:', err);
                    setPiece('placas', 'error');
                }
            }

            if (chosen.has('podcast')) {
                setPiece('podcast', 'working');
                try {
                    await generatePodcast(mat.id);
                    setPodcastPath(`podcasts/${mat.id}.mp3`);
                    setPiece('podcast', 'done');
                } catch (err) {
                    console.error('podcast:', err);
                    setPiece('podcast', 'error');
                }
            }

            let questions: ActivityQuestion[] = [];
            if (chosen.has('actividad') || chosen.has('vivo')) {
                try {
                    questions = await extractQuestions(content);
                } catch (err) {
                    console.error('preguntas:', err);
                }
            }

            if (chosen.has('actividad')) {
                setPiece('actividad', 'working');
                try {
                    const act = await createActivity({
                        title: `Actividad: ${topic.trim()}`,
                        description: `Sobre el módulo "${topic.trim()}"`,
                        contentMd: content,
                        questions,
                        subjectId: assignment.subjectId,
                        courseId: assignment.courseId,
                        teacherId: user.id,
                        schoolId: user.schoolId,
                        sourceTool: 'act',
                        points: 10,
                    });
                    setActivityId(act.id);
                    setPiece('actividad', 'done');
                } catch (err) {
                    console.error('actividad:', err);
                    setPiece('actividad', 'error');
                }
            }

            if (chosen.has('vivo')) {
                setPiece('vivo', 'working');
                try {
                    const mc = questions.find(q => q.type === 'multiple_choice' && (q.options?.length ?? 0) >= 2);
                    if (!mc) throw new Error('sin pregunta de opciones');
                    // Si ya hay una clase abierta para el curso se reusa
                    const existing = await getMyLiveSession(user.id);
                    const session = existing && existing.courseId === assignment.courseId
                        ? existing
                        : await startLiveSession({
                            teacherId: user.id,
                            schoolId: user.schoolId,
                            subjectId: assignment.subjectId,
                            courseId: assignment.courseId,
                            title: `${subjectName} · ${assignment.courseName}`,
                        });
                    const options = (mc.options ?? []).map((label, i) => ({ id: String.fromCharCode(97 + i), label }));
                    await launchActivity(session.id, 'quiz', {
                        question: mc.prompt,
                        options,
                        correctId: options[mc.correct_index ?? 0]?.id,
                    });
                    setLiveReady(true);
                    setPiece('vivo', 'done');
                } catch (err) {
                    console.error('vivo:', err);
                    setPiece('vivo', 'error');
                }
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'No se pudo generar el material.');
        } finally {
            setBuilding(false);
        }
    };

    const handleShare = async () => {
        if (!materialId) return;
        try {
            await updateMaterial(materialId, { isSharedWithStudents: true });
            setShared(true);
        } catch (err) {
            console.error(err);
        }
    };

    const allDone = !building && step === 3;

    return (
        <div className="mod-container animate-in">
            {/* Pasos */}
            <div className="mod-steps">
                {['De dónde sale', 'El módulo', 'El material'].map((label, i) => (
                    <div key={label} className={`mod-step ${step > i ? 'done' : ''} ${step === i + 1 ? 'active' : ''}`}>
                        <span className="mod-step-num">{step > i + 1 ? <Check size={13} /> : i + 1}</span>
                        <span className="mod-step-label">{label}</span>
                    </div>
                ))}
            </div>

            {error && <div className="mod-error"><AlertCircle size={15} /> {error}</div>}

            {/* ── Paso 1: el tema ── */}
            {step === 1 && (
                <section className="card mod-card mod-intro">
                    <div className="mod-hero-icon"><Boxes size={26} /></div>
                    <h2>Armá un módulo completo</h2>
                    <p className="text-secondary">
                        De un módulo salen sus temas, y de ahí las placas, el podcast, la actividad
                        y las preguntas para el aula. Todo junto, en un minuto.
                    </p>

                    <div className="mod-form">
                        <label className="mod-label">¿Para qué curso?</label>
                        <select
                            className="form-select"
                            value={assignmentIdx}
                            onChange={e => setAssignmentIdx(Number(e.target.value))}
                        >
                            {assignments.map((a, i) => (
                                <option key={i} value={i}>
                                    {subjectsMap[a.subjectId]?.name ?? 'Materia'} — {a.courseName}
                                </option>
                            ))}
                        </select>

                        <label className="mod-label">¿De dónde sale el contenido?</label>
                        <div className="mod-origenes">
                            {materials.length > 0 && (
                                <button
                                    className={`mod-origen ${origen === 'material' ? 'on' : ''}`}
                                    onClick={() => setOrigen('material')}
                                >
                                    <BookOpen size={16} />
                                    <span><strong>De mi biblioteca</strong>
                                        <em>Usa tu material tal cual: el módulo sale real</em></span>
                                </button>
                            )}
                            {temas.length > 0 && (
                                <button
                                    className={`mod-origen ${origen === 'tema' ? 'on' : ''}`}
                                    onClick={() => setOrigen('tema')}
                                >
                                    <FolderTree size={16} />
                                    <span><strong>De un tema de mi planificación</strong>
                                        <em>Respeta los objetivos que ya escribiste</em></span>
                                </button>
                            )}
                            <button
                                className={`mod-origen ${origen === 'nuevo' ? 'on' : ''}`}
                                onClick={() => setOrigen('nuevo')}
                            >
                                <PenLine size={16} />
                                <span><strong>De un tema nuevo</strong>
                                    <em>Lo escribís vos y la IA lo desarrolla</em></span>
                            </button>
                        </div>

                        {origen === 'material' && (
                            <select
                                className="form-select"
                                value={baseMaterialId}
                                onChange={e => setBaseMaterialId(e.target.value)}
                            >
                                <option value="">Elegí un material...</option>
                                {materials.map(m => (
                                    <option key={m.id} value={m.id}>{m.subjectName}: {m.title}</option>
                                ))}
                            </select>
                        )}

                        {origen === 'tema' && (
                            <select
                                className="form-select"
                                value={temaId}
                                onChange={e => setTemaId(e.target.value)}
                            >
                                <option value="">Elegí un tema...</option>
                                {temas.map(t => (
                                    <option key={t.id} value={t.id}>{t.unitTitle} → {t.title}</option>
                                ))}
                            </select>
                        )}

                        <label className="mod-label">
                            {origen === 'nuevo' ? '¿Sobre qué tema?' : 'Enfoque (opcional)'}
                        </label>
                        <input
                            className="mod-input"
                            placeholder={origen === 'nuevo'
                                ? 'Ej: La Revolución de Mayo y sus causas'
                                : 'Dejalo vacío para cubrir todo, o acotá el enfoque'}
                            value={topic}
                            maxLength={120}
                            onChange={e => setTopic(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') handleGenerate(); }}
                        />

                        <button
                            className="btn btn-primary mod-cta"
                            onClick={handleGenerate}
                            disabled={!canGenerate}
                        >
                            <Sparkles size={17} /> Armar el módulo
                        </button>
                    </div>
                </section>
            )}

            {/* ── Paso 2: el módulo generado + qué hacer con él ── */}
            {step === 2 && (
                <>
                    <section className="card mod-card">
                        <div className="mod-card-head">
                            <h3><Boxes size={17} className="text-ia-accent" /> {topic}</h3>
                            {generating && (
                                <button className="btn btn-outline btn-sm" onClick={handleStop}>
                                    <Square size={13} /> Detener
                                </button>
                            )}
                        </div>
                        <div className="mod-content">
                            {content
                                ? <MarkdownRenderer content={content} />
                                : <p className="mod-writing">Escribiendo el módulo<span className="mod-dots" /></p>}
                        </div>
                    </section>

                    {!generating && content && (
                        <section className="card mod-card">
                            <h3 className="mod-choose-title">¿Qué querés que salga de este módulo?</h3>
                            <p className="text-sm text-secondary">Elegí lo que te sirva. Podés marcar todo.</p>
                            <div className="mod-pieces">
                                {PIECES.map(p => (
                                    <button
                                        key={p.key}
                                        className={`mod-piece ${chosen.has(p.key) ? 'on' : ''}`}
                                        onClick={() => togglePiece(p.key)}
                                    >
                                        <span className="mod-piece-check">{chosen.has(p.key) && <Check size={13} />}</span>
                                        <span className="mod-piece-emoji">{p.emoji}</span>
                                        <span className="mod-piece-text">
                                            <strong>{p.label}</strong>
                                            <span>{p.desc}</span>
                                        </span>
                                    </button>
                                ))}
                            </div>
                            <button
                                className="btn btn-primary mod-cta"
                                onClick={handleBuild}
                                disabled={chosen.size === 0}
                            >
                                <Sparkles size={17} /> Generar {chosen.size} cosa{chosen.size !== 1 ? 's' : ''} <ArrowRight size={16} />
                            </button>
                        </section>
                    )}
                </>
            )}

            {/* ── Paso 3: generando y resultado ── */}
            {step === 3 && (
                <section className="card mod-card">
                    <h3 className="mod-choose-title">
                        {building ? 'Generando tu material...' : '¡Listo! Ya tenés todo'}
                    </h3>

                    <div className="mod-progress">
                        {PIECES.filter(p => chosen.has(p.key)).map(p => {
                            const st = states[p.key];
                            return (
                                <div key={p.key} className={`mod-prog-row ${st}`}>
                                    <span className="mod-prog-icon">
                                        {st === 'working' ? <Loader2 size={16} className="spin" />
                                            : st === 'done' ? <Check size={16} />
                                                : st === 'error' ? <AlertCircle size={16} />
                                                    : <p.icon size={16} />}
                                    </span>
                                    <div className="mod-prog-text">
                                        <strong>{p.emoji} {p.label}</strong>
                                        <span>
                                            {st === 'working' ? 'Generando...'
                                                : st === 'done' ? 'Listo'
                                                    : st === 'error' ? 'No se pudo generar esta parte'
                                                        : 'En espera'}
                                        </span>
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {allDone && (
                        <>
                            <div className="mod-results">
                                {cards && cards.length > 0 && (
                                    <button className="mod-result" onClick={() => setShowCards(true)}>
                                        <Layers size={16} /> Ver las {cards.length} placas
                                    </button>
                                )}
                                {podcastPath && (
                                    <button className="mod-result" onClick={() => setShowPodcast(true)}>
                                        <Headphones size={16} /> Escuchar el podcast
                                    </button>
                                )}
                                {activityId && (
                                    <button className="mod-result" onClick={() => navigate(`/actividades/${activityId}`)}>
                                        <Eye size={16} /> Ver la actividad publicada
                                    </button>
                                )}
                                {liveReady && (
                                    <button className="mod-result mod-result-live" onClick={() => navigate('/clase-en-vivo')}>
                                        <Radio size={16} /> La pregunta ya está en vivo — ir al panel
                                    </button>
                                )}
                            </div>

                            <div className="mod-final">
                                <button
                                    className={`btn btn-sm ${shared ? 'btn-outline' : 'btn-primary'}`}
                                    onClick={handleShare}
                                    disabled={shared || !materialId}
                                >
                                    {shared
                                        ? <><Check size={15} /> Compartido con los estudiantes</>
                                        : <><Share2 size={15} /> Compartir el módulo con el curso</>}
                                </button>
                                <button
                                    className="btn btn-outline btn-sm"
                                    onClick={() => {
                                        setStep(1); setTopic(''); setContent('');
                                        setCards(null); setPodcastPath(null); setActivityId(null);
                                        setLiveReady(false); setShared(false); setMaterialId(null);
                                        setStates({ placas: 'idle', podcast: 'idle', actividad: 'idle', vivo: 'idle' });
                                    }}
                                >
                                    Armar otro módulo
                                </button>
                            </div>
                        </>
                    )}
                </section>
            )}

            {showCards && cards && (
                <StudyCardsViewer
                    cards={cards}
                    title={`Módulo: ${topic}`}
                    subjectName={subjectName}
                    onClose={() => setShowCards(false)}
                />
            )}
            {showPodcast && podcastPath && (
                <PodcastPlayer path={podcastPath} title={topic} onClose={() => setShowPodcast(false)} />
            )}
        </div>
    );
}
