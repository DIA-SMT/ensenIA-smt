/**
 * Vista staff (docente/director): comunicados oficiales y citaciones
 * a familias, con acuses de recibo y confirmación de asistencia.
 */

import { useState, useEffect } from 'react';
import {
  Megaphone, CalendarPlus, Send, Trash2, CheckCircle, Eye, X, AlertCircle,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { getNoticesForStaff, createNotice, deleteNotice } from '../services/guardians.service';
import { getStudentsByTeacher, getAllStudents } from '../services/students.service';
import type { GuardianNotice, NoticeReceipt, NoticeType, Student } from '../types';
import './Familias.css';
import '../components/Modals.css';

type StaffNotice = GuardianNotice & { receipts: NoticeReceipt[] };

export default function Familias() {
  const { user, isDirector } = useAuth();
  const [notices, setNotices] = useState<StaffNotice[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);

  // Form
  const [type, setType] = useState<NoticeType>('comunicado');
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
      getAllStudents(user.schoolId).then(setStudents).catch(console.error);
    } else {
      const courseIds = user.subjects?.map(s => s.courseId) ?? [];
      getStudentsByTeacher(courseIds).then(setStudents).catch(console.error);
    }
  }, [user]);

  if (!user) return null;

  const handleSend = async () => {
    if (!title.trim() || !body.trim()) { setError('Completá título y mensaje.'); return; }
    if (type === 'citacion' && !targetStudentId) { setError('Las citaciones son para la familia de un estudiante específico.'); return; }
    setSending(true);
    setError('');
    try {
      await createNotice({
        schoolId: user.schoolId,
        studentId: targetStudentId || null,
        fromUserId: user.id,
        type,
        title,
        body,
        meetingAt: type === 'citacion' && meetingDate
          ? new Date(`${meetingDate}T${meetingTime || '08:00'}`).toISOString()
          : null,
        meetingPlace: type === 'citacion' ? meetingPlace : null,
      });
      setTitle(''); setBody(''); setMeetingDate(''); setMeetingTime(''); setMeetingPlace('');
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
    if (!window.confirm(`¿Eliminar "${n.title}"?`)) return;
    await deleteNotice(n.id);
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
        <h2 className="flex items-center gap-2"><Megaphone size={20} className="text-cyan" /> Comunicación con familias</h2>
        <p className="text-secondary text-sm">Comunicados oficiales y citaciones con acuse de recibo.</p>
      </div>

      <div className="fam-grid">
        {/* ── Crear ── */}
        <div className="card fam-form">
          <h3 className="fam-form-title">Nuevo aviso</h3>
          {error && <div className="em-error"><AlertCircle size={14} /> {error}</div>}
          {sentOk && <div className="fam-ok"><CheckCircle size={14} /> Enviado. Las familias ya lo ven en su portal.</div>}

          <div className="fam-type-toggle">
            <button className={type === 'comunicado' ? 'active' : ''} onClick={() => setType('comunicado')}>
              <Megaphone size={14} /> Comunicado
            </button>
            <button className={type === 'citacion' ? 'active' : ''} onClick={() => setType('citacion')}>
              <CalendarPlus size={14} /> Citación
            </button>
          </div>

          <div className="em-field">
            <label>Destinatario</label>
            <select className="form-select" value={targetStudentId} onChange={e => setTargetStudentId(e.target.value)}>
              <option value="">📢 Todas las familias de la escuela</option>
              {students.map(s => (
                <option key={s.id} value={s.id}>Familia de {s.firstName} {s.lastName} ({s.courseName})</option>
              ))}
            </select>
          </div>

          <div className="em-field">
            <label>Título</label>
            <input type="text" value={title} onChange={e => setTitle(e.target.value)} placeholder={type === 'citacion' ? 'Citación: reunión por...' : 'Ej: Acto del 9 de Julio'} />
          </div>

          <div className="em-field">
            <label>Mensaje</label>
            <textarea rows={4} value={body} onChange={e => setBody(e.target.value)} placeholder="Estimadas familias..." />
          </div>

          {type === 'citacion' && (
            <>
              <div className="em-row">
                <div className="em-field">
                  <label>Fecha</label>
                  <input type="date" value={meetingDate} onChange={e => setMeetingDate(e.target.value)} />
                </div>
                <div className="em-field">
                  <label>Hora</label>
                  <input type="text" placeholder="10:00" value={meetingTime} onChange={e => setMeetingTime(e.target.value)} />
                </div>
              </div>
              <div className="em-field">
                <label>Lugar</label>
                <input type="text" value={meetingPlace} onChange={e => setMeetingPlace(e.target.value)} placeholder="Dirección de la escuela" />
              </div>
            </>
          )}

          <button className="btn btn-primary w-full" onClick={handleSend} disabled={sending}>
            <Send size={15} /> {sending ? 'Enviando...' : 'Enviar a las familias'}
          </button>
        </div>

        {/* ── Historial ── */}
        <div className="fam-list">
          {loading && <p className="text-secondary">Cargando...</p>}
          {!loading && notices.length === 0 && (
            <div className="card acts-empty">
              <Megaphone size={30} className="text-secondary" />
              <p className="text-secondary">Todavía no hay avisos enviados.</p>
            </div>
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
