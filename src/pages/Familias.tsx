/**
 * Vista staff: avisos a familias con acuses de recibo y confirmación de
 * asistencia. La dirección manda comunicados y citaciones; el docente solo
 * cita a la familia de un estudiante de sus materias (la base lo exige, 052).
 */

import { useState, useEffect } from 'react';
import {
  Megaphone, CalendarPlus, Send, Trash2, CheckCircle, Eye, X, AlertCircle,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { getNoticesForStaff, createNotice, deleteNotice } from '../services/guardians.service';
import { getAllStudents } from '../services/students.service';
import { getEnrolledStudents } from '../services/activities.service';
import { getSubjects } from '../services/subjects.service';
import { asignacionesDe, type Asignacion } from '../lib/asignaciones';
import type { GuardianNotice, NoticeReceipt, NoticeType, Student } from '../types';
import { avisar, confirmar } from '../components/ui/avisar';
import EstadoVacio from '../components/ui/EstadoVacio';
import { Esqueleto } from '../components/ui/Esqueleto';
// Estilos compartidos con otras pantallas: desde que cada pantalla se baja
// por separado, lo que no se importa acá no llega.
import './Familias.css';
import '../components/Modals.css';

type StaffNotice = GuardianNotice & { receipts: NoticeReceipt[] };

export default function Familias() {
  const { user, isDirector } = useAuth();
  const [notices, setNotices] = useState<StaffNotice[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  // Docente: sus estudiantes, por materia · curso (la citación es de una materia)
  const [porMateria, setPorMateria] = useState<{ asignacion: Asignacion; students: Student[] }[]>([]);
  const [cargandoEstudiantes, setCargandoEstudiantes] = useState(true);
  const [loading, setLoading] = useState(true);

  // Form
  const [type, setType] = useState<NoticeType>(isDirector ? 'comunicado' : 'citacion');
  // Director: id del estudiante ('' = toda la escuela). Docente: "materia|estudiante".
  const [targetStudentId, setTargetStudentId] = useState('');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [meetingDate, setMeetingDate] = useState('');
  const [meetingTime, setMeetingTime] = useState('');
  const [meetingPlace, setMeetingPlace] = useState('');
  const [sending, setSending] = useState(false);
  const [sentOk, setSentOk] = useState(false);
  const [error, setError] = useState('');

  const load = () => {
    getNoticesForStaff().then(setNotices).catch(console.error).finally(() => setLoading(false));
  };

  useEffect(() => {
    if (!user) return;
    load();
    if (isDirector) {
      getAllStudents(user.schoolId).then(setStudents).catch(console.error).finally(() => setCargandoEstudiantes(false));
    } else {
      // Inscriptos en cada materia y curso del docente: "estudiantes de su materia"
      (async () => {
        const materias = await getSubjects(user.schoolId).catch(() => []);
        const asignaciones = asignacionesDe(user.subjects, id => materias.find(m => m.id === id)?.name ?? '');
        const listas = await Promise.all(asignaciones.map(async asignacion => ({
          asignacion,
          students: (await getEnrolledStudents(asignacion.subjectId, asignacion.courseId).catch(() => []))
            .sort((a, b) => a.lastName.localeCompare(b.lastName, 'es') || a.firstName.localeCompare(b.firstName, 'es')),
        })));
        setPorMateria(listas.filter(l => l.students.length > 0));
      })().catch(console.error).finally(() => setCargandoEstudiantes(false));
    }
  }, [user, isDirector]);

  if (!user) return null;

  const handleSend = async () => {
    if (!title.trim() || !body.trim()) { setError('Completá título y mensaje.'); return; }
    if (type === 'citacion' && !targetStudentId) { setError('Las citaciones son para la familia de un estudiante específico.'); return; }
    // El docente elige estudiante y materia juntos
    const [subjectId, studentId] = isDirector ? [null, targetStudentId] : targetStudentId.split('|');
    setSending(true);
    setError('');
    try {
      await createNotice({
        schoolId: user.schoolId,
        studentId: studentId || null,
        fromUserId: user.id,
        type: isDirector ? type : 'citacion',
        subjectId,
        title,
        body,
        meetingAt: type === 'citacion' && meetingDate
          ? new Date(`${meetingDate}T${meetingTime || '08:00'}`).toISOString()
          : null,
        meetingPlace: type === 'citacion' ? meetingPlace : null,
      });
      setTitle(''); setBody(''); setMeetingDate(''); setMeetingTime(''); setMeetingPlace('');
      if (!isDirector) setTargetStudentId('');
      setSentOk(true);
      setTimeout(() => setSentOk(false), 3000);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo enviar.');
    } finally {
      setSending(false);
    }
  };

  const handleDelete = async (n: StaffNotice) => {
    const ok = await confirmar({
      titulo: `¿Eliminar "${n.title}"?`,
      mensaje: 'Las familias dejan de verlo en su portal. No se puede deshacer.',
      accion: 'Eliminar',
      peligro: true,
    });
    if (!ok) return;
    try {
      await deleteNotice(n.id);
    } catch (err) {
      console.error(err);
      avisar.error('No se pudo eliminar el aviso', 'Probá de nuevo.');
      return;
    }
    avisar.exito('Aviso eliminado', n.title);
    load();
  };

  const receiptSummary = (n: StaffNotice) => {
    const read = n.receipts.filter(r => r.readAt).length;
    const yes = n.receipts.filter(r => r.response === 'asistire').length;
    const no = n.receipts.filter(r => r.response === 'no_puedo').length;
    return { read, yes, no };
  };

  return (
    <div className="fam-container animate-in">
      <div>
        {/* El título ya está en la barra de arriba */}
        <p className="text-secondary text-sm">
          {isDirector
            ? 'Comunicados oficiales y citaciones con acuse de recibo.'
            : 'Citá a la familia de un estudiante de tus materias y mirá si la leyó y si confirma. Los comunicados generales los manda la dirección.'}
        </p>
      </div>

      <div className="fam-grid">
        {/* ── Crear ── */}
        <div className="card fam-form">
          <h3 className="fam-form-title">{isDirector ? 'Nuevo aviso' : 'Nueva citación'}</h3>
          {error && <div className="em-error"><AlertCircle size={14} /> {error}</div>}
          {sentOk && <div className="fam-ok"><CheckCircle size={14} /> Enviado. Las familias ya lo ven en su portal.</div>}

          {isDirector && (
            <div className="fam-type-toggle">
              <button className={type === 'comunicado' ? 'active' : ''} aria-pressed={type === 'comunicado'} onClick={() => setType('comunicado')}>
                <Megaphone size={14} /> Comunicado
              </button>
              <button className={type === 'citacion' ? 'active' : ''} aria-pressed={type === 'citacion'} onClick={() => setType('citacion')}>
                <CalendarPlus size={14} /> Citación
              </button>
            </div>
          )}

          <div className="em-field">
            <label htmlFor="fam-dest">{isDirector ? 'Destinatario' : 'Familia de'}</label>
            {isDirector ? (
              <select id="fam-dest" className="form-select" value={targetStudentId} onChange={e => setTargetStudentId(e.target.value)}>
                <option value="">📢 Todas las familias de la escuela</option>
                {students.map(s => (
                  <option key={s.id} value={s.id}>Familia de {s.firstName} {s.lastName} ({s.courseName})</option>
                ))}
              </select>
            ) : (
              <select id="fam-dest" className="form-select" value={targetStudentId} onChange={e => setTargetStudentId(e.target.value)}
                disabled={cargandoEstudiantes || porMateria.length === 0}>
                <option value="">
                  {cargandoEstudiantes ? 'Cargando tus estudiantes…' : porMateria.length === 0 ? 'No tenés estudiantes inscriptos' : 'Elegí un estudiante'}
                </option>
                {porMateria.map(({ asignacion, students: lista }) => (
                  <optgroup key={asignacion.clave} label={asignacion.etiqueta}>
                    {lista.map(s => (
                      <option key={s.id} value={`${asignacion.subjectId}|${s.id}`}>{s.lastName}, {s.firstName}</option>
                    ))}
                  </optgroup>
                ))}
              </select>
            )}
            {!isDirector && targetStudentId && (
              <p className="text-xs text-subtle mt-1">
                La familia ve que la cita es por {porMateria.find(g => g.asignacion.subjectId === targetStudentId.split('|')[0])?.asignacion.subjectName ?? 'tu materia'}.
              </p>
            )}
          </div>

          <div className="em-field">
            <label htmlFor="fam-titulo">Título</label>
            <input id="fam-titulo" type="text" value={title} onChange={e => setTitle(e.target.value)} placeholder={type === 'citacion' ? 'Citación: reunión por...' : 'Ej: Acto del 9 de Julio'} />
          </div>

          <div className="em-field">
            <label htmlFor="fam-mensaje">Mensaje</label>
            <textarea id="fam-mensaje" rows={4} value={body} onChange={e => setBody(e.target.value)} placeholder={type === 'citacion' ? 'Los convocamos a una reunión para...' : 'Estimadas familias...'} />
          </div>

          {type === 'citacion' && (
            <>
              <div className="em-row">
                <div className="em-field">
                  <label htmlFor="fam-fecha">Fecha</label>
                  <input id="fam-fecha" type="date" value={meetingDate} onChange={e => setMeetingDate(e.target.value)} />
                </div>
                <div className="em-field">
                  <label htmlFor="fam-hora">Hora</label>
                  <input id="fam-hora" type="text" placeholder="10:00" value={meetingTime} onChange={e => setMeetingTime(e.target.value)} />
                </div>
              </div>
              <div className="em-field">
                <label htmlFor="fam-lugar">Lugar</label>
                <input id="fam-lugar" type="text" value={meetingPlace} onChange={e => setMeetingPlace(e.target.value)} placeholder="Dirección de la escuela" />
              </div>
            </>
          )}

          <button className="btn btn-primary w-full" onClick={handleSend} disabled={sending}>
            <Send size={15} /> {sending ? 'Enviando...' : isDirector ? 'Enviar a las familias' : 'Enviar la citación'}
          </button>
        </div>

        {/* ── Historial ── */}
        <div className="fam-list">
          {loading && <Esqueleto tipo="tarjetas" cantidad={2} etiqueta="Cargando avisos…" />}
          {!loading && notices.length === 0 && (
            <EstadoVacio
              icono={Megaphone}
              titulo={isDirector ? 'Todavía no hay avisos enviados' : 'Todavía no hay citaciones'}
              texto="Lo que mandes a las familias aparece acá, con quién lo leyó y quién confirmó."
              accion={{ etiqueta: isDirector ? 'Escribir un aviso' : 'Escribir una citación', alTocar: () => document.getElementById('fam-dest')?.focus() }}
            />
          )}
          {notices.map(n => {
            const rs = receiptSummary(n);
            return (
              <div key={n.id} className="card fam-notice">
                <div className="fam-notice-head">
                  <div>
                    <span className={`badge ${n.type === 'citacion' ? 'badge-warning' : 'badge-cyan'}`}>
                      {n.type === 'citacion' ? '📅 Citación' : '📢 Comunicado'}
                    </span>
                    {n.subjectName && <span className="badge badge-cyan" style={{ marginLeft: 6 }}>{n.subjectName}</span>}
                    <span className="badge badge-neutral" style={{ marginLeft: 6 }}>
                      {n.studentName ? `Familia de ${n.studentName}` : 'Toda la escuela'}
                    </span>
                  </div>
                  {n.fromUserId === user.id && (
                    <button className="btn-icon" title="Eliminar" onClick={() => handleDelete(n)}><Trash2 size={15} /></button>
                  )}
                </div>
                <h4>{n.title}</h4>
                <p className="text-sm text-secondary">{n.body}</p>
                {n.meetingAt && (
                  <p className="text-sm text-warning">
                    📅 {new Date(n.meetingAt).toLocaleString('es-AR', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}
                    {n.meetingPlace && ` · ${n.meetingPlace}`}
                  </p>
                )}
                <div className="fam-receipts">
                  <span className="text-xs text-subtle"><Eye size={11} /> {rs.read} leído{rs.read !== 1 ? 's' : ''}</span>
                  {n.type === 'citacion' && (
                    <>
                      <span className="text-xs text-success"><CheckCircle size={11} /> {rs.yes} asistirá{rs.yes !== 1 ? 'n' : ''}</span>
                      <span className="text-xs text-danger"><X size={11} /> {rs.no} no puede{rs.no !== 1 ? 'n' : ''}</span>
                    </>
                  )}
                  {n.receipts.filter(r => r.readAt).map(r => (
                    <span key={r.guardianUserId} className="badge badge-neutral text-xs">
                      {r.guardianName}{r.response === 'asistire' ? ' ✓' : r.response === 'no_puedo' ? ' ✗' : ''}
                    </span>
                  ))}
                </div>
                <span className="text-xs text-subtle">
                  Enviado por {n.fromName ?? '—'} · {new Date(n.createdAt).toLocaleDateString('es-AR')}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
