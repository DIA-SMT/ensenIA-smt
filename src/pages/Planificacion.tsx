/**
 * Mi planificación (062) — el paso inicial del docente.
 *
 * Su horario es fijo todo el año: con el programa subido, la planificación
 * sale con fechas. Cada tema arranca un día y ocupa los encuentros hasta que
 * empieza el siguiente. Desde cada tema se prepara lo que hace falta
 * (presentación, trabajo práctico, evaluación, la clase completa) con la IA,
 * sin buscar herramientas: el "Laboratorio IA" ya no está en el menú, se
 * llega desde acá con el tema elegido.
 *
 * Las fechas y el reparto los decide la base (fechas_de_clase,
 * reacomodar_planificacion, importar_programa); acá solo se muestran.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useMigue } from '../contexts/MigueContext';
import {
  CalendarRange, FileUp, RefreshCw, Plus, Check, Sparkles, Presentation, ClipboardList,
  FileCheck2, MessageSquare, Boxes, Trash2, Pencil, AlertTriangle, CalendarClock, Brain, ChevronDown, FolderOpen,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { esErrorDeRed } from '../lib/conexion';
import ImportProgramModal from '../components/ImportProgramModal';
import EstadoVacio from '../components/ui/EstadoVacio';
import { Esqueleto } from '../components/ui/Esqueleto';
import { avisar, confirmar, pedirTexto } from '../components/ui/avisar';
import {
  getPlanningBySubjectAndCourse, createUnit, createClass, updateClass, deleteUnit, esDelAnio,
} from '../services/planning.service';
import { getSubjects } from '../services/subjects.service';
import { getScheduleByTeacher } from '../services/schedule.service';
import { getTerms } from '../services/gradebook.service';
import {
  getEncuentros, reacomodar, getDiasSinClase, fechaCorta, hoyISO, type Encuentro,
} from '../services/planificacion.service';
import type { PlanningUnit, PlanningClass, Subject, ScheduleBlock } from '../types';
import './Planificacion.css';

const DIAS = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes'];
const AVISO_MEMORIA = 'estudia_aviso_memoria_docente';

interface TemaConFecha extends PlanningClass {
  unidad: PlanningUnit;
  /** Encuentros desde su fecha hasta que arranca el siguiente tema */
  encuentros: number;
  /** Otro tema arranca el mismo día */
  comparteDia: boolean;
}

export default function Planificacion() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const asignaciones = useMemo(() => user?.subjects ?? [], [user]);

  const anioActual = new Date().getFullYear();
  const [anio, setAnio] = useState(anioActual);
  const [elegida, setElegida] = useState(0);
  const [materias, setMaterias] = useState<Record<string, Subject>>({});
  const [horario, setHorario] = useState<ScheduleBlock[] | null>(null);
  const [unidades, setUnidades] = useState<PlanningUnit[] | null>(null);
  const [encuentros, setEncuentros] = useState<Encuentro[]>([]);
  const [sinTrimestres, setSinTrimestres] = useState(false);
  const [diasSinClase, setDiasSinClase] = useState<number | null>(null);
  const [fallo, setFallo] = useState(false);
  const [falloFechas, setFalloFechas] = useState(false);
  const [importando, setImportando] = useState(false);
  const [abierto, setAbierto] = useState<string | null>(null);
  const [trabajando, setTrabajando] = useState(false);
  const [avisoMemoriaVisto, setAvisoMemoriaVisto] = useState(() => {
    try { return localStorage.getItem(AVISO_MEMORIA) === '1'; } catch { return false; }
  });
  const enfocar = useRef<string | null>(null);

  const asignacion = asignaciones[elegida];
  const materiaNombre = asignacion ? (materias[asignacion.subjectId]?.name ?? 'Materia') : '';
  const hoy = hoyISO();
  // Si el año todavía no empezó, se reparte desde su primer encuentro
  const desde = anio > anioActual ? `${anio}-01-01` : undefined;

  // ?materia=&curso=&clase= — llega desde Hoy o desde un aviso
  useEffect(() => {
    const m = searchParams.get('materia');
    const c = searchParams.get('curso');
    const clase = searchParams.get('clase');
    if (!m && !clase) return;
    const i = asignaciones.findIndex(a => a.subjectId === m && a.courseId === c);
    if (i >= 0) setElegida(i);
    if (clase) {
      enfocar.current = clase;
      setAbierto(clase);
      // El curso queda en la dirección; el tema, ya abierto, no hace falta
      const p = new URLSearchParams(searchParams);
      p.delete('clase');
      setSearchParams(p, { replace: true });
    }
  }, [asignaciones, searchParams, setSearchParams]);

  useEffect(() => {
    if (!user) return;
    getSubjects(user.schoolId)
      .then(lista => setMaterias(Object.fromEntries(lista.map(s => [s.id, s]))))
      .catch(console.error);
    // Si no cargó, no se dice "cargá tu horario" (no se sabe): queda sin aviso
    getScheduleByTeacher(user.id).then(setHorario).catch(() => setHorario(null));
  }, [user]);

  // Cada carga lleva un número: si el docente cambia de curso mientras otra
  // carga está en vuelo, la respuesta vieja se descarta
  const pedido = useRef(0);
  const cargar = useCallback(async () => {
    if (!user || !asignacion) return;
    const este = ++pedido.current;
    // Los trimestres los carga dirección (acá no se crean solos)
    const [trimestres, planif, enc, dias] = await Promise.all([
      getTerms(user.schoolId, anio).catch(() => null),
      // Por separado: si fallan las fechas, la planificación igual se ve
      getPlanningBySubjectAndCourse(asignacion.subjectId, asignacion.courseId, user.id).catch(err => { console.error(err); return null; }),
      getEncuentros(asignacion.subjectId, asignacion.courseId, anio).catch(err => { console.error(err); return null; }),
      getDiasSinClase(user.schoolId, anio).catch(() => null),
    ]);
    if (este !== pedido.current) return;
    setSinTrimestres(trimestres !== null && trimestres.length === 0);
    setFallo(planif === null);
    // Solo las unidades de este ciclo lectivo
    setUnidades((planif ?? []).filter(u => esDelAnio(u, anio)));
    setFalloFechas(enc === null);
    setEncuentros(enc ?? []);
    setDiasSinClase(dias ? dias.length : null);
  }, [user, asignacion, anio]);

  useEffect(() => { void cargar(); }, [cargar]);

  // Después de cargar, el tema pedido queda a la vista
  useEffect(() => {
    if (!enfocar.current || !unidades) return;
    const el = document.getElementById(`tema-${enfocar.current}`);
    if (el) { el.scrollIntoView({ block: 'center' }); enfocar.current = null; }
  }, [unidades]);

  const bloques = useMemo(
    () => (horario ?? []).filter(b => asignacion && b.subjectId === asignacion.subjectId && b.courseId === asignacion.courseId),
    [horario, asignacion],
  );

  // Temas en orden del programa, con cuántos encuentros ocupa cada uno
  const temas: TemaConFecha[] = useMemo(() => {
    const lista = (unidades ?? []).flatMap(u => u.classes.map(c => ({ ...c, unidad: u })));
    const fechas = [...new Set(lista.map(t => t.fecha).filter((f): f is string => Boolean(f)))].sort();
    const cuenta = new Map<string, number>();
    fechas.forEach((f, i) => {
      const siguiente = fechas[i + 1];
      cuenta.set(f, encuentros.filter(e => e.fecha >= f && (!siguiente || e.fecha < siguiente)).length);
    });
    const porDia = new Map<string, number>();
    lista.forEach(t => { if (t.fecha) porDia.set(t.fecha, (porDia.get(t.fecha) ?? 0) + 1); });
    return lista.map(t => ({
      ...t,
      encuentros: t.fecha ? (cuenta.get(t.fecha) ?? 0) : 0,
      comparteDia: t.fecha ? (porDia.get(t.fecha) ?? 0) > 1 : false,
    }));
  }, [unidades, encuentros]);

  // Lo que toca hoy: el último tema que ya arrancó
  const deHoy = useMemo(() => {
    const arrancados = temas.filter(t => t.fecha && t.fecha <= hoy);
    if (arrancados.length === 0) return null;
    const ultimo = arrancados.reduce((a, b) => ((b.fecha ?? '') >= (a.fecha ?? '') ? b : a));
    const numero = encuentros.filter(e => e.fecha >= (ultimo.fecha ?? '') && e.fecha <= hoy).length;
    return { tema: ultimo, numero, esHoy: encuentros.some(e => e.fecha === hoy) };
  }, [temas, encuentros, hoy]);

  const sinFecha = temas.filter(t => !t.fecha && !t.isComplete).length;

  if (!user) return null;

  if (asignaciones.length === 0) {
    return (
      <div className="pl-pantalla">
        <EstadoVacio icono={CalendarRange} titulo="Todavía no tenés materias asignadas"
          texto="Cuando dirección te asigne materias y cursos, acá vas a armar la planificación del año." />
      </div>
    );
  }

  const correr = async (fn: () => Promise<void>) => {
    setTrabajando(true);
    try { await fn(); await cargar(); } catch (err) {
      console.error(err);
      // Los mensajes redactados para el docente (reacomodar: "No hay encuentros…") se
      // muestran; los técnicos de la base, no
      const m = err instanceof Error ? err.message : '';
      if (esErrorDeRed(err)) avisar.error('Se cortó la señal', 'No se guardó. Probá de nuevo cuando vuelva.');
      else if (m && !/permission|violates|function|syntax|relation|duplicate|null value|jwt|pgrst|column|constraint/i.test(m)) avisar.error(m);
      else avisar.error('No se pudo guardar el cambio', 'Probá de nuevo en un momento.');
    } finally { setTrabajando(false); }
  };

  const reacomodarFechas = async () => {
    const si = await confirmar({
      titulo: 'Reacomodar las fechas',
      mensaje: `Los temas que no marcaste como dados se reparten parejo en los encuentros ${desde ? `de ${anio}` : 'desde hoy'}. Los que ya diste quedan donde están.`,
      accion: 'Reacomodar',
    });
    if (!si || !asignacion) return;
    await correr(async () => {
      const r = await reacomodar(asignacion.subjectId, asignacion.courseId, anio, desde);
      avisar.exito(`Listo: ${r.clases} ${r.clases === 1 ? 'tema' : 'temas'} en ${r.encuentros} encuentros.`,
        r.masClasesQueEncuentros ? 'Hay más temas que encuentros: algunos comparten día.' : undefined);
    });
  };

  const agregarUnidad = async () => {
    if (!asignacion) return;
    const titulo = await pedirTexto({ titulo: 'Nueva unidad', etiqueta: 'Nombre de la unidad', accion: 'Agregar', maxLength: 200 });
    if (!titulo) return;
    await correr(async () => {
      await createUnit({
        title: titulo, subjectId: asignacion.subjectId, courseId: asignacion.courseId, teacherId: user.id,
        order: (unidades?.reduce((m, u) => Math.max(m, u.order), 0) ?? 0) + 1,
        anio,
      });
    });
  };

  const agregarTema = async (u: PlanningUnit) => {
    const titulo = await pedirTexto({
      titulo: `Nuevo tema en «${u.title}»`, etiqueta: 'Tema', accion: 'Agregar', maxLength: 200,
      mensaje: 'Queda sin fecha: después tocá "Reacomodar fechas" o elegile un día.',
    });
    if (!titulo) return;
    await correr(async () => {
      await createClass({ unitId: u.id, title: titulo, order: u.classes.reduce((m, c) => Math.max(m, c.order), 0) + 1 });
    });
  };

  const renombrar = async (t: TemaConFecha) => {
    const titulo = await pedirTexto({ titulo: 'Cambiar el nombre del tema', etiqueta: 'Tema', valor: t.title, maxLength: 200 });
    if (!titulo || titulo === t.title) return;
    await correr(() => updateClass(t.id, { title: titulo }));
  };

  const borrarUnidad = async (u: PlanningUnit) => {
    const si = await confirmar({
      titulo: `¿Borrar «${u.title}»?`,
      mensaje: `Se borra la unidad con sus ${u.classes.length} temas. Las actividades y materiales que ya hiciste quedan, sin el tema.`,
      accion: 'Borrar', peligro: true,
    });
    if (!si) return;
    await correr(() => deleteUnit(u.id));
  };

  const fechasPorTrimestre = [1, 2, 3].map(n => ({ n, fechas: encuentros.filter(e => e.trimestre === n) }));
  const minutosSemana = bloques.reduce((s, b) => s + b.duration * 60, 0);
  const diasDeClase = [...new Set(bloques.map(b => b.dayIndex))].sort().map(d => DIAS[d]).join(' y ');

  return (
    <div className="pl-pantalla">
      <section className="card pl-encabezado">
        <div className="pl-titulo">
          <h2><CalendarRange size={20} aria-hidden="true" /> Mi planificación</h2>
          <p>Tu horario fijo y tu programa: el año armado. Desde cada tema preparás lo que necesitás.</p>
        </div>
        <div className="pl-controles">
          <label className="sr-only" htmlFor="pl-materia">Materia y curso</label>
          <select id="pl-materia" className="form-select" value={elegida}
            onChange={e => {
              const i = Number(e.target.value);
              setElegida(i);
              setUnidades(null);
              setAbierto(null);
              // En la dirección: volver desde un tema trae el mismo curso
              const a = asignaciones[i];
              if (a) setSearchParams({ materia: a.subjectId, curso: a.courseId }, { replace: true });
            }}>
            {asignaciones.map((a, i) => (
              <option key={`${a.subjectId}-${a.courseId}`} value={i}>
                {materias[a.subjectId]?.name ?? 'Materia'} · {a.courseName}
              </option>
            ))}
          </select>
          <label className="sr-only" htmlFor="pl-anio">Año</label>
          <select id="pl-anio" className="form-select pl-anio" value={anio}
            onChange={e => { setAnio(Number(e.target.value)); setUnidades(null); }}>
            <option value={anioActual}>{anioActual}</option>
            <option value={anioActual + 1}>{anioActual + 1}</option>
          </select>
        </div>
        <div className="pl-acciones">
          <button type="button" className={`btn btn-sm ${unidades?.length ? 'btn-secondary' : 'btn-primary'}`} onClick={() => setImportando(true)}>
            <FileUp size={15} aria-hidden="true" /> Subir el programa
          </button>
          {Boolean(unidades?.length) && (
            <button type="button" className="btn btn-secondary btn-sm" onClick={reacomodarFechas} disabled={trabajando || encuentros.length === 0}>
              <RefreshCw size={15} aria-hidden="true" /> Reacomodar fechas
            </button>
          )}
          <button type="button" className="btn btn-secondary btn-sm" onClick={agregarUnidad} disabled={trabajando}>
            <Plus size={15} aria-hidden="true" /> Unidad
          </button>
          <Link to="/settings#memoria-docente" className="pl-memoria">
            <Brain size={14} aria-hidden="true" /> Lo que la IA recuerda de cómo trabajás
          </Link>
        </div>
      </section>

      {/* La memoria del docente viene prendida: se avisa una vez */}
      {!avisoMemoriaVisto && Boolean(unidades?.length) && (
        <div className="pl-aviso pl-aviso-info" role="note">
          <Brain size={16} aria-hidden="true" />
          <span>La IA va a ir anotando cómo trabajás (el formato de tus materiales, lo que le corregís) para no pedírtelo de nuevo. Solo lo ves vos; lo borrás o lo apagás en Ajustes.</span>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => {
            setAvisoMemoriaVisto(true);
            try { localStorage.setItem(AVISO_MEMORIA, '1'); } catch { /* sin storage */ }
          }}>Entendido</button>
        </div>
      )}

      {/* Lo que hace falta para que haya fechas */}
      {horario && bloques.length === 0 && (
        <div className="pl-aviso" role="note">
          <CalendarClock size={16} aria-hidden="true" />
          <span>Para que salgan las fechas, cargá tu horario de {materiaNombre} en {asignacion?.courseName}.</span>
          <Link to="/agenda?volver=/planificacion" className="btn btn-secondary btn-sm">Cargar mi horario</Link>
        </div>
      )}
      {sinTrimestres && Boolean(unidades?.length) && (
        <div className="pl-aviso" role="note">
          <AlertTriangle size={16} aria-hidden="true" />
          <span>Dirección todavía no cargó los trimestres de {anio}.</span>
        </div>
      )}
      {bloques.length > 0 && encuentros.length > 0 && (
        <p className="pl-resumen">
          {encuentros.length} encuentros en {anio} ({diasDeClase}, {Math.round(minutosSemana)} min por semana)
          {' · '}{fechasPorTrimestre.map(t => `${t.n}° trimestre: ${t.fechas.length}`).join(' · ')}
          {diasSinClase === 0 && <span className="pl-resumen-aviso"> · Dirección todavía no cargó feriados ni recesos: alguna fecha puede caer en uno.</span>}
        </p>
      )}

      {/* Lo que toca hoy */}
      {deHoy && deHoy.esHoy && !deHoy.tema.isComplete && (
        <section className="card pl-hoy" aria-label="Lo que toca hoy">
          <span className="pl-hoy-etiqueta">Hoy toca</span>
          <strong>{deHoy.tema.title}</strong>
          <span className="text-secondary text-sm">{deHoy.tema.unidad.title} · {deHoy.numero}° encuentro de {deHoy.tema.encuentros || 1}</span>
          <Link to={`/tema/${deHoy.tema.id}`} className="btn btn-primary btn-sm">
            <Sparkles size={15} aria-hidden="true" /> Preparar
          </Link>
        </section>
      )}

      {fallo && <div role="alert" className="pl-aviso"><AlertTriangle size={16} aria-hidden="true" /> No pudimos traer tu planificación. Revisá la conexión.</div>}
      {!fallo && falloFechas && (
        <div role="alert" className="pl-aviso"><AlertTriangle size={16} aria-hidden="true" /> No pudimos calcular las fechas de tus clases. Tu planificación está; probá de nuevo en un rato.</div>
      )}

      {unidades === null && !fallo && <Esqueleto tipo="tarjetas" cantidad={3} etiqueta="Cargando tu planificación…" />}

      {unidades?.length === 0 && !fallo && (
        <EstadoVacio
          icono={FileUp}
          titulo={`Subí el programa de ${materiaNombre} · ${asignacion?.courseName}`}
          texto="La IA lo lee y arma las unidades y los temas; la app los reparte en los días de tu horario. Después movés lo que quieras."
          accion={{ etiqueta: 'Subir el programa', alTocar: () => setImportando(true), icono: FileUp }}
          accionSecundaria={{ etiqueta: 'Armarla a mano', alTocar: agregarUnidad }}
        />
      )}

      {sinFecha > 0 && encuentros.length > 0 && (
        <div className="pl-aviso" role="note">
          <CalendarRange size={16} aria-hidden="true" />
          <span>{sinFecha} {sinFecha === 1 ? 'tema no tiene' : 'temas no tienen'} fecha todavía.</span>
          <button type="button" className="btn btn-secondary btn-sm" onClick={reacomodarFechas} disabled={trabajando}>Repartir fechas</button>
        </div>
      )}

      {unidades?.map(u => (
        <section key={u.id} className="card pl-unidad" aria-labelledby={`unidad-${u.id}`}>
          <header className="pl-unidad-encabezado">
            <h3 id={`unidad-${u.id}`}>{u.title}</h3>
            <div className="pl-unidad-acciones">
              <button type="button" className="btn-icon" onClick={() => agregarTema(u)} aria-label={`Agregar tema a ${u.title}`} title="Agregar tema">
                <Plus size={16} aria-hidden="true" />
              </button>
              <button type="button" className="btn-icon" onClick={() => borrarUnidad(u)} aria-label={`Borrar ${u.title}`} title="Borrar unidad">
                <Trash2 size={15} aria-hidden="true" />
              </button>
            </div>
          </header>
          <ol className="pl-temas">
            {temas.filter(t => t.unitId === u.id).map(t => (
              <FilaTema
                key={t.id}
                tema={t}
                hoy={hoy}
                encuentros={encuentros}
                abierto={abierto === t.id}
                alAbrir={() => setAbierto(abierto === t.id ? null : t.id)}
                alCambiarFecha={fecha => correr(() => updateClass(t.id, { fecha }))}
                alMarcarDada={() => correr(() => updateClass(t.id, { isComplete: !t.isComplete }))}
                alRenombrar={() => renombrar(t)}
              />
            ))}
            {u.classes.length === 0 && <li className="pl-sin-temas text-secondary text-sm">Sin temas. Tocá + para agregar.</li>}
          </ol>
        </section>
      ))}

      {importando && asignacion && (
        <ImportProgramModal
          teacherId={user.id}
          schoolId={user.schoolId}
          subjectId={asignacion.subjectId}
          courseId={asignacion.courseId}
          subjectName={materiaNombre}
          courseName={asignacion.courseName}
          existingUnitsCount={unidades?.length ?? 0}
          anio={anio}
          desde={desde}
          onClose={() => setImportando(false)}
          onImported={() => { void cargar(); }}
        />
      )}
    </div>
  );
}

/** Un tema: su fecha, cuántos encuentros ocupa y lo que se prepara desde acá. */
function FilaTema({ tema, hoy, encuentros, abierto, alAbrir, alCambiarFecha, alMarcarDada, alRenombrar }: {
  tema: TemaConFecha;
  hoy: string;
  encuentros: Encuentro[];
  abierto: boolean;
  alAbrir: () => void;
  alCambiarFecha: (fecha: string | null) => void;
  alMarcarDada: () => void;
  alRenombrar: () => void;
}) {
  const t = tema;
  const migue = useMigue();
  const estado = t.isComplete ? 'dada' : t.fecha && t.fecha <= hoy ? 'en-curso' : 'proxima';
  // Dirección cargó un feriado o cambió un trimestre después de repartir:
  // la fecha guardada ya no es un día de clase
  const fueraDeAgenda = Boolean(t.fecha) && encuentros.length > 0 && !encuentros.some(e => e.fecha === t.fecha);
  const opciones = useMemo(() => {
    const lista = encuentros.map(e => e.fecha);
    if (t.fecha && !lista.includes(t.fecha)) lista.unshift(t.fecha);
    return lista;
  }, [encuentros, t.fecha]);

  // Desde cada tema, lo que hay para preparar (antes eran pantallas sueltas)
  const preparar = [
    { a: `/tema/${t.id}`, icono: FolderOpen, etiqueta: 'Todo lo del tema', detalle: 'El material de la clase y lo de los chicos, en un lugar' },
    { a: `/modulo?tema=${t.id}`, icono: Boxes, etiqueta: 'Clase completa', detalle: 'Apunte, diapositivas, juego y tarea, para mandar juntos' },
    { a: `/ia-lab?clase=${t.id}&herramienta=pres`, icono: Presentation, etiqueta: 'Presentación', detalle: 'Diapositivas que podés corregir y proyectar' },
    { a: `/actividades/nueva?tema=${t.id}&tipo=tp`, icono: ClipboardList, etiqueta: 'Trabajo práctico', detalle: 'Por partes y con puntos; en el celular o en papel' },
    { a: `/actividades/nueva?tema=${t.id}&tipo=evaluacion`, icono: FileCheck2, etiqueta: 'Evaluación', detalle: 'Por partes y con puntos; se corrige sola la opción múltiple' },
  ];

  return (
    <li id={`tema-${t.id}`} className={`pl-tema ${estado}`}>
      <div className="pl-tema-fila">
        <div className="pl-tema-fecha">
          {t.fecha ? <span className="pl-fecha">{fechaCorta(t.fecha)}</span> : <span className="pl-fecha sin">Sin fecha</span>}
          {fueraDeAgenda ? (
            <span className="pl-encuentros pl-fuera" title="Tocá Reacomodar fechas o elegile otro día">Ese día no hay clase</span>
          ) : t.fecha && t.encuentros > 0 && (
            <span className="pl-encuentros">{t.encuentros} {t.encuentros === 1 ? 'encuentro' : 'encuentros'}{t.comparteDia ? ' (comparte día)' : ''}</span>
          )}
        </div>
        <div className="pl-tema-texto">
          <span className="pl-tema-titulo">{t.title}</span>
          {t.objectives && t.objectives.length > 0 && <span className="pl-objetivos">{t.objectives.join(' · ')}</span>}
        </div>
        <div className="pl-tema-acciones">
          <button type="button" className="btn btn-secondary btn-sm" onClick={alAbrir} aria-expanded={abierto}
            aria-controls={`preparar-${t.id}`}>
            <Sparkles size={14} aria-hidden="true" /> Preparar <ChevronDown size={14} aria-hidden="true" className={abierto ? 'pl-girado' : ''} />
          </button>
          <button type="button" className={`btn-icon ${t.isComplete ? 'pl-dada' : ''}`} onClick={alMarcarDada}
            aria-pressed={t.isComplete} aria-label={t.isComplete ? `Marcar «${t.title}» como no dada` : `Marcar «${t.title}» como dada`}
            title={t.isComplete ? 'Dada (tocá para desmarcar)' : 'Marcar como dada'}>
            <Check size={16} aria-hidden="true" />
          </button>
        </div>
      </div>

      {abierto && (
        <div id={`preparar-${t.id}`} className="pl-preparar">
          <div className="pl-preparar-opciones">
            {preparar.map(p => (
              <Link key={p.etiqueta} to={p.a} className="pl-opcion">
                <p.icono size={18} aria-hidden="true" />
                <span><strong>{p.etiqueta}</strong><small>{p.detalle}</small></span>
              </Link>
            ))}
            {/* Migue, con el tema ya cargado (antes: "Preguntale a la IA") */}
            {migue && (
              <button type="button" className="pl-opcion" onClick={() => migue.abrir({ contexto: { tipo: 'tema', id: t.id, titulo: t.title } })}>
                <MessageSquare size={18} aria-hidden="true" />
                <span><strong>Preguntale a Migue</strong><small>Ideas, ejemplos y adaptaciones para este tema</small></span>
              </button>
            )}
          </div>
          <div className="pl-preparar-pie">
            <label htmlFor={`fecha-${t.id}`} className="text-sm text-secondary">Arranca el</label>
            <select id={`fecha-${t.id}`} className="form-select pl-fecha-select" value={t.fecha ?? ''}
              onChange={e => alCambiarFecha(e.target.value || null)}>
              <option value="">Sin fecha</option>
              {opciones.map(f => <option key={f} value={f}>{fechaCorta(f)}</option>)}
            </select>
            <button type="button" className="btn btn-secondary btn-sm" onClick={alRenombrar}>
              <Pencil size={13} aria-hidden="true" /> Cambiar el nombre
            </button>
          </div>
        </div>
      )}
    </li>
  );
}
