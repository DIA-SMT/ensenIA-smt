/**
 * SMT EstudIA — Mi horario
 *
 * El horario de la semana, que se repite todas las semanas. Lo carga el
 * propio docente (antes solo venía de los seeds y nadie podía tocarlo): de
 * acá sale "Hoy", con la próxima clase, pasar lista y preparar.
 *
 * En la compu, una grilla de lunes a viernes; en el celular, una lista por
 * día (la grilla de cinco columnas no entra en una pantalla angosta).
 */

import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { X, Users, MapPin, Wand2, CheckSquare, Plus, Pencil, Trash2, CalendarDays, Loader2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { getScheduleByTeacher, crearBloques, actualizarBloque, borrarBloque, type BloqueNuevo } from '../services/schedule.service';
import { getSubjects } from '../services/subjects.service';
import { horaATexto, textoAHora } from '../lib/horas';
import type { ScheduleBlock, Subject } from '../types';
import Dialogo from '../components/shell/Dialogo';
import EstadoVacio from '../components/ui/EstadoVacio';
import { Esqueleto } from '../components/ui/Esqueleto';
import { avisar, confirmar } from '../components/ui/avisar';
import '../components/shell/shell.css';
import '../components/ui/ui.css';
import './Agenda.css';

const DIAS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes'];
const DIAS_CORTOS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie'];

/** Duraciones habituales de un módulo, en minutos */
const DURACIONES = [40, 60, 80, 90, 120, 160];

const COLORES = ['blue', 'green', 'purple', 'orange'];
const CLASE_COLOR: Record<string, string> = {
    blue: 'block-blue', green: 'block-green', purple: 'block-purple', orange: 'block-orange',
    amber: 'block-orange', teal: 'block-blue',
};

function minutos(duracionHoras: number): number {
    return Math.round(duracionHoras * 60);
}

interface Formulario {
    asignacion: number;
    dias: Set<number>;
    inicio: string;
    duracion: number;
    aula: string;
}

export default function Agenda() {
    const { user } = useAuth();
    const navigate = useNavigate();
    const [bloques, setBloques] = useState<ScheduleBlock[]>([]);
    const [cargando, setCargando] = useState(true);
    const [materias, setMaterias] = useState<Record<string, Subject>>({});
    const [elegido, setElegido] = useState<ScheduleBlock | null>(null);
    // null = cerrado; editando = id del bloque, o 'nuevo'
    const [editando, setEditando] = useState<string | null>(null);
    const [form, setForm] = useState<Formulario | null>(null);
    const [guardando, setGuardando] = useState(false);

    const asignaciones = user?.subjects ?? [];

    useEffect(() => {
        if (!user) return;
        getScheduleByTeacher(user.id).then(setBloques).catch(err => {
            console.error(err);
            avisar.error('No se pudo cargar tu horario', 'Revisá la conexión y probá de nuevo.');
        }).finally(() => setCargando(false));
        getSubjects(user.schoolId).then(list => {
            const map: Record<string, Subject> = {};
            list.forEach(s => { map[s.id] = s; });
            setMaterias(map);
        }).catch(console.error);
    }, [user]);

    // Rango de horas de la grilla: el habitual, estirado si hay clases antes o después
    const [desde, hasta] = useMemo(() => {
        let min = 8;
        let max = 17;
        for (const b of bloques) {
            min = Math.min(min, Math.floor(b.startHour));
            max = Math.max(max, Math.ceil(b.startHour + b.duration));
        }
        return [min, max];
    }, [bloques]);

    if (!user) return null;

    const hoyIdx = (() => { const d = new Date().getDay(); return d >= 1 && d <= 5 ? d - 1 : -1; })();
    const nombreAsignacion = (i: number) => {
        const a = asignaciones[i];
        return a ? `${materias[a.subjectId]?.name ?? 'Materia'} — ${a.courseName}` : '';
    };
    const colorDe = (subjectId: string) => {
        const i = asignaciones.findIndex(a => a.subjectId === subjectId);
        return COLORES[(i < 0 ? 0 : i) % COLORES.length];
    };

    const abrirNuevo = (dia?: number) => {
        setForm({ asignacion: 0, dias: new Set(dia !== undefined ? [dia] : []), inicio: '08:00', duracion: 80, aula: '' });
        setEditando('nuevo');
    };
    const abrirEdicion = (b: ScheduleBlock) => {
        const i = asignaciones.findIndex(a => a.subjectId === b.subjectId && a.courseId === b.courseId);
        setForm({
            asignacion: i < 0 ? 0 : i,
            dias: new Set([b.dayIndex]),
            inicio: horaATexto(b.startHour).padStart(5, '0'),
            duracion: minutos(b.duration),
            aula: b.room ?? '',
        });
        setElegido(null);
        setEditando(b.id);
    };
    const cerrarForm = () => { setEditando(null); setForm(null); };

    const guardar = async () => {
        if (!form || !editando) return;
        const a = asignaciones[form.asignacion];
        const inicio = textoAHora(form.inicio);
        if (!a) { avisar.error('Elegí la materia y el curso'); return; }
        if (form.dias.size === 0) { avisar.error('Elegí al menos un día'); return; }
        if (inicio === null || inicio < 7 || inicio > 23) { avisar.error('Revisá la hora de inicio', 'Tiene que estar entre las 7:00 y las 23:00.'); return; }
        const base = {
            teacherId: user.id, schoolId: user.schoolId, subjectId: a.subjectId, courseId: a.courseId,
            startHour: inicio, duration: form.duracion / 60, room: form.aula, colorClass: colorDe(a.subjectId),
        };
        // Superposición con otra clase propia: la base no la deja guardar (045),
        // así que se avisa antes en vez de ofrecer "guardar igual"
        const choca = [...form.dias].some(d => bloques.some(b =>
            b.id !== editando && b.dayIndex === d &&
            inicio < b.startHour + b.duration && b.startHour < inicio + form.duracion / 60));
        if (choca) {
            avisar.error('Se superpone con otra clase tuya', 'En ese horario ya tenés otra clase cargada. Cambiá el día o la hora.');
            return;
        }

        setGuardando(true);
        try {
            if (editando === 'nuevo') {
                const nuevos: BloqueNuevo[] = [...form.dias].sort().map(d => ({ ...base, dayIndex: d }));
                const creados = await crearBloques(nuevos);
                setBloques(prev => [...prev, ...creados]);
                avisar.exito(creados.length === 1 ? 'Clase agregada a tu horario' : `${creados.length} clases agregadas a tu horario`);
            } else {
                const actualizado = await actualizarBloque(editando, { ...base, dayIndex: [...form.dias][0] });
                setBloques(prev => prev.map(b => (b.id === editando ? actualizado : b)));
                avisar.exito('Clase actualizada');
            }
            cerrarForm();
        } catch (err) {
            console.error(err);
            const msg = err instanceof Error ? err.message : '';
            avisar.error('No se pudo guardar', /row-level security|permission/i.test(msg)
                ? 'Tu escuela todavía no habilitó cargar el horario desde la app. Avisale a dirección.'
                : msg || 'Probá de nuevo.');
        } finally {
            setGuardando(false);
        }
    };

    const borrar = async (b: ScheduleBlock) => {
        if (!(await confirmar({
            titulo: '¿Sacar esta clase de tu horario?',
            mensaje: `${b.subjectName} · ${b.courseName}, ${DIAS[b.dayIndex].toLowerCase()} a las ${horaATexto(b.startHour)}. No borra actividades ni notas.`,
            accion: 'Sacar',
            peligro: true,
        }))) return;
        try {
            await borrarBloque(b.id);
            setBloques(prev => prev.filter(x => x.id !== b.id));
            setElegido(null);
            avisar.exito('Clase sacada del horario');
        } catch (err) {
            console.error(err);
            avisar.error('No se pudo sacar la clase', 'Probá de nuevo.');
        }
    };

    const horas = Array.from({ length: hasta - desde }, (_, i) => i + desde);
    const porDia = DIAS.map((_, d) => bloques.filter(b => b.dayIndex === d).sort((x, y) => x.startHour - y.startHour));
    const formCambiado = editando !== null;

    return (
        <div className="agenda-container">
            <div className="agenda-header card">
                <div>
                    <h2 className="sr-only">Mi horario</h2>
                    <p className="agenda-bajada">
                        Se repite todas las semanas. De acá sale tu pantalla <strong>Hoy</strong>: la próxima clase, pasar lista y preparar.
                    </p>
                </div>
                {/* Con el horario vacío, el botón está en el estado vacío */}
                {bloques.length > 0 && (
                    <button className="btn btn-primary" onClick={() => abrirNuevo()}>
                        <Plus size={17} aria-hidden="true" /> Agregar clase
                    </button>
                )}
            </div>

            {cargando ? (
                <Esqueleto tipo="filas" cantidad={4} etiqueta="Cargando tu horario…" />
            ) : asignaciones.length === 0 ? (
                <EstadoVacio
                    icono={CalendarDays}
                    titulo="Todavía no tenés materias asignadas"
                    texto="Para cargar tu horario, dirección tiene que asignarte tus materias y cursos."
                />
            ) : bloques.length === 0 ? (
                <EstadoVacio
                    icono={CalendarDays}
                    titulo="Cargá tu horario"
                    texto="Un minuto, una sola vez: con tu horario, la pantalla Hoy te muestra la próxima clase y te deja pasar lista o prepararla con un toque."
                    accion={{ etiqueta: 'Agregar mi primera clase', alTocar: () => abrirNuevo(), icono: Plus }}
                />
            ) : (
                <>
                    {/* Compu: grilla */}
                    <div className="calendar-grid card agenda-grilla" aria-hidden="false">
                        <div className="time-col">
                            <div className="header-cell"></div>
                            {horas.map(h => (
                                <div key={h} className="time-cell"><span>{h}:00</span></div>
                            ))}
                        </div>
                        <div className="days-wrapper">
                            <div className="days-header">
                                {DIAS.map((dia, idx) => (
                                    <div key={dia} className={`day-header-cell ${idx === hoyIdx ? 'today' : ''}`}>
                                        <span className="day-name">{dia}</span>
                                        {idx === hoyIdx && <span className="day-hoy">Hoy</span>}
                                    </div>
                                ))}
                            </div>
                            <div className="days-grid-content" style={{ minHeight: `${horas.length * 60}px` }}>
                                <div className="grid-lines">
                                    {horas.map(h => <div key={h} className="grid-row"></div>)}
                                </div>
                                {bloques.map(b => (
                                    <button
                                        key={b.id}
                                        type="button"
                                        className={`schedule-block ${CLASE_COLOR[b.colorClass] || 'block-blue'}`}
                                        style={{
                                            gridColumn: b.dayIndex + 1,
                                            top: `${(b.startHour - desde) * 60}px`,
                                            height: `${b.duration * 60}px`,
                                        }}
                                        onClick={() => setElegido(b)}
                                        aria-label={`${b.subjectName}, ${b.courseName}, ${DIAS[b.dayIndex]} de ${horaATexto(b.startHour)} a ${horaATexto(b.startHour + b.duration)}`}
                                    >
                                        <span className="block-title">{b.subjectName}</span>
                                        <span className="block-details">
                                            {b.courseName} · {horaATexto(b.startHour)}{b.room ? ` · ${b.room}` : ''}
                                        </span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Celular: lista por día */}
                    <div className="agenda-lista">
                        {porDia.map((lista, d) => (
                            <section key={d} className={`agenda-dia ${d === hoyIdx ? 'es-hoy' : ''}`} aria-labelledby={`agenda-dia-${d}`}>
                                <div className="agenda-dia-cabeza">
                                    <h3 id={`agenda-dia-${d}`}>{DIAS[d]}{d === hoyIdx && <span className="day-hoy">Hoy</span>}</h3>
                                    <button className="btn btn-ghost btn-sm" onClick={() => abrirNuevo(d)} aria-label={`Agregar una clase el ${DIAS[d].toLowerCase()}`}>
                                        <Plus size={15} aria-hidden="true" />
                                    </button>
                                </div>
                                {lista.length === 0 ? (
                                    <p className="agenda-dia-vacio">Sin clases</p>
                                ) : (
                                    <ul>
                                        {lista.map(b => (
                                            <li key={b.id}>
                                                <button type="button" className={`agenda-item ${CLASE_COLOR[b.colorClass] || 'block-blue'}`} onClick={() => setElegido(b)}>
                                                    <span className="agenda-item-hora">{horaATexto(b.startHour)}<em>{horaATexto(b.startHour + b.duration)}</em></span>
                                                    <span className="agenda-item-textos">
                                                        <strong>{b.subjectName}</strong>
                                                        <span>{b.courseName}{b.room ? ` · ${b.room}` : ''}</span>
                                                    </span>
                                                </button>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </section>
                        ))}
                    </div>
                </>
            )}

            {/* Detalle de una clase */}
            <Dialogo
                abierto={elegido !== null}
                alCerrar={() => setElegido(null)}
                etiquetadoPor="agenda-detalle-titulo"
                className="agenda-dialogo"
            >
                {elegido && (
                    <>
                        <div className="modal-header">
                            <h3 id="agenda-detalle-titulo">Detalle de clase</h3>
                            <button type="button" className="btn-icon" aria-label="Cerrar" onClick={() => setElegido(null)}><X size={20} aria-hidden="true" /></button>
                        </div>
                        <div className={`modal-banner ${CLASE_COLOR[elegido.colorClass] || 'block-blue'}`}>
                            <h2>{elegido.subjectName}</h2>
                            <p>{DIAS[elegido.dayIndex]} · {horaATexto(elegido.startHour)} a {horaATexto(elegido.startHour + elegido.duration)}</p>
                        </div>
                        <div className="modal-body">
                            <div className="detail-row">
                                <Users className="text-secondary" size={18} aria-hidden="true" />
                                <div className="detail-text">
                                    <span className="detail-label">Curso</span>
                                    <span className="detail-value">{elegido.courseName} ({elegido.studentCount} est.)</span>
                                </div>
                            </div>
                            {elegido.room && (
                                <div className="detail-row">
                                    <MapPin className="text-secondary" size={18} aria-hidden="true" />
                                    <div className="detail-text">
                                        <span className="detail-label">Aula</span>
                                        <span className="detail-value">{elegido.room}</span>
                                    </div>
                                </div>
                            )}
                        </div>
                        <div className="modal-actions">
                            <button className="btn btn-primary w-full" onClick={() => navigate(`/asistencia?curso=${elegido.courseId}&materia=${elegido.subjectId}`)}>
                                <CheckSquare size={18} aria-hidden="true" /> Pasar lista
                            </button>
                            <button className="btn btn-outline w-full" onClick={() => navigate('/crear')}>
                                <Wand2 size={18} aria-hidden="true" /> Preparar la clase
                            </button>
                            <div className="agenda-acciones-bloque">
                                <button className="btn btn-ghost btn-sm" onClick={() => abrirEdicion(elegido)}>
                                    <Pencil size={15} aria-hidden="true" /> Editar
                                </button>
                                <button className="btn btn-ghost btn-sm agenda-sacar" onClick={() => borrar(elegido)}>
                                    <Trash2 size={15} aria-hidden="true" /> Sacar del horario
                                </button>
                            </div>
                        </div>
                    </>
                )}
            </Dialogo>

            {/* Agregar / editar */}
            <Dialogo
                abierto={formCambiado}
                alCerrar={cerrarForm}
                etiquetadoPor="agenda-form-titulo"
                className="agenda-dialogo"
            >
                {form && (
                    <form className="agenda-form" onSubmit={e => { e.preventDefault(); guardar(); }}>
                        <div className="modal-header">
                            <h3 id="agenda-form-titulo">{editando === 'nuevo' ? 'Agregar clase' : 'Editar clase'}</h3>
                            <button type="button" className="btn-icon" aria-label="Cerrar" onClick={cerrarForm}><X size={20} aria-hidden="true" /></button>
                        </div>
                        <div className="modal-body">
                            <label className="agenda-campo">
                                <span>Materia y curso</span>
                                <select
                                    className="form-select"
                                    value={form.asignacion}
                                    onChange={e => setForm({ ...form, asignacion: Number(e.target.value) })}
                                    data-inicial=""
                                >
                                    {asignaciones.map((_, i) => <option key={i} value={i}>{nombreAsignacion(i)}</option>)}
                                </select>
                            </label>

                            <fieldset className="agenda-campo agenda-dias">
                                <legend>{editando === 'nuevo' ? 'Días (podés marcar varios)' : 'Día'}</legend>
                                <div className="fila-desplazable">
                                    {DIAS_CORTOS.map((d, i) => {
                                        const on = form.dias.has(i);
                                        return (
                                            <button
                                                key={d}
                                                type="button"
                                                className={`agenda-dia-chip ${on ? 'on' : ''}`}
                                                aria-pressed={on}
                                                aria-label={DIAS[i]}
                                                onClick={() => setForm(f => {
                                                    if (!f) return f;
                                                    const dias = editando === 'nuevo' ? new Set(f.dias) : new Set<number>();
                                                    if (f.dias.has(i) && editando === 'nuevo') dias.delete(i); else dias.add(i);
                                                    return { ...f, dias };
                                                })}
                                            >
                                                {d}
                                            </button>
                                        );
                                    })}
                                </div>
                            </fieldset>

                            <div className="agenda-fila">
                                <label className="agenda-campo">
                                    <span>Empieza</span>
                                    <input
                                        type="time"
                                        className="form-input"
                                        min="07:00"
                                        max="23:00"
                                        step={300}
                                        value={form.inicio}
                                        onChange={e => setForm({ ...form, inicio: e.target.value })}
                                        required
                                    />
                                </label>
                                <label className="agenda-campo">
                                    <span>Dura</span>
                                    <select className="form-select" value={form.duracion} onChange={e => setForm({ ...form, duracion: Number(e.target.value) })}>
                                        {[...new Set([...DURACIONES, form.duracion])].sort((x, y) => x - y).map(m => (
                                            <option key={m} value={m}>{m < 60 ? `${m} min` : `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ''}`}</option>
                                        ))}
                                    </select>
                                </label>
                            </div>

                            <label className="agenda-campo">
                                <span>Aula (opcional)</span>
                                <input
                                    className="form-input"
                                    maxLength={40}
                                    placeholder="Ej: Aula 4, Laboratorio"
                                    value={form.aula}
                                    onChange={e => setForm({ ...form, aula: e.target.value })}
                                />
                            </label>
                        </div>
                        <div className="modal-actions agenda-form-acciones">
                            <button type="button" className="btn btn-outline" onClick={cerrarForm}>Cancelar</button>
                            <button type="submit" className="btn btn-primary" disabled={guardando}>
                                {guardando ? <><Loader2 size={16} className="girando" aria-hidden="true" /> Guardando…</> : 'Guardar'}
                            </button>
                        </div>
                    </form>
                )}
            </Dialogo>
        </div>
    );
}
