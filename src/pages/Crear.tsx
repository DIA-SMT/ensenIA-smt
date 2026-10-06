/**
 * SMT EstudIA — Crear
 *
 * Una sola puerta para todo lo que el docente arma: antes había cuatro
 * caminos sueltos (Armar módulo, Laboratorio IA, Actividad rápida y el
 * botón de la barra) y no quedaba claro cuál usar para qué. Acá cada
 * opción dice para qué sirve y cuánto tarda.
 */

import { Link } from 'react-router-dom';
import {
    Zap, Boxes, Radio, ListChecks, FileInput, Presentation, Mic, MessagesSquare,
    ArrowRight, type LucideIcon,
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

const PRINCIPALES: Opcion[] = [
    {
        a: '/actividad-rapida',
        icono: Zap,
        titulo: 'Actividad rápida',
        texto: 'Escribís el tema y te arma la consigna para publicársela a tu curso.',
        nota: 'Lista en un minuto',
    },
    {
        a: '/modulo',
        icono: Boxes,
        titulo: 'Módulo de un tema',
        texto: 'A partir de tu material: placas de estudio para el celular, podcast y actividad.',
        nota: 'Se genera una vez y queda guardado',
    },
    {
        a: '/clase-en-vivo',
        icono: Radio,
        titulo: 'Clase en vivo',
        texto: 'Das tu clase y lanzás preguntas que tus estudiantes responden desde el celular.',
        nota: 'Ves las respuestas al instante',
    },
];

const HERRAMIENTAS: Opcion[] = [
    { a: '/ia-lab?herramienta=eval', icono: ListChecks, titulo: 'Evaluación', texto: 'Con rúbrica y criterios de corrección.', nota: '' },
    { a: '/ia-lab?herramienta=pres', icono: Presentation, titulo: 'Diapositivas para proyectar', texto: 'Una presentación con notas para vos.', nota: '' },
    { a: '/ia-lab?herramienta=sum', icono: FileInput, titulo: 'Resumen', texto: 'Pegás un texto largo y lo sintetiza.', nota: '' },
    { a: '/ia-lab?herramienta=oral', icono: Mic, titulo: 'Exposiciones orales', texto: 'Rúbricas para orales y debates.', nota: '' },
    { a: '/ia-lab', icono: MessagesSquare, titulo: 'Charlar con la IA', texto: 'Para lo que no está en la lista.', nota: '' },
];

export default function Crear() {
    return (
        <div className="crear">
            <div className="crear-cabeza">
                <p className="crear-bajada">Elegí qué necesitás. La IA arma un borrador y vos lo revisás antes de que llegue a tus estudiantes.</p>
                <UsosIA />
            </div>

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
