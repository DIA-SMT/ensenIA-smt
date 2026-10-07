import { useState, useEffect, useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { enlaceMensaje } from '../services/mensajes.service';
import { coincideBusqueda } from '../services/busqueda.service';
import {
    Search, AlertTriangle, X, HeartPulse, PencilLine, MessagesSquare,
    Users as UsersIcon, CalendarPlus, CheckCircle, Sparkles, Copy, Medal, Flame,
    BookOpenCheck, FileDown, Trash2, ArrowUpDown, Award, Plus, CloudUpload, ArrowUpRight,
} from 'lucide-react';
import { avisarADireccionPorAlumno, TEMAS_AVISO } from '../services/alerts.service';
import { useAuth } from '../contexts/AuthContext';
import { getStudentsByTeacher, getWorkByStudent, type StudentWork } from '../services/students.service';
import { logAccess } from '../services/audit.service';
import { getCheckinsByStudent, getObservationsByStudent, deleteObservation } from '../services/wellbeing.service';
import { guardarObservacionResiliente, pendientesDe, subscribe as suscribirCola } from '../services/offline-queue.service';
import { getGuardiansOfStudent, createNotice } from '../services/guardians.service';
import { getSubjects } from '../services/subjects.service';
import { getAchievementsByStudent, grantAchievement, revokeAchievement, totalPoints } from '../services/gamification.service';
import { getAbsencesByStudent, ATTENDANCE_META, type AttendanceStatus } from '../services/attendance.service';
import { summarizeStudent } from '../services/documents.service';
import { getStudentTrace } from '../services/informes.service';
import { getWellbeingSignals, weekdayPattern, SIGNAL_META, type WellbeingSignal } from '../services/senales.service';
import { informeToPdf, textToPdf } from '../lib/pdf';
import { getStudentProgress } from '../services/practice.service';
import { getStudentAwards, giveStudentAward } from '../services/awards.service';
import { getPublishedGradesByStudent } from '../services/gradebook.service';
import { formatoNota } from '../lib/resumenNotas';
import MarkdownRenderer from '../components/MarkdownRenderer';
import AwardPickerModal from '../components/AwardPickerModal';
import Dialogo from '../components/shell/Dialogo';
import EstadoVacio from '../components/ui/EstadoVacio';
import { Esqueleto, Cargando } from '../components/ui/Esqueleto';
import { avisar, confirmar } from '../components/ui/avisar';
import {
    FEELING_META, OBSERVATION_META, ACHIEVEMENT_PRESETS, AWARD_META, levelForXp,
    type Student, type StudentCheckin, type StudentObservation,
    type GuardianLink, type ObservationCategory, type StudentAchievement,
    type StudentAward, type StudentProgress, type TermGrade,
} from '../types';
// Estilos compartidos con otras pantallas: desde que cada pantalla se baja
// por separado, lo que no se importa acá no llega.
import './Actividades.css';
import './Biblioteca.css';
import './Students.css';
import '../components/Modals.css';

type SortKey = 'name';

const WORK_STATUS_META: Record<StudentWork['status'], { label: string; cls: string }> = {
    in_progress: { label: 'En curso', cls: 'badge-warning' },
    submitted: { label: 'Entregada', cls: 'badge-cyan' },
    graded: { label: 'Calificada', cls: 'badge-success' },
};

export default function Students() {
    const { user } = useAuth();
    const [searchParams, setSearchParams] = useSearchParams();
    const [allStudents, setAllStudents] = useState<Student[]>([]);
    const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
    const [search, setSearch] = useState('');

    // Filtros y orden de la lista
    const [courseFilter, setCourseFilter] = useState<string>('all');
    const [sortKey, setSortKey] = useState<SortKey>('name');
    const [sortAsc, setSortAsc] = useState(true);

    // Datos del panel
    const [checkins, setCheckins] = useState<StudentCheckin[]>([]);
    const [observations, setObservations] = useState<StudentObservation[]>([]);

    /**
     * Las observaciones del alumno: las del servidor más las guardadas en
     * este equipo que todavía no se enviaron (arriba, marcadas). Sin señal,
     * si no hay copia de las del servidor, se ven al menos las pendientes.
     */
    function recargarObservaciones(studentId: string) {
        const enEspera = (): StudentObservation[] => pendientesDe('observacion')
            .filter(op => op.studentId === studentId)
            .map(op => ({
                id: op.id, studentId: op.studentId, teacherId: op.teacherId, subjectId: op.subjectId,
                category: op.category, note: op.note.trim(), createdAt: new Date(op.ts).toISOString(),
                teacherName: user ? `${user.firstName} ${user.lastName}` : undefined, pendiente: true,
            }))
            .reverse();
        setObservations(enEspera());
        getObservationsByStudent(studentId)
            .then(lista => {
                const pend = enEspera();
                const ids = new Set(lista.map(o => o.id));
                setObservations([...pend.filter(p => !ids.has(p.id)), ...lista]);
            })
            .catch(console.error);
    }
    const [guardians, setGuardians] = useState<GuardianLink[]>([]);
    const [work, setWork] = useState<StudentWork[]>([]);
    const [absences, setAbsences] = useState<{ date: string; status: AttendanceStatus }[]>([]);

    // Logros
    const [achievements, setAchievements] = useState<StudentAchievement[]>([]);
    const [showGrantForm, setShowGrantForm] = useState(false);
    const [customTitle, setCustomTitle] = useState('');
    const [customEmoji, setCustomEmoji] = useState('🏅');
    const [granting, setGranting] = useState(false);
    const [awards, setAwards] = useState<StudentAward[]>([]);
    const [studentProgress, setStudentProgress] = useState<StudentProgress | null>(null);
    // Notas publicadas en la libreta: lo único real para "cómo le va".
    const [notasFicha, setNotasFicha] = useState<TermGrade[] | null>(null);
    const [showAwardModal, setShowAwardModal] = useState(false);

    // Observación rápida
    const [obsCategory, setObsCategory] = useState<ObservationCategory>('dificultad');
    const [obsNote, setObsNote] = useState('');
    const [obsSaving, setObsSaving] = useState(false);
    const [obsSaved, setObsSaved] = useState(false);
    const [obsError, setObsError] = useState('');

    // Informe de actividad (trazabilidad completa, PDF)
    const [informeLoading, setInformeLoading] = useState(false);
    const handleDownloadInforme = async () => {
        if (!selectedStudent || informeLoading) return;
        setInformeLoading(true);
        try {
            const trace = await getStudentTrace(selectedStudent.id);
            informeToPdf(
                `${selectedStudent.firstName} ${selectedStudent.lastName}`,
                `Global · ${selectedStudent.courseName}`,
                [
                    { label: 'Entregas', value: String(trace.stats.entregas) },
                    { label: 'Calificadas', value: String(trace.stats.calificadas) },
                    { label: 'Respuestas en vivo', value: String(trace.stats.respuestasVivo) },
                    { label: 'Conexiones en vivo', value: String(trace.stats.conexionesVivo) },
                    { label: 'Check-ins', value: String(trace.stats.checkins) },
                    { label: 'Logros', value: String(trace.stats.logros) },
                    { label: 'Inasistencias', value: String(trace.stats.inasistencias) },
                ],
                trace.events.slice(0, 80),
            );
        } catch (err) {
            console.error(err);
            avisar.error('No se pudo generar el informe.', 'Probá de nuevo en un rato.');
        } finally {
            setInformeLoading(false);
        }
    };

    // Avisar a dirección sobre este alumno (051)
    const [avisoAbierto, setAvisoAbierto] = useState(false);
    const [avisoTema, setAvisoTema] = useState('convivencia');
    const [avisoMotivo, setAvisoMotivo] = useState('');
    const [avisoEnviando, setAvisoEnviando] = useState(false);
    const [avisoError, setAvisoError] = useState('');
    const handleAvisarDireccion = async () => {
        if (!selectedStudent || !avisoMotivo.trim() || avisoEnviando) return;
        setAvisoEnviando(true);
        setAvisoError('');
        try {
            await avisarADireccionPorAlumno(selectedStudent.id, avisoTema, avisoMotivo);
            avisar.exito('Le avisaste a dirección', 'Le llegó a cada directivo. Lo seguís en Alertas → Avisadas a dirección.');
            setAvisoAbierto(false);
            setAvisoMotivo('');
        } catch (err) {
            setAvisoError(err instanceof Error ? err.message : 'No se pudo avisar. Probá de nuevo.');
        } finally {
            setAvisoEnviando(false);
        }
    };

    // Cierre del círculo: registrar que la conversación pasó
    const [talkSaving, setTalkSaving] = useState(false);
    const handleTalked = async () => {
        if (!selectedStudent || !user || talkSaving) return;
        setTalkSaving(true);
        try {
            const resultado = await guardarObservacionResiliente({
                studentId: selectedStudent.id,
                teacherId: user.id,
                subjectId: null,
                category: 'otro',
                note: 'Charla de acompañamiento: hablamos a partir de las señales de bienestar.',
                descripcion: `Charla registrada con ${selectedStudent.firstName} ${selectedStudent.lastName}`,
            });
            recargarObservaciones(selectedStudent.id);
            avisar.exito('Charla registrada', resultado === 'pendiente'
                ? 'Quedó guardada en este equipo y se envía sola cuando haya señal.'
                : 'Quedó en las observaciones de la ficha.');
        } catch (err) {
            console.error(err);
            avisar.error('No se pudo registrar la charla.', 'Probá de nuevo.');
        } finally {
            setTalkSaving(false);
        }
    };

    // Resumen IA
    const [showSummary, setShowSummary] = useState(false);
    const [summaryText, setSummaryText] = useState('');
    const [summaryLoading, setSummaryLoading] = useState(false);
    const [summaryError, setSummaryError] = useState('');
    const [summaryCopied, setSummaryCopied] = useState(false);

    // Citación
    const [showCite, setShowCite] = useState(false);
    const [citeTitle, setCiteTitle] = useState('');
    const [citeBody, setCiteBody] = useState('');
    const [citeDate, setCiteDate] = useState('');
    const [citeTime, setCiteTime] = useState('');
    const [citePlace, setCitePlace] = useState('');
    const [citeSending, setCiteSending] = useState(false);
    const [citeDone, setCiteDone] = useState(false);
    const [citeError, setCiteError] = useState('');
    // La citación es de una materia del docente en el curso del estudiante (052)
    const [citeMaterias, setCiteMaterias] = useState<{ id: string; name: string }[]>([]);
    const [citeSubjectId, setCiteSubjectId] = useState('');

    // Señales tempranas de bienestar (línea base, persistencia, convergencia)
    const [signals, setSignals] = useState<Map<string, WellbeingSignal>>(new Map());

    // Hasta que llega la lista no se dice "no hay estudiantes"
    const [cargandoLista, setCargandoLista] = useState(true);

    useEffect(() => {
        if (!user) return;
        const courseIds = user.subjects?.map(s => s.courseId) ?? [];
        getStudentsByTeacher(courseIds)
            .then(setAllStudents)
            .catch(console.error)
            .finally(() => setCargandoLista(false));
        getWellbeingSignals().then(setSignals).catch(console.error);
    }, [user]);

    // Enlace directo: /students?student=<id> (desde una alerta) o
    // /students?estudiante=<id> (desde el buscador) abre la ficha. Solo si el
    // estudiante está entre los de sus cursos.
    const pedido = searchParams.get('student') ?? searchParams.get('estudiante');
    useEffect(() => {
        if (!pedido || allStudents.length === 0) return;
        const hallado = allStudents.find(s => s.id === pedido);
        if (hallado) setSelectedStudent(hallado);
        setSearchParams(p => { p.delete('student'); p.delete('estudiante'); return p; }, { replace: true });
    }, [pedido, allStudents, setSearchParams]);

    useEffect(() => {
        if (!selectedStudent) return;
        setCheckins([]);
        setObservations([]);
        setGuardians([]);
        setWork([]);
        setAbsences([]);
        setAchievements([]);
        setShowGrantForm(false);
        setCustomTitle('');
        setObsNote('');
        setObsError('');
        setObsSaved(false);
        setAvisoAbierto(false);
        setAvisoMotivo('');
        setAvisoError('');
        setAwards([]);
        setStudentProgress(null);
        setNotasFicha(null);
        getPublishedGradesByStudent(selectedStudent.id).then(setNotasFicha).catch(err => { console.error(err); setNotasFicha([]); });
        getCheckinsByStudent(selectedStudent.id, 40).then(setCheckins).catch(console.error);
        recargarObservaciones(selectedStudent.id);
        getGuardiansOfStudent(selectedStudent.id).then(setGuardians).catch(console.error);
        getWorkByStudent(selectedStudent.id).then(setWork).catch(console.error);
        getAbsencesByStudent(selectedStudent.id).then(setAbsences).catch(console.error);
        getAchievementsByStudent(selectedStudent.id).then(setAchievements).catch(console.error);
        getStudentAwards(selectedStudent.id).then(setAwards).catch(console.error);
        getStudentProgress(selectedStudent.id).then(setStudentProgress).catch(console.error);
        // Bitácora: queda registrado cada acceso a la ficha del estudiante.
        if (user) {
            logAccess({
                userId: user.id,
                userLabel: `${user.firstName} ${user.lastName} (${user.role})`,
                schoolId: user.schoolId,
                action: 'view_student_profile',
                entityType: 'student',
                entityId: selectedStudent.id,
            });
        }
    }, [selectedStudent?.id]);

    // Cuando la cola manda las observaciones pendientes, se ven como enviadas
    useEffect(() => suscribirCola(() => {
        if (!selectedStudent || !observations.some(o => o.pendiente)) return;
        if (pendientesDe('observacion').some(op => op.studentId === selectedStudent.id)) return;
        recargarObservaciones(selectedStudent.id);
    }), [selectedStudent?.id, observations]); // eslint-disable-line react-hooks/exhaustive-deps

    const courseNames = useMemo(
        () => Array.from(new Set(allStudents.map(s => s.courseName))).sort(),
        [allStudents],
    );

    const filteredStudents = useMemo(() => {
        let list = allStudents;
        if (courseFilter !== 'all') list = list.filter(s => s.courseName === courseFilter);
        // Sin tildes y en cualquier orden: "perez sofia" encuentra a "Sofía Pérez"
        if (search.trim()) {
            list = list.filter(s => coincideBusqueda(`${s.firstName} ${s.lastName} ${s.courseName}`, search));
        }
        const dir = sortAsc ? 1 : -1;
        return [...list].sort((a, b) => {
            return `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`) * dir;
        });
    }, [allStudents, courseFilter, search, sortKey, sortAsc]);

    if (!user) return null;

    const toggleSort = (key: SortKey) => {
        if (sortKey === key) setSortAsc(v => !v);
        else { setSortKey(key); setSortAsc(true); }
    };

    const handleAddObservation = async () => {
        if (!selectedStudent || !obsNote.trim() || obsSaving) return;
        setObsSaving(true);
        setObsError('');
        try {
            // Sin señal queda guardada en el equipo y se envía sola
            await guardarObservacionResiliente({
                studentId: selectedStudent.id,
                teacherId: user.id,
                subjectId: null,
                category: obsCategory,
                note: obsNote,
                descripcion: `Observación sobre ${selectedStudent.firstName} ${selectedStudent.lastName}`,
            });
            setObsNote('');
            setObsSaved(true);
            setTimeout(() => setObsSaved(false), 2500);
            recargarObservaciones(selectedStudent.id);
        } catch (err) {
            // Con o sin señal, lo que llega acá es que el servidor no la aceptó
            console.error('Error guardando observación:', err);
            setObsError('El servidor no aceptó la observación. Probá de nuevo; el texto sigue acá.');
        } finally {
            setObsSaving(false);
        }
    };

    const handleGrant = async (emoji: string, title: string, points: number) => {
        if (!selectedStudent || granting || !title.trim()) return;
        setGranting(true);
        try {
            await grantAchievement({
                studentId: selectedStudent.id,
                teacherId: user.id,
                emoji,
                title,
                points,
            });
            setCustomTitle('');
            setShowGrantForm(false);
            await getAchievementsByStudent(selectedStudent.id).then(setAchievements);        } catch (err) {
            console.error('Error otorgando logro:', err);
            avisar.error('No se pudo dar el logro.', 'Probá de nuevo en un rato.');
        } finally {
            setGranting(false);
        }
    };

    const handleRevoke = async (a: StudentAchievement) => {
        if (a.grantedBy !== user.id) return;
        const ok = await confirmar({
            titulo: `¿Quitar el logro "${a.title}"?`,
            mensaje: `Se le restan los ${a.points} puntos y deja de verlo en su perfil.`,
            accion: 'Quitar',
            peligro: true,
        });
        if (!ok) return;
        try {
            await revokeAchievement(a.id);
            setAchievements(prev => prev.filter(x => x.id !== a.id));
            avisar.exito('Logro quitado');
        } catch (err) {
            console.error('Error quitando logro:', err);
            avisar.error('No se pudo quitar el logro.', 'Probá de nuevo.');
        }
    };

    const handleDeleteObservation = async (o: StudentObservation) => {
        if (o.teacherId !== user.id) return;
        const ok = await confirmar({
            titulo: '¿Borrar esta observación?',
            mensaje: 'Deja de verse en la ficha para todo el equipo docente. No se puede deshacer.',
            accion: 'Borrar',
            peligro: true,
        });
        if (!ok) return;
        try {
            await deleteObservation(o.id);
            setObservations(prev => prev.filter(x => x.id !== o.id));
            avisar.exito('Observación borrada');
        } catch (err) {
            console.error('Error borrando observación:', err);
            avisar.error('No se pudo borrar la observación.', 'Probá de nuevo.');
        }
    };

    const handleDownloadFicha = () => {
        if (!selectedStudent) return;
        const s = selectedStudent;
        const fmt = (iso: string) => new Date(iso).toLocaleDateString('es-AR');
        const md = [
            `Curso: ${s.courseName}`,
            `Generada el ${new Date().toLocaleDateString('es-AR')} por ${user.firstName} ${user.lastName}`,
            '',
            '## Notas publicadas en la libreta',
            ...((notasFicha ?? []).filter(n => n.grade !== null).length
                ? (notasFicha ?? []).filter(n => n.grade !== null).map(n =>
                    `- ${n.subjectName ?? 'Materia'}, ${n.termName ?? 'trimestre'}: ${n.grade}${n.carriesToDecember ? ' (se lleva la materia a diciembre)' : ''}`)
                : ['- Todavía no hay notas publicadas.']),
            '',
            '## Señales recientes (check-ins emocionales)',
            ...(checkins.length
                ? checkins.slice(0, 8).map(c =>
                    `- ${FEELING_META[c.feeling].label} (${c.moment === 'inicio' ? 'al empezar' : 'al terminar'})${c.comment ? `: "${c.comment}"` : ''} — ${fmt(c.createdAt)}`)
                : ['- Sin check-ins registrados.']),
            '',
            '## Trabajo académico reciente',
            ...(work.length
                ? work.slice(0, 8).map(w => {
                    const nota = w.score ?? w.autoScore;
                    return `- ${w.activityTitle} (${w.subjectName}) — ${WORK_STATUS_META[w.status].label}${nota != null ? `, nota ${nota}${w.points ? `/${w.points}` : ''}` : ''} — ${fmt(w.updatedAt)}`;
                })
                : ['- Sin entregas registradas.']),
            '',
            '## Logros',
            ...(achievements.length
                ? [
                    `Total: ${totalPoints(achievements)} puntos.`,
                    ...achievements.slice(0, 10).map(a =>
                        `- ${a.title} (+${a.points} pts) — ${a.kind === 'auto' ? 'automático' : (a.grantedByName ?? 'docente')}, ${fmt(a.createdAt)}`),
                ]
                : ['- Sin logros todavía.']),
            '',
            '## Observaciones del equipo docente',
            ...(observations.length
                ? observations.slice(0, 10).map(o =>
                    `- [${OBSERVATION_META[o.category].label}] ${o.note} (${o.teacherName ?? 'Docente'}, ${fmt(o.createdAt)})`)
                : ['- Sin observaciones registradas.']),
        ].join('\n');
        textToPdf(md, `Ficha de ${s.firstName} ${s.lastName}`, s.courseName);
    };

    const openCite = () => {
        if (!selectedStudent) return;
        setCiteTitle(`Citación: reunión por ${selectedStudent.firstName}`);
        setCiteBody('');
        setCiteDate('');
        setCiteTime('');
        setCitePlace('');
        setCiteDone(false);
        setCiteError('');
        const ids = [...new Set((user.subjects ?? [])
            .filter(a => a.courseId === selectedStudent.courseId)
            .map(a => a.subjectId))];
        setCiteMaterias(ids.map(id => ({ id, name: '' })));
        setCiteSubjectId(ids[0] ?? '');
        getSubjects(user.schoolId)
            .then(lista => setCiteMaterias(ids.map(id => ({ id, name: lista.find(m => m.id === id)?.name ?? 'Materia' }))))
            .catch(console.error);
        setShowCite(true);
    };

    const handleSendCite = async () => {
        if (!selectedStudent || !citeTitle.trim() || !citeBody.trim()) return;
        if (!citeSubjectId) {
            setCiteError('No das ninguna materia en el curso de este estudiante: no lo podés citar.');
            return;
        }
        setCiteSending(true);
        setCiteError('');
        try {
            await createNotice({
                schoolId: user.schoolId,
                studentId: selectedStudent.id,
                fromUserId: user.id,
                type: 'citacion',
                subjectId: citeSubjectId,
                title: citeTitle,
                body: citeBody,
                meetingAt: citeDate ? new Date(`${citeDate}T${citeTime || '08:00'}`).toISOString() : null,
                meetingPlace: citePlace,
            });
            setCiteDone(true);
        } catch (err) {
            console.error(err);
            // La base rechaza si el estudiante no cursa esa materia con el docente
            setCiteError(err && typeof err === 'object' && 'code' in err && err.code === '42501'
                ? 'Este estudiante no cursa esa materia con vos: no lo podés citar por ella.'
                : 'No se pudo enviar la citación. Revisá la conexión y probá de nuevo.');
        } finally {
            setCiteSending(false);
        }
    };

    const avgFeeling = checkins.length
        ? checkins.reduce((acc, c) => acc + FEELING_META[c.feeling].value, 0) / checkins.length
        : null;

    const handleAiSummary = async () => {
        if (!selectedStudent) return;
        setShowSummary(true);
        setSummaryError('');
        setSummaryCopied(false);
        setSummaryLoading(true);
        try {
            const s = selectedStudent;
            const notas = notasFicha ?? await getPublishedGradesByStudent(s.id);
            const lines: string[] = [
                `ESTUDIANTE: ${s.firstName} ${s.lastName} — ${s.courseName}.`,
                '',
                'NOTAS PUBLICADAS EN LA LIBRETA:',
                ...(notas.length
                    ? notas.filter(n => n.grade !== null).map(n =>
                        `- ${n.subjectName ?? 'Materia'}, ${n.termName ?? 'trimestre'}: ${n.grade}${n.carriesToDecember ? ' (se lleva la materia a diciembre)' : ''}`)
                    : ['(todavía no hay notas publicadas)']),
                '(La plataforma no registra asistencia: no la menciones ni la supongas.)',
                '',
                'CHECK-INS EMOCIONALES RECIENTES:',
                ...(checkins.length
                    ? checkins.slice(0, 10).map(c =>
                        `- ${FEELING_META[c.feeling].label} (${c.moment === 'inicio' ? 'al empezar' : 'al terminar'} una actividad)${c.comment ? `: "${c.comment}"` : ''} — ${new Date(c.createdAt).toLocaleDateString('es-AR')}`)
                    : ['(sin check-ins registrados)']),
                '',
                'OBSERVACIONES DEL EQUIPO DOCENTE:',
                ...(observations.length
                    ? observations.slice(0, 10).map(o =>
                        `- [${OBSERVATION_META[o.category].label}] ${o.note} (${o.teacherName ?? 'docente'}, ${new Date(o.createdAt).toLocaleDateString('es-AR')})`)
                    : ['(sin observaciones registradas)']),
            ];
            const summary = await summarizeStudent(lines.join('\n'), `${s.firstName} ${s.lastName}`);
            setSummaryText(summary);
        } catch (err) {
            setSummaryError(err instanceof Error ? err.message : 'No se pudo generar el resumen.');
        } finally {
            setSummaryLoading(false);
        }
    };

    return (
        <div className="students-container">
            <div className={`students-main card ${selectedStudent ? 'panel-open' : ''}`}>
                <div className="students-header border-bottom">
                    <h2>Lista de Estudiantes</h2>
                    <div className="students-actions">
                        <div className="search-bar">
                            <Search size={16} className="search-icon" />
                            <input
                                type="search"
                                placeholder="Buscar por nombre o apellido…"
                                aria-label="Buscar estudiante por nombre, apellido o curso"
                                className="search-input"
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                                onKeyDown={e => { if (e.key === 'Escape') setSearch(''); }}
                            />
                            {search && (
                                <button className="search-limpiar" aria-label="Borrar la búsqueda" onClick={() => setSearch('')}>
                                    <X size={15} />
                                </button>
                            )}
                        </div>
                    </div>
                </div>

                {/* Filtros por curso */}
                <div className="stu-filters border-bottom">
                    <div className="stu-filter-group fila-desplazable">
                        <button
                            className={`stu-filter-chip ${courseFilter === 'all' ? 'selected' : ''}`}
                            onClick={() => setCourseFilter('all')}
                        >
                            Todos los cursos
                        </button>
                        {courseNames.map(c => (
                            <button
                                key={c}
                                className={`stu-filter-chip ${courseFilter === c ? 'selected' : ''}`}
                                onClick={() => setCourseFilter(c)}
                            >
                                {c}
                            </button>
                        ))}
                    </div>
                    <div className="stu-filter-group">
                        <span className="stu-count">
                            {filteredStudents.length} estudiante{filteredStudents.length !== 1 ? 's' : ''}
                        </span>
                    </div>
                </div>

                {cargandoLista && <Esqueleto tipo="tabla" cantidad={6} etiqueta="Cargando estudiantes…" className="stu-vacio" />}

                {!cargandoLista && allStudents.length === 0 && (
                    <EstadoVacio
                        icono={UsersIcon}
                        titulo="Todavía no tenés estudiantes"
                        texto="Aparecen acá cuando dirección te asigna cursos y carga sus listas."
                        className="stu-vacio"
                    />
                )}

                {!cargandoLista && allStudents.length > 0 && filteredStudents.length === 0 && (
                    <EstadoVacio
                        icono={Search}
                        titulo="Nadie coincide con la búsqueda"
                        texto="Probá con otro nombre o mirá todos los cursos."
                        accion={{ etiqueta: 'Ver todos', alTocar: () => { setSearch(''); setCourseFilter('all'); } }}
                        compacto
                        className="stu-vacio"
                    />
                )}

                {!cargandoLista && filteredStudents.length > 0 && (
                    <div className="table-responsive">
                        <table className="modern-table">
                            <thead>
                                <tr>
                                    <th scope="col" aria-sort={sortAsc ? 'ascending' : 'descending'}>
                                        <button
                                            type="button"
                                            onClick={() => toggleSort('name')}
                                            title="Ordenar por apellido"
                                            style={{ background: 'none', border: 0, padding: 0, font: 'inherit', color: 'inherit', cursor: 'pointer' }}
                                        >
                                            Estudiante <ArrowUpDown size={11} className={sortAsc ? '' : 'flip'} aria-hidden="true" />
                                        </button>
                                    </th>
                                    <th scope="col">Curso</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredStudents.map(student => (
                                    <tr
                                        key={student.id}
                                        onClick={() => setSelectedStudent(student)}
                                        className={selectedStudent?.id === student.id ? 'selected-row' : ''}
                                    >
                                        <td>
                                            <button
                                                type="button"
                                                className="student-cell student-cell-btn"
                                                onClick={e => { e.stopPropagation(); setSelectedStudent(student); }}
                                                aria-pressed={selectedStudent?.id === student.id}
                                            >
                                                <span className="student-avatar" aria-hidden="true">{student.avatarInitials}</span>
                                                <span className="font-medium">{student.firstName} {student.lastName}</span>
                                                {(() => {
                                                    const sig = signals.get(student.id);
                                                    if (!sig || sig.level === 'verde') return null;
                                                    return (
                                                        <span title={`${SIGNAL_META[sig.level].label}: ${sig.reasons[0] ?? ''}`}>
                                                            {SIGNAL_META[sig.level].emoji}
                                                        </span>
                                                    );
                                                })()}
                                            </button>
                                        </td>
                                        <td className="text-secondary">{student.courseName}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Panel de perfil */}
            {selectedStudent && (
                <div className="student-profile-panel card animate-slide-in">
                    <div className="profile-header border-bottom">
                        <div className="profile-title-row">
                            <h3>Perfil del Estudiante</h3>
                            <button className="btn-icon" onClick={() => setSelectedStudent(null)} aria-label="Cerrar la ficha"><X size={18} aria-hidden="true" /></button>
                        </div>
                    </div>

                    <div className="profile-body">
                        <div className="profile-hero">
                            <div className="profile-avatar-large">{selectedStudent.avatarInitials}</div>
                            <h2 className="profile-name">{selectedStudent.firstName} {selectedStudent.lastName}</h2>
                            <p className="profile-course">{selectedStudent.courseName}</p>
                            <div className="flex gap-2 mt-2" style={{ flexWrap: 'wrap', justifyContent: 'center' }}>
                                <button
                                    className="btn btn-outline btn-sm"
                                    onClick={handleDownloadFicha}
                                    title="Descarga la ficha completa en PDF: notas, señales, trabajo y observaciones. Ideal para reuniones."
                                >
                                    <FileDown size={14} /> Ficha (PDF)
                                </button>
                                <button
                                    className="btn btn-outline btn-sm"
                                    onClick={handleDownloadInforme}
                                    disabled={informeLoading}
                                    title="Todo lo trazado: entregas, clase en vivo, conexiones, check-ins, logros y asistencia."
                                >
                                    <FileDown size={14} /> {informeLoading ? 'Generando...' : 'Informe de actividad (PDF)'}
                                </button>
                            </div>
                        </div>

                        <div className="profile-section">
                            <h4>Notas publicadas</h4>
                            {notasFicha === null && <Cargando texto="Cargando notas…" />}
                            {notasFicha && notasFicha.filter(n => n.grade !== null).length === 0 && (
                                <p className="text-sm text-secondary">Todavía no hay notas publicadas en la libreta.</p>
                            )}
                            {notasFicha && notasFicha.some(n => n.grade !== null) && (
                                <ul className="ficha-notas">
                                    {notasFicha.filter(n => n.grade !== null).map(n => (
                                        <li key={n.id}>
                                            <span>{n.subjectName ?? 'Materia'} <span className="text-subtle">· {n.termName}</span></span>
                                            <strong className={n.carriesToDecember ? 'text-danger' : undefined}>{formatoNota(n.grade as number)}</strong>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>

                        <div className="profile-section">
                            <h4>Estudio</h4>
                            <div className="metrics-grid">
                                {studentProgress && (
                                    <>
                                        <div className="metric-box">
                                            <span className="metric-label">Nivel de estudio</span>
                                            <span className="metric-val">
                                                {levelForXp(studentProgress.xp).level.n} · {levelForXp(studentProgress.xp).level.name}
                                            </span>
                                        </div>
                                        <div className="metric-box">
                                            <span className="metric-label">Racha</span>
                                            <span className="metric-val"><Flame size={14} className="text-warning inline" /> {studentProgress.streakDays} días</span>
                                        </div>
                                    </>
                                )}
                            </div>
                            {absences.length > 0 && (
                                <div className="stu-absences">
                                    <span className="text-xs text-subtle">Faltas recientes:</span>
                                    {absences.slice(0, 6).map((a, i) => (
                                        <span key={i} className="stu-absence-chip" title={ATTENDANCE_META[a.status].label}>
                                            {ATTENDANCE_META[a.status].emoji} {new Date(a.date + 'T12:00').toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' })}
                                        </span>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* ── Trabajo académico reciente ── */}
                        <div className="profile-section">
                            <h4><BookOpenCheck size={14} className="text-cyan inline ml-1" /> Trabajo académico</h4>
                            {work.length === 0 ? (
                                <p className="text-sm text-secondary italic">Sin entregas en tus actividades todavía.</p>
                            ) : (
                                <div className="stu-work-list">
                                    {work.slice(0, 6).map(w => {
                                        const nota = w.score ?? w.autoScore;
                                        return (
                                            <div key={w.id} className="stu-work-item">
                                                <div className="stu-work-main">
                                                    <span className="stu-work-title">{w.activityTitle}</span>
                                                    <span className="stu-work-meta">
                                                        {w.subjectName} · {new Date(w.updatedAt).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' })}
                                                    </span>
                                                </div>
                                                <div className="stu-work-side">
                                                    <span className={`badge ${WORK_STATUS_META[w.status].cls}`}>
                                                        {WORK_STATUS_META[w.status].label}
                                                    </span>
                                                    {nota != null && (
                                                        <span className="stu-work-score">
                                                            {nota}{w.points ? `/${w.points}` : ''}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>

                        {/* ── Logros (gamificación) ── */}
                        <div className="profile-section">
                            <div className="flex items-center justify-between">
                                <h4><Award size={14} className="text-warning inline ml-1" /> Logros
                                    {achievements.length > 0 && (
                                        <span className="stu-points-badge">⭐ {totalPoints(achievements)} pts</span>
                                    )}
                                </h4>
                                <button className="btn btn-secondary btn-sm" onClick={() => setShowGrantForm(v => !v)}>
                                    <Plus size={13} /> Dar logro
                                </button>
                            </div>

                            {showGrantForm && (
                                <div className="stu-grant-form">
                                    <p className="text-xs text-subtle">Un toque y se lo lleva:</p>
                                    <div className="stu-preset-grid">
                                        {ACHIEVEMENT_PRESETS.map(p => (
                                            <button
                                                key={p.title}
                                                className="stu-preset-chip"
                                                disabled={granting}
                                                title={`${p.points} puntos`}
                                                onClick={() => handleGrant(p.emoji, p.title, p.points)}
                                            >
                                                {p.emoji} {p.title}
                                            </button>
                                        ))}
                                    </div>
                                    <div className="stu-custom-grant">
                                        <input
                                            type="text"
                                            className="stu-custom-emoji"
                                            value={customEmoji}
                                            maxLength={4}
                                            onChange={e => setCustomEmoji(e.target.value)}
                                            aria-label="Emoji del logro"
                                        />
                                        <input
                                            type="text"
                                            className="stu-custom-title"
                                            placeholder="Logro personalizado..."
                                            value={customTitle}
                                            maxLength={40}
                                            onChange={e => setCustomTitle(e.target.value)}
                                            onKeyDown={e => { if (e.key === 'Enter') handleGrant(customEmoji || '🏅', customTitle, 10); }}
                                        />
                                        <button
                                            className="btn btn-primary btn-sm"
                                            disabled={!customTitle.trim() || granting}
                                            onClick={() => handleGrant(customEmoji || '🏅', customTitle, 10)}
                                        >
                                            Dar
                                        </button>
                                    </div>
                                </div>
                            )}

                            {achievements.length === 0
                                ? <p className="text-sm text-secondary italic">Todavía no tiene logros. ¡Regalale el primero!</p>
                                : (
                                    <div className="stu-achievements">
                                        {achievements.slice(0, 8).map(a => (
                                            <div key={a.id} className="stu-achievement" title={a.reason ?? undefined}>
                                                <span className="stu-achievement-emoji">{a.emoji}</span>
                                                <div className="stu-achievement-body">
                                                    <span className="stu-achievement-title">{a.title}</span>
                                                    <span className="stu-achievement-meta">
                                                        +{a.points} pts · {a.kind === 'auto' ? 'automático' : (a.grantedByName ?? 'docente')} · {new Date(a.createdAt).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' })}
                                                    </span>
                                                </div>
                                                {a.grantedBy === user.id && (
                                                    <button className="stu-obs-delete" title="Quitar logro" onClick={() => handleRevoke(a)}>
                                                        <Trash2 size={13} />
                                                    </button>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                )}
                        </div>

                        {/* ── Alerta temprana: nivel + porqué + primer paso ── */}
                        {(() => {
                            const sig = signals.get(selectedStudent.id);
                            if (!sig || sig.level === 'verde') return null;
                            const pattern = weekdayPattern(checkins);
                            return (
                                <div className={`profile-section senal-card senal-${sig.level}`}>
                                    <h4>
                                        {SIGNAL_META[sig.level].emoji} Alerta temprana — {SIGNAL_META[sig.level].label}
                                    </h4>
                                    <ul className="senal-reasons">
                                        {sig.reasons.map((r, i) => <li key={i}>{r}</li>)}
                                        {pattern && <li>{pattern}</li>}
                                    </ul>
                                    {sig.nextStep && <p className="senal-step">👉 {sig.nextStep}</p>}
                                    <p className="senal-disclaimer">
                                        Es una señal para conversar, no un diagnóstico. Si algo te preocupa, avisale a dirección desde «Avisar a dirección», más abajo.
                                    </p>
                                    <button className="btn btn-outline btn-sm" onClick={handleTalked} disabled={talkSaving}>
                                        {talkSaving ? 'Registrando...' : '✓ Lo hablamos — registrar'}
                                    </button>
                                </div>
                            );
                        })()}

                        {/* ── Medallas / reconocimientos ── */}
                        <div className="profile-section">
                            <div className="flex items-center justify-between">
                                <h4><Medal size={14} className="text-warning inline ml-1" /> Medallas</h4>
                                <button className="btn btn-secondary btn-sm" onClick={() => setShowAwardModal(true)} title="Reconocé el esfuerzo: la medalla aparece en el perfil del estudiante y suma XP">
                                    <Medal size={13} /> Dar medalla
                                </button>
                            </div>
                            {awards.length === 0
                                ? <p className="text-sm text-secondary italic">Todavía sin medallas. ¡Un "¡Crack!" a tiempo motiva un montón!</p>
                                : awards.slice(0, 5).map(a => {
                                    const meta = AWARD_META[a.badgeCode] ?? { emoji: '🏅', label: a.badgeCode };
                                    return (
                                        <div key={a.id} className="acts-obs-item">
                                            <p className="acts-obs-note">{meta.emoji} <strong>{meta.label}</strong>{a.message ? ` — "${a.message}"` : ''}</p>
                                            <span className="acts-obs-meta">
                                                {a.teacherName ?? 'Docente'} · {new Date(a.createdAt).toLocaleDateString('es-AR')}
                                            </span>
                                        </div>
                                    );
                                })}
                        </div>

                        {/* ── Señales: cómo se viene sintiendo ── */}
                        <div className="profile-section">
                            <div className="flex items-center justify-between">
                                <h4><HeartPulse size={14} className="text-cyan inline ml-1" /> Señales recientes</h4>
                                <button className="btn btn-secondary btn-sm" onClick={handleAiSummary} title="Síntesis para reunión con la familia o boletín">
                                    <Sparkles size={13} /> Resumen IA
                                </button>
                            </div>
                            {checkins.length === 0 ? (
                                <p className="text-sm text-secondary italic">Todavía no hay check-ins emocionales.</p>
                            ) : (
                                <>
                                    {avgFeeling !== null && (
                                        <p className="text-sm text-secondary" style={{ marginBottom: 8 }}>
                                            Ánimo promedio: <strong className={avgFeeling >= 3.5 ? 'text-success' : avgFeeling >= 2.5 ? 'text-warning' : 'text-danger'}>
                                                {avgFeeling.toFixed(1)}/5
                                            </strong> en sus últimos {checkins.length} check-ins
                                        </p>
                                    )}
                                    <div className="signal-feed">
                                        {checkins.slice(0, 5).map(c => (
                                            <div key={c.id} className="signal-item">
                                                <span className="signal-emoji">{FEELING_META[c.feeling].emoji}</span>
                                                <div>
                                                    <span className="text-sm">{FEELING_META[c.feeling].label} · <span className="text-subtle">{c.moment === 'inicio' ? 'al empezar' : 'al terminar'}</span></span>
                                                    {c.comment && <p className="text-xs text-secondary italic">"{c.comment}"</p>}
                                                    <span className="text-xs text-subtle">{new Date(c.createdAt).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' })}</span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </>
                            )}
                        </div>

                        {/* ── Observaciones del equipo docente ── */}
                        <div className="profile-section">
                            <h4><PencilLine size={14} className="text-secondary inline ml-1" /> Observaciones</h4>
                            <div className="acts-obs-form" style={{ marginBottom: 12 }}>
                                <div className="acts-obs-cats">
                                    {(Object.entries(OBSERVATION_META) as [ObservationCategory, { emoji: string; label: string }][]).map(([key, meta]) => (
                                        <button
                                            key={key}
                                            className={`acts-obs-cat ${obsCategory === key ? 'selected' : ''}`}
                                            onClick={() => setObsCategory(key)}
                                        >
                                            {meta.emoji} {meta.label}
                                        </button>
                                    ))}
                                </div>
                                <textarea
                                    className="form-textarea w-full"
                                    rows={2}
                                    placeholder="Lo que ves en clase y no queda registrado en ningún lado..."
                                    value={obsNote}
                                    onChange={e => setObsNote(e.target.value)}
                                />
                                <button
                                    className={`btn btn-sm ${obsSaved ? 'btn-primary' : 'btn-secondary'}`}
                                    onClick={handleAddObservation}
                                    disabled={!obsNote.trim() || obsSaving}
                                >
                                    {obsSaving ? 'Guardando...' : obsSaved ? '✓ Guardada' : 'Guardar observación'}
                                </button>
                                {obsError && (
                                    <p className="text-xs text-danger" style={{ marginTop: 4 }}>
                                        <AlertTriangle size={12} className="inline" /> {obsError}
                                    </p>
                                )}
                            </div>
                            {observations.length === 0
                                ? <p className="text-sm text-secondary italic">Sin observaciones todavía.</p>
                                : observations.slice(0, 6).map(o => (
                                    <div key={o.id} className="acts-obs-item stu-obs-item">
                                        <div className="stu-obs-body">
                                            <p className="acts-obs-note">
                                                {OBSERVATION_META[o.category].emoji} {o.note}
                                            </p>
                                            <span className="acts-obs-meta">
                                                {o.teacherName ?? 'Docente'} · {new Date(o.createdAt).toLocaleDateString('es-AR')}
                                                {o.pendiente && (
                                                    <span className="text-warning" title="Guardada en este equipo: se envía sola cuando haya señal">
                                                        {' '}· <CloudUpload size={11} className="inline" aria-hidden="true" /> sin enviar
                                                    </span>
                                                )}
                                            </span>
                                        </div>
                                        {o.teacherId === user.id && !o.pendiente && (
                                            <button
                                                className="stu-obs-delete"
                                                title="Borrar esta observación"
                                                onClick={() => handleDeleteObservation(o)}
                                            >
                                                <Trash2 size={13} />
                                            </button>
                                        )}
                                    </div>
                                ))}
                        </div>

                        {/* ── Familia ── */}
                        <div className="profile-section">
                            <h4><UsersIcon size={14} className="text-secondary inline ml-1" /> Familia</h4>
                            {guardians.length === 0
                                ? <p className="text-sm text-secondary italic">Sin tutores vinculados.</p>
                                : guardians.map(g => (
                                    <p key={g.id} className="text-sm stu-familiar">
                                        <span>{g.guardianName} <span className="text-subtle">({g.relationship})</span></span>
                                        <Link to={enlaceMensaje([g.guardianUserId], `Sobre ${selectedStudent.firstName}`)} className="stu-escribir">
                                            <MessagesSquare size={13} aria-hidden="true" /> Escribir
                                        </Link>
                                    </p>
                                ))}
                            {/* Mensajes (060): al chico, si tiene cuenta. La conversación la puede leer dirección. */}
                            {selectedStudent.userId && (
                                <Link to={enlaceMensaje([selectedStudent.userId])} className="btn btn-outline btn-sm mt-2 w-full">
                                    <MessagesSquare size={14} /> Escribirle a {selectedStudent.firstName}
                                </Link>
                            )}
                            <button className="btn btn-outline btn-sm mt-2 w-full" onClick={openCite}>
                                <CalendarPlus size={14} /> Citar a la familia
                            </button>
                        </div>

                        {/* ── Avisar a dirección (051) ── */}
                        <div className="profile-section">
                            <h4><ArrowUpRight size={14} className="text-secondary inline ml-1" /> Dirección</h4>
                            {!avisoAbierto ? (
                                <>
                                    <p className="text-sm text-secondary">Si algo te preocupa de {selectedStudent.firstName}, contáselo a dirección: le llega a cada directivo y lo ven en Alertas.</p>
                                    <button className="btn btn-outline btn-sm mt-2 w-full" onClick={() => { setAvisoAbierto(true); setAvisoError(''); }}>
                                        <ArrowUpRight size={14} /> Avisar a dirección
                                    </button>
                                </>
                            ) : (
                                <div className="stu-aviso">
                                    <label className="text-xs text-secondary" htmlFor="stu-aviso-tema">Sobre</label>
                                    <select id="stu-aviso-tema" className="form-select" value={avisoTema} onChange={e => setAvisoTema(e.target.value)}>
                                        {TEMAS_AVISO.map(t => <option key={t.valor} value={t.valor}>{t.label}</option>)}
                                    </select>
                                    <textarea
                                        className="form-textarea"
                                        rows={3}
                                        maxLength={1000}
                                        value={avisoMotivo}
                                        onChange={e => setAvisoMotivo(e.target.value)}
                                        placeholder="Qué pasa y qué necesitás de dirección…"
                                        aria-label="Motivo del aviso a dirección"
                                    />
                                    {avisoError && <p className="text-xs text-danger">{avisoError}</p>}
                                    <div className="stu-aviso-botones">
                                        <button className="btn btn-ghost btn-sm" onClick={() => setAvisoAbierto(false)} disabled={avisoEnviando}>Cancelar</button>
                                        <button className="btn btn-primary btn-sm" onClick={handleAvisarDireccion} disabled={avisoEnviando || !avisoMotivo.trim()}>
                                            {avisoEnviando ? 'Avisando…' : 'Avisar a dirección'}
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* ── Modal dar medalla ── */}
            {showAwardModal && selectedStudent && (
                <AwardPickerModal
                    title="Dar medalla"
                    recipientName={`${selectedStudent.firstName} ${selectedStudent.lastName}`}
                    catalog={AWARD_META}
                    onClose={() => setShowAwardModal(false)}
                    onGive={async (badgeCode, message) => {
                        const subjectId = user.subjects?.find(s => s.courseId === selectedStudent.courseId)?.subjectId ?? null;
                        await giveStudentAward({
                            studentId: selectedStudent.id,
                            teacherId: user.id,
                            subjectId,
                            badgeCode,
                            message,
                        });
                        getStudentAwards(selectedStudent.id).then(setAwards).catch(console.error);
                    }}
                />
            )}

            {/* ── Modal resumen IA ── */}
            <Dialogo abierto={showSummary && selectedStudent !== null} alCerrar={() => setShowSummary(false)} etiquetadoPor="stu-resumen-titulo" className="dialogo-em">
                {selectedStudent && (
                    <div className="em-modal em-modal-lg">
                        <div className="em-modal-header">
                            <h3 id="stu-resumen-titulo"><Sparkles size={17} className="text-ia-accent" /> Resumen IA — {selectedStudent.firstName} {selectedStudent.lastName}</h3>
                            <button className="btn-icon" aria-label="Cerrar" onClick={() => setShowSummary(false)}><X size={18} /></button>
                        </div>
                        <div className="em-modal-body">
                            {summaryLoading && (
                                <div className="em-processing">
                                    <div className="em-spinner" />
                                    <p>Sintetizando señales, observaciones y desempeño...</p>
                                </div>
                            )}
                            {summaryError && <div className="em-error"><AlertTriangle size={15} /> {summaryError}</div>}
                            {!summaryLoading && summaryText && (
                                <div className="summary-markdown">
                                    <MarkdownRenderer content={summaryText} />
                                </div>
                            )}
                            {!summaryLoading && summaryText && (
                                <p className="em-hint">
                                    Generado a partir de {checkins.length} check-in{checkins.length !== 1 ? 's' : ''} y {observations.length} observación{observations.length !== 1 ? 'es' : ''}.
                                    Revisalo antes de compartirlo: la IA ayuda, el criterio es tuyo.
                                </p>
                            )}
                        </div>
                        <div className="em-modal-footer">
                            {!summaryLoading && summaryText && (
                                <button
                                    className="btn btn-outline btn-sm"
                                    onClick={() => { navigator.clipboard.writeText(summaryText); setSummaryCopied(true); setTimeout(() => setSummaryCopied(false), 2000); }}
                                >
                                    <Copy size={14} /> {summaryCopied ? '¡Copiado!' : 'Copiar'}
                                </button>
                            )}
                            <button className="btn btn-primary btn-sm" onClick={() => setShowSummary(false)}>Cerrar</button>
                        </div>
                    </div>
                )}
            </Dialogo>

            {/* ── Modal citación ── */}
            <Dialogo abierto={showCite && selectedStudent !== null} alCerrar={() => setShowCite(false)} etiquetadoPor="stu-cita-titulo" className="dialogo-em">
                {selectedStudent && (
                    <div className="em-modal">
                        <div className="em-modal-header">
                            <h3 id="stu-cita-titulo"><CalendarPlus size={17} className="text-cyan" /> Citar a la familia de {selectedStudent.firstName}</h3>
                            <button className="btn-icon" aria-label="Cerrar" onClick={() => setShowCite(false)}><X size={18} /></button>
                        </div>
                        <div className="em-modal-body">
                            {citeDone ? (
                                <div className="em-processing">
                                    <CheckCircle size={38} className="text-success" />
                                    <p><strong>Citación enviada</strong></p>
                                    <p className="text-sm text-secondary">
                                        La familia la ve en su portal y puede confirmar asistencia. Seguí los acuses en <strong>Citaciones</strong>.
                                    </p>
                                </div>
                            ) : (
                                <>
                                    {citeError && <div className="em-error" role="alert"><AlertTriangle size={15} /> {citeError}</div>}
                                    {guardians.length === 0 && (
                                        <div className="em-error">Este estudiante no tiene tutores vinculados: la citación no la verá nadie todavía.</div>
                                    )}
                                    {citeMaterias.length > 1 ? (
                                        <div className="em-field">
                                            <label htmlFor="stu-cita-materia">Por qué materia</label>
                                            <select id="stu-cita-materia" className="form-select" value={citeSubjectId} onChange={e => setCiteSubjectId(e.target.value)}>
                                                {citeMaterias.map(m => <option key={m.id} value={m.id}>{m.name || 'Materia'}</option>)}
                                            </select>
                                        </div>
                                    ) : citeMaterias.length === 1 && citeMaterias[0].name && (
                                        <p className="text-xs text-subtle">La familia ve que la cita es por {citeMaterias[0].name}.</p>
                                    )}
                                    <div className="em-field">
                                        <label htmlFor="stu-cita-asunto">Título</label>
                                        <input id="stu-cita-asunto" type="text" value={citeTitle} onChange={e => setCiteTitle(e.target.value)} />
                                    </div>
                                    <div className="em-field">
                                        <label>Motivo / mensaje para la familia</label>
                                        <textarea rows={3} value={citeBody} onChange={e => setCiteBody(e.target.value)} placeholder="Los convocamos a una reunión para..." />
                                    </div>
                                    <div className="em-row">
                                        <div className="em-field">
                                            <label>Fecha</label>
                                            <input type="date" value={citeDate} onChange={e => setCiteDate(e.target.value)} />
                                        </div>
                                        <div className="em-field">
                                            <label>Hora</label>
                                            <input type="text" placeholder="10:00" value={citeTime} onChange={e => setCiteTime(e.target.value)} />
                                        </div>
                                    </div>
                                    <div className="em-field">
                                        <label>Lugar</label>
                                        <input type="text" value={citePlace} onChange={e => setCitePlace(e.target.value)} placeholder="Dirección de la escuela" />
                                    </div>
                                </>
                            )}
                        </div>
                        <div className="em-modal-footer">
                            {citeDone ? (
                                <button className="btn btn-primary btn-sm" onClick={() => setShowCite(false)}>Listo</button>
                            ) : (
                                <>
                                    <button className="btn btn-outline btn-sm" onClick={() => setShowCite(false)}>Cancelar</button>
                                    <button className="btn btn-primary btn-sm" onClick={handleSendCite} disabled={citeSending || !citeTitle.trim() || !citeBody.trim()}>
                                        {citeSending ? 'Enviando...' : 'Enviar citación'}
                                    </button>
                                </>
                            )}
                        </div>
                    </div>
                )}
            </Dialogo>
        </div>
    );
}
