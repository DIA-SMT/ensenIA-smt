/**
 * Resumen de una clase en vivo (docente): se abre al terminarla y desde
 * "Clases anteriores". Qué se vio, quiénes participaron, cómo le fue al
 * curso en cada pregunta, el ambiente y las medallas. Y un informe escrito
 * por la IA a partir de esos números, que queda guardado en la clase.
 */

import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Sparkles, Loader2, Copy, Check, Users, ClipboardList, Medal, Clock, Smile, ListChecks, RotateCcw, MessageCircleQuestion } from 'lucide-react';
import {
  getLiveSessionSummary, saveLiveSessionReport, getMaterialesDeClase, getLiveSession, getPreguntasDeLaClase,
  getPreguntasDelPublico, type PreguntaPublico,
  LIVE_KIND_META, LIVE_REACTIONS,
  type ResumenClase as Datos, type MaterialEnLista, type LiveSession,
} from '../services/live.service';
import { classReport } from '../services/documents.service';
import { createActivity } from '../services/activities.service';
import { useAuth } from '../contexts/AuthContext';
import type { ActivityQuestion } from '../types';
import MarkdownRenderer from './MarkdownRenderer';
import EstadoVacio from './ui/EstadoVacio';
import { Esqueleto } from './ui/Esqueleto';
import { avisar } from './ui/avisar';
import { AWARD_META, FEELING_META, type CheckinFeeling } from '../types';
import './ResumenClase.css';

const sinTildes = (t: string) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const escapar = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const pct = (n: number, de: number) => (de > 0 ? Math.round((n / de) * 100) : 0);

const fecha = (iso: string) =>
  new Date(iso).toLocaleString('es-AR', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });

/**
 * Los números de la clase en texto, para que la IA escriba el informe.
 * Sin nombres: cada chico va como "Estudiante N" (los nombres de menores no
 * salen de la escuela); `ponerNombres` los devuelve al informe que vuelve.
 */
function datosParaInforme(d: Datos, materiales: MaterialEnLista[]): { texto: string; ponerNombres: (informe: string) => string } {
  const t = d.totales;
  const l: string[] = [];
  const codigos = new Map<string, string>();
  d.alumnos.forEach((s, i) => codigos.set(`Estudiante ${i + 1}`, s.nombre));

  /**
   * Los nombres que se cuelan en lo que escribió el docente (una pregunta
   * dirigida, "Lu, ¿cómo estás?"; un título): se cambian por el código.
   * Siempre el nombre completo; nombre y apellido sueltos, solo en las
   * dirigidas (en otro texto, "Rosa" o "Flores" pueden ser otra cosa).
   */
  const sinNombres = (texto: string, sueltos = false) => {
    let out = texto;
    d.alumnos.forEach((s, i) => {
      const partes = s.nombre.split(/\s+/).filter(x => x.length >= 3);
      const variantes = [s.nombre, ...(sueltos ? partes : [])];
      for (const v of variantes) {
        // Con o sin tildes ("Sofía" y "Sofia")
        const patron = sinTildes(v).split('').map(c => {
          const con = { a: '[aá]', e: '[eé]', i: '[ií]', o: '[oó]', u: '[uúü]', n: '[nñ]' }[c.toLowerCase()];
          return con ?? escapar(c);
        }).join('');
        out = out.replace(new RegExp(`(^|[^\\p{L}])${patron}(?![\\p{L}])`, 'giu'), (_m, antes: string) => `${antes}Estudiante ${i + 1}`);
      }
      // En una dirigida, también el apodo que es el comienzo del nombre ("Sofi" por "Sofía")
      if (sueltos) {
        const bases = partes.map(x => sinTildes(x).toLowerCase());
        out = out.replace(/\p{L}{4,}/gu, w => (bases.some(b => b.startsWith(sinTildes(w).toLowerCase())) ? `Estudiante ${i + 1}` : w));
      }
    });
    return out;
  };

  l.push(`Clase: ${sinNombres(d.sesion.titulo)}. Duración: ${d.sesion.minutos} minutos.`);
  if (materiales.length > 1) {
    l.push(`Materiales que se usaron: ${materiales.map(m => `${sinNombres(m.titulo)} (${m.detalle})`).join('; ')}.`);
  } else if (d.material) {
    l.push(`Material: ${sinNombres(d.material.titulo)}${d.material.unidad ? ` (${d.material.unidad})` : ''}.`);
  }
  l.push(`Estudiantes del curso: ${t.curso}. Se conectaron: ${t.conectados}. Participaron (respondieron algo): ${t.participaron}.`);
  if (t.invitados) l.push(`Invitados sin cuenta: ${t.invitados}.`);
  l.push('', 'Actividades:');
  if (d.actividades.length === 0) l.push('- No se lanzaron actividades.');
  for (const a of d.actividades) {
    const tipo = LIVE_KIND_META[a.tipo]?.label ?? a.tipo;
    const pregunta = a.pregunta ? sinNombres(a.pregunta, a.dirigida) : '';
    let x = `- ${tipo}${pregunta ? `: "${pregunta}"` : ''}. Respondieron ${a.respondieron}.`;
    if (a.aciertos != null) x += ` Acertaron ${a.aciertos}${a.correcta ? ` (correcta: "${a.correcta}")` : ''}.`;
    if (a.dirigida) x += ' (pregunta para un solo estudiante)';
    if (a.grupal) x += ' (por grupos)';
    l.push(x);
  }
  l.push('', 'Por estudiante (cada uno con un código: usalo tal cual, "Estudiante N", sin inventar nombres):');
  d.alumnos.forEach((s, i) => {
    l.push(`- Estudiante ${i + 1}: ${s.conectado ? 'conectado' : 'no se conectó'}, ${s.respuestas} respuestas` +
      (s.preguntas ? `, ${s.aciertos}/${s.preguntas} aciertos` : '') +
      (s.medallas ? `, ${s.medallas} medalla(s)` : '') + '.');
  });
  if (d.animo.length) {
    l.push('', `Check-in de ánimo: ${d.animo.map(a => `${FEELING_META[a.estado as CheckinFeeling]?.label ?? a.estado} ${a.n}`).join(', ')}.`);
  }
  if (d.reacciones.length) {
    l.push(`Emojis: ${d.reacciones.map(r => `${r.emoji} (${LIVE_REACTIONS.find(x => x.emoji === r.emoji)?.label ?? ''}) ${r.n}`).join(', ')}.`);
  }
  if (d.medallas.length) {
    l.push(`Medallas dadas: ${d.medallas.map(m => `${AWARD_META[m.medalla]?.label ?? m.medalla} ${m.n}`).join(', ')}.`);
  }
  // "Estudiante 3", "estudiante 3", "Estudiantes 3 y 5", "Estudiantes 2, 4 y 7"
  const ponerNombres = (informe: string) =>
    informe.replace(/estudiantes?\s+(\d+(?:\s*(?:,|y|e)\s*\d+)*)/giu, (_todo, lista: string) =>
      lista.replace(/\d+/g, n => codigos.get(`Estudiante ${n}`) ?? `Estudiante ${n}`));
  return { texto: l.join('\n'), ponerNombres };
}

/**
 * Las preguntas rápidas de la clase como partes de una actividad de repaso:
 * primero las que más costaron. Sin las dirigidas a un solo estudiante ni
 * las repetidas. Cada una se empareja con su resultado del resumen por el
 * texto de la pregunta (sin resultado: va al final).
 */
function partesDeRepaso(
  preguntas: Awaited<ReturnType<typeof getPreguntasDeLaClase>>,
  quizDelResumen: Datos['actividades'],
): ActivityQuestion[] {
  const vistas = new Set<string>();
  const usados = new Set<number>();
  return preguntas
    .map(p => {
      const texto = p.config.question?.trim() ?? '';
      const i = quizDelResumen.findIndex((r, j) => !usados.has(j) && (r.pregunta ?? '').trim() === texto);
      if (i >= 0) usados.add(i);
      const r = i >= 0 ? quizDelResumen[i] : null;
      const tasa = r && r.respondieron > 0 && r.aciertos != null ? r.aciertos / r.respondieron : 1;
      return { p, tasa };
    })
    .filter(({ p }) => {
      const pregunta = p.config.question?.trim() ?? '';
      const opciones = p.config.options ?? [];
      const clave = pregunta.toLowerCase();
      if (!pregunta || p.targetStudentId || opciones.length < 2 || vistas.has(clave)) return false;
      if (!opciones.some(o => o.id === p.config.correctId)) return false;
      vistas.add(clave);
      return true;
    })
    .sort((a, b) => a.tasa - b.tasa)
    .map(({ p }, i) => {
      const opciones = p.config.options ?? [];
      return {
        id: `q${i + 1}`,
        type: 'multiple_choice' as const,
        prompt: p.config.question!.trim(),
        options: opciones.map(o => o.label),
        correct_index: opciones.findIndex(o => o.id === p.config.correctId),
      };
    });
}

/** ¿Fue hoy? (la asistencia es del día) */
const esHoy = (iso: string) => new Date(iso).toDateString() === new Date().toDateString();

export default function ResumenClase({ sessionId, onVolver }: { sessionId: string; onVolver: () => void }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  // La clase (materia, curso, tema): para pasar lista y armar el repaso
  const [sesion, setSesion] = useState<LiveSession | null>(null);
  const [armandoRepaso, setArmandoRepaso] = useState(false);
  const [datos, setDatos] = useState<Datos | null | undefined>(undefined);
  const [error, setError] = useState('');
  const [informe, setInforme] = useState<string | null>(null);
  const [generando, setGenerando] = useState(false);
  const [errorInforme, setErrorInforme] = useState('');
  const [copiado, setCopiado] = useState(false);
  // Todos los materiales de la clase (049); con uno solo alcanza con datos.material
  const [materiales, setMateriales] = useState<MaterialEnLista[]>([]);
  // Preguntas del público (074) que quedaron sin responder: para arrancar la próxima
  const [sinResponder, setSinResponder] = useState<PreguntaPublico[]>([]);
  // El resumen aparece en la misma pantalla que estaba proyectada: los nombres, a pedido
  const [verAutores, setVerAutores] = useState(false);

  useEffect(() => {
    let cancelado = false;
    getMaterialesDeClase(sessionId).then(m => { if (!cancelado) setMateriales(m); }).catch(console.error);
    getLiveSession(sessionId).then(s => { if (!cancelado) setSesion(s); }).catch(console.error);
    getPreguntasDelPublico(sessionId)
      .then(p => { if (!cancelado) setSinResponder(p.lista.filter(x => x.estado !== 'respondida')); })
      .catch(() => { /* sin la 074, o sin señal: el resumen sigue */ });
    getLiveSessionSummary(sessionId)
      .then(d => { if (cancelado) return; setDatos(d); setInforme(d?.sesion.ai_summary ?? null); })
      .catch(err => { if (!cancelado) { setDatos(null); setError(err instanceof Error ? err.message : 'No se pudo cargar el resumen.'); } });
    return () => { cancelado = true; };
  }, [sessionId]);

  const generar = async () => {
    if (!datos || generando) return;
    setGenerando(true);
    setErrorInforme('');
    try {
      const { texto: pedido, ponerNombres } = datosParaInforme(datos, materiales);
      const texto = ponerNombres(await classReport(pedido));
      setInforme(texto);
      await saveLiveSessionReport(sessionId, texto).catch(err => {
        console.error(err);
        avisar.info('El informe está listo, pero no se pudo guardar en la clase.', 'Copialo si lo querés conservar.');
      });
    } catch (err) {
      setErrorInforme(err instanceof Error ? err.message : 'No se pudo escribir el informe.');
    } finally {
      setGenerando(false);
    }
  };

  /** Un borrador con las preguntas de la clase; se abre para revisarlo y publicarlo */
  const armarRepaso = async () => {
    if (!datos || !sesion || !user || armandoRepaso) return;
    setArmandoRepaso(true);
    try {
      const partes = partesDeRepaso(
        await getPreguntasDeLaClase(sessionId),
        datos.actividades.filter(a => a.tipo === 'quiz'),
      );
      if (partes.length === 0) {
        avisar.info('No hay preguntas para armar el repaso', 'Hacen falta preguntas rápidas con su respuesta correcta.');
        return;
      }
      const sobre = datos.material?.tipo === 'tema' ? datos.material.titulo : datos.sesion.titulo;
      const dia = new Date(datos.sesion.inicio).toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' });
      const act = await createActivity({
        title: `Repaso: ${sobre}`.slice(0, 120),
        contentMd: `Las preguntas de la clase del ${dia}, para repasar. Primero van las que más costaron.`,
        questions: partes,
        subjectId: sesion.subjectId,
        courseId: sesion.courseId,
        teacherId: user.id,
        schoolId: sesion.schoolId,
        classId: sesion.classId,
        tipo: 'actividad',
        estado: 'draft',
      });
      avisar.exito('Repaso armado', 'Quedó como borrador: revisalo, sumale lo que quieras y publicalo.');
      navigate(`/actividades/${act.id}/editar`);
    } catch (err) {
      console.error(err);
      avisar.error('No se pudo armar el repaso.', 'Probá de nuevo en un rato.');
    } finally {
      setArmandoRepaso(false);
    }
  };

  const copiar = async () => {
    if (!informe) return;
    try {
      await navigator.clipboard.writeText(informe);
      setCopiado(true);
      window.setTimeout(() => setCopiado(false), 2000);
      avisar.exito('Informe copiado', 'Ya lo podés pegar donde quieras.');
    } catch {
      avisar.error('No se pudo copiar el informe.', 'Seleccioná el texto y copialo a mano.');
    }
  };

  if (datos === undefined) {
    return <div className="cv-container"><Esqueleto tipo="tarjetas" cantidad={4} etiqueta="Armando el resumen…" /></div>;
  }
  if (!datos) {
    return (
      <div className="cv-container rc">
        <button type="button" className="btn btn-ghost btn-sm rc-volver" onClick={onVolver}><ArrowLeft size={15} /> Volver</button>
        <p className="text-danger text-sm">{error || 'No se encontró esa clase.'}</p>
      </div>
    );
  }

  const t = datos.totales;
  const noParticiparon = datos.alumnos.filter(a => a.respuestas === 0);

  return (
    <div className="cv-container rc">
      <button type="button" className="btn btn-ghost btn-sm rc-volver" onClick={onVolver}>
        <ArrowLeft size={15} aria-hidden="true" /> Volver a Clase en vivo
      </button>

      <header className="card rc-head">
        <span className="rc-etiqueta">Resumen de la clase</span>
        <h2>{datos.sesion.titulo}</h2>
        <p className="text-secondary text-sm">
          <Clock size={13} aria-hidden="true" /> {fecha(datos.sesion.inicio)} · {datos.sesion.minutos} min
        </p>
        {materiales.length > 1 ? (
          <p className="text-sm rc-material">
            📖 {materiales.length} materiales: {materiales.map(m => m.titulo).join(' · ')}
          </p>
        ) : datos.material && (
          <p className="text-sm rc-material">
            📖 {datos.material.titulo}{datos.material.unidad ? ` · ${datos.material.unidad}` : ''}
          </p>
        )}
      </header>

      <section className="rc-tiles" aria-label="En números">
        <div className="card rc-tile">
          <span className="rc-tile-label"><Users size={14} aria-hidden="true" /> Participaron</span>
          <strong>{t.participaron}/{t.curso}</strong>
          <span className="rc-tile-sub">{pct(t.participaron, t.curso)}% del curso</span>
        </div>
        <div className="card rc-tile">
          <span className="rc-tile-label">Se conectaron</span>
          <strong>{t.conectados}/{t.curso}</strong>
          <span className="rc-tile-sub">{t.invitados ? `+ ${t.invitados} invitado${t.invitados !== 1 ? 's' : ''}` : 'en sus celulares'}</span>
        </div>
        <div className="card rc-tile">
          <span className="rc-tile-label"><ClipboardList size={14} aria-hidden="true" /> Actividades</span>
          <strong>{t.actividades}</strong>
          <span className="rc-tile-sub">lanzadas</span>
        </div>
        <div className="card rc-tile">
          <span className="rc-tile-label"><Medal size={14} aria-hidden="true" /> Medallas</span>
          <strong>{t.medallas}</strong>
          <span className="rc-tile-sub">{datos.medallas.map(m => AWARD_META[m.medalla]?.emoji ?? '🏅').join(' ') || 'ninguna'}</span>
        </div>
      </section>

      {/* Qué sigue (fase 5, parte 4): lo que el docente hace después de la clase */}
      {sesion && (
        <section className="card rc-bloque rc-sigue" aria-labelledby="rc-sigue">
          <h3 id="rc-sigue">Qué sigue</h3>
          <div className="rc-sigue-acciones">
            {esHoy(datos.sesion.inicio) && (
              <Link to={`/asistencia?curso=${sesion.courseId}&materia=${sesion.subjectId}`} className="rc-sigue-item">
                <ListChecks size={18} aria-hidden="true" />
                <span>
                  <strong>Pasar asistencia de hoy</strong>
                  {/* La lista marca a los que respondieron o mandaron un emoji hoy (sin número
                      acá: esa cuenta suma todas las clases del día y no coincidiría) */}
                  <small>{t.participaron > 0
                    ? 'En la lista vas a ver quiénes participaron desde el celular. Ojo: alguien pudo hacerlo sin estar en el aula, y otro estar sin celular.'
                    : 'Nadie participó desde el celular: pasala como siempre.'}</small>
                </span>
              </Link>
            )}
            {datos.actividades.some(a => a.tipo === 'quiz' && !a.dirigida) ? (
              <button type="button" className="rc-sigue-item" onClick={() => void armarRepaso()} disabled={armandoRepaso}>
                {armandoRepaso ? <Loader2 size={18} className="spin" aria-hidden="true" /> : <RotateCcw size={18} aria-hidden="true" />}
                <span>
                  <strong>{armandoRepaso ? 'Armando el repaso…' : 'Armar un repaso con estas preguntas'}</strong>
                  <small>Una actividad para el celular con las preguntas de hoy, primero las que más costaron. Queda como borrador.</small>
                </span>
              </button>
            ) : sesion.classId && (
              <Link to={`/actividades/nueva?tipo=actividad&tema=${sesion.classId}`} className="rc-sigue-item">
                <RotateCcw size={18} aria-hidden="true" />
                <span>
                  <strong>Armar una actividad de repaso</strong>
                  <small>Del tema de la clase, con la IA o a mano. Queda como borrador.</small>
                </span>
              </Link>
            )}
          </div>
        </section>
      )}

      {sinResponder.length > 0 && (
        <section className="card rc-bloque" aria-labelledby="rc-preguntas">
          <h3 id="rc-preguntas"><MessageCircleQuestion size={16} aria-hidden="true" /> Preguntas que quedaron sin responder</h3>
          <p className="text-sm text-secondary">Las del público que no marcaste como respondidas, de la más votada a la menos. Sirven para arrancar la próxima clase.</p>
          <label className="rc-ver-autores">
            <input type="checkbox" checked={verAutores} onChange={e => setVerAutores(e.target.checked)} /> Ver quién preguntó
          </label>
          {sinResponder.some(p => p.estado === 'visible') && (
            <ol className="rc-preguntas">
              {sinResponder.filter(p => p.estado === 'visible').map(p => (
                <li key={p.id}>
                  <span className="rc-pregunta-votos" aria-label={`${p.votos} votos`}>▲ {p.votos}</span>
                  <span className="rc-pregunta-texto">{p.texto}{verAutores && p.autor && <small>{p.autor}</small>}</span>
                </li>
              ))}
            </ol>
          )}
          {sinResponder.some(p => p.estado === 'pendiente') && (
            <details className="rc-sin-revisar">
              <summary>Quedaron sin revisar ({sinResponder.filter(p => p.estado === 'pendiente').length}): nadie más las vio</summary>
              <ol className="rc-preguntas">
                {sinResponder.filter(p => p.estado === 'pendiente').map(p => (
                  <li key={p.id}>
                    <span className="rc-pregunta-texto">{p.texto}{verAutores && p.autor && <small>{p.autor}</small>}</span>
                  </li>
                ))}
              </ol>
            </details>
          )}
        </section>
      )}

      <section className="card rc-bloque" aria-labelledby="rc-informe">
        <div className="rc-bloque-head">
          <h3 id="rc-informe"><Sparkles size={16} aria-hidden="true" /> Informe de la clase</h3>
          <div className="rc-acciones">
            {informe && (
              <button type="button" className="btn btn-ghost btn-sm" onClick={copiar}>
                {copiado ? <Check size={14} /> : <Copy size={14} />} {copiado ? 'Copiado' : 'Copiar'}
              </button>
            )}
            <button type="button" className="btn btn-secondary btn-sm" onClick={generar} disabled={generando}>
              {generando ? <Loader2 size={14} className="spin" /> : <Sparkles size={14} />}
              {generando ? 'Escribiendo…' : informe ? 'Volver a escribir' : 'Escribir con IA'}
            </button>
          </div>
        </div>
        {informe
          ? <div className="rc-informe"><MarkdownRenderer content={informe} /></div>
          : !generando && <p className="text-secondary text-sm">La IA arma un informe corto con lo que se vio, la participación, qué quedó claro y qué retomar, el ambiente y sugerencias para la próxima clase. Usa solo estos datos.</p>}
        {errorInforme && <p className="text-sm text-danger" role="alert">{errorInforme}</p>}
      </section>

      <section className="card rc-bloque" aria-labelledby="rc-ambiente">
        <h3 id="rc-ambiente">Ambiente</h3>
        {datos.animo.length === 0 && datos.reacciones.length === 0 && (
          <EstadoVacio compacto icono={Smile} titulo="Sin check-in ni emojis" texto="En esta clase no se usó el check-in de ánimo ni la botonera de emojis." />
        )}
        {datos.animo.length > 0 && (
          <div className="rc-chips" aria-label="Cómo venían (check-in)">
            {datos.animo.map(a => {
              const m = FEELING_META[a.estado as CheckinFeeling];
              return <span key={a.estado} className="rc-chip">{m?.emoji ?? '•'} {m?.label ?? a.estado} <strong>{a.n}</strong></span>;
            })}
          </div>
        )}
        {datos.reacciones.length > 0 && (
          <div className="rc-chips" aria-label="Emojis">
            {datos.reacciones.map(r => {
              const m = LIVE_REACTIONS.find(x => x.emoji === r.emoji);
              return <span key={r.emoji} className={`rc-chip ${m?.alert ? 'alerta' : ''}`}>{r.emoji} {m?.label ?? ''} <strong>{r.n}</strong></span>;
            })}
          </div>
        )}
      </section>

      <section className="card rc-bloque" aria-labelledby="rc-actividades">
        <h3 id="rc-actividades">Actividades</h3>
        {datos.actividades.length === 0 ? (
          <EstadoVacio compacto icono={ClipboardList} titulo="No se lanzaron actividades" texto="En la próxima clase podés lanzar una pregunta, una encuesta o una nube de palabras." />
        ) : (
          <ol className="rc-actividades">
            {datos.actividades.map(a => (
              <li key={a.orden}>
                <span className="rc-act-tipo">{LIVE_KIND_META[a.tipo]?.emoji} {LIVE_KIND_META[a.tipo]?.label}</span>
                {a.pregunta && <span className="rc-act-pregunta">{a.pregunta}</span>}
                <span className="rc-act-datos">
                  {a.respondieron} respondi{a.respondieron === 1 ? 'ó' : 'eron'}
                  {a.aciertos != null && <> · <strong>{a.aciertos} acert{a.aciertos === 1 ? 'ó' : 'aron'}</strong> ({pct(a.aciertos, a.respondieron)}%)</>}
                  {a.correcta && <> · correcta: “{a.correcta}”</>}
                </span>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section className="card rc-bloque" aria-labelledby="rc-alumnos">
        <h3 id="rc-alumnos">Estudiantes</h3>
        {noParticiparon.length > 0 && datos.alumnos.length > 0 && (
          <p className="rc-nota">
            <strong>No participaron ({noParticiparon.length}):</strong> {noParticiparon.map(a => a.nombre).join(', ')}.
          </p>
        )}
        {datos.alumnos.length === 0 ? (
          <EstadoVacio compacto icono={Users} titulo="El curso todavía no tiene estudiantes" texto="Cuando la escuela los cargue, vas a ver acá cómo participó cada uno." />
        ) : (
          <div className="rc-tabla-wrap">
            <table className="rc-tabla">
              <thead><tr><th>Estudiante</th><th>Conectado</th><th>Respuestas</th><th>Aciertos</th><th>Medallas</th></tr></thead>
              <tbody>
                {datos.alumnos.map(a => (
                  <tr key={a.id} className={a.respuestas === 0 ? 'rc-sin' : ''}>
                    <td>{a.nombre}</td>
                    <td>{a.conectado ? 'Sí' : 'No'}</td>
                    <td>{a.respuestas}</td>
                    <td>{a.preguntas ? `${a.aciertos}/${a.preguntas}` : '—'}</td>
                    <td>{a.medallas || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
