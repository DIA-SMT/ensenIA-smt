/**
 * SMT EstudIA — Crear
 *
 * Primero el tema (UX docente, etapa 3): todo lo de una clase se prepara en
 * su tema —presentación, trabajo práctico, evaluación, clase completa,
 * preguntas para la clase en vivo— y queda junto. Acá se elige cuál, empezando
 * por los que vienen. Abajo, lo suelto: material sin tema, una actividad
 * rápida, las herramientas de la IA y Migue para lo que no está en la lista.
 */

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useMigue } from '../contexts/MigueContext';
import {
    Zap, Radio, ListChecks, FlaskConical, MessagesSquare,
    ArrowRight, CalendarRange, Upload, ScanLine, FolderOpen, type LucideIcon, WifiOff,
} from 'lucide-react';
import UsosIA from '../components/ui/UsosIA';
import { Esqueleto } from '../components/ui/Esqueleto';
import { getTemasConFecha } from '../services/planning.service';
import { getSubjects } from '../services/subjects.service';
import { hoyISO, fechaCorta } from '../services/planificacion.service';
import type { PlanningClass, PlanningUnit } from '../types';
import './Crear.css';

interface Opcion {
    a: string;
    icono: LucideIcon;
    titulo: string;
    texto: string;
}

// Lo suelto: lo que no es de un tema puntual
const SUELTO: Opcion[] = [
    { a: '/actividad-rapida', icono: Zap, titulo: 'Actividad rápida', texto: 'Escribís de qué se trata y te arma la consigna para tu curso.' },
    { a: '/actividades/nueva?tipo=tp', icono: ListChecks, titulo: 'Trabajo práctico o evaluación', texto: 'Por partes y con puntos, sin atarlo a un tema.' },
    { a: '/ia-lab', icono: FlaskConical, titulo: 'Preparar con la IA', texto: 'Una rúbrica, un resumen de un texto largo, criterios para exposiciones orales.' },
    { a: '/clase-en-vivo', icono: Radio, titulo: 'Clase en vivo o sala abierta', texto: 'Preguntas, nube de palabras y competencia desde el celular.' },
];

interface TemaParaElegir { tema: PlanningClass; unidad: PlanningUnit }

/** Los que vienen: el que está en curso en cada materia y curso, los siguientes y los sin fecha */
function proximosTemas(unidades: PlanningUnit[], hoy: string): TemaParaElegir[] {
    const todos = unidades.flatMap(u => u.classes.map(tema => ({ tema, unidad: u }))).filter(t => !t.tema.isComplete);
    const conFecha = todos.filter(t => t.tema.fecha).sort((a, b) => (a.tema.fecha ?? '').localeCompare(b.tema.fecha ?? ''));
    // El que está en curso: el último de cada curso que ya arrancó
    const enCurso = new Map<string, TemaParaElegir>();
    for (const t of conFecha) {
        if ((t.tema.fecha ?? '') <= hoy) enCurso.set(`${t.unidad.subjectId}|${t.unidad.courseId}`, t);
    }
    const vienen = conFecha.filter(t => (t.tema.fecha ?? '') > hoy);
    const sinFecha = todos.filter(t => !t.tema.fecha);
    return [...enCurso.values(), ...vienen, ...sinFecha].slice(0, 6);
}

export default function Crear() {
    const { user } = useAuth();
    const migue = useMigue();
    const [temas, setTemas] = useState<TemaParaElegir[] | null>(null);
    const [materias, setMaterias] = useState<Record<string, string>>({});
    // Un error de red nunca es "no tenés temas": se avisa y se reintenta
    const [sinTemas, setSinTemas] = useState(false);
    const [intento, setIntento] = useState(0);

    useEffect(() => {
        if (!user) return;
        let vivo = true;
        Promise.all([
            getTemasConFecha(user.id).then(u => u, () => null),
            getSubjects().catch(() => []),
        ]).then(([unidades, subjects]) => {
            if (!vivo) return;
            setMaterias(Object.fromEntries(subjects.map(s => [s.id, s.name])));
            if (unidades === null) { setSinTemas(true); return; }
            setTemas(proximosTemas(unidades, hoyISO()));
        });
        return () => { vivo = false; };
    }, [user, intento]);

    if (!user) return null;
    const hoy = hoyISO();
    const curso = (u: PlanningUnit) => user.subjects?.find(a => a.subjectId === u.subjectId && a.courseId === u.courseId)?.courseName ?? '';
    const cuando = (t: PlanningClass) => (!t.fecha ? 'Sin fecha' : t.fecha <= hoy ? 'En curso' : fechaCorta(t.fecha));

    return (
        <div className="crear">
            <div className="crear-cabeza">
                <p className="crear-bajada">
                    Elegí el tema y preparás todo ahí: presentación, trabajo práctico, evaluación, clase completa y
                    preguntas para la clase en vivo. La IA arma un borrador y vos lo revisás antes de que llegue a tus estudiantes.
                </p>
                <UsosIA />
            </div>

            {/* Primero el tema: ahí queda todo junto */}
            <section className="crear-temas" aria-labelledby="crear-temas-titulo">
                <h2 id="crear-temas-titulo" className="crear-seccion">¿Para qué tema?</h2>
                {sinTemas && temas === null ? (
                    <div className="crear-tema crear-tema-vacio" role="status">
                        <WifiOff size={22} aria-hidden="true" />
                        <span>
                            <strong>No pudimos traer tus temas</strong>
                            <small>Puede ser la señal. Probá de nuevo, o entrá a tu planificación.</small>
                        </span>
                        <button type="button" className="btn btn-outline btn-sm" onClick={() => { setSinTemas(false); setIntento(n => n + 1); }}>Reintentar</button>
                    </div>
                ) : temas === null ? (
                    <Esqueleto filas={2} etiqueta="Buscando tus próximos temas…" />
                ) : temas.length === 0 ? (
                    <Link to="/planificacion" className="crear-tema crear-tema-vacio">
                        <CalendarRange size={22} aria-hidden="true" />
                        <span>
                            <strong>Todavía no tenés temas</strong>
                            <small>Subí tu programa en Planificación: la IA arma las unidades y los temas, con fecha en tus días de clase.</small>
                        </span>
                        <ArrowRight size={18} aria-hidden="true" />
                    </Link>
                ) : (
                    <ul className="crear-temas-lista">
                        {temas.map(({ tema, unidad }) => (
                            <li key={tema.id}>
                                <Link to={`/tema/${tema.id}`} className="crear-tema">
                                    <span className="crear-tema-cuando">{cuando(tema)}</span>
                                    <span className="crear-tema-textos">
                                        <strong>{tema.title}</strong>
                                        <small>{[materias[unidad.subjectId], curso(unidad), unidad.title].filter(Boolean).join(' · ')}</small>
                                    </span>
                                    <span className="crear-tema-ir">Prepararlo <ArrowRight size={16} aria-hidden="true" /></span>
                                </Link>
                            </li>
                        ))}
                    </ul>
                )}
                <Link to="/planificacion" className="crear-otro-tema">
                    <FolderOpen size={16} aria-hidden="true" /> Elegir otro tema de mi planificación
                </Link>
            </section>

            {/* Lo suelto */}
            <section className="crear-suelto" aria-labelledby="crear-suelto-titulo">
                <h2 id="crear-suelto-titulo" className="crear-seccion">Algo suelto, sin tema</h2>
                <div className="crear-material-botones">
                    <Link to="/biblioteca?subir=archivo" className="crear-material-boton">
                        <Upload size={22} aria-hidden="true" />
                        <span><strong>Subir un archivo</strong><small>PDF, Word, PowerPoint o fotos</small></span>
                    </Link>
                    <Link to="/biblioteca?subir=escanear" className="crear-material-boton">
                        <ScanLine size={22} aria-hidden="true" />
                        <span><strong>Escanear hojas</strong><small>Con la cámara: queda un PDF derecho y limpio</small></span>
                    </Link>
                </div>
                <ul className="crear-herramientas-lista">
                    {SUELTO.map(o => (
                        <li key={o.a}>
                            <Link to={o.a} className="crear-herramienta">
                                <span className="crear-herramienta-icono" aria-hidden="true"><o.icono size={20} /></span>
                                <span className="crear-herramienta-textos">
                                    <span className="crear-herramienta-titulo">{o.titulo}</span>
                                    <span className="crear-herramienta-texto">{o.texto}</span>
                                </span>
                                <ArrowRight size={16} className="crear-herramienta-flecha" aria-hidden="true" />
                            </Link>
                        </li>
                    ))}
                </ul>
            </section>

            {/* Lo que no está en la lista: Migue (el único asistente del docente) */}
            {migue && (
                <button type="button" className="crear-migue" onClick={() => migue.abrir()}>
                    <span className="crear-migue-cara" aria-hidden="true"><img src="/migue-docente.jpeg" alt="" /></span>
                    <span className="crear-herramienta-textos">
                        <span className="crear-herramienta-titulo">¿No está en la lista? Preguntale a Migue</span>
                        <span className="crear-herramienta-texto">Ideas, ejemplos, adaptaciones, una rúbrica, cómo usar la app. Lo que te sirva lo guardás o lo publicás.</span>
                    </span>
                    <MessagesSquare size={18} className="crear-herramienta-flecha" aria-hidden="true" />
                </button>
            )}
        </div>
    );
}
