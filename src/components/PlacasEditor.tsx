/**
 * Editor de placas de estudio.
 *
 * Las placas se generan una vez y quedan guardadas en el material: acá el
 * docente las corrige, borra las que no le sirven, cambia el orden o suma
 * las suyas, sin volver a gastar IA. "Rehacer con IA" es a pedido y no
 * guarda solo: las nuevas aparecen acá para revisarlas antes de guardar.
 */

import { useState } from 'react';
import {
    ArrowUp, ArrowDown, Trash2, Plus, Sparkles, Loader2, X, Lightbulb, RotateCcw, CircleHelp,
} from 'lucide-react';
import type { StudyCard } from '../types';
import { placaCompleta } from '../services/documents.service';
import Dialogo from './shell/Dialogo';
import { avisar, confirmar } from './ui/avisar';
import './Modals.css';
import './ui/ui.css';
import './PlacasEditor.css';

type Tipo = NonNullable<StudyCard['type']>;

const TIPOS: Record<Tipo, { etiqueta: string; icono: typeof Lightbulb; ayuda: string }> = {
    concept: { etiqueta: 'Concepto', icono: Lightbulb, ayuda: 'Una idea para leer' },
    flashcard: { etiqueta: 'Pregunta y respuesta', icono: RotateCcw, ayuda: 'Se da vuelta para ver la respuesta' },
    quiz: { etiqueta: 'Quiz', icono: CircleHelp, ayuda: 'Cuatro opciones, una correcta' },
};

const tipoDe = (c: StudyCard): Tipo => c.type ?? 'concept';

function placaNueva(tipo: Tipo, tag = ''): StudyCard {
    return {
        type: tipo, emoji: tipo === 'quiz' ? '❓' : tipo === 'flashcard' ? '🔁' : '💡', tag,
        title: '', body: '', question: '', answer: '',
        options: tipo === 'quiz' ? ['', '', '', ''] : [], correct_index: 0, explanation: '',
    };
}

interface Props {
    placas: StudyCard[];
    titulo: string;
    alCerrar: () => void;
    /** Guarda las placas en el material. Si falla, tira el error. */
    alGuardar: (placas: StudyCard[]) => Promise<void>;
    /** Genera placas nuevas con IA (no las guarda). Sin esto no se ofrece rehacer. */
    alRehacer?: () => Promise<StudyCard[]>;
}

export default function PlacasEditor({ placas: iniciales, titulo, alCerrar, alGuardar, alRehacer }: Props) {
    const [placas, setPlacas] = useState<StudyCard[]>(() => iniciales.map(c => ({ ...c, options: [...(c.options ?? [])] })));
    const [cambios, setCambios] = useState(false);
    const [guardando, setGuardando] = useState(false);
    const [rehaciendo, setRehaciendo] = useState(false);
    const [mostrarErrores, setMostrarErrores] = useState(false);

    const cambiar = (i: number, parche: Partial<StudyCard>) => {
        setPlacas(prev => prev.map((c, j) => (j === i ? { ...c, ...parche } : c)));
        setCambios(true);
    };
    const cambiarOpcion = (i: number, k: number, valor: string) => {
        setPlacas(prev => prev.map((c, j) => {
            if (j !== i) return c;
            const options = [...(c.options ?? [])];
            options[k] = valor;
            return { ...c, options };
        }));
        setCambios(true);
    };
    const mover = (i: number, delta: number) => {
        const destino = i + delta;
        if (destino < 0 || destino >= placas.length) return;
        setPlacas(prev => {
            const copia = [...prev];
            [copia[i], copia[destino]] = [copia[destino], copia[i]];
            return copia;
        });
        setCambios(true);
    };
    const borrar = (i: number) => {
        setPlacas(prev => prev.filter((_, j) => j !== i));
        setCambios(true);
    };
    const agregar = (tipo: Tipo) => {
        setPlacas(prev => [...prev, placaNueva(tipo, prev[prev.length - 1]?.tag ?? '')]);
        setCambios(true);
        // Que la placa nueva quede a la vista
        requestAnimationFrame(() => {
            document.querySelector('.pe-lista > li:last-child')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        });
    };

    const incompletas = placas.map((c, i) => (placaCompleta(c) ? -1 : i)).filter(i => i >= 0);

    const cerrar = async () => {
        if (cambios && !(await confirmar({
            titulo: '¿Salir sin guardar?',
            mensaje: 'Se pierden los cambios que hiciste en las placas.',
            accion: 'Salir sin guardar',
            cancelar: 'Seguir editando',
            peligro: true,
        }))) return;
        alCerrar();
    };

    const guardar = async () => {
        if (placas.length === 0) {
            avisar.error('Dejá al menos una placa', 'Si no querés placas para este material, cerrá sin guardar.');
            return;
        }
        if (incompletas.length > 0) {
            setMostrarErrores(true);
            avisar.error(
                incompletas.length === 1 ? 'Hay una placa incompleta' : `Hay ${incompletas.length} placas incompletas`,
                'Completala o borrala antes de guardar. Están marcadas en rojo.',
            );
            document.querySelector(`.pe-lista > li:nth-child(${incompletas[0] + 1})`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            return;
        }
        setGuardando(true);
        try {
            // Los campos que no corresponden al tipo van vacíos, como los genera la IA
            const limpias = placas.map(c => {
                const tipo = tipoDe(c);
                return {
                    ...c,
                    type: tipo,
                    title: tipo === 'concept' ? (c.title ?? '').trim() : '',
                    body: tipo === 'concept' ? (c.body ?? '').trim() : '',
                    question: tipo !== 'concept' ? (c.question ?? '').trim() : '',
                    answer: tipo === 'flashcard' ? (c.answer ?? '').trim() : '',
                    options: tipo === 'quiz' ? (c.options ?? []).map(o => o.trim()) : [],
                    correct_index: tipo === 'quiz' ? (c.correct_index ?? 0) : 0,
                    explanation: tipo === 'quiz' ? (c.explanation ?? '').trim() : '',
                };
            });
            await alGuardar(limpias);
            avisar.exito('Placas guardadas', 'Tus estudiantes ven esta versión.');
            setCambios(false);
            alCerrar();
        } catch (err) {
            console.error(err);
            avisar.error('No se pudieron guardar las placas', 'Revisá la conexión y probá de nuevo.');
        } finally {
            setGuardando(false);
        }
    };

    const rehacer = async () => {
        if (!alRehacer) return;
        if (!(await confirmar({
            titulo: '¿Rehacer las placas con IA?',
            mensaje: 'Se arman de nuevo desde el material y reemplazan a estas en el editor. Usa uno de tus usos de IA del día. Nada se guarda hasta que toques "Guardar".',
            accion: 'Rehacer',
        }))) return;
        setRehaciendo(true);
        try {
            const nuevas = await alRehacer();
            setPlacas(nuevas.map(c => ({ ...c, options: [...(c.options ?? [])] })));
            setCambios(true);
            setMostrarErrores(false);
            avisar.info(`Listas ${nuevas.length} placas nuevas`, 'Revisalas y tocá "Guardar" para quedarte con estas.');
        } catch (err) {
            avisar.error('No se pudieron rehacer las placas', err instanceof Error ? err.message : 'Probá de nuevo.');
        } finally {
            setRehaciendo(false);
        }
    };

    const ocupado = guardando || rehaciendo;

    return (
        <Dialogo abierto alCerrar={alCerrar} alPedirCierre={() => { void cerrar(); }} etiquetadoPor="pe-titulo" className="dialogo-em">
            <div className="em-modal em-modal-lg pe-modal">
                <div className="em-modal-header">
                    <h3 id="pe-titulo">Editar placas — {titulo}</h3>
                    <button className="btn btn-ghost" onClick={() => { void cerrar(); }} aria-label="Cerrar" disabled={guardando}>
                        <X size={18} aria-hidden="true" />
                    </button>
                </div>

                <div className="em-modal-body pe-cuerpo">
                    <div className="pe-resumen">
                        <p>
                            {placas.length} placa{placas.length !== 1 ? 's' : ''} · quedan guardadas en el material y no se vuelven a generar.
                        </p>
                        {alRehacer && (
                            <button className="btn btn-outline btn-sm" onClick={rehacer} disabled={ocupado}>
                                {rehaciendo
                                    ? <><Loader2 size={15} className="girando" aria-hidden="true" /> Rehaciendo… (cerca de un minuto)</>
                                    : <><Sparkles size={15} aria-hidden="true" /> Rehacer con IA</>}
                            </button>
                        )}
                    </div>

                    <ol className="pe-lista" aria-busy={rehaciendo}>
                        {placas.map((c, i) => {
                            const tipo = tipoDe(c);
                            const Icono = TIPOS[tipo].icono;
                            const mal = mostrarErrores && !placaCompleta(c);
                            const id = `pe-${i}`;
                            return (
                                <li key={i} className={`pe-placa pe-${tipo}${mal ? ' pe-mal' : ''}`}>
                                    <div className="pe-placa-cabeza">
                                        <span className="pe-num">{i + 1}</span>
                                        <span className="pe-tipo"><Icono size={14} aria-hidden="true" /> {TIPOS[tipo].etiqueta}</span>
                                        <input
                                            className="pe-emoji"
                                            value={c.emoji ?? ''}
                                            maxLength={4}
                                            onChange={e => cambiar(i, { emoji: e.target.value })}
                                            aria-label={`Emoji de la placa ${i + 1}`}
                                        />
                                        <div className="pe-acciones">
                                            <button className="btn-icon" onClick={() => mover(i, -1)} disabled={i === 0} aria-label={`Subir la placa ${i + 1}`} title="Subir">
                                                <ArrowUp size={16} aria-hidden="true" />
                                            </button>
                                            <button className="btn-icon" onClick={() => mover(i, 1)} disabled={i === placas.length - 1} aria-label={`Bajar la placa ${i + 1}`} title="Bajar">
                                                <ArrowDown size={16} aria-hidden="true" />
                                            </button>
                                            <button className="btn-icon pe-borrar" onClick={() => borrar(i)} aria-label={`Borrar la placa ${i + 1}`} title="Borrar">
                                                <Trash2 size={16} aria-hidden="true" />
                                            </button>
                                        </div>
                                    </div>

                                    <label className="pe-campo">
                                        <span>Eje</span>
                                        <input className="form-input" value={c.tag ?? ''} maxLength={40}
                                            onChange={e => cambiar(i, { tag: e.target.value })} placeholder="Ej: Causas" />
                                    </label>

                                    {tipo === 'concept' && (
                                        <>
                                            <label className="pe-campo">
                                                <span>Título</span>
                                                <input className="form-input" value={c.title ?? ''} maxLength={80}
                                                    onChange={e => cambiar(i, { title: e.target.value })} />
                                            </label>
                                            <label className="pe-campo">
                                                <span>Explicación</span>
                                                <textarea className="form-input" rows={3} value={c.body ?? ''}
                                                    onChange={e => cambiar(i, { body: e.target.value })} />
                                            </label>
                                        </>
                                    )}

                                    {tipo !== 'concept' && (
                                        <label className="pe-campo">
                                            <span>Pregunta</span>
                                            <textarea className="form-input" rows={2} value={c.question ?? ''}
                                                onChange={e => cambiar(i, { question: e.target.value })} />
                                        </label>
                                    )}

                                    {tipo === 'flashcard' && (
                                        <label className="pe-campo">
                                            <span>Respuesta</span>
                                            <textarea className="form-input" rows={2} value={c.answer ?? ''}
                                                onChange={e => cambiar(i, { answer: e.target.value })} />
                                        </label>
                                    )}

                                    {tipo === 'quiz' && (
                                        <>
                                            <fieldset className="pe-opciones">
                                                <legend>Opciones (marcá la correcta)</legend>
                                                {(c.options ?? []).map((o, k) => (
                                                    <div key={k} className="pe-opcion">
                                                        <input
                                                            type="radio"
                                                            name={`${id}-correcta`}
                                                            checked={(c.correct_index ?? 0) === k}
                                                            onChange={() => cambiar(i, { correct_index: k })}
                                                            aria-label={`La opción ${k + 1} es la correcta`}
                                                        />
                                                        <input
                                                            className="form-input"
                                                            value={o}
                                                            onChange={e => cambiarOpcion(i, k, e.target.value)}
                                                            aria-label={`Opción ${k + 1}`}
                                                        />
                                                    </div>
                                                ))}
                                            </fieldset>
                                            <label className="pe-campo">
                                                <span>Por qué es la correcta</span>
                                                <textarea className="form-input" rows={2} value={c.explanation ?? ''}
                                                    onChange={e => cambiar(i, { explanation: e.target.value })} />
                                            </label>
                                        </>
                                    )}

                                    {mal && <p className="pe-falta" role="alert">Falta completar esta placa.</p>}
                                </li>
                            );
                        })}
                    </ol>

                    <div className="pe-agregar">
                        <span>Agregar una placa:</span>
                        {(Object.keys(TIPOS) as Tipo[]).map(t => {
                            const Icono = TIPOS[t].icono;
                            return (
                                <button key={t} className="btn btn-outline btn-sm" onClick={() => agregar(t)} disabled={ocupado} title={TIPOS[t].ayuda}>
                                    <Plus size={14} aria-hidden="true" /><Icono size={14} aria-hidden="true" /> {TIPOS[t].etiqueta}
                                </button>
                            );
                        })}
                    </div>
                </div>

                <div className="pe-pie">
                    <button className="btn btn-outline" onClick={() => { void cerrar(); }} disabled={guardando}>Cancelar</button>
                    <button className="btn btn-primary" onClick={guardar} disabled={ocupado || !cambios}>
                        {guardando ? <><Loader2 size={16} className="girando" aria-hidden="true" /> Guardando…</> : 'Guardar'}
                    </button>
                </div>
            </div>
        </Dialogo>
    );
}
