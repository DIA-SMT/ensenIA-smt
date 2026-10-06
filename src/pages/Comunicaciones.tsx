import { useState, useEffect } from 'react';
import { Send, Users, User as UserIcon, Clock, ChevronRight, MessageSquare, Plus, Loader2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { getCommunicationsBySchool, sendCommunication } from '../services/communications.service';
import { getTeacherUsers } from '../services/profiles.service';
import { avisar } from '../components/ui/avisar';
import { Esqueleto } from '../components/ui/Esqueleto';
import EstadoVacio from '../components/ui/EstadoVacio';
import type { Communication, NotificationPriority, User } from '../types';
import '../components/ui/ui.css';
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
  const [cargando, setCargando] = useState(true);
  const [enviando, setEnviando] = useState(false);

  // Compose form state
  const [toAll, setToAll] = useState(true);
  const [selectedTeacherId, setSelectedTeacherId] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [priority, setPriority] = useState<NotificationPriority>('medium');

  useEffect(() => {
    if (!user) return;
    getCommunicationsBySchool(user.schoolId)
      .then(setCommunications)
      .catch(console.error)
      .finally(() => setCargando(false));
    getTeacherUsers(user.schoolId).then(setTeachers).catch(console.error);
  }, [user]);

  function escribir() {
    setComposing(true);
    setSelectedComm(null);
  }

  async function handleSend() {
    if (!user || enviando) return;
    setEnviando(true);
    const elegido = teachers.find(t => t.id === selectedTeacherId);
    const destino = toAll ? 'A todo el equipo docente' : elegido ? `A ${elegido.firstName} ${elegido.lastName}` : undefined;
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
      avisar.exito('Comunicado enviado', destino);
    } catch (err) {
      console.error(err);
      avisar.error('No se pudo enviar el comunicado.', 'Lo que escribiste sigue ahí. Revisá la conexión y probá de nuevo.');
    } finally {
      setEnviando(false);
    }
  }

  if (!user) return null;

  return (
    <div className="comms-container">
      {/* Left: List */}
      <div className="card comms-list-panel">
        <div className="comms-list-header">
          <h3 aria-level={2}>Comunicaciones</h3>
          <button type="button" className="btn btn-primary btn-sm" onClick={escribir}>
            <Plus size={16} aria-hidden="true" />
            Nuevo
          </button>
        </div>

        <div className="comms-list">
          {cargando && <Esqueleto tipo="filas" cantidad={4} etiqueta="Cargando comunicados…" />}
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
              <h3 aria-level={2}>Nuevo comunicado</h3>
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
                  <select className="form-select" aria-label="Docente" value={selectedTeacherId} onChange={e => setSelectedTeacherId(e.target.value)}>
                    <option value="">Elegí un docente…</option>
                    {teachers.map(t => (
                      <option key={t.id} value={t.id}>{t.firstName} {t.lastName}</option>
                    ))}
                  </select>
                )}
              </div>

              <div className="login-field">
                <label htmlFor="comms-asunto">Asunto</label>
                <input id="comms-asunto" type="text" value={subject} onChange={e => setSubject(e.target.value)} placeholder="Asunto del comunicado…" />
              </div>

              <div className="login-field">
                <label htmlFor="comms-prioridad">Prioridad</label>
                <select id="comms-prioridad" className="form-select" value={priority} onChange={e => setPriority(e.target.value as NotificationPriority)}>
                  <option value="low">Baja</option>
                  <option value="medium">Media</option>
                  <option value="high">Alta</option>
                </select>
              </div>

              <div className="login-field">
                <label htmlFor="comms-mensaje">Mensaje</label>
                <textarea
                  id="comms-mensaje"
                  className="form-textarea"
                  rows={8}
                  value={body}
                  onChange={e => setBody(e.target.value)}
                  placeholder="Escribí tu comunicado…"
                />
              </div>

              <button type="button" className="btn btn-primary" onClick={handleSend} disabled={enviando || !subject.trim() || !body.trim() || (!toAll && !selectedTeacherId)}>
                {enviando ? <Loader2 size={16} className="girando" aria-hidden="true" /> : <Send size={16} aria-hidden="true" />}
                {enviando ? 'Enviando…' : 'Enviar comunicado'}
              </button>
            </div>
          </div>
        ) : selectedComm ? (
          <div className="comms-detail">
            <div className="comms-detail-header">
              <MessageSquare size={18} />
              <h3 aria-level={2}>{selectedComm.subject}</h3>
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
        ) : cargando ? null : communications.length === 0 ? (
          <EstadoVacio className="comms-vacio" icono={MessageSquare} titulo="Todavía no mandaste comunicados"
            texto="Le llegan al equipo docente en Comunicados y en Mi día, y ves quién lo leyó."
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
