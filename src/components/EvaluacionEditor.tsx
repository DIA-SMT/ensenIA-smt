/**
 * Cargar (o corregir) las notas de una evaluación del trimestre: una prueba
 * escrita, un TP, un oral... Título, tipo y fecha, y la lista del curso
 * para tipear cada nota (Enter pasa al siguiente) o marcar "ausente".
 * Lo que no lleva nota (control de carpeta) se registra como completo,
 * incompleto o no lo entregó, y cada alumno puede tener un comentario
 * corto (063). Sin señal se guarda en el equipo y se envía sola.
 */

import { useEffect, useRef, useState } from 'react';
import { X, Save, Trash2, Loader2, ClipboardList, MessageSquarePlus } from 'lucide-react';
import Dialogo from './shell/Dialogo';
import { confirmar } from './ui/avisar';
import {
  borrarEvaluacion, MARCAS, TIPOS_EVALUACION,
  type EscalaEvaluacion, type Evaluacion, type MarcaCumplimiento, type TipoEvaluacion,
} from '../services/evaluaciones.service';
import {
  guardarEvaluacionResiliente, olvidarPendiente, claveEvaluacion, type ResultadoGuardado,
} from '../services/offline-queue.service';
import { haySenial } from '../lib/conexion';
import { useSinGuardar } from '../lib/sinGuardar';
import { todayISO } from '../services/attendance.service';
import './Modals.css';
import './EvaluacionEditor.css';

export interface ContextoEvaluacion {
  subjectId: string;
  courseId: string;
  termId: string;
  subjectName: string;
  courseName: string;
  termName: string;
  /** YYYY-MM-DD: la fecha por defecto cae dentro del trimestre */
  termStartsOn: string;
  termEndsOn: string;
}

/** "7,5" o "7.5" → 7.5; vacío → null; fuera de 1-10 o no número → NaN */
function leerNota(v: string): number | null {
  const t = v.trim().replace(',', '.');
  if (t === '') return null;
  const n = Number(t);
  return Number.isFinite(n) && n >= 1 && n <= 10 ? Math.round(n * 100) / 100 : NaN;
}

const notaATexto = (n: number | null | undefined) =>
  n === null || n === undefined ? '' : String(n).replace('.', ',');

export default function EvaluacionEditor({
  contexto, alumnos, evaluacion, alCerrar, alGuardar, alBorrar,
}: {
  contexto: ContextoEvaluacion;
  alumnos: { studentId: string; firstName: string; lastName: string }[];
  /** null: una nueva */
  evaluacion: Evaluacion | null;
  alCerrar: () => void;
  alGuardar: (e: Evaluacion, resultado: ResultadoGuardado) => void;
  alBorrar: (id: string) => void;
}) {
  const hoy = todayISO();
  const fechaInicial = evaluacion?.fecha
    ?? (hoy < contexto.termStartsOn ? contexto.termStartsOn : hoy > contexto.termEndsOn ? contexto.termEndsOn : hoy);

  const [titulo, setTitulo] = useState(evaluacion?.titulo ?? '');
  const [tipo, setTipo] = useState<TipoEvaluacion>(evaluacion?.tipo ?? 'prueba');
  const [escala, setEscala] = useState<EscalaEvaluacion>(evaluacion?.escala ?? 'nota');
  // En una nueva, el control de carpeta arranca sin nota hasta que el docente elija
  const [escalaElegida, setEscalaElegida] = useState(!!evaluacion);
  const [fecha, setFecha] = useState(fechaInicial);
  const [valores, setValores] = useState<Record<string, string>>(() =>
    Object.fromEntries(alumnos.map(a => [a.studentId, notaATexto(evaluacion?.notas[a.studentId]?.nota)])));
  const [marcas, setMarcas] = useState<Record<string, MarcaCumplimiento | null>>(() =>
    Object.fromEntries(alumnos.map(a => [a.studentId, evaluacion?.notas[a.studentId]?.marca ?? null])));
  const [comentarios, setComentarios] = useState<Record<string, string>>(() =>
    Object.fromEntries(alumnos.map(a => [a.studentId, evaluacion?.notas[a.studentId]?.comentario ?? ''])));
  // De quiénes está abierto el comentario (los que ya tienen uno, abiertos)
  const [conComentario, setConComentario] = useState<Set<string>>(() =>
    new Set(alumnos.filter(a => evaluacion?.notas[a.studentId]?.comentario).map(a => a.studentId)));
  const [ausentes, setAusentes] = useState<Set<string>>(() =>
    new Set(alumnos.filter(a => evaluacion?.notas[a.studentId]?.ausente).map(a => a.studentId)));
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [sucio, setSucio] = useState(false);
  useSinGuardar('evaluacion', sucio);
  const tituloRef = useRef<HTMLInputElement>(null);

  // Una nueva arranca por el título; una existente, por la primera nota
  useEffect(() => {
    if (!evaluacion) tituloRef.current?.focus();
  }, [evaluacion]);

  const cambiarNota = (id: string, v: string) => {
    setValores(prev => ({ ...prev, [id]: v }));
    setSucio(true);
  };
  const alternarAusente = (id: string) => {
    setAusentes(prev => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
    setSucio(true);
  };

  /** Enter → la nota del siguiente */
  const alTeclear = (e: React.KeyboardEvent<HTMLInputElement>, idx: number) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    document.querySelector<HTMLInputElement>(`input[data-nota-idx="${idx + 1}"]`)?.focus();
  };

  const cambiarMarca = (id: string, m: MarcaCumplimiento) => {
    setMarcas(prev => ({ ...prev, [id]: prev[id] === m ? null : m }));
    setSucio(true);
  };
  const cambiarComentario = (id: string, v: string) => {
    setComentarios(prev => ({ ...prev, [id]: v }));
    setSucio(true);
  };
  const abrirComentario = (id: string) => {
    setConComentario(prev => new Set(prev).add(id));
    requestAnimationFrame(() => document.getElementById(`ev-com-${id}`)?.focus());
  };
  // ¿Hay algo cargado en la escala que se dejaría? (las notas o las marcas)
  const hayCargado = (en: EscalaEvaluacion) => alumnos.some(a => en === 'nota'
    ? (valores[a.studentId] ?? '').trim() !== ''
    : !!marcas[a.studentId]);

  const cambiarEscala = async (nueva: EscalaEvaluacion) => {
    if (nueva === escala) return;
    if (hayCargado(escala) && !(await confirmar({
      titulo: nueva === 'nota' ? '¿Pasar a nota de 1 a 10?' : '¿Pasar a sin nota?',
      mensaje: escala === 'nota'
        ? 'Las notas que cargaste se borran al guardar: quedan solo las marcas (completo, incompleto, no lo entregó).'
        : 'Las marcas que cargaste se borran al guardar: quedan solo las notas.',
      accion: 'Cambiar',
    }))) return;
    setEscala(nueva);
    setEscalaElegida(true);
    setSucio(true);
  };

  const elegirTipo = (t: TipoEvaluacion) => {
    setTipo(t);
    // El control de carpeta casi nunca lleva nota: se propone sin nota,
    // salvo que ya haya algo cargado
    if (!escalaElegida && !hayCargado(escala)) setEscala(t === 'carpeta' ? 'cumplimiento' : 'nota');
    setSucio(true);
  };

  const tieneValor = (id: string) => ausentes.has(id)
    || (escala === 'nota' ? leerNota(valores[id] ?? '') !== null : !!marcas[id]);
  const conNota = alumnos.filter(a => !ausentes.has(a.studentId) && tieneValor(a.studentId)).length;

  const guardar = async () => {
    if (!titulo.trim()) {
      setError('Ponele un título (por ejemplo: "Prueba escrita: ángulos").');
      tituloRef.current?.focus();
      return;
    }
    if (escala === 'nota') {
      const malas = alumnos.filter(a => !ausentes.has(a.studentId) && Number.isNaN(leerNota(valores[a.studentId] ?? '') as number));
      if (malas.length > 0) {
        setError(`Las notas van de 1 a 10. Revisá: ${malas.map(a => `${a.firstName} ${a.lastName}`).join(', ')}.`);
        return;
      }
    }
    // Un comentario solo no se guarda (la fila necesita nota, marca o ausente)
    const comentarioSolo = alumnos.filter(a => comentarios[a.studentId]?.trim() && !tieneValor(a.studentId));
    if (comentarioSolo.length > 0) {
      setError(`Para guardar el comentario, poné también ${escala === 'nota' ? 'la nota' : 'cómo lo entregó'} o marcá ausente: ${comentarioSolo.map(a => `${a.firstName} ${a.lastName}`).join(', ')}.`);
      return;
    }
    setGuardando(true);
    setError('');
    const id = evaluacion?.id ?? crypto.randomUUID();
    const notas = alumnos.map(a => {
      const ausente = ausentes.has(a.studentId);
      return {
        studentId: a.studentId,
        ausente,
        nota: ausente || escala !== 'nota' ? null : leerNota(valores[a.studentId] ?? ''),
        marca: ausente || escala !== 'cumplimiento' ? null : marcas[a.studentId] ?? null,
        comentario: comentarios[a.studentId]?.trim() || null,
      };
    });
    try {
      const resultado = await guardarEvaluacionResiliente(
        { id, subjectId: contexto.subjectId, courseId: contexto.courseId, termId: contexto.termId, titulo: titulo.trim(), tipo, escala, fecha, notas },
        `${TIPOS_EVALUACION[tipo].label} «${titulo.trim()}» · ${contexto.subjectName} ${contexto.courseName}`,
      );
      setSucio(false);
      alGuardar({
        id, subjectId: contexto.subjectId, courseId: contexto.courseId, termId: contexto.termId,
        titulo: titulo.trim(), tipo, escala, fecha, pendiente: resultado === 'pendiente',
        notas: Object.fromEntries(notas
          .filter(n => n.ausente || n.nota !== null || n.marca)
          .map(n => [n.studentId, { nota: n.nota, ausente: n.ausente, marca: n.marca, comentario: n.comentario }])),
      }, resultado);
    } catch (err) {
      console.error(err);
      setError(err instanceof Error && err.message.includes('migración')
        ? err.message
        : 'El servidor no aceptó las notas y no se guardó ninguna. Probá de nuevo; lo cargado sigue acá.');
    } finally {
      setGuardando(false);
    }
  };

  const borrar = async () => {
    if (!evaluacion) return;
    const ok = await confirmar({
      titulo: `¿Borrar «${evaluacion.titulo}»?`,
      mensaje: 'Se borran también todas sus notas. Los alumnos y las familias dejan de verlas.',
      accion: 'Borrar',
      peligro: true,
    });
    if (!ok) return;
    // Si todavía no se había enviado, alcanza con sacarla de la espera
    if (evaluacion.pendiente) {
      olvidarPendiente(claveEvaluacion(evaluacion.id));
      setSucio(false);
      alBorrar(evaluacion.id);
      return;
    }
    if (!haySenial()) {
      setError('Para borrar una evaluación hace falta señal.');
      return;
    }
    setGuardando(true);
    try {
      await borrarEvaluacion(evaluacion.id);
      setSucio(false);
      alBorrar(evaluacion.id);
    } catch (err) {
      console.error(err);
      setError('No se pudo borrar. Probá de nuevo.');
    } finally {
      setGuardando(false);
    }
  };

  const cerrar = async () => {
    if (sucio && !(await confirmar({
      titulo: 'Tenés notas sin guardar',
      mensaje: 'Si cerrás, lo que cargaste se pierde.',
      accion: 'Cerrar igual',
    }))) return;
    setSucio(false);
    alCerrar();
  };

  return (
    <Dialogo abierto alCerrar={cerrar} etiquetadoPor="ev-titulo" className="dialogo-em">
      <div className="em-modal ev-modal">
        <div className="em-modal-header">
          <h3 id="ev-titulo"><ClipboardList size={18} aria-hidden="true" /> {evaluacion ? 'Notas de la evaluación' : 'Cargar notas de una evaluación'}</h3>
          <button type="button" className="btn btn-ghost" aria-label="Cerrar" onClick={cerrar}><X size={18} aria-hidden="true" /></button>
        </div>
        <div className="em-modal-body ev-cuerpo">
          <p className="em-hint">{contexto.subjectName} · {contexto.courseName} · {contexto.termName}. Las ven el alumno y su familia apenas se guardan.</p>

          <div className="em-field">
            <label htmlFor="ev-nombre">Título</label>
            <input id="ev-nombre" ref={tituloRef} type="text" maxLength={120} value={titulo}
              placeholder="Prueba escrita: ángulos"
              onChange={e => { setTitulo(e.target.value); setSucio(true); }} />
          </div>
          <div className="em-row">
            <div className="em-field">
              <label htmlFor="ev-tipo">Tipo</label>
              <select id="ev-tipo" className="form-select" value={tipo}
                onChange={e => elegirTipo(e.target.value as TipoEvaluacion)}>
                {(Object.entries(TIPOS_EVALUACION) as [TipoEvaluacion, { label: string; emoji: string }][]).map(([v, m]) => (
                  <option key={v} value={v}>{m.emoji} {m.label}</option>
                ))}
              </select>
            </div>
            <div className="em-field">
              <label htmlFor="ev-fecha">Fecha</label>
              <input id="ev-fecha" type="date" value={fecha} min={contexto.termStartsOn} max={contexto.termEndsOn}
                onChange={e => { setFecha(e.target.value); setSucio(true); }} />
            </div>
          </div>

          <fieldset className="ev-escala">
            <legend>Cómo se registra</legend>
            <label>
              <input type="radio" name="ev-escala" checked={escala === 'nota'}
                onChange={() => { void cambiarEscala('nota'); }} />
              Con nota (1 a 10)
            </label>
            <label>
              <input type="radio" name="ev-escala" checked={escala === 'cumplimiento'}
                onChange={() => { void cambiarEscala('cumplimiento'); }} />
              Sin nota: completo, incompleto o no lo entregó
            </label>
          </fieldset>

          <div className={`ev-lista ${escala === 'cumplimiento' ? 'con-marcas' : ''}`} role="group" aria-label="Lo de cada alumno">
            <div className="ev-lista-cabecera">
              <span>Alumno</span>
              <span>{escala === 'nota' ? 'Nota (1 a 10)' : 'Cómo lo entregó'}</span>
              <span>Ausente</span>
            </div>
            {alumnos.map((a, idx) => {
              const ausente = ausentes.has(a.studentId);
              const v = valores[a.studentId] ?? '';
              const mala = escala === 'nota' && !ausente && Number.isNaN(leerNota(v) as number);
              const nombre = `${a.firstName} ${a.lastName}`;
              return (
                <div key={a.studentId} className={`ev-fila ${ausente ? 'ausente' : ''}`}>
                  <span className="ev-nombre">
                    {a.lastName}, {a.firstName}
                    {!conComentario.has(a.studentId) && (
                      <button type="button" className="ev-com-abrir" onClick={() => abrirComentario(a.studentId)}
                        aria-label={`Agregar un comentario para ${nombre}`} title="Agregar un comentario (lo ven el alumno y su familia)">
                        <MessageSquarePlus size={14} aria-hidden="true" />
                      </button>
                    )}
                  </span>
                  {escala === 'nota' ? (
                    <input
                      className={`ev-nota ${mala ? 'mala' : ''}`}
                      inputMode="decimal"
                      maxLength={5}
                      value={ausente ? '' : v}
                      placeholder={ausente ? 'A' : '—'}
                      disabled={ausente}
                      data-nota-idx={idx}
                      aria-label={`Nota de ${nombre}`}
                      aria-invalid={mala}
                      onChange={e => cambiarNota(a.studentId, e.target.value)}
                      onKeyDown={e => alTeclear(e, idx)}
                    />
                  ) : (
                    <span className="ev-marcas" role="group" aria-label={`Cómo lo entregó ${nombre}`}>
                      {(Object.keys(MARCAS) as MarcaCumplimiento[]).map(m => (
                        <button key={m} type="button" aria-pressed={marcas[a.studentId] === m}
                          className={`ev-marca ${m} ${marcas[a.studentId] === m ? 'elegida' : ''}`}
                          disabled={ausente}
                          title={MARCAS[m].label}
                          aria-label={MARCAS[m].label}
                          onClick={() => cambiarMarca(a.studentId, m)}>
                          {MARCAS[m].simbolo}
                        </button>
                      ))}
                    </span>
                  )}
                  <label className="ev-ausente">
                    <input type="checkbox" checked={ausente} onChange={() => alternarAusente(a.studentId)}
                      aria-label={`${nombre} estuvo ausente`} />
                  </label>
                  {conComentario.has(a.studentId) && (
                    <input
                      id={`ev-com-${a.studentId}`}
                      className="ev-comentario"
                      type="text"
                      maxLength={200}
                      value={comentarios[a.studentId] ?? ''}
                      placeholder="Comentario (lo ven el alumno y su familia)"
                      aria-label={`Comentario para ${nombre}`}
                      onChange={e => cambiarComentario(a.studentId, e.target.value)}
                    />
                  )}
                </div>
              );
            })}
          </div>

          {error && <p className="em-error" role="alert">{error}</p>}
        </div>
        <div className="em-modal-footer ev-pie">
          {evaluacion && (
            <button type="button" className="btn btn-ghost btn-sm ev-borrar" onClick={borrar} disabled={guardando}>
              <Trash2 size={14} aria-hidden="true" /> Borrar
            </button>
          )}
          <span className="ev-cuenta">{conNota} {escala === 'nota' ? 'con nota' : 'anotados'} · {ausentes.size} ausente{ausentes.size !== 1 ? 's' : ''}</span>
          <button type="button" className="btn btn-outline btn-sm" onClick={cerrar} disabled={guardando}>Cancelar</button>
          <button type="button" className="btn btn-primary btn-sm" onClick={guardar} disabled={guardando}>
            {guardando ? <Loader2 size={14} className="spin" aria-hidden="true" /> : <Save size={14} aria-hidden="true" />}
            {guardando ? 'Guardando…' : 'Guardar notas'}
          </button>
        </div>
      </div>
    </Dialogo>
  );
}
