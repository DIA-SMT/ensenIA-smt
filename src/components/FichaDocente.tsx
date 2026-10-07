/**
 * La ficha de un docente: cómo usa la app y qué dicen sus estudiantes.
 *
 * La misma ficha la ven la dirección (Docentes) y el propio docente (Mis
 * clases → Mi devolución): fue decisión del usuario que el docente vea lo
 * mismo que dirección ve de él. Sirve para acompañar, no para vigilar a
 * escondidas.
 *
 * La devolución de los chicos es anónima y agrupada (058): con menos de 5
 * respuestas no se muestra el detalle, y los comentarios van sin nombre ni
 * fecha.
 */

import { useEffect, useState } from 'react';
import { ClipboardList, Send, Radio, BookOpen, CalendarCheck, GraduationCap, CheckCheck, Clock, Sparkles, MessageSquareQuote, Lock } from 'lucide-react';
import { getUsoDocente, getDevolucionDocente, type UsoDocente, type DevolucionDocente } from '../services/devolucion.service';
import { LIVE_REACTIONS } from '../services/live.service';
import { Esqueleto } from './ui/Esqueleto';
import './FichaDocente.css';

const horas = (h: number | null) => {
  if (h === null) return '—';
  if (h < 24) return `${Math.round(h)} h`;
  const d = Math.round(h / 24);
  return `${d} día${d !== 1 ? 's' : ''}`;
};

const hace = (iso: string | null) => {
  if (!iso) return 'Nunca';
  const dias = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (dias <= 0) return 'Hoy';
  if (dias === 1) return 'Ayer';
  if (dias < 30) return `Hace ${dias} días`;
  return new Date(iso).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' });
};

function Dato({ icono: Icono, valor, texto, alerta }: { icono: typeof ClipboardList; valor: string | number; texto: string; alerta?: boolean }) {
  return (
    <div className={`fd-dato ${alerta ? 'alerta' : ''}`}>
      <Icono size={16} aria-hidden="true" />
      <span className="fd-dato-valor">{valor}</span>
      <span className="fd-dato-texto">{texto}</span>
    </div>
  );
}

export default function FichaDocente({ teacherId, voz }: {
  teacherId: string;
  /** 'direccion' le habla a la dirección; 'propia', al docente */
  voz: 'direccion' | 'propia';
}) {
  const [uso, setUso] = useState<UsoDocente | null | undefined>(undefined);
  const [dev, setDev] = useState<DevolucionDocente | null | undefined>(undefined);
  const [fallo, setFallo] = useState(false);

  useEffect(() => {
    let vivo = true;
    // Al cambiar de docente, el que la usa le cambia la key: arranca de cero
    Promise.all([getUsoDocente(teacherId, 30), getDevolucionDocente(teacherId, 90)])
      .then(([u, d]) => { if (vivo) { setUso(u); setDev(d); } })
      .catch(err => { console.error(err); if (vivo) setFallo(true); });
    return () => { vivo = false; };
  }, [teacherId]);

  if (fallo) return <p className="text-sm text-danger" role="alert">No se pudo cargar la ficha. Probá de nuevo en un rato.</p>;
  if (uso === undefined || dev === undefined) return <Esqueleto tipo="filas" cantidad={4} etiqueta="Cargando la ficha…" />;
  if (!uso || !dev) return <p className="text-sm text-secondary">No hay datos para mostrar.</p>;

  const sus = voz === 'propia' ? 'tus' : 'sus';
  const Sus = voz === 'propia' ? 'Tus' : 'Sus';
  const total = dev.valores ? dev.valores.mucho + dev.valores.masOMenos + dev.valores.nada : 0;
  const pct = (n: number) => (total ? Math.round((n / total) * 100) : 0);
  const alertasVivo = (dev.enVivo['🐢'] ?? 0) + (dev.enVivo['❓'] ?? 0);

  return (
    <div className="fd">
      {/* ── Uso de la app ── */}
      <section className="fd-bloque" aria-labelledby={`fd-uso-${teacherId}`}>
        <h4 id={`fd-uso-${teacherId}`} className="fd-titulo">Uso de la app <small>últimos {uso.dias} días · última actividad: {hace(uso.ultimaActividad)}</small></h4>
        <div className="fd-datos">
          <Dato icono={ClipboardList} valor={uso.actividades} texto="actividades publicadas" />
          <Dato icono={Send} valor={uso.clasesEnviadas} texto="clases armadas enviadas" />
          <Dato icono={Radio} valor={uso.clasesEnVivo} texto="clases en vivo" />
          <Dato icono={BookOpen} valor={uso.materialesCompartidos} texto={`materiales compartidos (de ${uso.materiales})`} />
          <Dato icono={CalendarCheck} valor={uso.listasAsistencia} texto="listas de asistencia" />
          <Dato icono={GraduationCap} valor={uso.notasTrimestre + uso.evaluaciones} texto="notas y evaluaciones cargadas" />
          <Dato icono={CheckCheck} valor={uso.corregidas} texto={`entregas corregidas · ${uso.sinCorregir} sin corregir`} alerta={uso.sinCorregir > 10} />
          <Dato icono={Clock} valor={horas(uso.horasParaCorregir)} texto="tarda en corregir (mediana)" />
          <Dato icono={Sparkles} valor={uso.usosIA} texto="usos de IA" />
        </div>
      </section>

      {/* ── La devolución de los chicos ── */}
      <section className="fd-bloque" aria-labelledby={`fd-dev-${teacherId}`}>
        <h4 id={`fd-dev-${teacherId}`} className="fd-titulo">Qué dicen {sus} estudiantes <small>últimos 90 días</small></h4>

        {!dev.suficiente ? (
          <p className="fd-pocos">
            <Lock size={14} aria-hidden="true" />
            {dev.total === 0
              ? `Todavía no hay respuestas. Los estudiantes responden "¿te sirvió?" al entregar una tarea o al terminar una clase en vivo.`
              : `Hay ${dev.total} respuesta${dev.total !== 1 ? 's' : ''}. El detalle se muestra con ${dev.minimo} o más, para que nadie pueda adivinar quién respondió.`}
          </p>
        ) : (
          <>
            <ul className="fd-valores" aria-label={`${total} respuestas`}>
              {[
                { emoji: '😃', texto: 'Me sirvió mucho', n: dev.valores!.mucho },
                { emoji: '🙂', texto: 'Más o menos', n: dev.valores!.masOMenos },
                { emoji: '😕', texto: 'No me sirvió', n: dev.valores!.nada },
              ].map(v => (
                <li key={v.texto}>
                  <span className="fd-valor-nombre"><span aria-hidden="true">{v.emoji}</span> {v.texto}</span>
                  <span className="fd-barra"><span style={{ width: `${pct(v.n)}%` }} /></span>
                  <span className="fd-valor-n">{pct(v.n)}% <small>({v.n})</small></span>
                </li>
              ))}
            </ul>
            <p className="fd-total">{total} respuestas anónimas</p>

            {dev.porGrupo && dev.porGrupo.length > 1 && (
              <table className="fd-grupos">
                <caption className="sr-only">Por materia y curso</caption>
                <thead><tr><th scope="col">Materia y curso</th><th scope="col">Respuestas</th><th scope="col">Me sirvió mucho</th><th scope="col">No me sirvió</th></tr></thead>
                <tbody>
                  {dev.porGrupo.map(g => (
                    <tr key={`${g.materia}-${g.curso}`}>
                      <th scope="row">{g.materia} · {g.curso}</th>
                      <td>{g.total}</td>
                      <td>{Math.round((g.mucho / g.total) * 100)}%</td>
                      <td>{Math.round((g.nada / g.total) * 100)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {dev.comentarios && dev.comentarios.length > 0 && (
              <div className="fd-comentarios">
                <h5><MessageSquareQuote size={15} aria-hidden="true" /> Comentarios ({dev.comentarios.length})</h5>
                <ul>
                  {dev.comentarios.map((c, i) => <li key={i}>«{c}»</li>)}
                </ul>
              </div>
            )}
          </>
        )}

        {/* Otras señales que ya dejaban los chicos */}
        <div className="fd-senales">
          <div>
            <h5>Material</h5>
            <p>👍 {dev.material.meSirvio} me sirvió · 👎 {dev.material.noMeSirvio} no me sirvió</p>
          </div>
          <div>
            <h5>En las clases en vivo ({dev.clasesEnVivo})</h5>
            {Object.keys(dev.enVivo).length === 0 ? (
              <p>Sin reacciones.</p>
            ) : (
              <p className="fd-reacciones">
                {LIVE_REACTIONS.filter(r => dev.enVivo[r.emoji]).map(r => (
                  <span key={r.emoji} className={r.alert ? 'fd-reaccion-alerta' : ''} title={r.label}>
                    {r.emoji} {dev.enVivo[r.emoji]} <small>{r.label.toLowerCase()}</small>
                  </span>
                ))}
              </p>
            )}
            {alertasVivo > 0 && (
              <p className="fd-pista">
                {Sus} estudiantes pidieron "más despacio" o "no entiendo" {alertasVivo} {alertasVivo === 1 ? 'vez' : 'veces'}.
                {voz === 'propia' ? ' Una pausa para preguntar ayuda.' : ''}
              </p>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
