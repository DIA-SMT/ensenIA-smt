/**
 * Comunicados de dirección (docente) y avisos de la escuela (estudiante,
 * /avisos, 059). Lo que dirección manda desde Comunicaciones —a todos, a un
 * curso o a una persona— llega acá. Abrir uno lo marca como leído: dirección
 * ve quién lo leyó.
 *
 * Antes de esta pantalla dirección los mandaba y nadie los veía: no había
 * dónde leerlos y siempre decía "Leído por 0".
 */

import { useEffect, useState } from 'react';
import { Megaphone, ChevronDown, AlertTriangle } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { getCommunicationsBySchool, markCommunicationRead, EVENTO_COMUNICADO_LEIDO } from '../services/communications.service';
import type { Communication } from '../types';
import EstadoVacio from '../components/ui/EstadoVacio';
import { Esqueleto } from '../components/ui/Esqueleto';
import './ComunicadosDireccion.css';

const fecha = (iso: string) =>
  new Date(iso).toLocaleDateString('es-AR', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

export default function ComunicadosDireccion() {
  const { user } = useAuth();
  const [lista, setLista] = useState<Communication[] | null>(null);
  const [fallo, setFallo] = useState(false);
  const [abierto, setAbierto] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    getCommunicationsBySchool(user.schoolId)
      .then(c => setLista(c.filter(x => x.fromUserId !== user.id)))
      .catch(err => { console.error(err); setFallo(true); setLista([]); });
  }, [user]);

  if (!user) return null;
  const esEstudiante = user.role === 'estudiante';
  const paraQuien = (c: Communication) => {
    if (c.toUserIds !== 'all') return 'Para vos';
    if (c.audiencia === 'estudiantes') return c.courseName ? `Para ${c.courseName}` : 'Para toda la escuela';
    return c.courseName ? `Para los docentes de ${c.courseName}` : 'Para todo el equipo';
  };

  const abrir = (c: Communication) => {
    const ya = abierto === c.id;
    setAbierto(ya ? null : c.id);
    if (ya || c.readBy.includes(user.id)) return;
    // Optimista: se ve leído al instante; si falla, la próxima vez se reintenta
    setLista(prev => prev?.map(x => (x.id === c.id ? { ...x, readBy: [...x.readBy, user.id] } : x)) ?? prev);
    markCommunicationRead(c.id, user.id)
      .then(() => window.dispatchEvent(new Event(EVENTO_COMUNICADO_LEIDO)))
      .catch(console.error);
  };

  const sinLeer = (lista ?? []).filter(c => !c.readBy.includes(user.id)).length;

  return (
    <div className="cd-container animate-in">
      <p className="text-secondary">
        {esEstudiante ? 'Lo que te manda la escuela.' : 'Lo que te manda dirección.'} {sinLeer > 0 ? `Tenés ${sinLeer} sin leer.` : 'Estás al día.'} Al abrir uno, {esEstudiante ? 'la escuela' : 'dirección'} ve que lo leíste.
      </p>

      {lista === null && <Esqueleto tipo="filas" cantidad={3} etiqueta="Cargando comunicados…" />}
      {fallo && <p className="text-sm text-danger" role="alert">No se pudieron traer los comunicados. Revisá la conexión y volvé a entrar.</p>}

      {lista && lista.length === 0 && !fallo && (
        <EstadoVacio
          icono={Megaphone}
          titulo="Todavía no hay comunicados"
          texto={esEstudiante ? 'Cuando la escuela te mande un aviso a vos, a tu curso o a todos, aparece acá.' : 'Cuando dirección te mande algo a vos o a todo el equipo, aparece acá.'}
        />
      )}

      {lista && lista.length > 0 && (
        <ul className="cd-lista">
          {lista.map(c => {
            const leido = c.readBy.includes(user.id);
            const esteAbierto = abierto === c.id;
            return (
              <li key={c.id} className={`card cd-item ${leido ? '' : 'sin-leer'} ${c.priority === 'high' ? 'urgente' : ''}`}>
                <button type="button" className="cd-cabecera" aria-expanded={esteAbierto} onClick={() => abrir(c)}>
                  {!leido && <span className="cd-punto" aria-label="sin leer" />}
                  <span className="cd-texto">
                    <strong>{c.subject}</strong>
                    <small>{c.fromName || 'Dirección'} · {fecha(c.sentAt)} · {paraQuien(c)}</small>
                  </span>
                  {c.priority === 'high' && <span className="badge badge-danger"><AlertTriangle size={11} aria-hidden="true" /> Importante</span>}
                  <ChevronDown size={16} aria-hidden="true" className="cd-flecha" />
                </button>
                {esteAbierto && <div className="cd-cuerpo">{c.body}</div>}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
