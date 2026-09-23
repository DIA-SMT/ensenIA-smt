/**
 * Portal familias: comunicados oficiales y citaciones de la escuela.
 * Al abrir un aviso queda el acuse de lectura; las citaciones se
 * pueden confirmar ("Asistiré" / "No puedo").
 */

import { useState, useEffect } from 'react';
import { Megaphone, CalendarClock, CheckCircle, XCircle, ChevronDown, ArrowRight } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { getNoticesForGuardian, markNoticeRead, respondToNotice } from '../services/guardians.service';
import type { GuardianNotice, NoticeResponse } from '../types';
// Estilos compartidos con otras pantallas: desde que cada pantalla se baja
// por separado, lo que no se importa acá no llega.
import './StudentPortal.css';
import './Actividades.css';
import './Familias.css';

export default function ComunicadosFamilia() {
  const { user } = useAuth();
  const [notices, setNotices] = useState<GuardianNotice[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [fallo, setFallo] = useState(false);
  const [errorRespuesta, setErrorRespuesta] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    getNoticesForGuardian(user.id)
      .then(setNotices)
      .catch(err => { console.error(err); setFallo(true); })
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

  // La respuesta se muestra como enviada solo si el servidor la guardó.
  const handleRespond = async (n: GuardianNotice, response: NoticeResponse) => {
    setErrorRespuesta(null);
    try {
      await respondToNotice(n.id, user.id, response);
      setNotices(prev => prev.map(x => x.id === n.id ? { ...x, response, readAt: x.readAt ?? new Date().toISOString() } : x));
    } catch (err) {
      console.error(err);
      setErrorRespuesta(n.id);
    }
  };

  const unread = notices.filter(n => !n.readAt).length;
  const citacionPendiente = notices.find(n => n.type === 'citacion' && !n.response);

  return (
    <div className="sp-container sp-v4">
      <section className="sp-hoy" aria-labelledby="fam-hoy-titulo">
        <div className="sp-hoy-texto">
          <p className="sp-hoy-saludo">¡Hola, {user.firstName}!</p>
          <h2 id="fam-hoy-titulo" className="sp-hoy-titulo">
            {loading ? 'Buscando avisos…'
              : unread > 0 ? (unread === 1 ? 'Tenés un aviso sin leer' : `Tenés ${unread} avisos sin leer`)
              : 'Estás al día con la escuela'}
          </h2>
          {!loading && !citacionPendiente && (
            <p className="sp-hoy-bajada">Acá llegan los comunicados y las citaciones de la escuela.</p>
          )}
        </div>
        {citacionPendiente && (
          <button type="button" className="sp-hoy-siguiente" onClick={() => { if (openId !== citacionPendiente.id) handleOpen(citacionPendiente); document.getElementById(`aviso-${citacionPendiente.id}`)?.scrollIntoView({ block: 'center' }); }}>
            <span className="sp-hoy-siguiente-et">Citación para confirmar</span>
            <span className="sp-hoy-siguiente-titulo">{citacionPendiente.title}</span>
            {citacionPendiente.meetingAt && (
              <span className="sp-hoy-siguiente-meta">
                {new Date(citacionPendiente.meetingAt).toLocaleString('es-AR', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })} hs
              </span>
            )}
            <span className="sp-hoy-siguiente-ir" aria-hidden="true"><ArrowRight size={18} /></span>
          </button>
        )}
      </section>

      {loading && <p className="text-secondary" role="status">Cargando avisos…</p>}
      {!loading && fallo && (
        <div className="card acts-empty" role="alert">
          <p className="text-danger">No pudimos traer los avisos. Revisá la conexión y volvé a entrar.</p>
        </div>
      )}
      {!loading && !fallo && notices.length === 0 && (
        <div className="card acts-empty">
          <Megaphone size={30} className="text-secondary" />
          <p className="text-secondary">Todavía no hay comunicados.</p>
        </div>
      )}

      <div className="sp-activity-list">
        {notices.map(n => (
          <div key={n.id} id={`aviso-${n.id}`} className={`card fam-notice ${!n.readAt ? 'unread' : ''}`}>
            <button
              type="button"
              className="fam-notice-toggle"
              onClick={() => handleOpen(n)}
              aria-expanded={openId === n.id}
              aria-controls={`aviso-cuerpo-${n.id}`}
            >
              <div className="fam-notice-head" style={{ width: '100%' }}>
                <div className="flex items-center gap-2" style={{ flexWrap: 'wrap' }}>
                  {!n.readAt && <><span className="fam-dot" aria-hidden="true" /><span className="sr-only">Sin leer.</span></>}
                  <span className={`badge ${n.type === 'citacion' ? 'badge-warning' : 'badge-cyan'}`}>
                    {n.type === 'citacion' ? '📅 Citación' : '📢 Comunicado'}
                  </span>
                  {/* Es el estudiante del que trata el aviso, no quien lo envía
                      (el emisor va abajo, en "Enviado por"). */}
                  {n.studentName && <span className="badge badge-neutral">Sobre {n.studentName}</span>}
                  <span className="text-xs text-subtle">{new Date(n.createdAt).toLocaleDateString('es-AR')}</span>
                </div>
                <ChevronDown size={16} className={`fam-chevron ${openId === n.id ? 'open' : ''}`} aria-hidden="true" />
              </div>
              <h4 style={{ textAlign: 'left' }} aria-level={3}>{n.title}</h4>
            </button>

            {openId === n.id && (
              <div className="fam-notice-body animate-fade" id={`aviso-cuerpo-${n.id}`}>
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
                        {errorRespuesta === n.id && (
                          <p className="text-sm text-danger" role="alert">No se pudo enviar tu respuesta. Revisá la conexión y probá de nuevo.</p>
                        )}
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
