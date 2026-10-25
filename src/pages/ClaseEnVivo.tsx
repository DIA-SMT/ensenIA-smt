/**
 * SMT EstudIA — Clase en vivo (panel del docente)
 *
 * Pensado para el aula real: la clase arranca tradicional y, cuando el
 * docente quiere, lanza una actividad desde el celu, la tablet o la compu.
 * Mientras no hay actividad activa, los celulares de los estudiantes
 * quedan en un lobby tranquilo. La botonera de emojis se prende y apaga
 * (no siempre suma). Todo responsive: mismo panel en cualquier pantalla.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useContextoMigue } from '../contexts/MigueContext';
import {
    Radio, Square, Plus, Eye, Lock, CheckCircle, Users,
    Smile, Trash2, ChevronLeft, Loader2, QrCode, UserPlus, MonitorPlay,
    UsersRound, Target, X, BookOpen, Medal, Trophy, SkipForward,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { getSubjects } from '../services/subjects.service';
import { getEnrolledStudents } from '../services/activities.service';
import { getGroupsByCourse, type CourseGroup } from '../services/groups.service';
import GruposModal from '../components/GruposModal';
import {
    getMyLiveSession, startLiveSession, endLiveSession, setReactionsEnabled,
    getEstadoDocente, cerrarMiClaseOlvidada, launchActivity, setActivityStatus, revelarActividad, getLiveResults,
    setGuestsEnabled, sacarInvitado, deleteLiveResponse, sacarPalabraEnVivo,
    setLiveMaterial, type InvitadoEnSala,
    getCorrectResponders, getMyPastSessions, sincronizarMaterialesDeClase,
    LIVE_KIND_META, type EleccionMaterial, getCompetencia, type VistaCompetencia,
    SIN_PREGUNTAS, type PreguntasDelPublico, type PreguntaPublico,
    type LiveSession, type LiveActivity, type LiveActivityKind,
    type LiveResults, type LiveOption, type LiveActivityConfig,
} from '../services/live.service';
import { marcarLanzada } from '../services/preguntas-en-vivo.service';
import {
    SEGUNDOS_COMPETENCIA, useDesfaseServidor, useCuentaRegresiva, finDePregunta, type PreguntaEnCola,
} from '../lib/competencia';
import { RelojCompetencia, Podio, TablaPosiciones } from '../components/CompetenciaEnVivo';
import { getMaterialsByClass, getMaterialsByTeacher } from '../services/library.service';
import { getPlanningByTeacher } from '../services/planning.service';
import { getScheduleByTeacher } from '../services/schedule.service';
import PreguntasPreparadasVivo from '../components/PreguntasPreparadasVivo';
import MaterialEnVivo from '../components/MaterialEnVivo';
import MaterialViewer from '../components/MaterialViewer';
import PremiarEnVivo from '../components/PremiarEnVivo';
import ResumenClase from '../components/ResumenClase';
import ElegirMaterial from '../components/ElegirMaterial';
import QRCode from 'qrcode';
import QrModal from '../components/QrModal';
import ProyectarVivo from '../components/ProyectarVivo';
import ModerarPreguntas from '../components/ModerarPreguntas';
import SenialEnVivo from '../components/SenialEnVivo';
import { useSondeo } from '../lib/sondeo';
import { esErrorDeRed } from '../lib/conexion';
import { enlacePublico } from '../lib/direccion';
import { avisar, confirmar } from '../components/ui/avisar';
import { Esqueleto, Cargando } from '../components/ui/Esqueleto';
import { FEELING_META, AWARD_META, type Subject, type CheckinFeeling, type Student, type LibraryMaterial } from '../types';
import './ClaseEnVivo.css';

const POLL_MS = 2500;

/**
 * Competencia (073): las preguntas de una ronda suman para el mismo podio.
 * `cola`: las que faltan, si se armó con las preguntas preparadas.
 * Queda en sessionStorage: si se recarga la página, sigue la misma ronda.
 */
interface Ronda { id: string; cola: PreguntaEnCola[]; hechas: number }
const claveRonda = (sessionId: string) => `estudia_competencia:${sessionId}`;
function leerRonda(sessionId: string): Ronda | null {
    try { const v = sessionStorage.getItem(claveRonda(sessionId)); return v ? JSON.parse(v) as Ronda : null; } catch { return null; }
}
function guardarRonda(sessionId: string, r: Ronda | null) {
    try {
        if (r) sessionStorage.setItem(claveRonda(sessionId), JSON.stringify(r));
        else sessionStorage.removeItem(claveRonda(sessionId));
    } catch { /* sin almacenamiento: queda en memoria */ }
}

export default function ClaseEnVivo() {
    const { user } = useAuth();

    const [session, setSession] = useState<LiveSession | null | undefined>(undefined);
    const [activity, setActivity] = useState<LiveActivity | null>(null);
    const [results, setResults] = useState<LiveResults | null>(null);
    const [reactions, setReactions] = useState<{ emoji: string; createdAt: string }[]>([]);
    const [subjectsMap, setSubjectsMap] = useState<Record<string, Subject>>({});

    // Inicio de sesión
    const [assignmentIdx, setAssignmentIdx] = useState(0);
    const [starting, setStarting] = useState(false);
    const [startError, setStartError] = useState('');
    // Material elegido antes de arrancar (opcional)
    // Los materiales elegidos antes de arrancar (uno o varios, 049): el primero arranca en pantalla
    const [materialesIniciales, setMaterialesIniciales] = useState<EleccionMaterial[]>([]);
    const [eligiendoInicial, setEligiendoInicial] = useState(false);
    // Sala sin curso (075): una reunión, una jornada, una charla con familias
    const [modoInicio, setModoInicio] = useState<'curso' | 'sala'>('curso');
    const [tituloSala, setTituloSala] = useState('');
    const [searchParams, setSearchParams] = useSearchParams();

    // Lanzador de actividades
    const [pickedKind, setPickedKind] = useState<LiveActivityKind | null>(null);
    const [question, setQuestion] = useState('');
    const [options, setOptions] = useState<LiveOption[]>([
        { id: 'a', label: '' }, { id: 'b', label: '' },
    ]);
    const [correctId, setCorrectId] = useState<string>('');
    const [launching, setLaunching] = useState(false);
    const [showQr, setShowQr] = useState(false);
    // Una sola proyección (UX docente, etapa 4): el docente elige qué se ve —el
    // material o la clase (pregunta, resultados, QR)—; con el material puesto,
    // una pregunta activa se muestra sola y al cerrarla vuelve el material.
    const [proyeccion, setProyeccion] = useState<'vivo' | 'material' | null>(null);
    // El material que está en pantalla en la clase (lo avisa MaterialEnVivo): si
    // se cambia desde el celular, la pared muestra el nuevo
    const [materialActual, setMaterialActual] = useState<LibraryMaterial | null>(null);
    // El último que se proyectó queda montado y escondido: al volver, misma lámina
    const [materialVisto, setMaterialVisto] = useState<string | null>(null);
    // La actividad durante la cual el docente pidió ver el material igual
    const [materialPese, setMaterialPese] = useState<string | null>(null);
    const [connected, setConnected] = useState(0);
    // Los invitados que siguen en la sala (para poder sacar a uno)
    const [invitados, setInvitados] = useState<InvitadoEnSala[]>([]);
    const [joinQr, setJoinQr] = useState('');

    // Quiénes están: la lista del curso + los que laten ahora
    const [students, setStudents] = useState<Student[]>([]);
    const [onlineIds, setOnlineIds] = useState<Set<string>>(new Set());
    const [groups, setGroups] = useState<CourseGroup[]>([]);
    const [showGroups, setShowGroups] = useState(false);
    /** Pregunta dirigida: si está, lo que se lance va solo a este estudiante. */
    const [targetStudent, setTargetStudent] = useState<Student | null>(null);
    const [groupMode, setGroupMode] = useState(false);
    // Medallas: el diálogo (con quiénes vienen marcados)
    const [premiar, setPremiar] = useState<{ titulo: string; preseleccion: string[] } | null>(null);

    // Competencia (073): la ronda en curso, las posiciones después de cada
    // pregunta y el podio al terminar
    const [ronda, setRonda] = useState<Ronda | null>(null);
    const [vistaComp, setVistaComp] = useState<VistaCompetencia | null>(null);
    const [podioFinal, setPodioFinal] = useState<VistaCompetencia | null>(null);
    // Preguntas del público (074). Sube con cada cambio del docente: una
    // vuelta que salió antes trae lo de antes y no lo pisa
    const [preguntas, setPreguntas] = useState<PreguntasDelPublico>(SIN_PREGUNTAS);
    const preguntasVersion = useRef(0);
    const [competir, setCompetir] = useState(false);
    const [segundosComp, setSegundosComp] = useState(20);
    const { desfase, medir } = useDesfaseServidor();
    // De qué pregunta son las posiciones que se ven, y cuál ya se reveló sola
    const vistaDeRef = useRef<string | null>(null);
    const reveladaRef = useRef<string | null>(null);
    // Las que se terminaron: una vuelta que salió antes no las revive
    const terminadasRef = useRef(new Set<string>());

    // Resumen: el de la clase que se acaba de terminar, o una anterior
    const [resumenId, setResumenId] = useState<string | null>(null);
    const [pasadas, setPasadas] = useState<LiveSession[]>([]);

    const assignments = user?.subjects ?? [];
    // Sin cursos (la dirección, por ejemplo), solo sala
    const conCursos = assignments.length > 0;
    const esModoSala = !conCursos || modoInicio === 'sala';

    useEffect(() => {
        getSubjects().then(subjects => {
            const map: Record<string, Subject> = {};
            subjects.forEach(s => { map[s.id] = s; });
            setSubjectsMap(map);
        }).catch(console.error);
    }, []);

    // Sesión viva existente (si recarga la página, la retoma). Sin señal no
    // se sabe si hay una abierta: se reintenta en vez de ofrecer arrancar
    // otra, que chocaría con la que sigue abierta (071).
    // null: anda (o todavía no falló) · si no, si la falla es de red o del servidor
    const [buscandoSinSenial, setBuscandoSinSenial] = useState<null | 'red' | 'servidor'>(null);
    useEffect(() => {
        if (!user) return;
        let vivo = true;
        let intentos = 0;
        let timer: number | undefined;
        const buscar = () => {
            getMyLiveSession(user.id)
                .then(s => { if (vivo) { setBuscandoSinSenial(null); setSession(s); } })
                .catch(err => {
                    if (!vivo) return;
                    intentos++;
                    setBuscandoSinSenial(esErrorDeRed(err) ? 'red' : 'servidor');
                    timer = window.setTimeout(buscar, Math.min(2500 * 2 ** Math.min(intentos, 3), 15_000));
                });
        };
        buscar();
        return () => { vivo = false; window.clearTimeout(timer); };
    }, [user]);

    // Llegado desde la Biblioteca (?material=) o el temario (?tema=): ese
    // material queda elegido. Con la clase ya andando y de la misma materia
    // se cambia ahí mismo; si no, se preselecciona para arrancarla.
    const pedidoMaterial = searchParams.get('material');
    const pedidoTema = searchParams.get('tema');
    // Desde Hoy, sin tema planificado: la materia y el curso de esa hora
    const pedidoMateria = searchParams.get('materia');
    const pedidoCurso = searchParams.get('curso');
    useEffect(() => {
        if (!user || session === undefined || (!pedidoMaterial && !pedidoTema)) return;
        let cancelado = false;
        (async () => {
            let destino: { subjectId: string; courseId?: string; eleccion: EleccionMaterial } | null = null;
            if (pedidoMaterial) {
                const m = (await getMaterialsByTeacher(user.id)).find(x => x.id === pedidoMaterial);
                if (m) destino = { subjectId: m.subjectId, eleccion: { materialId: m.id, titulo: m.title } };
            } else if (pedidoTema) {
                for (const u of await getPlanningByTeacher(user.id)) {
                    const c = u.classes.find(x => x.id === pedidoTema);
                    if (c) { destino = { subjectId: u.subjectId, courseId: u.courseId, eleccion: { classId: c.id, titulo: c.title } }; break; }
                }
            }
            // El material del tema (lo que subió o armó para esa clase) también queda elegido
            const delTema: EleccionMaterial[] = destino && 'classId' in destino.eleccion
                ? (await getMaterialsByClass(destino.eleccion.classId).catch(() => []))
                    .filter(m => m.teacherId === user.id)
                    .map(m => ({ materialId: m.id, titulo: m.title }))
                : [];
            if (cancelado) return;
            setSearchParams({}, { replace: true });
            if (!destino) return;
            const d = destino;
            if (session && session.status === 'live') {
                if (session.subjectId !== d.subjectId || (d.courseId && session.courseId !== d.courseId)) {
                    setStartError('Ese material es de otra materia o curso que la clase que tenés en vivo.');
                    return;
                }
                const e = d.eleccion;
                await setLiveMaterial(session.id, 'materialId' in e ? { materialId: e.materialId } : { classId: e.classId });
                setSession({ ...session, materialId: 'materialId' in e ? e.materialId : null, classId: 'classId' in e ? e.classId : null });
                return;
            }
            const idx = assignments.findIndex(a => a.subjectId === d.subjectId && (!d.courseId || a.courseId === d.courseId));
            if (idx >= 0) {
                setAssignmentIdx(idx);
                const claveDe = (x: EleccionMaterial) => ('materialId' in x ? x.materialId : x.classId);
                setMaterialesIniciales(prev => {
                    const lista = [...prev];
                    for (const e of [d.eleccion, ...delTema]) if (!lista.some(x => claveDe(x) === claveDe(e))) lista.push(e);
                    return lista;
                });
            }
        })().catch(console.error);
        return () => { cancelado = true; };
        // Corre una vez por pedido: session y assignments se leen en ese momento
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user?.id, session === undefined, pedidoMaterial, pedidoTema]);

    // Sin enlace: la materia y el curso de ?materia=&curso=, o los de la hora
    // que toca ahora según el horario (o la que arranca en 15 minutos)
    useEffect(() => {
        if (!user || session !== null || pedidoMaterial || pedidoTema) return;
        let vivo = true;
        const elegir = (subjectId: string, courseId: string) => {
            const idx = assignments.findIndex(a => a.subjectId === subjectId && a.courseId === courseId);
            if (idx >= 0 && vivo) setAssignmentIdx(idx);
        };
        if (pedidoMateria && pedidoCurso) {
            elegir(pedidoMateria, pedidoCurso);
            setSearchParams({}, { replace: true });
            return () => { vivo = false; };
        }
        getScheduleByTeacher(user.id).then(bloques => {
            const ahora = new Date();
            const dia = ahora.getDay() - 1;
            const hora = ahora.getHours() + ahora.getMinutes() / 60;
            const b = bloques.find(x => x.dayIndex === dia && x.startHour - 0.25 <= hora && hora < x.startHour + x.duration);
            if (b) elegir(b.subjectId, b.courseId);
        }).catch(() => undefined);
        return () => { vivo = false; };
        // Una vez, al llegar sin clase andando
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user?.id, session === null, pedidoMateria, pedidoCurso]);

    // Sin clase andando: las últimas que terminó, para volver a ver su resumen
    const sinClase = session === null || session?.status === 'ended';
    useEffect(() => {
        if (!user || !sinClase || resumenId) return;
        getMyPastSessions(user.id).then(setPasadas).catch(console.error);
    }, [user, sinClase, resumenId]);

    // Con la clase viva, carga el curso (para nombres) y sus grupos
    useEffect(() => {
        if (!session || session.status !== 'live' || !session.subjectId || !session.courseId) return;
        getEnrolledStudents(session.subjectId, session.courseId).then(setStudents).catch(console.error);
        getGroupsByCourse(session.courseId).then(setGroups).catch(console.error);
    }, [session?.id, session?.status]);

    /** La clase terminó: la competencia se va con ella */
    const dejarLaCompetencia = useCallback((id: string) => {
        guardarRonda(id, null);
        setRonda(null);
        setVistaComp(null);
        setPodioFinal(null);
        setCompetir(false);
        // La proyección es de esta clase: la próxima arranca sin nada en la pared
        setProyeccion(null);
        setMaterialVisto(null);
        setMaterialPese(null);
    }, []);

    // ── Una vuelta: estado, resultados, emojis, invitados y presencia en un
    // solo pedido (071; antes eran seis, que con poca señal se encimaban) ──
    const sessionId = session?.id ?? null;

    /** Las posiciones después de una pregunta; si no llegan, la próxima vuelta las vuelve a pedir */
    const traerPosiciones = useCallback((act: LiveActivity) => {
        const r = act.config.competencia?.ronda;
        if (!r || !sessionId) return;
        vistaDeRef.current = act.id;
        getCompetencia(sessionId, r).then(setVistaComp).catch(() => {
            if (vistaDeRef.current === act.id) vistaDeRef.current = null;
        });
    }, [sessionId]);

    const vuelta = useCallback(async (senal: AbortSignal) => {
        if (!sessionId) return;
        const versionPreguntas = preguntasVersion.current;
        const e = await getEstadoDocente(sessionId, senal);
        if (!e) return;
        if (e.session.status === 'ended') {
            // Se terminó por otro lado (desde otro equipo, o sola por quedar
            // 2 horas sin uso): se muestra cómo le fue, no la pantalla de inicio
            setResumenId(sessionId);
            setSession(null);
            setActivity(null);
            setResults(null);
            dejarLaCompetencia(sessionId);
            avisar.info('La clase terminó', 'Se cerró desde otro equipo o por estar más de 2 horas sin uso. Acá está su resumen.');
            return;
        }
        if (e.olvidada) {
            // Quedó abierta horas sin uso (por ejemplo, desde ayer): se cierra
            // con la hora de su última señal y se muestra cómo le fue
            if (await cerrarMiClaseOlvidada(sessionId)) {
                setResumenId(sessionId);
                setSession(null);
                setActivity(null);
                setResults(null);
                dejarLaCompetencia(sessionId);
                avisar.info('Esta clase había quedado abierta', 'Tenía más de 2 horas sin uso y la cerramos. Acá está su resumen; si querés seguir, arrancá una nueva.');
                return;
            }
        }
        setSession(e.session);
        setActivity(e.activity);
        medir(e.ahora);
        // Competencia: si se recargó la página en el medio, la ronda sigue
        const c = e.activity?.config.competencia;
        if (c && e.activity && e.activity.status !== 'closed' && !terminadasRef.current.has(c.ronda)) {
            const guardada = leerRonda(sessionId);
            if (e.activity.status === 'active' || guardada?.id === c.ronda) {
                setRonda(prev => (prev?.id === c.ronda ? prev : guardada?.id === c.ronda ? guardada : { id: c.ronda, cola: [], hechas: 1 }));
            }
            // Las posiciones, una vez por pregunta revelada (aunque la haya revelado otro equipo)
            if (e.activity.status === 'revealed' && vistaDeRef.current !== e.activity.id) traerPosiciones(e.activity);
        }
        // Una actividad cerrada deja a la vista los últimos resultados que tuvo
        if (e.activity && e.activity.status !== 'closed') setResults(e.results);
        setReactions(e.reacciones);
        setInvitados(e.invitados);
        if (preguntasVersion.current === versionPreguntas) setPreguntas(e.preguntas);
        // Invitados conectados: los que dieron señal en los últimos 2 minutos
        // (con la hora del servidor: si la notebook tiene la hora corrida, igual cuenta bien)
        const desde = (e.ahora ? Date.parse(e.ahora) : Date.now()) - 120_000;
        setConnected(e.invitados.filter(g => new Date(g.vistoAt).getTime() > desde).length);
        setOnlineIds(e.conectados);
    }, [sessionId, medir, dejarLaCompetencia, traerPosiciones]);
    const sondeo = useSondeo(vuelta, POLL_MS, Boolean(session && session.status === 'live'));

    // Migue sabe qué clase está dando (lo último que lanzó, sin nombres)
    useContextoMigue(session && session.status === 'live' ? { tipo: 'clase_en_vivo', id: session.id, titulo: session.title } : null);

    // ── Competencia: el reloj de la pregunta y el revelado solo ──
    const quedan = useCuentaRegresiva(finDePregunta(activity, activity?.createdAt), desfase);

    /**
     * Revela la pregunta (solo si sigue activa: si justo se cerró, no la
     * reabre; la vuelta trae cómo quedó) y, si es de competencia, trae las posiciones
     */
    const revelar = useCallback(async (act: LiveActivity) => {
        if (!(await revelarActividad(act.id))) return;
        setActivity(a => (a && a.id === act.id ? { ...a, status: 'revealed' } : a));
        traerPosiciones(act);
    }, [traerPosiciones]);

    // Al terminar el tiempo (con un segundo y medio para lo que viene en
    // camino) o cuando ya respondieron todos los que están, se revela sola
    const esperados = students.filter(s => onlineIds.has(s.id)).length + connected;
    const respondieron = results?.responded ?? 0;
    useEffect(() => {
        if (!activity?.config.competencia || activity.status !== 'active' || reveladaRef.current === activity.id) return;
        const todos = esperados > 0 && respondieron >= esperados;
        if (!todos && (quedan === null || quedan > -1.5)) return;
        const act = activity;
        reveladaRef.current = act.id;
        revelar(act).catch(() => {
            // Sin señal: se vuelve a probar en unos segundos
            window.setTimeout(() => { if (reveladaRef.current === act.id) reveladaRef.current = null; }, 3000);
        });
    }, [activity, quedan, esperados, respondieron, revelar]);

    // El QR vive en el panel, no en un modal: con la notebook espejada al
    // proyector, esta pantalla es la que ve la sala. Un modal que hay que
    // abrir y cerrar tapa justo los resultados que la gente está mirando.
    const joinCode = session && session !== undefined ? session.joinCode : null;
    useEffect(() => {
        if (!joinCode) { setJoinQr(''); return; }
        QRCode.toDataURL(enlacePublico(`/vivo/${joinCode}`), {
            width: 600,
            margin: 1,
            errorCorrectionLevel: 'M',
            color: { dark: '#0F1419', light: '#FFFFFF' },
        }).then(setJoinQr).catch(() => setJoinQr(''));
    }, [joinCode]);

    if (!user) return null;

    const subjectName = (id: string) => subjectsMap[id]?.name ?? 'Materia';

    // ── Handlers ──

    const handleStart = async () => {
        if (starting) return;
        if (esModoSala) {
            setStarting(true);
            setStartError('');
            try {
                setSession(await startLiveSession({
                    teacherId: user.id,
                    schoolId: user.schoolId,
                    subjectId: null,
                    courseId: null,
                    title: tituloSala.trim().slice(0, 80) || 'Sala abierta',
                }));
            } catch (err) {
                setStartError(err instanceof Error ? err.message : 'No se pudo abrir la sala.');
            } finally {
                setStarting(false);
            }
            return;
        }
        const a = assignments[assignmentIdx];
        if (!a) return;
        setStarting(true);
        setStartError('');
        const primero = materialesIniciales[0] ?? null;
        try {
            const s = await startLiveSession({
                teacherId: user.id,
                schoolId: user.schoolId,
                subjectId: a.subjectId,
                courseId: a.courseId,
                title: `${subjectName(a.subjectId)} · ${a.courseName}`,
                materialId: primero && 'materialId' in primero ? primero.materialId : null,
                classId: primero && 'classId' in primero ? primero.classId : null,
            });
            // El primero ya entró a la lista con la clase; el resto, en su orden
            if (materialesIniciales.length > 1) {
                await sincronizarMaterialesDeClase(s.id, materialesIniciales, s.materialId ?? s.classId)
                    .catch(err => setStartError(`La clase arrancó, pero no se pudieron sumar todos los materiales: ${err instanceof Error ? err.message : 'probá desde "Agregar o quitar"'}`));
            }
            setSession(s);
        } catch (err) {
            setStartError(err instanceof Error ? err.message : 'No se pudo iniciar la clase.');
        } finally {
            setStarting(false);
        }
    };

    const handleEnd = async () => {
        if (!session) return;
        const ok = await confirmar({
            titulo: '¿Terminar la clase en vivo?',
            mensaje: 'Los estudiantes vuelven a su pantalla normal y vas a ver el resumen de la clase.',
            accion: 'Terminar clase',
            cancelar: 'Seguir en vivo',
            peligro: true,
        });
        if (!ok) return;
        try {
            await endLiveSession(session.id);
            setResumenId(session.id);
            dejarLaCompetencia(session.id);
            setSession(null);
            setActivity(null);
            setResults(null);
        } catch (err) {
            console.error(err);
            avisar.error('No se pudo terminar la clase. Probá de nuevo.');
        }
    };

    const handleToggleReactions = async () => {
        if (!session) return;
        const next = !session.reactionsEnabled;
        setSession({ ...session, reactionsEnabled: next }); // optimista
        try {
            await setReactionsEnabled(session.id, next);
        } catch (err) {
            console.error(err);
            setSession({ ...session, reactionsEnabled: !next });
            avisar.error('No se pudo cambiar la botonera de emojis. Probá de nuevo.');
        }
    };

    /**
     * Abre la sala a gente sin cuenta. Apagado por default: en una clase
     * normal participan los estudiantes del curso y nadie más. Se prende
     * para una presentación, una jornada o una visita al aula.
     */
    const handleToggleGuests = async () => {
        if (!session) return;
        const next = !session.guestsEnabled;
        // Abrirla deja entrar a cualquiera con el código, en una clase con chicos
        if (next && !(await confirmar({
            titulo: '¿Abrir la sala a invitados?',
            mensaje: 'Cualquiera con el código o el QR entra sin cuenta, con el nombre que quiera, y puede contestar y mandar emojis. Sirve para una visita o una jornada; en una clase común no hace falta. Al cerrarla, salen todos y el código cambia.',
            accion: 'Abrir la sala',
        }))) return;
        setSession({ ...session, guestsEnabled: next });
        try {
            await setGuestsEnabled(session.id, next);
            if (!next) avisar.info('Sala cerrada a invitados', 'Los que estaban adentro ya no ven la clase.');
        } catch (err) {
            console.error(err);
            setSession({ ...session, guestsEnabled: !next });
            avisar.error('No se pudo cambiar el acceso de invitados. Probá de nuevo.');
        }
    };

    const sacar = async (g: InvitadoEnSala) => {
        if (!(await confirmar({
            titulo: `¿Sacar a "${g.nombre}" de la sala?`,
            mensaje: 'Deja de ver la clase, se borra lo que mandó y el código de la sala cambia: con el enlace o el QR viejo no vuelve a entrar. Si está en el aula y escanea el nuevo, puede volver: en ese caso, cerrá la sala.',
            accion: 'Sacar',
            peligro: true,
        }))) return;
        try {
            await sacarInvitado(g.id);
            setInvitados(prev => prev.filter(x => x.id !== g.id));
            if (activity) getLiveResults(activity.id).then(setResults).catch(console.error);
            // Se borró lo que mandó: si estaba en el podio, sale también de ahí (y del proyector)
            if (vistaComp && sessionId) getCompetencia(sessionId, vistaComp.ronda).then(setVistaComp).catch(console.error);
            if (podioFinal && sessionId) getCompetencia(sessionId, podioFinal.ronda).then(setPodioFinal).catch(console.error);
        } catch (err) {
            console.error(err);
            avisar.error('No se pudo sacar al invitado. Probá de nuevo.');
        }
    };

    /** Saca una respuesta (texto) o una palabra de la nube sin frenar la clase. */
    const sacarRespuesta = async (que: { id: string } | { palabra: string }) => {
        if (!activity) return;
        try {
            if ('id' in que) await deleteLiveResponse(que.id);
            else await sacarPalabraEnVivo(activity.id, que.palabra);
            setResults(await getLiveResults(activity.id));
        } catch (err) {
            console.error(err);
            avisar.error('No se pudo sacar. Probá de nuevo.');
        }
    };

    const resetLauncher = () => {
        setPickedKind(null);
        setQuestion('');
        setOptions([{ id: 'a', label: '' }, { id: 'b', label: '' }]);
        setCorrectId('');
    };

    const needsOptions = pickedKind === 'quiz' || pickedKind === 'encuesta' || pickedKind === 'chips';
    const validOptions = options.filter(o => o.label.trim());
    /** La pregunta rápida que se lanza va con tiempo y puntos (no si es dirigida a uno) */
    const conCompetencia = pickedKind === 'quiz' && competir && !targetStudent;
    const canLaunch = pickedKind === 'checkin'
        || (pickedKind === 'nube' && question.trim())
        || (pickedKind === 'texto' && question.trim())
        || (needsOptions && question.trim() && validOptions.length >= 2 && (pickedKind !== 'quiz' || correctId));

    /** Un cambio del docente en una pregunta, al toque (null: sale de la lista) */
    const cambiarPregunta = (id: string, cambio: Partial<PreguntaPublico> | null) => {
        preguntasVersion.current++;
        setPreguntas(p => ({
            ...p,
            lista: cambio === null ? p.lista.filter(x => x.id !== id) : p.lista.map(x => (x.id === id ? { ...x, ...cambio } : x)),
        }));
    };

    /**
     * Se lanzó algo: el podio final deja la pantalla (y el proyector). Si es
     * de competencia, arranca (o sigue) la ronda con esta pregunta.
     */
    const sumarALaRonda = (act: LiveActivity, cola?: PreguntaEnCola[]) => {
        setPodioFinal(null);
        const c = act.config.competencia;
        if (!c || !session) return;
        const misma = ronda?.id === c.ronda ? ronda : null;
        const r: Ronda = { id: c.ronda, cola: cola ?? misma?.cola ?? [], hechas: (misma?.hechas ?? 0) + 1 };
        setRonda(r);
        guardarRonda(session.id, r);
        setCompetir(true);
    };

    /** Con una ronda en curso, la pregunta rápida (con correcta, para todos) suma a la competencia */
    const enLaRonda = (kind: LiveActivityKind, config: LiveActivityConfig): LiveActivityConfig =>
        ronda && kind === 'quiz' && config.correctId && !targetStudent
            ? { ...config, groupMode: undefined, competencia: { segundos: segundosComp, ronda: ronda.id } }
            : config;

    const handleLaunch = async () => {
        if (!session || !pickedKind || !canLaunch || launching) return;
        setLaunching(true);
        try {
            const base = pickedKind === 'checkin'
                ? { question: '¿Cómo venís con la clase de hoy?' }
                : needsOptions
                    ? { question: question.trim(), options: validOptions, ...(pickedKind === 'quiz' ? { correctId } : {}) }
                    : { question: question.trim() };
            // Competencia: con tiempo y para todos (sin ronda, la arma el servidor).
            // Si no, dirigida a uno o una respuesta por grupo: nunca las dos a la vez.
            const config: LiveActivityConfig = conCompetencia
                ? { ...base, competencia: { segundos: segundosComp, ronda: ronda?.id ?? '' } }
                : groupMode && !targetStudent ? { ...base, groupMode: true } : base;
            const act = await launchActivity(session.id, pickedKind, config, targetStudent?.id ?? null, session.classId);
            setActivity(act);
            setResults(null);
            sumarALaRonda(act);
            resetLauncher();
            setTargetStudent(null);
        } catch (err) {
            avisar.error('No se pudo lanzar la actividad.', err instanceof Error ? err.message : 'Probá de nuevo.');
        } finally {
            setLaunching(false);
        }
    };

    /** Lanza una pregunta armada desde el material (va a todo el curso). */
    const lanzarDesdeMaterial = async (kind: LiveActivityKind, config: LiveActivityConfig) => {
        if (!session) return;
        const act = await launchActivity(session.id, kind, enLaRonda(kind, config), null, session.classId);
        setActivity(act);
        setResults(null);
        sumarALaRonda(act);
    };

    /**
     * Una pregunta preparada (068), de un toque. Respeta lo elegido en el
     * panel: si hay un destinatario va solo a él; si está "en grupos", a los grupos.
     */
    const lanzarPreparada = async (kind: LiveActivityKind, config: LiveActivityConfig, classId: string) => {
        if (!session || launching) return;
        setLaunching(true);
        try {
            const cfg = enLaRonda(kind, groupMode && !targetStudent ? { ...config, groupMode: true } : config);
            const act = await launchActivity(session.id, kind, cfg, targetStudent?.id ?? null, classId);
            setActivity(act);
            setResults(null);
            sumarALaRonda(act);
            setTargetStudent(null);
        } catch (err) {
            avisar.error('No se pudo lanzar la pregunta.', err instanceof Error ? err.message : 'Probá de nuevo.');
        } finally {
            setLaunching(false);
        }
    };

    /** Una pregunta de la cola de la competencia; `resto`: las que quedan después */
    const lanzarEnCompetencia = async (p: PreguntaEnCola, resto: PreguntaEnCola[]) => {
        if (!session || launching) return;
        setLaunching(true);
        try {
            const config: LiveActivityConfig = {
                ...p.config, groupMode: undefined,
                competencia: { segundos: segundosComp, ronda: ronda?.id ?? '' },
            };
            const act = await launchActivity(session.id, 'quiz', config, null, p.classId);
            setActivity(act);
            setResults(null);
            sumarALaRonda(act, resto);
            if (p.preguntaId) void marcarLanzada(p.preguntaId);
        } catch (err) {
            avisar.error('No se pudo lanzar la pregunta.', err instanceof Error ? err.message : 'Probá de nuevo.');
        } finally {
            setLaunching(false);
        }
    };

    /** Las preguntas preparadas, una atrás de otra, con tiempo y puntos */
    const competirConPreparadas = (lista: PreguntaEnCola[]) => {
        const [primera, ...resto] = lista;
        if (primera) void lanzarEnCompetencia(primera, resto);
    };

    const siguientePregunta = () => {
        if (!ronda || ronda.cola.length === 0) return;
        const [p, ...resto] = ronda.cola;
        void lanzarEnCompetencia(p, resto);
    };

    /** Termina la ronda: la que está en pantalla se revela (si no, no suma) y queda el podio */
    const terminarCompetencia = async () => {
        if (!session || !ronda) return;
        const id = ronda.id;
        terminadasRef.current.add(id);
        try {
            if (activity?.config.competencia?.ronda === id && activity.status === 'active') {
                reveladaRef.current = activity.id;
                await revelar(activity);
            }
            setPodioFinal(await getCompetencia(session.id, id));
        } catch (err) {
            terminadasRef.current.delete(id);
            avisar.error('No se pudo traer el podio.', esErrorDeRed(err) ? 'Sin señal: probá de nuevo en un ratito.' : 'Probá de nuevo.');
            return;
        }
        guardarRonda(session.id, null);
        setRonda(null);
        setVistaComp(null);
        setCompetir(false);
    };

    /** Los que eligieron la correcta; en modo grupal, todo su grupo. */
    const premiarAcertaron = async () => {
        if (!activity?.config.correctId) return;
        try {
            let ids = await getCorrectResponders(activity.id, activity.config.correctId);
            if (activity.config.groupMode) {
                const delGrupo = groups.filter(g => g.memberIds.some(id => ids.includes(id))).flatMap(g => g.memberIds);
                ids = [...new Set([...ids, ...delGrupo])];
            }
            setPremiar({
                titulo: ids.length ? `Premiar a los que acertaron (${ids.length})` : 'Nadie acertó todavía: elegí a quién premiar',
                preseleccion: ids,
            });
        } catch {
            setPremiar({ titulo: 'Dar medalla', preseleccion: [] });
        }
    };

    const handleReveal = async () => {
        if (!activity) return;
        const act = activity;
        reveladaRef.current = act.id;
        await revelar(act).catch(err => {
            console.error(err);
            // Que el reloj la pueda revelar sola si no se vuelve a tocar
            if (reveladaRef.current === act.id) reveladaRef.current = null;
            avisar.error('No se pudo revelar la respuesta. Probá de nuevo.');
        });
    };

    const handleCloseActivity = async () => {
        if (!activity) return;
        await setActivityStatus(activity.id, 'closed').catch(console.error);
        setActivity({ ...activity, status: 'closed' });
    };

    // ── Render: cargando ──
    if (session === undefined) {
        return (
            <div className="cv-container">
                {buscandoSinSenial && (
                    <SenialEnVivo fallas={2} deRed={buscandoSinSenial === 'red'} ultimaOk={null} detalle="Todavía no pudimos ver si tenés una clase abierta. Seguimos probando." />
                )}
                <Esqueleto tipo="tarjetas" cantidad={2} etiqueta="Cargando la clase en vivo…" />
            </div>
        );
    }

    // ── Render: resumen de una clase terminada ──
    if (resumenId) {
        return <ResumenClase sessionId={resumenId} onVolver={() => setResumenId(null)} />;
    }

    // ── Render: sin clase en vivo → iniciar ──
    if (!session || session.status !== 'live') {
        return (
            <div className="cv-container cv-start animate-in">
                <div className="card cv-start-card">
                    <div className="cv-start-icon"><Radio size={26} /></div>
                    <h2>{conCursos ? 'Clase en vivo' : 'Sala en vivo'}</h2>
                    {conCursos && (
                        <div className="cv-modo" role="group" aria-label="¿Para quién es?">
                            <button type="button" className={`cv-chip-seg ${!esModoSala ? 'on' : ''}`} aria-pressed={!esModoSala}
                                onClick={() => { setModoInicio('curso'); setStartError(''); }}>
                                Clase con un curso
                            </button>
                            <button type="button" className={`cv-chip-seg ${esModoSala ? 'on' : ''}`} aria-pressed={esModoSala}
                                onClick={() => { setModoInicio('sala'); setStartError(''); }}>
                                Sala abierta, sin curso
                            </button>
                        </div>
                    )}
                    {esModoSala ? (
                        <>
                            <p className="text-secondary">
                                Para una reunión, una jornada o una charla con familias: entran con el QR o el código,
                                sin cuenta, y participan desde el celular. Preguntas, encuestas, nube de palabras,
                                competencia y preguntas del público, como en una clase.
                            </p>
                            <div className="cv-start-form">
                                <label htmlFor="cv-sala-titulo" className="text-sm text-secondary">Nombre de la sala</label>
                                <input id="cv-sala-titulo" className="cv-input" maxLength={80} value={tituloSala}
                                    placeholder="Ej: Reunión con familias de 3° A"
                                    onChange={e => setTituloSala(e.target.value)}
                                    onKeyDown={e => { if (e.key === 'Enter') void handleStart(); }} />
                                <button className="btn btn-primary w-full" onClick={handleStart} disabled={starting}>
                                    {starting ? <Loader2 size={16} className="spin" /> : <QrCode size={16} />}
                                    {starting ? 'Abriendo...' : 'Abrir la sala'}
                                </button>
                                {startError && <p className="text-sm text-danger">{startError}</p>}
                                <p className="text-xs text-subtle">
                                    Se suman con el QR que vas a proyectar, poniendo solo un nombre. No es una clase de un
                                    curso: los estudiantes no la ven con su cuenta (si hace falta, escanean el QR como cualquiera).
                                </p>
                            </div>
                        </>
                    ) : (
                    <>
                    <p className="text-secondary">
                        Dictás tu clase como siempre y, cuando lo necesitás, lanzás una actividad:
                        los celulares de tus estudiantes se convierten en su forma de participar.
                        Vos ves los resultados crecer en vivo, desde cualquier dispositivo.
                    </p>
                    <div className="cv-start-form">
                        <label className="text-sm text-secondary">¿Para qué curso?</label>
                        <select
                            className="form-select"
                            value={assignmentIdx}
                            onChange={e => { setAssignmentIdx(Number(e.target.value)); setMaterialesIniciales([]); }}
                        >
                            {assignments.map((a, i) => (
                                <option key={i} value={i}>
                                    {subjectName(a.subjectId)} — {a.courseName}
                                </option>
                            ))}
                        </select>
                        <label className="text-sm text-secondary">Material de la clase (opcional)</label>
                        <button type="button" className="btn btn-secondary w-full cv-start-material" onClick={() => setEligiendoInicial(true)}
                            disabled={assignments.length === 0}>
                            <BookOpen size={16} aria-hidden="true" />
                            <span>
                                {materialesIniciales.length === 0
                                    ? 'Elegir temas o materiales'
                                    : materialesIniciales.length === 1
                                        ? materialesIniciales[0].titulo
                                        : `${materialesIniciales.length} materiales: ${materialesIniciales.map(m => m.titulo).join(' · ')}`}
                            </span>
                        </button>
                        <button className="btn btn-primary w-full" onClick={handleStart} disabled={starting || assignments.length === 0}>
                            {starting ? <Loader2 size={16} className="spin" /> : <Radio size={16} />}
                            {starting ? 'Iniciando...' : 'Iniciar clase en vivo'}
                        </button>
                        {startError && <p className="text-sm text-danger">{startError}</p>}
                        <p className="text-xs text-subtle">
                            Tus estudiantes van a ver un aviso en su pantalla para entrar. Sin códigos, sin instalar nada.
                        </p>
                    </div>
                    </>
                    )}
                </div>
                {pasadas.length > 0 && (
                    <section className="card cv-pasadas" aria-labelledby="cv-pasadas-titulo">
                        <h3 id="cv-pasadas-titulo">Clases anteriores</h3>
                        <ul>
                            {pasadas.map(p => (
                                <li key={p.id}>
                                    <span className="cv-pasada-texto">
                                        <strong>{p.title}</strong>
                                        <span className="text-xs text-subtle">
                                            {new Date(p.createdAt).toLocaleString('es-AR', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                                        </span>
                                    </span>
                                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => setResumenId(p.id)}>Ver resumen</button>
                                </li>
                            ))}
                        </ul>
                    </section>
                )}
                {!esModoSala && assignments[assignmentIdx] && (
                    <ElegirMaterial
                        abierto={eligiendoInicial}
                        alCerrar={() => setEligiendoInicial(false)}
                        teacherId={user.id}
                        subjectId={assignments[assignmentIdx].subjectId}
                        courseId={assignments[assignmentIdx].courseId}
                        elegidos={materialesIniciales}
                        alConfirmar={lista => { setMaterialesIniciales(lista); setEligiendoInicial(false); }}
                    />
                )}
            </div>
        );
    }

    // ── Render: clase en vivo activa ──
    const alertCounts = reactions.reduce<Record<string, number>>((acc, r) => {
        acc[r.emoji] = (acc[r.emoji] ?? 0) + 1;
        return acc;
    }, {});

    /** Hay algo en pantalla de los estudiantes ahora mismo. */
    const hayActiva = !!activity && activity.status !== 'closed';
    // Con el material proyectado y una pregunta activa, se ve la pregunta (salvo que
    // el docente haya pedido el material para esta); al cerrarla, vuelve el material
    const modoProyeccion = proyeccion === 'material' && !materialActual ? null
        : proyeccion === 'material' && hayActiva && activity && materialPese !== activity.id ? 'vivo'
            : proyeccion;
    /** Pedido a mano: el material, aunque haya una pregunta en curso */
    const proyectarMaterial = () => {
        if (!materialActual) return;
        setMaterialVisto(materialActual.id);
        setMaterialPese(hayActiva && activity ? activity.id : null);
        setProyeccion('material');
    };

    const studentName = (id: string) => {
        const s = students.find(x => x.id === id);
        return s ? `${s.firstName} ${s.lastName}` : 'un estudiante';
    };
    const onlineCount = students.filter(s => onlineIds.has(s.id)).length;
    /** Grupos con al menos alguien conectado (para el modo grupal). */
    const groupsOnline = groups.filter(g => g.memberIds.some(id => onlineIds.has(id))).length;

    return (
        <div className="cv-container animate-in">
            {/* Header de sesión */}
            <div className="card cv-header">
                <div className="cv-header-info">
                    <span className="cv-live-dot" />
                    <div>
                        <h3>{session.title}</h3>
                        <p className="text-xs text-subtle">
                            {session.guestsEnabled
                                ? `Sala abierta · entran con el QR o el código ${session.joinCode ?? ''}`
                                : 'Los estudiantes participan desde su celular'}
                        </p>
                    </div>
                </div>
                <div className="cv-header-actions">
                    {/* Una sala sin curso es solo con invitados: la puerta no se cierra */}
                    {session.courseId && (
                    <button
                        className={`cv-toggle ${session.guestsEnabled ? 'on' : ''}`}
                        onClick={handleToggleGuests}
                        title={session.guestsEnabled
                            ? 'Cualquiera con el QR puede participar. Tocá para cerrar la sala.'
                            : 'Sala cerrada: solo los estudiantes del curso. Tocá para abrirla con QR.'}
                    >
                        <UserPlus size={15} />
                        <span>Invitados</span>
                        <span className={`cv-toggle-pill ${session.guestsEnabled ? 'on' : ''}`} />
                    </button>
                    )}
                    {session.guestsEnabled && session.joinCode && (
                        <button
                            className="btn btn-outline btn-sm"
                            onClick={() => setShowQr(true)}
                            title="QR y código para proyectar"
                        >
                            <QrCode size={13} /> {session.joinCode}
                        </button>
                    )}
                    <button
                        className="btn btn-outline btn-sm"
                        onClick={() => setProyeccion('vivo')}
                        title="Pantalla completa para el proyector"
                    >
                        <MonitorPlay size={13} /> Proyectar
                    </button>
                    <button
                        className={`cv-toggle ${session.reactionsEnabled ? 'on' : ''}`}
                        onClick={handleToggleReactions}
                        title={session.reactionsEnabled
                            ? 'Los estudiantes pueden mandar emojis. Tocá para apagar la botonera.'
                            : 'Botonera de emojis apagada. Tocá para prenderla.'}
                    >
                        <Smile size={15} />
                        <span>Emojis</span>
                        <span className={`cv-toggle-pill ${session.reactionsEnabled ? 'on' : ''}`} />
                    </button>
                    <button className="btn btn-outline btn-sm cv-end-btn" onClick={handleEnd}>
                        <Square size={13} /> Terminar
                    </button>
                </div>
            </div>

            <SenialEnVivo
                fallas={sondeo.fallas}
                deRed={sondeo.deRed}
                ultimaOk={sondeo.ultimaOk}
                detalle="Los chicos pueden seguir respondiendo desde sus celulares: cuando se pueda, ves todo."
            />

            {/* Puerta de entrada. Grande mientras no hay actividad —que es
                cuando la gente está entrando— y compacta cuando sí la hay,
                para no competir con los resultados pero que el que llega
                tarde siga teniendo por dónde entrar. */}
            {session.guestsEnabled && session.joinCode && (
                <div className={`card cv-join ${activity && activity.status !== 'closed' ? 'compact' : ''}`}>
                    {joinQr && (
                        <img
                            className="cv-join-qr"
                            src={joinQr}
                            alt={`Código QR para entrar a la sala ${session.joinCode}`}
                            onClick={() => setShowQr(true)}
                            title="Ampliar"
                        />
                    )}
                    <div className="cv-join-info">
                        <p className="cv-join-kicker">Escaneá para entrar</p>
                        <p className="cv-join-code">{session.joinCode}</p>
                        <p className="cv-join-meta">
                            {connected > 0
                                ? `${connected} ${connected === 1 ? 'conectado' : 'conectados'}`
                                : 'Sin cuenta, sin instalar nada'}
                        </p>
                    </div>
                    {invitados.length > 0 && (
                        <details className="cv-invitados">
                            <summary>Invitados ({invitados.length})</summary>
                            <ul>
                                {invitados.map(g => (
                                    <li key={g.id}>
                                        <span>{g.nombre}</span>
                                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => sacar(g)}>
                                            <X size={13} aria-hidden="true" /> Sacar
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        </details>
                    )}
                </div>
            )}

            {/* Competencia (073): cómo va la ronda y qué sigue */}
            {ronda && (
                <section className="card cv-comp" aria-labelledby="cv-comp-titulo">
                    <div className="cv-comp-head">
                        <h4 id="cv-comp-titulo"><Trophy size={15} aria-hidden="true" /> Competencia</h4>
                        <span className="text-xs text-subtle">
                            {ronda.cola.length > 0
                                ? `Pregunta ${ronda.hechas} de ${ronda.hechas + ronda.cola.length}`
                                : `${ronda.hechas} ${ronda.hechas === 1 ? 'pregunta' : 'preguntas'}`}
                            {vistaComp && vistaComp.participantes > 0 ? ` · ${vistaComp.participantes} participantes` : ''}
                        </span>
                    </div>
                    {/* Mientras corre el tiempo, el podio no: la sala mira la pregunta */}
                    {vistaComp && activity?.status !== 'active' && (
                        <>
                            <Podio podio={vistaComp.podio} />
                            {vistaComp.todos && vistaComp.todos.length > 0 && (
                                <details className="cv-comp-todos">
                                    <summary>Todas las posiciones</summary>
                                    <p className="text-xs text-subtle">Los chicos solo ven el podio y su propio puesto. Si tu pantalla está espejada en el proyector, esta lista también se ve.</p>
                                    <TablaPosiciones todos={vistaComp.todos} />
                                </details>
                            )}
                        </>
                    )}
                    <div className="cv-comp-tiempo" role="group" aria-label="Tiempo para responder cada pregunta">
                        <span className="text-xs text-subtle">Tiempo por pregunta:</span>
                        {SEGUNDOS_COMPETENCIA.map(s => (
                            <button key={s} type="button" className={`cv-chip-seg ${segundosComp === s ? 'on' : ''}`}
                                aria-pressed={segundosComp === s} onClick={() => setSegundosComp(s)}>{s} s</button>
                        ))}
                    </div>
                    <div className="cv-comp-acciones">
                        {ronda.cola.length > 0 && activity?.status !== 'active' && (
                            <button type="button" className="btn btn-primary btn-sm" onClick={siguientePregunta} disabled={launching}>
                                {launching ? <Loader2 size={14} className="spin" /> : <SkipForward size={14} aria-hidden="true" />} Siguiente pregunta
                            </button>
                        )}
                        <button type="button" className="btn btn-outline btn-sm" onClick={terminarCompetencia}>
                            <Trophy size={14} aria-hidden="true" /> Terminar y mostrar el podio
                        </button>
                    </div>
                    {ronda.cola.length === 0 && activity?.status !== 'active' && (
                        <p className="text-xs text-subtle">Las preguntas rápidas con una correcta que lances ahora suman a esta competencia.</p>
                    )}
                </section>
            )}

            {podioFinal && (
                <section className="card cv-comp cv-comp-final" aria-labelledby="cv-podio-titulo">
                    <div className="cv-comp-head">
                        <h4 id="cv-podio-titulo"><Trophy size={15} aria-hidden="true" /> Podio de la competencia</h4>
                        <span className="text-xs text-subtle">
                            {podioFinal.reveladas} {podioFinal.reveladas === 1 ? 'pregunta' : 'preguntas'} · {podioFinal.participantes} participantes
                        </span>
                    </div>
                    <Podio podio={podioFinal.podio} />
                    <p className="text-xs text-subtle">Cada uno ve en su celular en qué puesto quedó.</p>
                    {podioFinal.todos && podioFinal.todos.length > 0 && (
                        <details className="cv-comp-todos">
                            <summary>Todas las posiciones</summary>
                            <TablaPosiciones todos={podioFinal.todos} />
                        </details>
                    )}
                    <div className="cv-comp-acciones">
                        <button type="button" className="btn btn-primary btn-sm" onClick={() => setProyeccion('vivo')}>
                            <MonitorPlay size={14} aria-hidden="true" /> Proyectar el podio
                        </button>
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setPodioFinal(null)}>Listo</button>
                    </div>
                </section>
            )}

            {/* Actividad activa + resultados */}
            {activity && activity.status !== 'closed' ? (
                <div className="card cv-activity">
                    <div className="cv-activity-head">
                        <span className="badge badge-ia">
                            {LIVE_KIND_META[activity.kind].emoji} {LIVE_KIND_META[activity.kind].label}
                        </span>
                        {activity.targetStudentId && (
                            <span className="badge badge-warning" title="Solo este estudiante la ve en su celular">
                                🎯 Para {studentName(activity.targetStudentId)}
                            </span>
                        )}
                        {activity.config.groupMode && (
                            <span className="badge badge-cyan" title="Una respuesta por grupo">👥 En grupos</span>
                        )}
                        {results && (
                            <span className="cv-responded" title={activity.config.groupMode ? 'Respuestas / grupos con alguien conectado' : 'Respondieron / total del curso'}>
                                <Users size={13} /> {results.responded}/{activity.targetStudentId ? 1 : activity.config.groupMode ? Math.max(groupsOnline, 1) : results.courseTotal}
                            </span>
                        )}
                    </div>
                    {activity.config.question && <h3 className="cv-question">{activity.config.question}</h3>}
                    {activity.config.competencia && activity.status === 'active' && (
                        <RelojCompetencia quedan={quedan} total={activity.config.competencia.segundos} />
                    )}

                    <LiveResultsView activity={activity} results={results} isTeacher onSacar={sacarRespuesta} />

                    <div className="cv-activity-actions">
                        {activity.kind === 'quiz' && activity.status === 'active' && (
                            <button className="btn btn-primary btn-sm" onClick={handleReveal}>
                                <Eye size={14} /> {activity.config.competencia ? 'Revelar ya' : 'Revelar respuesta'}
                            </button>
                        )}
                        {activity.kind === 'quiz' && activity.status === 'revealed' && (
                            <button className="btn btn-primary btn-sm" onClick={premiarAcertaron}>
                                <Medal size={14} aria-hidden="true" /> Premiar a los que acertaron
                            </button>
                        )}
                        <button className="btn btn-outline btn-sm" onClick={handleCloseActivity}>
                            <Lock size={14} /> Cerrar actividad
                        </button>
                    </div>
                </div>
            ) : (
                <div className="card cv-idle">
                    <p className="text-secondary">
                        {activity ? 'Actividad cerrada. ' : ''}{session.courseId ? 'Seguí con tu clase tranquilo' : 'Seguí con la charla tranquilo'} —
                        los celulares están en pausa. Lanzá una actividad cuando quieras.
                    </p>
                </div>
            )}

            {/* Reacciones entrantes */}
            {session.reactionsEnabled && reactions.length > 0 && (
                <div className="cv-reactions-strip card">
                    <div className="cv-reactions-flow">
                        {reactions.slice(0, 24).map((r, i) => (
                            <span key={`${r.createdAt}-${i}`} className="cv-reaction-float">{r.emoji}</span>
                        ))}
                    </div>
                    {(alertCounts['🐢'] || alertCounts['❓']) && (
                        <div className="cv-reaction-alerts">
                            {alertCounts['🐢'] > 0 && <span className="cv-alert-chip">🐢 {alertCounts['🐢']} piden ir más despacio</span>}
                            {alertCounts['❓'] > 0 && <span className="cv-alert-chip">❓ {alertCounts['❓']} no están entendiendo</span>}
                        </div>
                    )}
                </div>
            )}

            {/* Lo preparado en "Preparar la clase": se lanza de un toque, sin escribir en el celular */}
            <PreguntasPreparadasVivo session={session} lanzar={lanzarPreparada} ocupado={launching}
                competir={ronda ? undefined : competirConPreparadas} />

            {session.courseId && (
                <MaterialEnVivo session={session} onSession={setSession} lanzar={lanzarDesdeMaterial}
                    onMaterial={setMaterialActual} onProyectar={proyectarMaterial} />
            )}

            {/* Quiénes están: presencia real, no un contador. Tocás a un
                conectado y le mandás una pregunta directa. */}
            {session.courseId && (
                <div className="card cv-people">
                    <div className="cv-people-head">
                        <h4><UsersRound size={15} /> En la sala</h4>
                        <span className="cv-people-count">
                            <span className="cv-online-dot" /> {onlineCount}/{students.length} conectados
                        </span>
                        <button className="btn btn-outline btn-sm" onClick={() => setShowGroups(true)}>
                            👥 Grupos{groups.length > 0 ? ` (${groups.length})` : ''}
                        </button>
                        <button className="btn btn-outline btn-sm" disabled={students.length === 0}
                            onClick={() => setPremiar({ titulo: 'Dar medalla', preseleccion: targetStudent ? [targetStudent.id] : [] })}>
                            <Medal size={14} aria-hidden="true" /> Medalla
                        </button>
                    </div>
                    <div className="cv-people-chips">
                        {students.map(s => {
                            const online = onlineIds.has(s.id);
                            return (
                                <button
                                    key={s.id}
                                    className={`cv-person ${online ? 'online' : ''} ${targetStudent?.id === s.id ? 'targeted' : ''}`}
                                    disabled={!online}
                                    title={online
                                        ? `${s.firstName} está conectado — tocá para mandarle una pregunta directa`
                                        : `${s.firstName} no está conectado ahora`}
                                    onClick={() => setTargetStudent(t => (t?.id === s.id ? null : s))}
                                >
                                    <span className={`cv-person-dot ${online ? 'on' : ''}`} />
                                    {s.firstName} {s.lastName[0]}.
                                    {online && <Target size={12} className="cv-person-target" />}
                                </button>
                            );
                        })}
                        {students.length === 0 && (
                            <Cargando texto="Cargando el curso…" />
                        )}
                    </div>
                </div>
            )}

            <ModerarPreguntas session={session} preguntas={preguntas} onSession={setSession}
                onPregunta={cambiarPregunta} refrescar={sondeo.ahora} />

            {/* Lanzador */}
            <div className="card cv-launcher">
                {targetStudent && (
                    <div className="cv-target-banner" role="status">
                        <Target size={15} />
                        <span>Pregunta directa para <strong>{targetStudent.firstName} {targetStudent.lastName}</strong> — solo su celular la recibe</span>
                        <button className="btn-icon" aria-label="Quitar destinatario" onClick={() => setTargetStudent(null)}>
                            <X size={14} />
                        </button>
                    </div>
                )}
                {!pickedKind ? (
                    <>
                        <h4 className="cv-launcher-title">
                            <Plus size={15} />
                            {targetStudent
                                ? `Elegí qué mandarle a ${targetStudent.firstName}`
                                : hayActiva ? 'Lanzar la siguiente' : 'Lanzar actividad'}
                        </h4>
                        {/* Con una actividad en pantalla, "Cerrar actividad" se lee
                            como la única salida y no queda claro que la forma de
                            avanzar es elegir otra de acá abajo. */}
                        {hayActiva && !targetStudent && (
                            <p className="cv-launcher-hint">
                                Elegí la próxima y la actual se cierra sola. No hace falta cerrarla antes.
                            </p>
                        )}
                        <div className="cv-kinds">
                            {(Object.entries(LIVE_KIND_META) as [LiveActivityKind, typeof LIVE_KIND_META[LiveActivityKind]][]).map(([kind, meta]) => (
                                <button key={kind} className="cv-kind-card" onClick={() => setPickedKind(kind)}>
                                    <span className="cv-kind-emoji">{meta.emoji}</span>
                                    <span className="cv-kind-label">{meta.label}</span>
                                    <span className="cv-kind-desc">{meta.desc}</span>
                                </button>
                            ))}
                        </div>
                    </>
                ) : (
                    <div className="cv-config">
                        <div className="cv-config-head">
                            <button className="btn-icon" onClick={resetLauncher} title="Volver">
                                <ChevronLeft size={16} />
                            </button>
                            <h4>{LIVE_KIND_META[pickedKind].emoji} {LIVE_KIND_META[pickedKind].label}</h4>
                        </div>

                        {pickedKind === 'checkin' ? (
                            <p className="text-sm text-secondary">
                                Cada estudiante marca cómo viene ({Object.values(FEELING_META).map(f => f.emoji).join(' ')}).
                                Vos ves el clima del aula en vivo y queda en sus señales de bienestar.
                            </p>
                        ) : (
                            <input
                                className="cv-input"
                                autoFocus
                                placeholder={pickedKind === 'nube' ? 'Ej: ¿Con qué palabra resumís lo de hoy?' : 'Escribí la pregunta...'}
                                value={question}
                                maxLength={200}
                                onChange={e => setQuestion(e.target.value)}
                            />
                        )}

                        {needsOptions && (
                            <div className="cv-options-builder">
                                {options.map((opt, i) => (
                                    <div key={opt.id} className="cv-option-row">
                                        {pickedKind === 'quiz' && (
                                            <button
                                                className={`cv-correct-pick ${correctId === opt.id ? 'on' : ''}`}
                                                title="Marcar como correcta"
                                                onClick={() => setCorrectId(opt.id)}
                                            >
                                                <CheckCircle size={15} />
                                            </button>
                                        )}
                                        <input
                                            className="cv-input"
                                            placeholder={`Opción ${String.fromCharCode(65 + i)}`}
                                            value={opt.label}
                                            maxLength={80}
                                            onChange={e => setOptions(prev => prev.map(o => o.id === opt.id ? { ...o, label: e.target.value } : o))}
                                        />
                                        {options.length > 2 && (
                                            <button className="btn-icon" onClick={() => setOptions(prev => prev.filter(o => o.id !== opt.id))}>
                                                <Trash2 size={14} />
                                            </button>
                                        )}
                                    </div>
                                ))}
                                {options.length < 6 && (
                                    <button
                                        className="cv-add-option"
                                        onClick={() => setOptions(prev => [...prev, { id: `${Date.now()}`, label: '' }])}
                                    >
                                        <Plus size={13} /> Agregar opción
                                    </button>
                                )}
                                {pickedKind === 'quiz' && !correctId && (
                                    <p className="text-xs text-subtle">Tocá el círculo de la opción correcta.</p>
                                )}
                            </div>
                        )}

                        {/* Competencia (073): con tiempo, puntos por rapidez y podio */}
                        {pickedKind === 'quiz' && !targetStudent && (
                            <div className="cv-comp-opcion">
                                <label className="cv-groupmode" title="Cada uno responde una sola vez, con tiempo. Suma más el que acierta más rápido.">
                                    <input type="checkbox" checked={competir} onChange={e => setCompetir(e.target.checked)} />
                                    🏆 Competencia: con tiempo y puntos por rapidez{ronda ? ' (suma a la que está en curso)' : ''}
                                </label>
                                {competir && (
                                    <div className="cv-comp-tiempo" role="group" aria-label="Tiempo para responder">
                                        {SEGUNDOS_COMPETENCIA.map(s => (
                                            <button key={s} type="button" className={`cv-chip-seg ${segundosComp === s ? 'on' : ''}`}
                                                aria-pressed={segundosComp === s} onClick={() => setSegundosComp(s)}>{s} s</button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}

                        {groups.length > 0 && !targetStudent && !conCompetencia && (
                            <label className="cv-groupmode" title="Para cuando no alcanzan los celulares o la consigna es grupal">
                                <input type="checkbox" checked={groupMode} onChange={e => setGroupMode(e.target.checked)} />
                                👥 Una respuesta por grupo ({groups.length} grupos)
                            </label>
                        )}

                        <button className="btn btn-primary w-full" onClick={handleLaunch} disabled={!canLaunch || launching}>
                            {launching ? <Loader2 size={15} className="spin" /> : targetStudent ? <Target size={15} /> : conCompetencia ? <Trophy size={15} /> : <Radio size={15} />}
                            {launching ? 'Lanzando...'
                                : targetStudent ? `Mandársela a ${targetStudent.firstName}`
                                : conCompetencia ? `Lanzar con ${segundosComp} segundos`
                                : groupMode ? 'Lanzar a los grupos'
                                : session.courseId ? 'Lanzar al curso' : 'Lanzar a la sala'}
                        </button>
                    </div>
                )}
            </div>

            {/* El material en la pared; con una pregunta en curso, pasa sola a la pregunta */}
            {materialActual && (materialVisto === materialActual.id || proyeccion === 'material') && (
                <MaterialViewer
                    key={materialActual.id}
                    material={materialActual}
                    proyectar
                    oculto={modoProyeccion !== 'material'}
                    onClose={() => setProyeccion(null)}
                    accionesExtra={(
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setMaterialPese(null); setProyeccion('vivo'); }}
                            title="La pregunta en curso, los resultados o el QR para entrar">
                            <MonitorPlay size={15} aria-hidden="true" /> Pregunta y QR
                        </button>
                    )}
                />
            )}

            {modoProyeccion === 'vivo' && (
                <ProyectarVivo
                    session={session}
                    activity={activity}
                    results={results}
                    connected={connected}
                    reactions={session.reactionsEnabled ? reactions : []}
                    sinSenial={sondeo.fallas >= 2}
                    competencia={{ quedan, vista: vistaComp, final: podioFinal }}
                    preguntas={{ abiertas: session.preguntasAbiertas, lista: preguntas.lista }}
                    onClose={() => setProyeccion(null)}
                    alVerMaterial={materialActual ? proyectarMaterial : undefined}
                />
            )}

            {premiar && session.subjectId && (
                <PremiarEnVivo
                    titulo={premiar.titulo}
                    students={students}
                    onlineIds={onlineIds}
                    preseleccion={premiar.preseleccion}
                    teacherId={user.id}
                    subjectId={session.subjectId}
                    onClose={() => setPremiar(null)}
                    onListo={(n, code) => {
                        setPremiar(null);
                        const m = AWARD_META[code];
                        avisar.exito(`${m?.emoji ?? '🏅'} ${m?.label ?? 'Medalla'} para ${n} estudiante${n !== 1 ? 's' : ''}`, 'Les aparece ahora en el celular.');
                    }}
                />
            )}

            {showGroups && session.courseId && (
                <GruposModal
                    courseId={session.courseId}
                    teacherId={user.id}
                    courseName={session.title}
                    students={students}
                    onClose={() => setShowGroups(false)}
                    onSaved={setGroups}
                />
            )}

            {showQr && session.joinCode && (
                <QrModal
                    path={`/vivo/${session.joinCode}`}
                    title={`Sala ${session.joinCode}`}
                    subtitle="Proyectalo: escanean, ponen su nombre y participan desde el celular. No hace falta cuenta. El código también se puede tipear a mano."
                    onClose={() => setShowQr(false)}
                />
            )}
        </div>
    );
}

/* ── Resultados en vivo (compartido docente/estudiante) ── */
type PropsResultados = {
    /* Solo necesita la forma de la actividad: así la reusa también la
       pantalla de invitados, que recibe una versión recortada. */
    activity: Pick<LiveActivity, 'kind' | 'config' | 'status'>;
    results: LiveResults | null;
    isTeacher?: boolean;
    /** Solo el docente: sacar un texto o una palabra que no tiene que estar */
    onSacar?: (que: { id: string } | { palabra: string }) => void;
};

export function LiveResultsView(props: PropsResultados) {
    const retenidas = props.isTeacher ? props.results?.retenidas ?? 0 : 0;
    return (
        <>
            {/* Sin quién ni qué: el panel puede estar proyectado (067) */}
            {retenidas > 0 && (
                <p className="cv-retenidas" role="status">
                    {retenidas === 1 ? '1 respuesta retenida' : `${retenidas} respuestas retenidas`}: puede ser algo que preocupa.
                    No se proyectó ni la ven sus compañeros. Está en Alertas.
                </p>
            )}
            <ResultadosCuerpo {...props} />
        </>
    );
}

function ResultadosCuerpo({ activity, results, isTeacher = false, onSacar }: PropsResultados) {
    // Competencia: mientras corre el tiempo no se ve qué eligieron (se
    // proyecta y se pasa de banco en banco); solo cuántos respondieron
    if (activity.config.competencia && activity.status === 'active') {
        const n = results?.responded ?? 0;
        return <p className="cv-waiting">{n === 0 ? 'Esperando respuestas' : n === 1 ? '1 respondió' : `${n} respondieron`}<span className="cv-ellipsis" /></p>;
    }
    if (!results || results.responded === 0) {
        return <p className="cv-waiting">Esperando respuestas<span className="cv-ellipsis" />​</p>;
    }

    const revealed = activity.status === 'revealed';

    // Barras para opciones / checkin
    if (activity.kind === 'quiz' || activity.kind === 'encuesta' || activity.kind === 'chips' || activity.kind === 'checkin') {
        const entries: { id: string; label: string; n: number; correct?: boolean }[] =
            activity.kind === 'checkin'
                ? (Object.entries(FEELING_META) as [CheckinFeeling, typeof FEELING_META[CheckinFeeling]][]).map(([key, meta]) => ({
                    id: key, label: `${meta.emoji} ${meta.label}`, n: results.counts[key] ?? 0,
                }))
                : (activity.config.options ?? []).map(o => ({
                    id: o.id, label: o.label, n: results.counts[o.id] ?? 0,
                    correct: activity.config.correctId === o.id,
                }));

        const max = Math.max(1, ...entries.map(e => e.n));
        return (
            <div className="cv-bars">
                {entries.map(e => (
                    <div key={e.id} className={`cv-bar-row ${revealed && e.correct ? 'correct' : ''} ${revealed && activity.kind === 'quiz' && !e.correct ? 'dim' : ''}`}>
                        <span className="cv-bar-label">
                            {e.label} {revealed && e.correct && '✅'}
                        </span>
                        <div className="cv-bar-track">
                            <div className="cv-bar-fill" style={{ width: `${(e.n / max) * 100}%` }} />
                            <span className="cv-bar-n">{e.n}</span>
                        </div>
                    </div>
                ))}
            </div>
        );
    }

    if (activity.kind === 'nube') {
        const maxN = Math.max(1, ...results.words.map(w => w.n));
        return (
            <div className="cv-cloud">
                {results.words.map(w => (
                    <span
                        key={w.word}
                        className="cv-cloud-word"
                        style={{ fontSize: `${13 + (w.n / maxN) * 17}px`, opacity: 0.55 + (w.n / maxN) * 0.45 }}
                    >
                        {w.word}
                        {onSacar && (
                            <button type="button" className="cv-sacar" aria-label={`Sacar la palabra ${w.word}`}
                                onClick={() => onSacar({ palabra: w.word })}>
                                <X size={12} aria-hidden="true" />
                            </button>
                        )}
                    </span>
                ))}
            </div>
        );
    }

    // texto libre
    return (
        <div className="cv-texts">
            {results.texts.slice(-30).map(t => (
                <div key={t.id} className="cv-text-item">
                    {isTeacher && t.name && <span className="cv-text-name">{t.name}</span>}
                    <p>{t.text}</p>
                    {onSacar && (
                        <button type="button" className="cv-sacar" aria-label="Sacar esta respuesta" onClick={() => onSacar({ id: t.id })}>
                            <X size={12} aria-hidden="true" />
                        </button>
                    )}
                </div>
            ))}
        </div>
    );
}
