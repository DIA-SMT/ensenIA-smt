/**
 * SMT EstudIA — Armar la clase
 *
 * El recorrido completo en una sola pantalla: el docente elige un tema (de su
 * planificación, de su biblioteca o nuevo), la IA arma el contenido, y de ahí
 * sale la clase: diapositivas para proyectar, un juego para repasar, un
 * diagrama, la tarea, placas, podcast y una pregunta para la clase en vivo.
 *
 * Nada llega a los chicos hasta que el docente lo revisa y aprieta "Enviar al
 * curso": ahí se comparten los materiales, se publica la tarea y la clase
 * queda agrupada (056) para que la vean junta en el celular. Lo que no se
 * manda queda guardado en Mis materiales, sin compartir.
 */

import { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
    Boxes, Sparkles, Layers, Headphones, ClipboardList, Radio,
    Check, Loader2, ArrowRight, Eye, AlertCircle, Square,
    BookOpen, PenLine, FolderTree, Pencil, RefreshCw, Presentation,
    Puzzle, Network, Send, FileText, X, Trash2,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { getSubjects } from '../services/subjects.service';
import { getOrCreateSession, saveUserMessage } from '../services/chat-history.service';
import { streamChat } from '../services/ia-chat.service';
import { createMaterial, getMaterialsByTeacher } from '../services/library.service';
import { getPlanningByTeacher } from '../services/planning.service';
import {
    updateMaterial, generateStudyCards, generatePodcast, extractQuestions, generateSlides, guardarMazo, uploadFile,
} from '../services/documents.service';
import { generarDiagrama, generarDatosJuego, guardarDiagrama, guardarJuego } from '../services/visuales.service';
import { enviarClase, type TareaDeClase } from '../services/clases.service';
import { startLiveSession, launchActivity, getMyLiveSession } from '../services/live.service';
import { armarCrucigrama, armarCriptograma } from '../lib/armarJuegos';
import { dibujarDiagrama, svgAPng } from '../lib/dibujarDiagrama';
import { VARIANTES, type VarianteDiagrama } from '../lib/diagramas';
import { aTextoPlano, normalizarMazo, type Mazo } from '../lib/diapositivas';
import { mazoDe } from '../lib/mazoDe';
import { TAG_PRESENTACION } from '../lib/presentation';
import MarkdownRenderer from '../components/MarkdownRenderer';
import StudyCardsViewer from '../components/StudyCardsViewer';
import PlacasEditor from '../components/PlacasEditor';
import PodcastPlayer from '../components/PodcastPlayer';
import MaterialViewer from '../components/MaterialViewer';
import Presentador from '../components/Presentador';
import MazoEditor from '../components/MazoEditor';
import Dialogo from '../components/shell/Dialogo';
import EstadoVacio from '../components/ui/EstadoVacio';
import UsosIA from '../components/ui/UsosIA';
import { avisar } from '../components/ui/avisar';
import type { Subject, StudyCard, ActivityQuestion, LibraryMaterial, PlanningClass } from '../types';
import './ArmarModulo.css';

type PieceKey = 'diapositivas' | 'actividad' | 'juego' | 'diagrama' | 'placas' | 'podcast' | 'vivo';
type PieceState = 'idle' | 'working' | 'done' | 'error';

const PIECES: { key: PieceKey; emoji: string; icon: typeof Layers; label: string; desc: string }[] = [
    { key: 'diapositivas', emoji: '🖼️', icon: Presentation, label: 'Diapositivas', desc: 'Para proyectar en el aula. Los chicos también las ven en el celular' },
    { key: 'actividad', emoji: '📝', icon: ClipboardList, label: 'Tarea', desc: 'Con preguntas que se corrigen solas. Se publica recién cuando la enviás' },
    { key: 'juego', emoji: '🧩', icon: Puzzle, label: 'Crucigrama', desc: 'Las palabras clave del tema, para repasar jugando' },
    { key: 'diagrama', emoji: '🗺️', icon: Network, label: 'Diagrama', desc: 'El tema de un vistazo' },
    { key: 'placas', emoji: '🃏', icon: Layers, label: 'Placas de estudio', desc: 'Tarjetas con preguntas y quiz para repasar desde el celular' },
    { key: 'podcast', emoji: '🎧', icon: Headphones, label: 'Podcast', desc: 'Un audio de 2-3 minutos para escuchar en el colectivo' },
    { key: 'vivo', emoji: '📡', icon: Radio, label: 'Pregunta para la clase en vivo', desc: 'Queda lista para lanzarla cuando estés en el aula' },
];

const ESTADOS_INICIALES: Record<PieceKey, PieceState> = {
    diapositivas: 'idle', actividad: 'idle', juego: 'idle', diagrama: 'idle', placas: 'idle', podcast: 'idle', vivo: 'idle',
};

/** Lo que tarda cada pieza, para que la espera no parezca colgada. */
const DEMORA: Partial<Record<PieceKey, string>> = {
    diapositivas: 'Generando… (cerca de un minuto)',
    placas: 'Generando… (cerca de un minuto)',
    podcast: 'Generando… (cerca de un minuto)',
};

export default function ArmarModulo() {
    const { user } = useAuth();
    const navigate = useNavigate();

    const [step, setStep] = useState<1 | 2 | 3>(1);
    const [subjectsMap, setSubjectsMap] = useState<Record<string, Subject>>({});
    const [assignmentIdx, setAssignmentIdx] = useState(0);
    const [topic, setTopic] = useState('');

    // De dónde sale la clase. Con material o con un tema de la planificación
    // el contenido es REAL: sale de lo que el docente ya tiene, no de lo que
    // la IA imagine sobre el título.
    const [origen, setOrigen] = useState<'material' | 'tema' | 'nuevo'>('nuevo');
    const [materials, setMaterials] = useState<LibraryMaterial[]>([]);
    const [temas, setTemas] = useState<(PlanningClass & { unitTitle: string })[]>([]);
    const [baseMaterialId, setBaseMaterialId] = useState('');
    const [temaId, setTemaId] = useState('');

    // Generación del contenido base
    const [content, setContent] = useState('');
    const [generating, setGenerating] = useState(false);
    const [error, setError] = useState('');
    const abortRef = useRef<AbortController | null>(null);

    // Piezas elegidas y su progreso
    const [chosen, setChosen] = useState<Set<PieceKey>>(new Set(['diapositivas', 'actividad', 'juego']));
    const [states, setStates] = useState<Record<PieceKey, PieceState>>(ESTADOS_INICIALES);
    const [variante, setVariante] = useState<VarianteDiagrama>('mapa_mental');
    const [building, setBuilding] = useState(false);
    // Placas y podcast ya guardados se reusan; solo se rehacen si el docente lo pide
    const [rehacer, setRehacer] = useState<Set<'placas' | 'podcast'>>(new Set());
    const [editandoPlacas, setEditandoPlacas] = useState(false);

    // Resultados (todo guardado sin compartir hasta enviar)
    const [apunte, setApunte] = useState<LibraryMaterial | null>(null);
    const [cards, setCards] = useState<StudyCard[] | null>(null);
    const [podcastPath, setPodcastPath] = useState<string | null>(null);
    const [mazoMat, setMazoMat] = useState<LibraryMaterial | null>(null);
    const [juegoMat, setJuegoMat] = useState<LibraryMaterial | null>(null);
    const [diagramaMat, setDiagramaMat] = useState<LibraryMaterial | null>(null);
    const [tarea, setTarea] = useState<TareaDeClase | null>(null);
    // Lo que el diagrama y el juego le aportan al mazo. Se generan en paralelo,
    // así que se juntan al final (ref y no estado: lo leen las piezas al terminar).
    const paraElMazo = useRef<{
        material?: LibraryMaterial; mazo?: Mazo;
        palabras?: { respuesta: string; pista: string }[];
        diagrama?: { png: Blob; titulo: string; descripcion: string };
    }>({});
    const [preguntaVivo, setPreguntaVivo] = useState<ActivityQuestion | null>(null);
    const [liveReady, setLiveReady] = useState(false);
    const [lanzando, setLanzando] = useState(false);

    // Revisión: qué va en el envío y qué se está mirando
    const [fuera, setFuera] = useState<Set<string>>(new Set());
    const [viendo, setViendo] = useState<LibraryMaterial | null>(null);
    const [presentando, setPresentando] = useState<Mazo | null>(null);
    const [editandoMazo, setEditandoMazo] = useState<Mazo | null>(null);
    const [guardandoMazo, setGuardandoMazo] = useState(false);
    const [enviando, setEnviando] = useState(false);
    const [enviada, setEnviada] = useState<{ activityId: string | null } | null>(null);

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
            if (next.has(key)) next.delete(key); else next.add(key);
            return next;
        });
    };

    const baseMaterial = materials.find(m => m.id === baseMaterialId) ?? null;
    const baseTema = temas.find(t => t.id === temaId) ?? null;
    // Dónde queda guardado lo que se genera, para no volver a generarlo:
    //  · de un material de la biblioteca → en ese mismo material (antes se
    //    creaba un "Módulo:" nuevo cada vez y las placas se rehacían siempre);
    //  · de un tema de la planificación → en el material de ese tema.
    const destino = origen === 'material' ? baseMaterial
        : origen === 'tema' && baseTema ? materials.find(m => m.classId === baseTema.id) ?? null
        : null;
    const placasGuardadas = destino?.studyCards?.length ? destino.studyCards : null;
    const podcastGuardado = destino?.podcastStatus === 'ready' && destino.podcastPath ? destino.podcastPath : null;
    // Se muestra antes de gastar otra generación
    const existing = destino && (placasGuardadas || podcastGuardado) ? destino : null;

    /** Título de la clase según de dónde salga. Si parte de otro módulo, no se
     *  arrastra el prefijo (evita "Módulo: Módulo: ..."). */
    const moduleName = (origen === 'material' && baseMaterial ? (topic.trim() || baseMaterial.title)
        : origen === 'tema' && baseTema ? (topic.trim() || baseTema.title)
        : topic.trim()).replace(/^Módulo:\s*/i, '').replace(/[\s.]+$/, '');

    const canGenerate = Boolean(assignment) && (
        origen === 'material' ? Boolean(baseMaterial)
            : origen === 'tema' ? Boolean(baseTema)
            : Boolean(topic.trim())
    );

    const contexto = assignment ? { subjectName, courseName: assignment.courseName } : undefined;
    const pie = assignment ? `${subjectName} · ${assignment.courseName}` : undefined;

    // ── Paso 1 → 2: la IA arma el contenido ──
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
                title: 'Armar la clase',
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

            // Con material o con un tema de la planificación, la clase se apoya en
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
            setError(err instanceof Error ? err.message : 'No se pudo armar la clase.');
            setGenerating(false);
        }
    };

    const handleStop = () => {
        abortRef.current?.abort();
        setGenerating(false);
        abortRef.current = null;
    };

    /** Corre una pieza mostrando su estado. Si falla, la pieza queda en error y el resto sigue. */
    const pieza = async (key: PieceKey, fn: () => Promise<void>) => {
        setPiece(key, 'working');
        try {
            await fn();
            setPiece(key, 'done');
        } catch (err) {
            console.error(key, err);
            setPiece(key, 'error');
        }
    };

    /** Cada pieza, por separado: así se puede reintentar la que falló. */
    const generarPieza = (key: PieceKey, mat: LibraryMaterial): Promise<void> => {
        if (!assignment) return Promise.resolve();
        const destinoVisual = {
            teacherId: user.id,
            schoolId: user.schoolId,
            subjectId: assignment.subjectId,
            subjectName,
            courseId: assignment.courseId,
            unitName: baseTema?.unitTitle,
        };
        switch (key) {
            case 'diapositivas':
                return pieza(key, async () => {
                    const limpio = normalizarMazo(await generateSlides(content, moduleName, contexto));
                    if (!limpio) throw new Error('mazo vacío');
                    // Material aparte del apunte, sin class_id: el material "del tema" es el apunte
                    const m = await createMaterial({
                        title: `Diapositivas: ${moduleName}`.slice(0, 120),
                        description: `${limpio.diapositivas.length} diapositivas para ${subjectName} · ${assignment.courseName}`,
                        fileType: 'doc',
                        fileName: '',
                        fileSize: '—',
                        subjectId: assignment.subjectId,
                        subjectName,
                        courseId: assignment.courseId,
                        unitName: baseTema?.unitTitle,
                        teacherId: user.id,
                        schoolId: user.schoolId,
                        tags: [TAG_PRESENTACION, 'IA'],
                        extractedText: aTextoPlano(limpio),
                        slides: limpio,
                    });
                    setMazoMat(m);
                    paraElMazo.current.material = m;
                    paraElMazo.current.mazo = limpio;
                });
            case 'juego':
                return pieza(key, async () => {
                    const datos = await generarDatosJuego(content, moduleName, contexto);
                    paraElMazo.current.palabras = datos.palabras;
                    // Si las palabras no se cruzan, la frase clave igual sirve de criptograma
                    let juego;
                    try {
                        juego = armarCrucigrama(datos.titulo, datos.palabras);
                    } catch {
                        juego = armarCriptograma(datos.titulo, datos.frase, datos.pista);
                    }
                    setJuegoMat(await guardarJuego(juego, destinoVisual));
                });
            case 'diagrama':
                return pieza(key, async () => {
                    const d = await generarDiagrama(content, moduleName, variante, contexto);
                    const png = await svgAPng(await dibujarDiagrama(d));
                    paraElMazo.current.diagrama = { png, titulo: d.titulo, descripcion: d.descripcion };
                    setDiagramaMat(await guardarDiagrama(d, png, destinoVisual));
                });
            case 'placas':
                if (placasGuardadas && !rehacer.has('placas')) {
                    setCards(placasGuardadas);
                    setPiece(key, 'done');
                    return Promise.resolve();
                }
                return pieza(key, async () => {
                    const generated = await generateStudyCards(content, `Módulo: ${moduleName}`);
                    await updateMaterial(mat.id, { studyCards: generated });
                    setCards(generated);
                    setMaterials(prev => prev.map(m => (m.id === mat.id ? { ...m, studyCards: generated } : m)));
                });
            case 'podcast':
                if (podcastGuardado && !rehacer.has('podcast')) {
                    setPodcastPath(podcastGuardado);
                    setPiece(key, 'done');
                    return Promise.resolve();
                }
                return pieza(key, async () => {
                    await generatePodcast(mat.id);
                    setPodcastPath(`podcasts/${mat.id}.mp3`);
                });
            default:
                return Promise.resolve();
        }
    };

    /** La tarea y la pregunta en vivo salen de las mismas preguntas. */
    const generarPreguntas = async (quiereTarea: boolean, quiereVivo: boolean) => {
        if (quiereTarea) setPiece('actividad', 'working');
        if (quiereVivo) setPiece('vivo', 'working');
        let questions: ActivityQuestion[] = [];
        try {
            questions = await extractQuestions(content);
        } catch (err) {
            console.error('preguntas:', err);
        }
        if (quiereTarea) {
            if (questions.length) {
                setTarea({
                    titulo: `Tarea: ${moduleName}`.slice(0, 120),
                    consigna: `Repasá lo que vimos sobre "${moduleName}" y respondé las preguntas.`,
                    preguntas: questions,
                    vence: '',
                    puntos: 10,
                });
                setPiece('actividad', 'done');
            } else {
                setPiece('actividad', 'error');
            }
        }
        if (quiereVivo) {
            const mc = questions.find(q => q.type === 'multiple_choice' && (q.options?.length ?? 0) >= 2);
            setPreguntaVivo(mc ?? null);
            setPiece('vivo', mc ? 'done' : 'error');
        }
    };

    /**
     * Con diapositivas y juego o diagrama en la misma clase, el mazo los
     * incluye: el diagrama como segunda lámina (el tema de un vistazo) y el
     * juego antes del cierre. Así se proyecta todo junto, sin cambiar de
     * pantalla en el aula. Si algo falla, el mazo queda como salió.
     */
    const sumarAlMazo = async () => {
        const { material, mazo, palabras, diagrama } = paraElMazo.current;
        if (!material || !mazo || (!palabras?.length && !diagrama)) return;
        try {
            const ds = [...mazo.diapositivas];
            if (palabras?.length) {
                const cierre = ds.length && ds[ds.length - 1].tipo === 'cierre' ? ds.length - 1 : ds.length;
                ds.splice(cierre, 0, {
                    tipo: 'juego',
                    titulo: '¿Qué palabra es?',
                    puntos: [],
                    adivinanzas: palabras.slice(0, 5).map(p => ({ pista: p.pista, respuesta: p.respuesta })),
                    nota: 'Leé la pista, que el curso diga la palabra y tocá "Ver" para mostrarla.',
                });
            }
            if (diagrama) {
                // Copia propia: si el docente borra el material del diagrama, la lámina sigue andando
                const { storagePath } = await uploadFile(user.id, new File([diagrama.png], 'diagrama.png', { type: 'image/png' }));
                ds.splice(ds[0]?.tipo === 'portada' ? 1 : 0, 0, {
                    tipo: 'imagen', titulo: diagrama.titulo, puntos: [],
                    imagen: { ruta: storagePath, alt: diagrama.descripcion },
                });
            }
            const nuevo: Mazo = { ...mazo, diapositivas: ds };
            await guardarMazo(material.id, nuevo);
            setMazoMat({ ...material, slides: nuevo, extractedText: aTextoPlano(nuevo) });
        } catch (err) {
            console.error('sumar al mazo:', err);
        }
    };

    // ── Paso 2 → 3: generar lo elegido (sin compartir nada todavía) ──
    const handleBuild = async () => {
        if (!assignment || building || chosen.size === 0 || !content.trim()) return;
        setBuilding(true);
        setError('');
        setStep(3);
        paraElMazo.current = {};

        try {
            // El apunte: con material, o con un tema que ya tiene su material, se
            // usa ese. Si no, el contenido queda como material nuevo.
            const mat = destino ?? await createMaterial({
                title: `Módulo: ${moduleName}`,
                description: `Generado con IA para ${subjectName} · ${assignment.courseName}`,
                fileType: 'doc',
                fileName: '',
                fileSize: '—',
                subjectId: assignment.subjectId,
                subjectName,
                courseId: assignment.courseId,
                teacherId: user.id,
                schoolId: user.schoolId,
                tags: ['módulo', topic.trim().slice(0, 24)],
                classId: origen === 'tema' && baseTema ? baseTema.id : null,
            });
            // El texto de un material de la biblioteca es el original del docente:
            // no se pisa con el módulo.
            if (origen !== 'material') await updateMaterial(mat.id, { extractedText: content });
            setApunte({ ...mat, extractedText: origen !== 'material' ? content : mat.extractedText });

            // Todas las piezas a la vez: cada una avisa cuando termina
            const piezas: Promise<void>[] = (['diapositivas', 'juego', 'diagrama', 'placas', 'podcast'] as PieceKey[])
                .filter(k => chosen.has(k))
                .map(k => generarPieza(k, mat));
            if (chosen.has('actividad') || chosen.has('vivo')) {
                piezas.push(generarPreguntas(chosen.has('actividad'), chosen.has('vivo')));
            }
            await Promise.all(piezas);
            await sumarAlMazo();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'No se pudo generar el material.');
        } finally {
            setBuilding(false);
        }
    };

    const reintentar = async (key: PieceKey) => {
        if (!apunte) return;
        if (key === 'actividad' || key === 'vivo') await generarPreguntas(key === 'actividad', key === 'vivo');
        else await generarPieza(key, apunte);
    };

    // La pregunta en vivo se lanza cuando el docente está en el aula, no al prepararla
    const lanzarVivo = async () => {
        if (!assignment || !preguntaVivo || lanzando) return;
        setLanzando(true);
        try {
            const existente = await getMyLiveSession(user.id);
            const session = existente && existente.courseId === assignment.courseId
                ? existente
                : await startLiveSession({
                    teacherId: user.id,
                    schoolId: user.schoolId,
                    subjectId: assignment.subjectId,
                    courseId: assignment.courseId,
                    title: `${subjectName} · ${assignment.courseName}`,
                });
            const options = (preguntaVivo.options ?? []).map((label, i) => ({ id: String.fromCharCode(97 + i), label }));
            await launchActivity(session.id, 'quiz', {
                question: preguntaVivo.prompt,
                options,
                correctId: options[preguntaVivo.correct_index ?? 0]?.id,
            });
            setLiveReady(true);
        } catch (err) {
            console.error('vivo:', err);
            avisar.error('No se pudo lanzar la pregunta', 'Probá de nuevo desde Clase en vivo.');
        } finally {
            setLanzando(false);
        }
    };

    // ── Qué va en el envío ──
    const piezasMaterial: { id: string; mat: LibraryMaterial }[] = [
        ...(mazoMat ? [{ id: 'diapositivas', mat: mazoMat }] : []),
        ...(juegoMat ? [{ id: 'juego', mat: juegoMat }] : []),
        ...(diagramaMat ? [{ id: 'diagrama', mat: diagramaMat }] : []),
        ...(apunte ? [{ id: 'apunte', mat: apunte }] : []),
    ];
    const vaEnElEnvio = (id: string) => !fuera.has(id);
    const alternar = (id: string) => setFuera(prev => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id); else next.add(id);
        return next;
    });
    const materialesAEnviar = piezasMaterial.filter(p => vaEnElEnvio(p.id)).map(p => p.mat.id);
    const tareaAEnviar = tarea && vaEnElEnvio('tarea') && tarea.preguntas.length > 0 ? tarea : null;
    const nadaParaEnviar = materialesAEnviar.length === 0 && !tareaAEnviar;

    const handleEnviar = async () => {
        if (!assignment || enviando || enviada || nadaParaEnviar) return;
        if (tareaAEnviar && !tareaAEnviar.titulo.trim()) {
            avisar.error('La tarea necesita un título');
            return;
        }
        setEnviando(true);
        try {
            const clase = await enviarClase({
                teacherId: user.id,
                schoolId: user.schoolId,
                subjectId: assignment.subjectId,
                courseId: assignment.courseId,
                classId: origen === 'tema' && baseTema ? baseTema.id : null,
                unitId: origen === 'tema' && baseTema ? baseTema.unitId : null,
                titulo: moduleName,
                materialIds: materialesAEnviar,
                tarea: tareaAEnviar,
            });
            setEnviada({ activityId: clase.activityId });
            avisar.exito(`Clase enviada a ${assignment.courseName}`, 'La ven en Mis materiales, todo junto.');
        } catch (err) {
            avisar.error('No se pudo enviar la clase', err instanceof Error ? err.message : 'Probá de nuevo.');
        } finally {
            setEnviando(false);
        }
    };

    const reiniciar = () => {
        setStep(1); setTopic(''); setContent('');
        setApunte(null); setCards(null); setPodcastPath(null);
        setMazoMat(null); setJuegoMat(null); setDiagramaMat(null);
        setTarea(null); setPreguntaVivo(null); setLiveReady(false);
        setFuera(new Set()); setEnviada(null);
        setStates(ESTADOS_INICIALES);
        setRehacer(new Set());
    };

    const allDone = !building && step === 3;
    const algunaTrabajando = Object.values(states).some(s => s === 'working');

    return (
        <div className="mod-container animate-in">
            {/* Pasos */}
            <div className="mod-steps">
                {['De dónde sale', 'El contenido', 'Revisar y enviar'].map((label, i) => (
                    <div key={label} className={`mod-step ${step > i ? 'done' : ''} ${step === i + 1 ? 'active' : ''}`}>
                        <span className="mod-step-num">{step > i + 1 ? <Check size={13} /> : i + 1}</span>
                        <span className="mod-step-label">{label}</span>
                    </div>
                ))}
            </div>

            {error && <div className="mod-error"><AlertCircle size={15} /> {error}</div>}

            {/* Sin materia asignada no hay para qué curso armar nada */}
            {step === 1 && assignments.length === 0 && (
                <EstadoVacio
                    icono={Boxes}
                    titulo="Todavía no tenés materias asignadas"
                    texto="Para armar una clase hace falta una materia y un curso. Dirección te los asigna; después volvé acá."
                />
            )}

            {/* ── Paso 1: el tema ── */}
            {step === 1 && assignments.length > 0 && (
                <section className="card mod-card mod-intro">
                    <div className="mod-hero-icon"><Boxes size={26} /></div>
                    <h2>Armá tu clase</h2>
                    <p className="text-secondary">
                        De un tema salen las diapositivas, un juego, un diagrama y la tarea.
                        Lo revisás y lo mandás al curso con un solo botón.
                    </p>
                    <UsosIA />

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
                            {materials.length > 0 && (
                                <button
                                    className={`mod-origen ${origen === 'material' ? 'on' : ''}`}
                                    onClick={() => setOrigen('material')}
                                >
                                    <BookOpen size={16} />
                                    <span><strong>De mi biblioteca</strong>
                                        <em>Usa tu material tal cual: la clase sale real</em></span>
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

                        {existing && (
                            <div className="mod-existing" role="status">
                                <div className="mod-existing-head">
                                    <Check size={16} />
                                    <div>
                                        <strong>{origen === 'material' ? 'Este material ya tiene placas o podcast' : 'Este tema ya tiene su material'}</strong>
                                        <em>Se generó una vez y quedó guardado. Usalo directo; si armás la clase igual, se reusa lo guardado salvo que pidas rehacerlo.</em>
                                    </div>
                                </div>
                                <div className="mod-existing-actions">
                                    {placasGuardadas && (
                                        <>
                                            <button className="btn btn-primary btn-sm" onClick={() => { setApunte(existing); setCards(placasGuardadas); setShowCards(true); }}>
                                                <Layers size={14} aria-hidden="true" /> Ver las {placasGuardadas.length} placas
                                            </button>
                                            <button className="btn btn-outline btn-sm" onClick={() => { setApunte(existing); setCards(placasGuardadas); setEditandoPlacas(true); }}>
                                                <Pencil size={14} aria-hidden="true" /> Editar placas
                                            </button>
                                        </>
                                    )}
                                    {existing.podcastStatus === 'ready' && existing.podcastPath && (
                                        <button className="btn btn-primary btn-sm" onClick={() => { setPodcastPath(existing.podcastPath!); setShowPodcast(true); }}>
                                            <Headphones size={14} /> Escuchar el podcast
                                        </button>
                                    )}
                                    <button className="btn btn-secondary btn-sm" onClick={() => navigate('/biblioteca')}>
                                        <BookOpen size={14} /> Abrir en mis materiales
                                    </button>
                                </div>
                            </div>
                        )}

                        <button
                            className={`btn ${existing ? 'btn-outline' : 'btn-primary'} mod-cta`}
                            onClick={handleGenerate}
                            disabled={!canGenerate}
                        >
                            <Sparkles size={17} /> {existing ? 'Armar la clase igual' : 'Armar la clase'}
                        </button>
                    </div>
                </section>
            )}

            {/* ── Paso 2: el contenido generado + qué sale de ahí ── */}
            {step === 2 && (
                <>
                    <section className="card mod-card">
                        <div className="mod-card-head">
                            <h3><Boxes size={17} className="text-ia-accent" aria-hidden="true" /> {moduleName || topic}</h3>
                            {generating && (
                                <button className="btn btn-outline btn-sm" onClick={handleStop}>
                                    <Square size={13} /> Detener
                                </button>
                            )}
                        </div>
                        <div className="mod-content">
                            {content
                                ? <MarkdownRenderer content={content} />
                                : <p className="mod-writing">Escribiendo el contenido<span className="mod-dots" /></p>}
                        </div>
                    </section>

                    {!generating && content && (
                        <section className="card mod-card">
                            <h3 className="mod-choose-title">¿Qué querés para esta clase?</h3>
                            <p className="text-sm text-secondary">Elegí lo que te sirva. Nada le llega al curso hasta que lo revises y lo envíes.</p>
                            <div className="mod-pieces">
                                {PIECES.map(p => {
                                    const guardada = (p.key === 'placas' && placasGuardadas) || (p.key === 'podcast' && podcastGuardado);
                                    const seRehace = (p.key === 'placas' || p.key === 'podcast') && rehacer.has(p.key);
                                    return (
                                        <div key={p.key} className="mod-piece-fila">
                                            <button
                                                className={`mod-piece ${chosen.has(p.key) ? 'on' : ''}`}
                                                onClick={() => togglePiece(p.key)}
                                                aria-pressed={chosen.has(p.key)}
                                            >
                                                <span className="mod-piece-check">{chosen.has(p.key) && <Check size={13} />}</span>
                                                <span className="mod-piece-emoji" aria-hidden="true">{p.emoji}</span>
                                                <span className="mod-piece-text">
                                                    <strong>{p.label}</strong>
                                                    <span>
                                                        {guardada && !seRehace ? 'Ya está guardado: se usa ese, sin gastar IA'
                                                            : guardada && seRehace ? 'Se rehace y reemplaza al guardado'
                                                            : p.desc}
                                                    </span>
                                                </span>
                                            </button>
                                            {p.key === 'diagrama' && chosen.has('diagrama') && (
                                                <select
                                                    className="form-select mod-variante"
                                                    value={variante}
                                                    onChange={e => setVariante(e.target.value as VarianteDiagrama)}
                                                    aria-label="Tipo de diagrama"
                                                >
                                                    {VARIANTES.map(v => <option key={v.id} value={v.id}>{v.etiqueta}</option>)}
                                                </select>
                                            )}
                                            {guardada && chosen.has(p.key) && (
                                                <button
                                                    className="btn btn-ghost btn-sm mod-rehacer"
                                                    onClick={() => setRehacer(prev => {
                                                        const k = p.key as 'placas' | 'podcast';
                                                        const next = new Set(prev);
                                                        if (next.has(k)) next.delete(k); else next.add(k);
                                                        return next;
                                                    })}
                                                    aria-pressed={seRehace}
                                                >
                                                    <RefreshCw size={13} aria-hidden="true" /> {seRehace ? 'Usar el guardado' : 'Rehacerlo'}
                                                </button>
                                            )}
                                        </div>
                                    );
                                })}
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

            {/* ── Paso 3: generando, revisar y enviar ── */}
            {step === 3 && (
                <section className="card mod-card">
                    <h3 className="mod-choose-title">
                        {building ? 'Armando tu clase…' : enviada ? '¡Clase enviada!' : 'Revisá tu clase'}
                    </h3>
                    {!building && !enviada && (
                        <p className="text-sm text-secondary">
                            Todo quedó guardado en Mis materiales, sin compartir. Mirá cada parte, sacá lo que no
                            quieras y mandala al curso.
                        </p>
                    )}

                    <div className="mod-progress">
                        {/* Terminada la generación, la revisión reemplaza al progreso: quedan solo las que fallaron */}
                        {PIECES.filter(p => chosen.has(p.key) && (building || states[p.key] !== 'done')).map(p => {
                            const st = states[p.key];
                            return (
                                <div key={p.key} className={`mod-prog-row ${st}`}>
                                    <span className="mod-prog-icon">
                                        {st === 'working' ? <Loader2 size={16} className="girando" />
                                            : st === 'done' ? <Check size={16} />
                                                : st === 'error' ? <AlertCircle size={16} />
                                                    : <p.icon size={16} />}
                                    </span>
                                    <div className="mod-prog-text">
                                        <strong>{p.emoji} {p.label}</strong>
                                        <span>
                                            {st === 'working' ? (DEMORA[p.key] ?? 'Generando…')
                                                : st === 'done' ? 'Listo'
                                                    : st === 'error' ? 'No se pudo generar esta parte'
                                                        : 'En espera'}
                                        </span>
                                    </div>
                                    {st === 'error' && !enviada && (
                                        <button className="btn btn-ghost btn-sm mod-prog-accion" onClick={() => reintentar(p.key)} disabled={!apunte}>
                                            <RefreshCw size={13} aria-hidden="true" /> Reintentar
                                        </button>
                                    )}
                                </div>
                            );
                        })}
                    </div>

                    {allDone && (
                        <>
                            {/* ── Revisar cada parte ── */}
                            <div className="mod-revision">
                                {mazoMat && (
                                    <PiezaRevision
                                        icono={<Presentation size={18} />}
                                        titulo="Diapositivas"
                                        detalle={`${mazoDe(mazoMat)?.diapositivas.length ?? 0} láminas`}
                                        incluida={vaEnElEnvio('diapositivas')}
                                        alAlternar={() => alternar('diapositivas')}
                                        bloqueada={!!enviada}
                                    >
                                        <button className="btn btn-outline btn-sm" onClick={() => setPresentando(mazoDe(mazoMat))}>
                                            <Presentation size={14} /> Presentar
                                        </button>
                                        <button className="btn btn-ghost btn-sm" onClick={() => setEditandoMazo(mazoDe(mazoMat))}>
                                            <Pencil size={14} /> Editar
                                        </button>
                                    </PiezaRevision>
                                )}
                                {juegoMat && (
                                    <PiezaRevision
                                        icono={<Puzzle size={18} />}
                                        titulo={juegoMat.title.split(':')[0]}
                                        detalle={juegoMat.description}
                                        incluida={vaEnElEnvio('juego')}
                                        alAlternar={() => alternar('juego')}
                                        bloqueada={!!enviada}
                                    >
                                        <button className="btn btn-outline btn-sm" onClick={() => setViendo(juegoMat)}>
                                            <Eye size={14} /> Probarlo
                                        </button>
                                    </PiezaRevision>
                                )}
                                {diagramaMat && (
                                    <PiezaRevision
                                        icono={<Network size={18} />}
                                        titulo="Diagrama"
                                        detalle={diagramaMat.description}
                                        incluida={vaEnElEnvio('diagrama')}
                                        alAlternar={() => alternar('diagrama')}
                                        bloqueada={!!enviada}
                                    >
                                        <button className="btn btn-outline btn-sm" onClick={() => setViendo(diagramaMat)}>
                                            <Eye size={14} /> Verlo
                                        </button>
                                    </PiezaRevision>
                                )}
                                {apunte && (
                                    <PiezaRevision
                                        icono={<FileText size={18} />}
                                        titulo="Apunte del tema"
                                        detalle={[
                                            'El contenido completo',
                                            cards?.length ? `${cards.length} placas` : '',
                                            podcastPath ? 'podcast' : '',
                                        ].filter(Boolean).join(' · ')}
                                        incluida={vaEnElEnvio('apunte')}
                                        alAlternar={() => alternar('apunte')}
                                        bloqueada={!!enviada}
                                    >
                                        <button className="btn btn-outline btn-sm" onClick={() => setViendo(apunte)}>
                                            <Eye size={14} /> Verlo
                                        </button>
                                        {cards && cards.length > 0 && (
                                            <button className="btn btn-ghost btn-sm" onClick={() => setShowCards(true)}>
                                                <Layers size={14} /> Placas
                                            </button>
                                        )}
                                        {podcastPath && (
                                            <button className="btn btn-ghost btn-sm" onClick={() => setShowPodcast(true)}>
                                                <Headphones size={14} /> Podcast
                                            </button>
                                        )}
                                    </PiezaRevision>
                                )}
                                {tarea && (
                                    <PiezaRevision
                                        icono={<ClipboardList size={18} />}
                                        titulo="Tarea"
                                        detalle={enviada?.activityId ? 'Publicada' : 'Se publica al enviar'}
                                        incluida={vaEnElEnvio('tarea')}
                                        alAlternar={() => alternar('tarea')}
                                        bloqueada={!!enviada}
                                    >
                                        {enviada?.activityId && (
                                            <button className="btn btn-outline btn-sm" onClick={() => navigate(`/actividades/${enviada.activityId}`)}>
                                                <Eye size={14} /> Ver la tarea
                                            </button>
                                        )}
                                    </PiezaRevision>
                                )}
                                {tarea && vaEnElEnvio('tarea') && !enviada && (
                                    <TareaEditor tarea={tarea} alCambiar={setTarea} />
                                )}
                            </div>

                            {/* La pregunta en vivo no se manda: se lanza en el aula */}
                            {preguntaVivo && (
                                <div className="mod-results">
                                    {liveReady ? (
                                        <button className="mod-result mod-result-live" onClick={() => navigate('/clase-en-vivo')}>
                                            <Radio size={16} /> La pregunta ya está en vivo — ir al panel
                                        </button>
                                    ) : (
                                        <button className="mod-result" onClick={lanzarVivo} disabled={lanzando}>
                                            {lanzando ? <Loader2 size={16} className="girando" /> : <Radio size={16} />}
                                            Lanzar la pregunta en la clase en vivo: “{preguntaVivo.prompt.slice(0, 70)}{preguntaVivo.prompt.length > 70 ? '…' : ''}”
                                        </button>
                                    )}
                                </div>
                            )}

                            {/* ── Enviar ── */}
                            <div className={`mod-envio ${enviada ? 'enviada' : ''}`}>
                                {enviada ? (
                                    <>
                                        <div className="mod-envio-texto">
                                            <strong><Check size={16} /> Enviada a {subjectName} · {assignment?.courseName}</strong>
                                            <span>Los chicos la ven en Mis materiales, todo junto. Si la bajan con conexión, la tienen aunque después no haya señal.</span>
                                        </div>
                                        <div className="mod-final">
                                            <button className="btn btn-outline btn-sm" onClick={() => navigate('/biblioteca')}>
                                                <BookOpen size={14} /> Mis materiales
                                            </button>
                                            <button className="btn btn-primary btn-sm" onClick={reiniciar}>
                                                Armar otra clase
                                            </button>
                                        </div>
                                    </>
                                ) : (
                                    <>
                                        <div className="mod-envio-texto">
                                            <strong>Enviar a {subjectName} · {assignment?.courseName}</strong>
                                            <span>
                                                {nadaParaEnviar ? 'Elegí al menos una parte para enviar.'
                                                    : [
                                                        materialesAEnviar.length ? `Se comparte${materialesAEnviar.length > 1 ? 'n' : ''} ${materialesAEnviar.length} material${materialesAEnviar.length > 1 ? 'es' : ''}` : '',
                                                        tareaAEnviar ? `se publica la tarea${tareaAEnviar.vence ? ` (entrega ${new Date(tareaAEnviar.vence + 'T12:00').toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'numeric' })})` : ''}` : '',
                                                    ].filter(Boolean).join(' y ') + '.'}
                                            </span>
                                        </div>
                                        <div className="mod-final">
                                            <button className="btn btn-outline btn-sm" onClick={reiniciar}>
                                                Dejarla guardada sin enviar
                                            </button>
                                            <button
                                                className="btn btn-primary mod-enviar"
                                                onClick={handleEnviar}
                                                disabled={enviando || nadaParaEnviar || algunaTrabajando}
                                            >
                                                {enviando ? <Loader2 size={16} className="girando" /> : <Send size={16} />}
                                                {enviando ? 'Enviando…' : 'Enviar al curso'}
                                            </button>
                                        </div>
                                        {tarea && vaEnElEnvio('tarea') && (
                                            <p className="mod-envio-nota">La tarea se crea al enviar: si dejás la clase sin enviar, la tarea no queda guardada.</p>
                                        )}
                                    </>
                                )}
                            </div>
                        </>
                    )}
                </section>
            )}

            {showCards && cards && (
                <StudyCardsViewer
                    cards={cards}
                    title={moduleName || topic}
                    subjectName={subjectName}
                    onClose={() => setShowCards(false)}
                    onEditar={apunte ? () => { setShowCards(false); setEditandoPlacas(true); } : undefined}
                />
            )}
            {editandoPlacas && cards && apunte && (
                <PlacasEditor
                    placas={cards}
                    titulo={moduleName || topic}
                    alCerrar={() => setEditandoPlacas(false)}
                    alGuardar={async placas => {
                        await updateMaterial(apunte.id, { studyCards: placas });
                        setCards(placas);
                        // Que la lista local (y "ya está guardado") vea la versión nueva
                        setMaterials(prev => prev.map(m => (m.id === apunte.id ? { ...m, studyCards: placas } : m)));
                    }}
                    alRehacer={content.trim() || destino?.extractedText
                        ? () => generateStudyCards(content.trim() || destino!.extractedText!, moduleName || topic)
                        : undefined}
                />
            )}
            {showPodcast && podcastPath && (
                <PodcastPlayer path={podcastPath} title={moduleName || topic} onClose={() => setShowPodcast(false)} />
            )}

            {/* Cómo lo ven los chicos */}
            {viendo && <MaterialViewer material={viendo} onClose={() => setViendo(null)} />}

            {presentando && (
                <Presentador
                    mazo={presentando}
                    pie={pie}
                    contexto={{ ...contexto, teacherName: `${user.firstName} ${user.lastName}` }}
                    alCerrar={() => setPresentando(null)}
                    alCambiarDiseno={async id => {
                        if (!mazoMat) return;
                        try {
                            const nuevo = { ...presentando, diseno: id };
                            await guardarMazo(mazoMat.id, nuevo);
                            setMazoMat({ ...mazoMat, slides: nuevo });
                        } catch (err) {
                            avisar.error('No se pudo guardar el diseño', err instanceof Error ? err.message : '');
                        }
                    }}
                />
            )}

            {editandoMazo && mazoMat && (
                <Dialogo abierto alCerrar={() => setEditandoMazo(null)} etiqueta="Editar diapositivas" className="dialogo-ancho">
                    <div className="lab-mazo">
                        <div className="lab-mazo-head">
                            <h3>{mazoMat.title}</h3>
                            <button className="btn-icon" aria-label="Cerrar" onClick={() => setEditandoMazo(null)}>
                                <X size={18} />
                            </button>
                        </div>
                        <MazoEditor
                            mazo={editandoMazo}
                            alCambiar={setEditandoMazo}
                            guardando={guardandoMazo}
                            docenteId={user.id}
                            pie={pie}
                            contexto={{ ...contexto, teacherName: `${user.firstName} ${user.lastName}` }}
                            alGuardar={async () => {
                                setGuardandoMazo(true);
                                try {
                                    await guardarMazo(mazoMat.id, editandoMazo);
                                    setMazoMat({ ...mazoMat, slides: editandoMazo, extractedText: aTextoPlano(editandoMazo) });
                                    avisar.exito('Diapositivas guardadas');
                                    setEditandoMazo(null);
                                } catch (err) {
                                    avisar.error('No se pudo guardar', err instanceof Error ? err.message : '');
                                } finally {
                                    setGuardandoMazo(false);
                                }
                            }}
                        />
                    </div>
                </Dialogo>
            )}
        </div>
    );
}

/** Una parte de la clase en la revisión: qué es, cómo verla y si va en el envío. */
function PiezaRevision({ icono, titulo, detalle, incluida, alAlternar, bloqueada, children }: {
    icono: React.ReactNode;
    titulo: string;
    detalle?: string;
    incluida: boolean;
    alAlternar: () => void;
    bloqueada: boolean;
    children?: React.ReactNode;
}) {
    return (
        <div className={`mod-rev ${incluida ? '' : 'fuera'}`}>
            <span className="mod-rev-icono" aria-hidden="true">{icono}</span>
            <div className="mod-rev-texto">
                <strong>{titulo}</strong>
                {detalle && <span>{detalle}</span>}
            </div>
            <div className="mod-rev-acciones">
                {children}
                {!bloqueada && (
                    <label className="mod-rev-incluir">
                        <input type="checkbox" checked={incluida} onChange={alAlternar} />
                        Enviar
                    </label>
                )}
            </div>
        </div>
    );
}

/** La tarea antes de publicarla: título, entrega, puntos, consigna y preguntas. */
function TareaEditor({ tarea, alCambiar }: { tarea: TareaDeClase; alCambiar: (t: TareaDeClase) => void }) {
    const hoy = new Date().toISOString().split('T')[0];
    const autocorregibles = tarea.preguntas.filter(q => q.type === 'multiple_choice').length;
    return (
        <div className="mod-tarea">
            <label className="mod-tarea-campo">
                <span>Título</span>
                <input className="mod-input" value={tarea.titulo} maxLength={120}
                    onChange={e => alCambiar({ ...tarea, titulo: e.target.value })} />
            </label>
            <div className="mod-tarea-fila">
                <label className="mod-tarea-campo">
                    <span>Entrega</span>
                    <input className="mod-input" type="date" min={hoy} value={tarea.vence ?? ''}
                        onChange={e => alCambiar({ ...tarea, vence: e.target.value })} />
                </label>
                <label className="mod-tarea-campo">
                    <span>Puntos</span>
                    <input className="mod-input" type="number" min={0} max={100} value={tarea.puntos ?? ''}
                        onChange={e => alCambiar({ ...tarea, puntos: e.target.value === '' ? null : Math.max(0, Math.min(100, Number(e.target.value))) })} />
                </label>
            </div>
            <label className="mod-tarea-campo">
                <span>Consigna</span>
                <textarea className="mod-input" rows={2} value={tarea.consigna}
                    onChange={e => alCambiar({ ...tarea, consigna: e.target.value })} />
            </label>
            <details className="mod-tarea-preguntas">
                <summary>
                    {tarea.preguntas.length} pregunta{tarea.preguntas.length !== 1 ? 's' : ''}
                    {autocorregibles > 0 && ` · ${autocorregibles} se corrige${autocorregibles !== 1 ? 'n' : ''} sola${autocorregibles !== 1 ? 's' : ''}`}
                </summary>
                <ol>
                    {tarea.preguntas.map(q => (
                        <li key={q.id}>
                            <div className="mod-tarea-pregunta">
                                <span>{q.prompt}</span>
                                <button className="btn-icon" aria-label="Quitar esta pregunta" title="Quitar"
                                    onClick={() => alCambiar({ ...tarea, preguntas: tarea.preguntas.filter(x => x.id !== q.id) })}>
                                    <Trash2 size={14} />
                                </button>
                            </div>
                            {q.type === 'multiple_choice' && q.options && (
                                <ul>
                                    {q.options.map((o, i) => (
                                        <li key={i} className={i === q.correct_index ? 'correcta' : ''}>{o}</li>
                                    ))}
                                </ul>
                            )}
                        </li>
                    ))}
                </ol>
            </details>
        </div>
    );
}
