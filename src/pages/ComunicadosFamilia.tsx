/**
 * Portal familias: comunicados oficiales y citaciones de la escuela.
 * Al abrir un aviso queda el acuse de lectura; las citaciones se
 * pueden confirmar ("Asistiré" / "No puedo").
 */

import { useState, useEffect } from 'react';
import { Megaphone, CalendarClock, CheckCircle, XCircle, ChevronDown } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { getNoticesForGuardian, markNoticeRead, respondToNotice } from '../services/guardians.service';
import type { GuardianNotice, NoticeResponse } from '../types';
import './Familias.css';

export default function ComunicadosFamilia() {
  const { user } = useAuth();
  const [notices, setNotices] = useState<GuardianNotice[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    getNoticesForGuardian(user.id)
      .then(setNotices)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [user]);

  if (!user) return null;

  const handleOpen = (n: GuardianNotice) => {
    const next = openId === n.id ? null : n.id;
    setOpenId(next);
    if (next && !n.readAt) {
      markNoticeRead(n.id, user.id).catch(console.error);
      setNotices(prev => prev.map(x => x.id === n.id ? { ...x, readAt: new Date().toISOString() } : x));
    }
  };

  const handleRespond = async (n: GuardianNotice, response: NoticeResponse) => {
    await respondToNotice(n.id, user.id, response);
    setNotices(prev => prev.map(x => x.id === n.id ? { ...x, response, readAt: x.readAt ?? new Date().toISOString() } : x));
  };

  const unread = notices.filter(n => !n.readAt).length;

  return (
    <div className="sp-container animate-in">
      <div className="sp-hero card">
        <div>
          <h2>Comunicados de la escuela 📫</h2>
          <p className="text-secondary text-sm">
            {unread > 0
              ? `Tenés ${unread} aviso${unread !== 1 ? 's' : ''} sin leer.`
              : 'Estás al día con los avisos de la institución.'}
          </p>
        </div>
      </div>

      {loading && <p className="text-secondary">Cargando avisos...</p>}
      {!loading && notices.length === 0 && (
        <div className="card acts-empty">
          <Megaphone size={30} className="text-secondary" />
          <p className="text-secondary">Todavía no hay comunicados.</p>
        </div>
      )}

      <div className="sp-activity-list">
        {notices.map(n => (
          <div key={n.id} className={`card fam-notice ${!n.readAt ? 'unread' : ''}`}>
            <button className="fam-notice-toggle" onClick={() => handleOpen(n)}>
              <div className="fam-notice-head" style={{ width: '100%' }}>
                <div className="flex items-center gap-2" style={{ flexWrap: 'wrap' }}>
                  {!n.readAt && <span className="fam-dot" />}
                  <span className={`badge ${n.type === 'citacion' ? 'badge-warning' : 'badge-cyan'}`}>
                    {n.type === 'citacion' ? '📅 Citación' : '📢 Comunicado'}
                  </span>
                  {n.studentName && <span className="badge badge-neutral">Por {n.studentName}</span>}
                  <span className="text-xs text-subtle">{new Date(n.createdAt).toLocaleDateString('es-AR')}</span>
                </div>
                <ChevronDown size={16} className={`fam-chevron ${openId === n.id ? 'open' : ''}`} />
              </div>
              <h4 style={{ textAlign: 'left' }}>{n.title}</h4>
            </button>

            {openId === n.id && (
              <div className="fam-notice-body animate-fade">
                <p className="text-sm" style={{ whiteSpace: 'pre-wrap' }}>{n.body}</p>
                {n.meetingAt && (
                  <div className="fam-meeting">
                    <CalendarClock size={16} />
                    <div>
                      <strong>{new Date(n.meetingAt).toLocaleString('es-AR', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })} hs</strong>
                      {n.meetingPlace && <span style={{ display: 'block' }} className="text-sm text-secondary">{n.meetingPlace}</span>}
                    </div>
                  </div>
                )}
                {n.fromName && <p className="text-xs text-subtle">Enviado por {n.fromName}</p>}

                {n.type === 'citacion' && (
                  <div className="fam-respond">
                    {n.response ? (
                      <p className={`text-sm ${n.response === 'asistire' ? 'text-success' : 'text-danger'}`}>
                        {n.response === 'asistire' ? '✓ Confirmaste tu asistencia.' : '✗ Avisaste que no podés asistir. La escuela se contactará para reprogramar.'}
                      </p>
                    ) : (
                      <>
                        <span className="text-sm text-secondary">¿Vas a poder asistir?</span>
                        <div className="flex gap-2">
                          <button className="btn btn-primary btn-sm" onClick={() => handleRespond(n, 'asistire')}>
                            <CheckCircle size={14} /> Asistiré
                          </button>
                          <button className="btn btn-outline btn-sm" onClick={() => handleRespond(n, 'no_puedo')}>
                            <XCircle size={14} /> No puedo
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
