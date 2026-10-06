/**
 * SMT EstudIA — Editor del mazo
 *
 * Lo que faltaba: hasta acá la IA entregaba un mazo y el docente solo
 * podía cambiarle el color. Una errata, una lámina de más, un ejemplo que
 * no va para su curso — nada de eso se podía tocar, y rehacer todo por
 * una palabra no es una opción cuando tenés el recreo contado.
 *
 * La lámina se edita en el lugar, con el mismo dibujo que después se
 * proyecta (components/MazoVisor): lo que el docente ve mientras corrige
 * es exactamente lo que va a salir.
 */

import { useState } from 'react';
import {
    ChevronUp, ChevronDown, Copy, Trash2, Plus, Save, Download,
    Palette, LayoutTemplate, StickyNote, Loader2, ImagePlus, Sparkles,
} from 'lucide-react';
import { Lamina } from './MazoVisor';
import { DISENOS, disenoDe, varsDiseno, DISENO_PREDETERMINADO } from '../lib/disenos';
import { TIPOS_LAMINA, type Mazo, type Diapositiva, type TipoLamina } from '../lib/diapositivas';
import { exportarMazoPptx } from '../lib/pptxMazo';
import { uploadFile, generarImagenDeLamina } from '../services/documents.service';
import { avisar } from './ui/avisar';
import './MazoEditor.css';

const NOMBRE_TIPO: Record<TipoLamina, string> = {
    portada: 'Portada',
    puntos: 'Puntos',
    destacado: 'Destacado',
    'dos-columnas': 'Dos columnas',
    pregunta: 'Pregunta',
    imagen: 'Imagen',
    cierre: 'Cierre',
};

/** Lámina en blanco del tipo pedido, con lo mínimo para que se vea algo. */
function laminaNueva(tipo: TipoLamina): Diapositiva {
    const base: Diapositiva = { tipo, titulo: '', puntos: [] };
    if (tipo === 'destacado') return { ...base, destacado: '' };
    if (tipo === 'dos-columnas') return { ...base, izquierda: { titulo: '', puntos: [''] }, derecha: { titulo: '', puntos: [''] } };
    if (tipo === 'pregunta') return { ...base, opciones: ['', ''], correcta: null };
    if (tipo === 'imagen') return base;
    return { ...base, puntos: [''] };
}

/**
 * Qué dibujar. Se ofrece el título de la lámina como punto de partida,
 * pero conviene reescribirlo: "el target de un aviso publicitario" da una
 * ilustración mejor que "¿A quién le habla el aviso?".
 */
function PedirIlustracion({ sugerencia, alPedir, alCancelar }: {
    sugerencia: string;
    alPedir: (descripcion: string) => void;
    alCancelar: () => void;
}) {
    const [texto, setTexto] = useState(sugerencia);
    const pedir = () => { if (texto.trim()) alPedir(texto.trim()); };

    return (
        <div className="me-pedir">
            <label>
                <span>¿Qué querés que dibuje?</span>
                <input
                    type="text"
                    value={texto}
                    autoFocus
                    placeholder="Una escena, un objeto, una idea"
                    onChange={e => setTexto(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') pedir(); }}
                />
            </label>
            <p className="me-pedir-aviso">
                Hace una ilustración conceptual, sin texto. Para un mapa, un esquema o una
                foto real, subila vos: la IA los inventa y quedan mal.
            </p>
            <div className="me-pedir-acciones">
                <button className="btn btn-outline btn-sm" onClick={alCancelar}>Cancelar</button>
                <button className="btn btn-primary btn-sm" disabled={!texto.trim()} onClick={pedir}>Dibujar</button>
            </div>
        </div>
    );
}

export default function MazoEditor({ mazo, alCambiar, alGuardar, guardando, pie, contexto, docenteId }: {
    mazo: Mazo;
    alCambiar: (m: Mazo) => void;
    /** Si no está, el mazo no se persiste (por ejemplo, recién generado). */
    alGuardar?: () => void;
    guardando?: boolean;
    pie?: string;
    contexto?: { subjectName?: string; courseName?: string; teacherName?: string };
    /** Dueño del material: define la carpeta donde se suben las imágenes. */
    docenteId?: string;
}) {
    const [i, setI] = useState(0);
    const [verNotas, setVerNotas] = useState(true);
    const [bajando, setBajando] = useState(false);
    const [subiendo, setSubiendo] = useState(false);
    const [generando, setGenerando] = useState(false);
    const [pidiendoIA, setPidiendoIA] = useState(false);

    const total = mazo.diapositivas.length;
    const idx = Math.min(i, total - 1);
    const dia = mazo.diapositivas[idx];

    const conDiapositivas = (ds: Diapositiva[]) => alCambiar({ ...mazo, diapositivas: ds });
    const reemplazar = (j: number, d: Diapositiva) =>
        conDiapositivas(mazo.diapositivas.map((x, k) => k === j ? d : x));

    const mover = (de: number, a: number) => {
        if (a < 0 || a >= total) return;
        const ds = [...mazo.diapositivas];
        const [x] = ds.splice(de, 1);
        ds.splice(a, 0, x);
        conDiapositivas(ds);
        setI(a);
    };

    const duplicar = (j: number) => {
        const ds = [...mazo.diapositivas];
        ds.splice(j + 1, 0, structuredClone(ds[j]));
        conDiapositivas(ds);
        setI(j + 1);
    };

    const borrar = (j: number) => {
        if (total <= 1) return;
        conDiapositivas(mazo.diapositivas.filter((_, k) => k !== j));
        setI(Math.max(0, j - 1));
    };

    const agregar = () => {
        const ds = [...mazo.diapositivas];
        ds.splice(idx + 1, 0, laminaNueva('puntos'));
        conDiapositivas(ds);
        setI(idx + 1);
    };

    /**
     * Cambiar el tipo conserva lo que sirva. Pasar de "puntos" a
     * "dos-columnas" y perder las viñetas escritas sería castigar al que
     * probó una forma y se arrepintió.
     */
    const cambiarTipo = (tipo: TipoLamina) => {
        const nueva = laminaNueva(tipo);
        reemplazar(idx, {
            ...nueva,
            titulo: dia.titulo,
            puntos: tipo === 'destacado' || tipo === 'dos-columnas' ? nueva.puntos : (dia.puntos.length ? dia.puntos : nueva.puntos),
            // Se lleva todas las viñetas, no la primera: perder texto en
            // silencio al probar otra forma es peor que un destacado largo
            // que el docente recorta ahí mismo.
            ...(tipo === 'destacado' ? { destacado: dia.destacado || dia.puntos.join('\n') } : {}),
            ...(tipo === 'dos-columnas' ? { izquierda: dia.izquierda ?? nueva.izquierda, derecha: dia.derecha ?? nueva.derecha } : {}),
            ...(tipo === 'pregunta' ? { opciones: dia.opciones?.length ? dia.opciones : nueva.opciones, correcta: dia.correcta ?? null } : {}),
            ...(dia.nota ? { nota: dia.nota } : {}),
        });
    };

    /**
     * Sube la imagen al mismo bucket que el resto de los materiales.
     * Se guarda la ruta, no la URL: una URL firmada caduca en una hora y
     * un mazo guardado en marzo se abre en agosto.
     */
    const subirImagen = async (archivo: File) => {
        if (!docenteId) {
            avisar.error('No puedo subir la imagen', 'Falta saber de quién es el material.');
            return;
        }
        if (archivo.size > 5 * 1024 * 1024) {
            avisar.error('La imagen pesa demasiado', 'Máximo 5 MB. Una captura o una foto reducida alcanza.');
            return;
        }
        setSubiendo(true);
        try {
            const { storagePath } = await uploadFile(docenteId, archivo);
            reemplazar(idx, { ...dia, imagen: { ruta: storagePath, alt: dia.imagen?.alt ?? '' } });
        } catch (err) {
            avisar.error('No se pudo subir la imagen', err instanceof Error ? err.message : '');
        } finally {
            setSubiendo(false);
        }
    };

    /**
     * Pide la ilustración a la IA.
     *
     * El prompt del servidor la empuja a algo conceptual y sin texto: una
     * IA dibujando un mapa, un esquema del aparato digestivo o el retrato
     * de un prócer produce algo que PARECE material didáctico y está mal,
     * y termina proyectado como si fuera una fuente. Para eso está subir
     * la imagen real.
     */
    const generarImagen = async (descripcion: string) => {
        setPidiendoIA(false);
        setGenerando(true);
        try {
            const ruta = await generarImagenDeLamina(descripcion, { subjectName: contexto?.subjectName });
            reemplazar(idx, { ...dia, imagen: { ruta, alt: dia.imagen?.alt || descripcion.slice(0, 200) } });
        } catch (err) {
            avisar.error('No se pudo generar la imagen', err instanceof Error ? err.message : '');
        } finally {
            setGenerando(false);
        }
    };

    const descargar = async () => {
        setBajando(true);
        try { await exportarMazoPptx(mazo, contexto ?? {}); }
        finally { setBajando(false); }
    };

    if (!dia) return null;

    const d = disenoDe(mazo.diseno ?? DISENO_PREDETERMINADO);

    return (
        <div className="me">
            {/* ── Barra de acciones del mazo ── */}
            <div className="me-barra">
                <label className="me-select">
                    <Palette size={14} aria-hidden="true" />
                    <select
                        value={mazo.diseno ?? DISENO_PREDETERMINADO}
                        onChange={e => alCambiar({ ...mazo, diseno: e.target.value as never })}
                        aria-label="Diseño visual"
                    >
                        {DISENOS.map(x => <option key={x.id} value={x.id}>{x.nombre}</option>)}
                    </select>
                </label>

                <button className={`btn btn-outline btn-sm ${verNotas ? 'activo' : ''}`} onClick={() => setVerNotas(v => !v)}>
                    <StickyNote size={14} /> Notas
                </button>

                <div className="me-espaciador" />

                <button className="btn btn-outline btn-sm" onClick={descargar} disabled={bajando}>
                    {bajando ? <Loader2 size={14} className="girando" /> : <Download size={14} />} PowerPoint
                </button>
                {alGuardar && (
                    <button className="btn btn-primary btn-sm" onClick={alGuardar} disabled={guardando}>
                        {guardando ? <Loader2 size={14} className="girando" /> : <Save size={14} />}
                        {guardando ? 'Guardando...' : 'Guardar'}
                    </button>
                )}
            </div>

            <div className="me-cuerpo">
                {/* ── Las láminas, en orden ── */}
                <ol className="me-tira">
                    {mazo.diapositivas.map((x, j) => (
                        <li key={j}>
                            <button
                                className={`me-mini ${j === idx ? 'activa' : ''}`}
                                onClick={() => setI(j)}
                            >
                                <span className="me-mini-n">{j + 1}</span>
                                <span className="me-mini-txt">
                                    <span className="me-mini-tipo">{NOMBRE_TIPO[x.tipo]}</span>
                                    <span className="me-mini-titulo">{x.titulo || <em>Sin título</em>}</span>
                                </span>
                            </button>
                        </li>
                    ))}
                    <li>
                        <button className="me-mini me-mini-agregar" onClick={agregar}>
                            <Plus size={14} /> Agregar lámina
                        </button>
                    </li>
                </ol>

                {/* ── La lámina en edición ── */}
                <div className="me-panel">
                    <div className="me-herramientas">
                        <label className="me-select">
                            <LayoutTemplate size={14} aria-hidden="true" />
                            <select
                                value={dia.tipo}
                                onChange={e => cambiarTipo(e.target.value as TipoLamina)}
                                aria-label="Tipo de lámina"
                            >
                                {TIPOS_LAMINA.map(t => <option key={t} value={t}>{NOMBRE_TIPO[t]}</option>)}
                            </select>
                        </label>

                        <div className="me-espaciador" />

                        <button className="btn-icon" onClick={() => mover(idx, idx - 1)} disabled={idx === 0} title="Subir" aria-label="Subir">
                            <ChevronUp size={16} />
                        </button>
                        <button className="btn-icon" onClick={() => mover(idx, idx + 1)} disabled={idx === total - 1} title="Bajar" aria-label="Bajar">
                            <ChevronDown size={16} />
                        </button>
                        <button className="btn-icon" onClick={() => duplicar(idx)} title="Duplicar" aria-label="Duplicar">
                            <Copy size={15} />
                        </button>
                        <button className="btn-icon me-borrar" onClick={() => borrar(idx)} disabled={total <= 1} title="Borrar" aria-label="Borrar">
                            <Trash2 size={15} />
                        </button>
                    </div>

                    <div style={varsDiseno(d, dia.tipo === 'pregunta')}>
                        <Lamina dia={dia} pie={pie} alCambiar={nd => reemplazar(idx, nd)} />
                    </div>

                    {dia.tipo === 'imagen' && (
                        <div className="me-imagen">
                            <button
                                className="btn btn-outline btn-sm"
                                onClick={() => setPidiendoIA(true)}
                                disabled={subiendo || generando}
                                title="La IA dibuja una ilustración a partir de lo que le pidas"
                            >
                                {generando ? <Loader2 size={14} className="girando" /> : <Sparkles size={14} />}
                                {generando ? 'Dibujando...' : 'Generar con IA'}
                            </button>
                            <label className="btn btn-outline btn-sm">
                                {subiendo ? <Loader2 size={14} className="girando" /> : <ImagePlus size={14} />}
                                {dia.imagen ? 'Cambiar imagen' : 'Subir imagen'}
                                <input
                                    type="file"
                                    accept="image/png,image/jpeg,image/webp"
                                    hidden
                                    disabled={subiendo}
                                    onChange={e => {
                                        const f = e.target.files?.[0];
                                        e.target.value = '';
                                        if (f) subirImagen(f);
                                    }}
                                />
                            </label>
                            {dia.imagen && (
                                <label className="me-alt">
                                    <span>Qué se ve en la imagen</span>
                                    <input
                                        type="text"
                                        value={dia.imagen.alt}
                                        placeholder="Para quien no la puede ver"
                                        onChange={e => reemplazar(idx, { ...dia, imagen: { ...dia.imagen!, alt: e.target.value } })}
                                    />
                                </label>
                            )}
                        </div>
                    )}

                    {pidiendoIA && (
                        <PedirIlustracion
                            sugerencia={dia.titulo}
                            alCancelar={() => setPidiendoIA(false)}
                            alPedir={generarImagen}
                        />
                    )}

                    {verNotas && (
                        <label className="me-nota">
                            <span>Nota para vos — no se proyecta</span>
                            <textarea
                                value={dia.nota ?? ''}
                                placeholder="Cómo presentar esta lámina, qué preguntar, dónde suelen trabarse."
                                rows={2}
                                onChange={e => reemplazar(idx, { ...dia, nota: e.target.value })}
                            />
                        </label>
                    )}
                </div>
            </div>
        </div>
    );
}
