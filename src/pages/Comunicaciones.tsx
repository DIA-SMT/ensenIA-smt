import { useState, useEffect } from 'react';
import { Send, Users, User as UserIcon, Clock, ChevronRight, MessageSquare, Plus } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { getCommunicationsBySchool, sendCommunication } from '../services/communications.service';
import { getTeacherUsers } from '../services/profiles.service';
import type { Communication, NotificationPriority, User } from '../types';
import './Comunicaciones.css';

const priorityLabels: Record<NotificationPriority, string> = {
  high: 'Alta',
  medium: 'Media',
  low: 'Baja',
};

const priorityBadgeClass: Record<NotificationPriority, string> = {
  high: 'badge-danger',
  medium: 'badge-warning',
  low: 'badge-neutral',
};

export default function Comunicaciones() {
  const { user } = useAuth();
  const [selectedComm, setSelectedComm] = useState<Communication | null>(null);
  const [composing, setComposing] = useState(false);
  const [communications, setCommunications] = useState<Communication[]>([]);
  const [teachers, setTeachers] = useState<User[]>([]);

  // Compose form state
  const [toAll, setToAll] = useState(true);
  const [selectedTeacherId, setSelectedTeacherId] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [priority, setPriority] = useState<NotificationPriority>('medium');

  useEffect(() => {
    if (!user) return;
    getCommunicationsBySchool(user.schoolId).then(setCommunications).catch(console.error);
    getTeacherUsers().then(setTeachers).catch(console.error);
  }, [user]);

  async function handleSend() {
    if (!user) return;
    try {
      await sendCommunication({
        fromUserId: user.id,
        subject,
        body,
        priority,
        schoolId: user.schoolId,
        toUserIds: toAll ? 'all' : [selectedTeacherId],
      });
      // Refresh list
      const updated = await getCommunicationsBySchool(user.schoolId);
      setCommunications(updated);
      setComposing(false);
      setSubject('');
      setBody('');
    } catch (err) {
      console.error(err);
      alert('Error al enviar el comunicado.');
    }
  }

  if (!user) return null;

  return (
    <div className="comms-container">
      {/* Left: List */}
      <div className="card comms-list-panel">
        <div className="comms-list-header">
          <h3>Comunicaciones</h3>
          <button className="btn btn-primary btn-sm" onClick={() => { setComposing(true); setSelectedComm(null); }}>
            <Plus size={16} />
            Nuevo
          </button>
        </div>

        <div className="comms-list">
          {communications.map(comm => (
            <button
              key={comm.id}
              className={`comms-item ${selectedComm?.id === comm.id ? 'active' : ''}`}
              onClick={() => { setSelectedComm(comm); setComposing(false); }}
            >
              <div className="comms-item-icon">
                {comm.toUserIds === 'all' ? <Users size={16} /> : <UserIcon size={16} />}
              </div>
              <div className="comms-item-body">
                <span className="comms-item-subject">{comm.subject}</span>
                <span className="comms-item-to">
                  {comm.toNames.join(', ')}
                </span>
              </div>
              <div className="comms-item-meta">
                <span className={`badge ${priorityBadgeClass[comm.priority]}`}>{priorityLabels[comm.priority]}</span>
                <span className="comms-item-date">
                  <Clock size={12} />
                  {new Date(comm.sentAt).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })}
                </span>
              </div>
              <ChevronRight size={16} className="comms-item-arrow" />
            </button>
          ))}
        </div>
      </div>

      {/* Right: Detail or Compose */}
      <div className="card comms-detail-panel">
        {composing ? (
          <div className="comms-compose">
            <div className="comms-detail-header">
              <MessageSquare size={18} />
              <h3>Nuevo Comunicado</h3>
            </div>

            <div className="comms-compose-form">
              <div className="login-field">
                <label>Destinatario</label>
                <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer', fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                    <input type="radio" checked={toAll} onChange={() => setToAll(true)} />
                    Todos los docentes
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer', fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                    <input type="radio" checked={!toAll} onChange={() => setToAll(false)} />
                    Docente específico
                  </label>
                </div>
                {!toAll && (
                  <select className="form-select" value={selectedTeacherId} onChange={e => setSelectedTeacherId(e.target.value)}>
                    <option value="">Seleccionar docente...</option>
                    {teachers.map(t => (
                      <option key={t.id} value={t.id}>{t.firstName} {t.lastName}</option>
                    ))}
                  </select>
                )}
              </div>

              <div className="login-field">
                <label>Asunto</label>
                <input type="text" value={subject} onChange={e => setSubject(e.target.value)} placeholder="Asunto del comunicado..." />
              </div>

              <div className="login-field">
                <label>Prioridad</label>
                <select className="form-select" value={priority} onChange={e => setPriority(e.target.value as NotificationPriority)}>
                  <option value="low">Baja</option>
                  <option value="medium">Media</option>
                  <option value="high">Alta</option>
                </select>
              </div>

              <div className="login-field">
                <label>Mensaje</label>
                <textarea
                  className="form-textarea"
                  rows={8}
                  value={body}
                  onChange={e => setBody(e.target.value)}
                  placeholder="Escribí tu comunicado..."
                />
              </div>

              <button className="btn btn-primary" onClick={handleSend} disabled={!subject.trim() || !body.trim() || (!toAll && !selectedTeacherId)}>
                <Send size={16} />
                Enviar Comunicado
              </button>
            </div>
          </div>
        ) : selectedComm ? (
          <div className="comms-detail">
            <div className="comms-detail-header">
              <MessageSquare size={18} />
              <h3>{selectedComm.subject}</h3>
            </div>
            <div className="comms-detail-meta">
              <span className={`badge ${priorityBadgeClass[selectedComm.priority]}`}>{priorityLabels[selectedComm.priority]}</span>
              <span className="text-secondary text-sm">
                Para: {selectedComm.toNames.join(', ')}
              </span>
              <span className="text-subtle text-sm">
                {new Date(selectedComm.sentAt).toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
            <div className="comms-detail-body">
              {selectedComm.body.split('\n').map((line, i) => (
                <p key={i}>{line || <br />}</p>
              ))}
            </div>
            <div className="comms-detail-footer">
              <span className="text-subtle text-sm">
                Leído por {selectedComm.readBy.length} de {selectedComm.toUserIds === 'all' ? teachers.length : (selectedComm.toUserIds as string[]).length} destinatarios
              </span>
            </div>
          </div>
        ) : (
          <div className="comms-empty">
            <MessageSquare size={40} />
            <p>Seleccioná un comunicado o creá uno nuevo</p>
          </div>
        )}
      </div>
    </div>
  );
}
