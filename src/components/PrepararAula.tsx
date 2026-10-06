/**
 * "Preparar para el aula" (en Mi día): con señal, baja todo lo que el
 * docente usa en clase para que al otro día ande sin conexión. Ver
 * services/preparar-aula.service.ts.
 */

import { useEffect, useState } from 'react';
import { DownloadCloud, Check, Loader2, WifiOff } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { prepararParaElAula, preparadoEl, type Avance } from '../services/preparar-aula.service';
import { haySenial, suscribirConexion } from '../lib/conexion';
import './PrepararAula.css';

function cuandoTexto(d: Date): string {
  const hoy = new Date();
  const ayer = new Date(hoy);
  ayer.setDate(hoy.getDate() - 1);
  const hora = d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
  if (d.toDateString() === hoy.toDateString()) return `hoy a las ${hora}`;
  if (d.toDateString() === ayer.toDateString()) return `ayer a las ${hora}`;
  return `el ${d.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'numeric' })}`;
}

export default function PrepararAula() {
  const { user } = useAuth();
  const [preparado, setPreparado] = useState<Date | null>(() => (user ? preparadoEl(user.id) : null));
  const [avance, setAvance] = useState<Avance | null>(null);
  const [aviso, setAviso] = useState('');
  const [senial, setSenial] = useState(haySenial());

  useEffect(() => suscribirConexion(() => setSenial(haySenial())), []);

  if (!user || user.role !== 'docente') return null;

  const preparar = async () => {
    setAviso('');
    setAvance({ hechos: 0, total: 1, etapa: 'Empezando' });
    try {
      const r = await prepararParaElAula(user, setAvance);
      setPreparado(preparadoEl(user.id));
      setAviso(r.fallaron === 0
        ? 'Listo: tus cursos, libretas y fichas quedaron en este equipo.'
        : `Quedó casi todo; ${r.fallaron} de ${r.total} cosas no se pudieron bajar (la señal anduvo floja). Podés volver a prepararlo.`);
    } catch (err) {
      console.error(err);
      setAviso('Se cortó a mitad de camino. Lo que alcanzó a bajar quedó guardado; volvé a intentarlo con señal.');
    } finally {
      setAvance(null);
    }
  };

  const pct = avance && avance.total > 0 ? Math.round((avance.hechos / avance.total) * 100) : 0;

  return (
    <section className="preparar-aula" aria-labelledby="preparar-aula-titulo">
      <div className="preparar-aula-texto">
        <h2 id="preparar-aula-titulo">
          {preparado ? <Check size={16} aria-hidden="true" /> : <DownloadCloud size={16} aria-hidden="true" />}
          {preparado ? 'Listo para usar sin conexión' : 'Preparar para el aula'}
        </h2>
        <p>
          {avance
            ? `${avance.etapa}… ${pct}%`
            : preparado
              ? `Preparado ${cuandoTexto(preparado)}. Si cambiaron tus cursos o cargaste cosas nuevas, volvé a prepararlo.`
              : 'Con señal (por ejemplo, en casa), baja tus cursos, pasar lista, las libretas, el temario y las fichas de tus alumnos para usarlos en el aula sin conexión.'}
        </p>
        {avance && (
          <div className="preparar-aula-barra" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label="Avance">
            <span style={{ width: `${pct}%` }} />
          </div>
        )}
        {aviso && <p className="preparar-aula-aviso" role="status">{aviso}</p>}
      </div>
      <button
        type="button"
        className={`btn btn-sm ${preparado ? 'btn-outline' : 'btn-primary'}`}
        onClick={preparar}
        disabled={!!avance || !senial}
        title={senial ? undefined : 'Hace falta señal para preparar'}
      >
        {avance
          ? <><Loader2 size={14} className="spin" aria-hidden="true" /> Bajando…</>
          : !senial
            ? <><WifiOff size={14} aria-hidden="true" /> Sin señal</>
            : preparado ? 'Volver a preparar' : 'Preparar'}
      </button>
    </section>
  );
}
