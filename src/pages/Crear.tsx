/**
 * SMT EstudIA — Crear
 *
 * Una sola puerta para todo lo que el docente arma: antes había cuatro
 * caminos sueltos (Armar módulo, Laboratorio IA, Actividad rápida y el
 * botón de la barra) y no quedaba claro cuál usar para qué. Acá cada
 * opción dice para qué sirve y cuánto tarda.
 */

import { Link } from 'react-router-dom';
import { useMigue } from '../contexts/MigueContext';
import {
    Zap, Boxes, Radio, ListChecks, FileInput, Presentation, Mic, MessagesSquare,
    ArrowRight, CalendarRange, Upload, ScanLine, type LucideIcon,
} from 'lucide-react';
import UsosIA from '../components/ui/UsosIA';
import './Crear.css';

interface Opcion {
    a: string;
    icono: LucideIcon;
    titulo: string;
    texto: string;
    /** Cuánto tarda o qué deja, en pocas palabras */
    nota: string;
}

// Lo más común primero: preparar desde un tema de la planificación (062).
// La clase en vivo baja a "Otras herramientas": es lo último del recorrido
// (necesita dispositivos en el aula).
const PRINCIPALES: Opcion[] = [
    {
        a: '/planificacion',
        icono: CalendarRange,
        titulo: 'Desde mi planificación',
        texto: 'Elegís el tema y preparás su presentación, trabajo práctico o evaluación, con el contexto del tema ya cargado.',
        nota: 'Todo queda ordenado por tema',
    },
    {
        a: '/modulo',
        icono: Boxes,
        titulo: 'Clase armada',
        texto: 'De un tema de tu planificación: diapositivas, juego, diagrama y tarea. La revisás y la mandás al curso.',
        nota: 'Todo de una, con un solo envío',
    },
    {
        a: '/actividades/nueva?tipo=tp',
        icono: ListChecks,
        titulo: 'Trabajo práctico o evaluación',
        texto: 'Por partes y con puntos. Lo hacen en el celular o en papel, y todo queda en la libreta.',
        nota: 'Se corrige sola la opción múltiple',
    },
    {
        a: '/actividad-rapida',
        icono: Zap,
        titulo: 'Actividad rápida',
        texto: 'Escribís el tema y te arma la consigna para publicársela a tu curso.',
        nota: 'Lista en un minuto',
    },
];

const HERRAMIENTAS: Opcion[] = [
    { a: '/ia-lab?herramienta=eval', icono: ListChecks, titulo: 'Rúbrica de evaluación', texto: 'Criterios de corrección para una prueba que tomás vos.', nota: '' },
    { a: '/ia-lab?herramienta=pres', icono: Presentation, titulo: 'Diapositivas para proyectar', texto: 'Una presentación con notas para vos.', nota: '' },
    { a: '/ia-lab?herramienta=sum', icono: FileInput, titulo: 'Resumen', texto: 'Pegás un texto largo y lo sintetiza.', nota: '' },
    { a: '/ia-lab?herramienta=oral', icono: Mic, titulo: 'Exposiciones orales', texto: 'Rúbricas para orales y debates.', nota: '' },
    { a: '/clase-en-vivo', icono: Radio, titulo: 'Clase en vivo', texto: 'Preguntas que tus estudiantes responden desde el celular.', nota: '' },
];

export default function Crear() {
    const migue = useMigue();
    return (
        <div className="crear">
            <div className="crear-cabeza">
                <p className="crear-bajada">Elegí qué necesitás. La IA arma un borrador y vos lo revisás antes de que llegue a tus estudiantes.</p>
                <UsosIA />
            </div>

            {/* Lo primero: el material que el docente ya tiene */}
            <section className="crear-material" aria-labelledby="crear-material-titulo">
                <h2 id="crear-material-titulo" className="crear-seccion">Tu material</h2>
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
            </section>

            <ul className="crear-principales">
                {PRINCIPALES.map(o => (
                    <li key={o.a}>
                        <Link to={o.a} className="crear-opcion">
                            <span className="crear-opcion-icono" aria-hidden="true"><o.icono size={24} /></span>
                            <span className="crear-opcion-titulo">{o.titulo}</span>
                            <span className="crear-opcion-texto">{o.texto}</span>
                            <span className="crear-opcion-pie">
                                <span className="crear-opcion-nota">{o.nota}</span>
                                <ArrowRight size={18} className="crear-opcion-flecha" aria-hidden="true" />
                            </span>
                        </Link>
                    </li>
                ))}
            </ul>

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

            <section className="crear-herramientas" aria-labelledby="crear-herramientas-titulo">
                <h2 id="crear-herramientas-titulo" className="crear-seccion">Otras herramientas</h2>
                <ul>
                    {HERRAMIENTAS.map(o => (
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
        </div>
    );
}
