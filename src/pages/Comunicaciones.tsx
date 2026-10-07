/**
 * Comunicaciones de la dirección: un solo lugar para escribirle a docentes,
 * estudiantes y familias — a toda la escuela, a un curso o a una persona.
 *
 * Por debajo son dos sistemas (059): los comunicados del equipo y de los
 * estudiantes (communications, con audiencia y curso) y los avisos a las
 * familias (guardian_notices, también por curso). Acá se ven juntos, cada
 * uno con quién lo leyó. Las citaciones a una familia siguen en Familias.
 */

import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Send, Users, User as UserIcon, Clock, ChevronRight, MessageSquare, Plus, Loader2, GraduationCap, HeartHandshake, School } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { getCommunicationsBySchool, sendCommunication } from '../services/communications.service';
import { createNotice, getNoticesForStaff } from '../services/guardians.service';
import { getTeacherUsers } from '../services/profiles.service';
import { getCourses } from '../services/subjects.service';
import { getAllStudents } from '../services/students.service';
import { avisar } from '../components/ui/avisar';
import { Esqueleto } from '../components/ui/Esqueleto';
import EstadoVacio from '../components/ui/EstadoVacio';
import type { Communication, Course, GuardianNotice, NoticeReceipt, NotificationPriority, Student, User } from '../types';
import '../components/ui/ui.css';
import './Comunicaciones.css';

type Audiencia = 'docentes' | 'estudiantes' | 'familias';
type Alcance = 'escuela' | 'curso' | 'persona';

const AUDIENCIAS: { id: Audiencia; etiqueta: string; icono: typeof Users }[] = [
  { id: 'docentes', etiqueta: 'Docentes', icono: Users },
  { id: 'estudiantes', etiqueta: 'Estudiantes', icono: GraduationCap },
  { id: 'familias', etiqueta: 'Familias', icono: HeartHandshake },
];

const priorityLabels: Record<NotificationPriority, string> = { high: 'Alta', medium: 'Media', low: 'Baja' };
const priorityBadgeClass: Record<NotificationPriority, string> = { high: 'badge-danger', medium: 'badge-warning', low: 'badge-neutral' };

/** Un elemento de la lista: comunicado (equipo/estudiantes) o aviso a familias. */
type Item =
  | { tipo: 'com'; id: string; fecha: string; c: Communication }
  | { tipo: 'fam'; id: string; fecha: string; n: GuardianNotice & { receipts: NoticeReceipt[] } };

const fechaCorta = (iso: string) => new Date(iso).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' });

export default function Comunicaciones() {
  const { user } = useAuth();
  const [seleccion, setSeleccion] = useState<Item | null>(null);
  const [composing, setComposing] = useState(false);
  const [items, setItems] = useState<Item[]>([]);
  const [teachers, setTeachers] = useState<User[]>([]);
  const [cursos, setCursos] = useState<Course[]>([]);
  const [estudiantes, setEstudiantes] = useState<Student[]>([]);
  const [cargando, setCargando] = useState(true);
  const [enviando, setEnviando] = useState(false);

  // Formulario
  const [para, setPara] = useState<Set<Audiencia>>(new Set(['docentes']));
  const [alcance, setAlcance] = useState<Alcance>('escuela');
  const [cursoId, setCursoId] = useState('');
  const [personaId, setPersonaId] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [priority, setPriority] = useState<NotificationPriority>('medium');

  const cargarLista = async (schoolId: string) => {
    const [coms, avisos] = await Promise.all([
      getCommunicationsBySchool(schoolId),
      getNoticesForStaff().catch(() => []),
    ]);
    const lista: Item[] = [
      ...coms.map(c => ({ tipo: 'com' as const, id: `c-${c.id}`, fecha: c.sentAt, c })),
      // Las citaciones van en Familias: acá, los comunicados de la dirección
      ...avisos.filter(n => n.type === 'comunicado' && n.schoolId === schoolId)
        .map(n => ({ tipo: 'fam' as const, id: `f-${n.id}`, fecha: n.createdAt, n })),
    ].sort((a, b) => b.fecha.localeCompare(a.fecha));
    setItems(lista);
  };

  useEffect(() => {
    if (!user) return;
    cargarLista(user.schoolId).catch(console.error).finally(() => setCargando(false));
    getTeacherUsers(user.schoolId).then(setTeachers).catch(console.error);
    getCourses(user.schoolId).then(setCursos).catch(console.error);
    getAllStudents(user.schoolId).then(setEstudiantes).catch(console.error);
  }, [user]);

  if (!user) return null;

  const unaSola = para.size === 1 ? [...para][0] : null;
  // "Una persona" solo tiene sentido con una sola audiencia
  const alcanceEfectivo: Alcance = alcance === 'persona' && !unaSola ? 'escuela' : alcance;
  const conCuenta = estudiantes.filter(s => s.userId);

  const alternar = (a: Audiencia) => setPara(prev => {
    const next = new Set(prev);
    if (next.has(a)) { if (next.size > 1) next.delete(a); } else next.add(a);
    return next;
  });

  const listo = subject.trim() && body.trim()
    && (alcanceEfectivo !== 'curso' || cursoId)
    && (alcanceEfectivo !== 'persona' || personaId);

  const destinoTexto = () => {
    const quienes = [...para].map(a => AUDIENCIAS.find(x => x.id === a)!.etiqueta.toLowerCase()).join(', ').replace(/, ([^,]*)$/, ' y $1');
    if (alcanceEfectivo === 'curso') return `A ${quienes} de ${cursos.find(c => c.id === cursoId)?.name ?? 'ese curso'}`;
    if (alcanceEfectivo === 'persona') return 'A la persona elegida';
    return `A ${quienes} de toda la escuela`;
  };

  function escribir() {
    setComposing(true);
    setSeleccion(null);
  }

  async function handleSend() {
    if (!user || enviando || !listo) return;
    setEnviando(true);
    const hechos: string[] = [];
    const fallidos: string[] = [];
    const curso = alcanceEfectivo === 'curso' ? cursoId : null;
    for (const a of para) {
      try {
        if (a === 'familias') {
          await createNotice({
            schoolId: user.schoolId,
            fromUserId: user.id,
            type: 'comunicado',
            title: subject,
            body,
            studentId: alcanceEfectivo === 'persona' ? personaId : null,
            courseId: curso,
          });
        } else {
          let destinatarios: string[] | 'all' = 'all';
          if (alcanceEfectivo === 'persona') {
            const uid = a === 'docentes' ? personaId : estudiantes.find(s => s.id === personaId)?.userId;
            if (!uid) throw new Error('sin cuenta');
            destinatarios = [uid];
          }
          await sendCommunication({
            fromUserId: user.id, subject, body, priority, schoolId: user.schoolId,
            toUserIds: destinatarios, audiencia: a, courseId: curso,
          });
        }
        hechos.push(AUDIENCIAS.find(x => x.id === a)!.etiqueta);
      } catch (err) {
        console.error(a, err);
        fallidos.push(AUDIENCIAS.find(x => x.id === a)!.etiqueta);
      }
    }
    await cargarLista(user.schoolId).catch(console.error);
    setEnviando(false);
    if (fallidos.length === 0) {
      avisar.exito('Comunicado enviado', destinoTexto());
      setComposing(false);
      setSubject('');
      setBody('');
    } else if (hechos.length) {
      // Lo que salió, salió: se dice qué falta para no mandarlo dos veces
      avisar.error(`Le llegó a: ${hechos.join(', ')}. No se pudo mandar a: ${fallidos.join(', ')}.`, 'Para reintentar, dejá marcado solo lo que faltó.');
      setPara(new Set(fallidos.map(f => AUDIENCIAS.find(x => x.etiqueta === f)!.id)));
    } else {
      avisar.error('No se pudo enviar el comunicado.', 'Lo que escribiste sigue ahí. Revisá la conexión y probá de nuevo.');
    }
  }

  /** Cuántos debían leerlo: para "leído por X de N". */
  const totalDestino = (c: Communication): number | null => {
    if (c.toUserIds !== 'all') return c.toUserIds.length;
    if (c.audiencia === 'estudiantes') return conCuenta.filter(s => !c.courseId || s.courseId === c.courseId).length;
    return c.courseId ? teachers.filter(t => t.subjects?.some(sa => sa.courseId === c.courseId)).length : teachers.length;
  };

  const iconoDe = (it: Item) => it.tipo === 'fam' ? <HeartHandshake size={16} />
    : it.c.toUserIds !== 'all' ? <UserIcon size={16} />
    : it.c.audiencia === 'estudiantes' ? <GraduationCap size={16} /> : <Users size={16} />;

  const paraDe = (it: Item) => it.tipo === 'com' ? it.c.toNames.join(', ')
    : it.n.studentName ? `Familia de ${it.n.studentName}` : it.n.courseName ? `Familias de ${it.n.courseName}` : 'Todas las familias';

  return (
    <div className="comms-container">
      {/* Izquierda: lo enviado */}
      <div className="card comms-list-panel">
        <div className="comms-list-header">
          <h3 aria-level={2}>Comunicaciones</h3>
          <button type="button" className="btn btn-primary btn-sm" onClick={escribir}>
            <Plus size={16} aria-hidden="true" /> Nuevo
          </button>
        </div>

        <div className="comms-list">
          {cargando && <Esqueleto tipo="filas" cantidad={4} etiqueta="Cargando comunicados…" />}
          {items.map(it => (
            <button
              key={it.id}
              className={`comms-item ${seleccion?.id === it.id ? 'active' : ''}`}
              onClick={() => { setSeleccion(it); setComposing(false); }}
            >
              <div className="comms-item-icon">{iconoDe(it)}</div>
              <div className="comms-item-body">
                <span className="comms-item-subject">{it.tipo === 'com' ? it.c.subject : it.n.title}</span>
                <span className="comms-item-to">{paraDe(it)}</span>
              </div>
              <div className="comms-item-meta">
                {it.tipo === 'com' && <span className={`badge ${priorityBadgeClass[it.c.priority]}`}>{priorityLabels[it.c.priority]}</span>}
                <span className="comms-item-date"><Clock size={12} /> {fechaCorta(it.fecha)}</span>
              </div>
              <ChevronRight size={16} className="comms-item-arrow" />
            </button>
          ))}
        </div>
      </div>

      {/* Derecha: escribir o ver */}
      <div className="card comms-detail-panel">
        {composing ? (
          <div className="comms-compose">
            <div className="comms-detail-header">
              <MessageSquare size={18} />
              <h3 aria-level={2}>Nuevo comunicado</h3>
            </div>

            <div className="comms-compose-form">
              <fieldset className="comms-campo">
                <legend>Para</legend>
                <div className="comms-chips">
                  {AUDIENCIAS.map(a => (
                    <button key={a.id} type="button" className={`comms-chip ${para.has(a.id) ? 'on' : ''}`}
                      aria-pressed={para.has(a.id)} onClick={() => alternar(a.id)}>
                      <a.icono size={15} aria-hidden="true" /> {a.etiqueta}
                    </button>
                  ))}
                  <button type="button" className={`comms-chip ${para.size === 3 ? 'on' : ''}`} aria-pressed={para.size === 3}
                    onClick={() => setPara(new Set(['docentes', 'estudiantes', 'familias']))}>
                    <School size={15} aria-hidden="true" /> Toda la comunidad
                  </button>
                </div>
              </fieldset>

              <fieldset className="comms-campo">
                <legend>¿A quiénes?</legend>
                <div className="comms-chips">
                  <button type="button" className={`comms-chip ${alcanceEfectivo === 'escuela' ? 'on' : ''}`} aria-pressed={alcanceEfectivo === 'escuela'} onClick={() => setAlcance('escuela')}>Toda la escuela</button>
                  <button type="button" className={`comms-chip ${alcanceEfectivo === 'curso' ? 'on' : ''}`} aria-pressed={alcanceEfectivo === 'curso'} onClick={() => setAlcance('curso')}>Un curso</button>
                  {unaSola && (
                    <button type="button" className={`comms-chip ${alcanceEfectivo === 'persona' ? 'on' : ''}`} aria-pressed={alcanceEfectivo === 'persona'}
                      onClick={() => { setAlcance('persona'); setPersonaId(''); }}>
                      {unaSola === 'docentes' ? 'Un docente' : unaSola === 'estudiantes' ? 'Un estudiante' : 'La familia de un estudiante'}
                    </button>
                  )}
                </div>
                {alcanceEfectivo === 'curso' && (
                  <select className="form-select" aria-label="Curso" value={cursoId} onChange={e => setCursoId(e.target.value)}>
                    <option value="">Elegí un curso…</option>
                    {cursos.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                )}
                {alcanceEfectivo === 'persona' && unaSola === 'docentes' && (
                  <select className="form-select" aria-label="Docente" value={personaId} onChange={e => setPersonaId(e.target.value)}>
                    <option value="">Elegí un docente…</option>
                    {teachers.map(t => <option key={t.id} value={t.id}>{t.lastName}, {t.firstName}</option>)}
                  </select>
                )}
                {alcanceEfectivo === 'persona' && unaSola !== 'docentes' && (
                  <>
                    <select className="form-select" aria-label="Estudiante" value={personaId} onChange={e => setPersonaId(e.target.value)}>
                      <option value="">Elegí un estudiante…</option>
                      {(unaSola === 'estudiantes' ? conCuenta : estudiantes).map(s => (
                        <option key={s.id} value={s.id}>{s.lastName}, {s.firstName} · {s.courseName}</option>
                      ))}
                    </select>
                    {unaSola === 'estudiantes' && conCuenta.length < estudiantes.length && (
                      <p className="comms-ayuda">Aparecen solo los estudiantes que ya tienen su cuenta en la app.</p>
                    )}
                  </>
                )}
              </fieldset>

              <div className="login-field">
                <label htmlFor="comms-asunto">Asunto</label>
                <input id="comms-asunto" type="text" value={subject} maxLength={160} onChange={e => setSubject(e.target.value)} placeholder="Asunto del comunicado…" />
              </div>

              {(para.has('docentes') || para.has('estudiantes')) && (
                <div className="login-field">
                  <label htmlFor="comms-prioridad">Prioridad</label>
                  <select id="comms-prioridad" className="form-select" value={priority} onChange={e => setPriority(e.target.value as NotificationPriority)}>
                    <option value="low">Baja</option>
                    <option value="medium">Media</option>
                    <option value="high">Alta</option>
                  </select>
                </div>
              )}

              <div className="login-field">
                <label htmlFor="comms-mensaje">Mensaje</label>
                <textarea id="comms-mensaje" className="form-textarea" rows={8} value={body}
                  onChange={e => setBody(e.target.value)} placeholder="Escribí tu comunicado…" />
              </div>

              <p className="comms-resumen">{destinoTexto()}.</p>

              <button type="button" className="btn btn-primary" onClick={handleSend} disabled={enviando || !listo}>
                {enviando ? <Loader2 size={16} className="girando" aria-hidden="true" /> : <Send size={16} aria-hidden="true" />}
                {enviando ? 'Enviando…' : 'Enviar comunicado'}
              </button>
              <p className="comms-ayuda">
                Lo ven en la app: el equipo en Comunicados, los estudiantes en Avisos y las familias en sus Comunicados.
                Para citar a una familia, usá <Link to="/familias">Familias</Link>.
              </p>
            </div>
          </div>
        ) : seleccion ? (
          <div className="comms-detail">
            <div className="comms-detail-header">
              <MessageSquare size={18} />
              <h3 aria-level={2}>{seleccion.tipo === 'com' ? seleccion.c.subject : seleccion.n.title}</h3>
            </div>
            <div className="comms-detail-meta">
              {seleccion.tipo === 'com' && <span className={`badge ${priorityBadgeClass[seleccion.c.priority]}`}>{priorityLabels[seleccion.c.priority]}</span>}
              <span className="text-secondary text-sm">Para: {paraDe(seleccion)}</span>
              <span className="text-subtle text-sm">
                {new Date(seleccion.fecha).toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
            <div className="comms-detail-body">
              {(seleccion.tipo === 'com' ? seleccion.c.body : seleccion.n.body).split('\n').map((line, i) => <p key={i}>{line || <br />}</p>)}
            </div>
            <div className="comms-detail-footer">
              {seleccion.tipo === 'com' ? (() => {
                const total = totalDestino(seleccion.c);
                return (
                  <span className="text-subtle text-sm">
                    Leído por {seleccion.c.readBy.length}{total !== null ? ` de ${total}` : ''} {seleccion.c.audiencia === 'estudiantes' ? 'estudiantes' : 'docentes'}
                  </span>
                );
              })() : (
                <span className="text-subtle text-sm">
                  Leído por {seleccion.n.receipts.filter(r => r.readAt).length} familia{seleccion.n.receipts.filter(r => r.readAt).length !== 1 ? 's' : ''}.{' '}
                  <Link to="/familias">Ver quiénes en Familias</Link>
                </span>
              )}
            </div>
          </div>
        ) : cargando ? null : items.length === 0 ? (
          <EstadoVacio className="comms-vacio" icono={MessageSquare} titulo="Todavía no mandaste comunicados"
            texto="Escribile a docentes, estudiantes o familias: a toda la escuela, a un curso o a una persona. Ves quién lo leyó."
            accion={{ etiqueta: 'Escribir un comunicado', icono: Plus, alTocar: escribir }} />
        ) : (
          <EstadoVacio className="comms-vacio" icono={MessageSquare} titulo="Elegí un comunicado de la lista"
            texto="Vas a ver el mensaje completo y cuántos lo leyeron."
            accion={{ etiqueta: 'Escribir uno nuevo', icono: Plus, alTocar: escribir }} />
        )}
      </div>
    </div>
  );
}
