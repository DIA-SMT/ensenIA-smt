/**
 * Aclaraciones para todo el curso (fase 4), en la actividad del docente.
 * Lo que publica acá lo ven todos los que tienen la actividad, también sin
 * señal. Sirve para responder una sola vez lo que preguntan varios.
 *
 * Como los mensajes, no se editan ni se borran (066): se retiran, los
 * estudiantes dejan de verlas y la dirección las sigue viendo. Para
 * corregir una, se publica otra y se retira la vieja.
 */

import { useEffect, useState } from 'react';
import { Megaphone, Plus, EyeOff, AlertCircle } from 'lucide-react';
import { getAclaraciones, publicarAclaracion, retirarAclaracion, type Aclaracion } from '../services/seguimiento.service';
import { useSenial } from '../lib/useSenial';
import { avisar, confirmar } from './ui/avisar';
import './AclaracionesEditor.css';

type Estado = 'draft' | 'published' | 'closed';

const AL_PUBLICAR: Record<Estado, string> = {
  published: 'La ven todos los que tienen la actividad.',
  draft: 'La van a ver cuando publiques la actividad.',
  closed: 'La actividad está cerrada: los estudiantes la ven si la volvés a abrir.',
};

export default function AclaracionesEditor({ activityId, estado }: { activityId: string; estado: Estado }) {
  const senial = useSenial();
  const [lista, setLista] = useState<Aclaracion[] | null>(null);
  const [fallo, setFallo] = useState(false);
  const [nueva, setNueva] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    setFallo(false);
    getAclaraciones(activityId).then(setLista).catch(() => { setLista(null); setFallo(true); });
  }, [activityId]);

  const publicar = async () => {
    if (!nueva?.trim() || guardando) return;
    setGuardando(true);
    try {
      const a = await publicarAclaracion(activityId, nueva);
      setLista(prev => [...(prev ?? []), a]);
      setNueva(null);
      avisar.exito('Aclaración publicada', AL_PUBLICAR[estado]);
    } catch (err) {
      avisar.error('No se pudo publicar', err instanceof Error && err.message ? err.message : 'Probá de nuevo.');
    } finally {
      setGuardando(false);
    }
  };

  const retirar = async (a: Aclaracion) => {
    const ok = await confirmar({
      titulo: '¿Retirar esta aclaración?',
      mensaje: 'Los estudiantes dejan de verla (en los celulares que ya la bajaron, cuando vuelvan a abrir la actividad con señal). Queda registrada para la dirección.',
      accion: 'Retirar',
      peligro: true,
    });
    if (!ok) return;
    try {
      await retirarAclaracion(a.id);
      setLista(prev => (prev ?? []).filter(x => x.id !== a.id));
    } catch (err) {
      avisar.error('No se pudo retirar', err instanceof Error && err.message ? err.message : 'Probá de nuevo.');
    }
  };

  return (
    <section className="acl-ed" aria-labelledby={`acl-ed-${activityId}`}>
      <div className="acl-ed-cabecera">
        <h4 id={`acl-ed-${activityId}`}><Megaphone size={15} aria-hidden="true" /> Aclaraciones para todo el curso</h4>
        {nueva === null && !fallo && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setNueva('')} disabled={!senial}
            title={senial ? undefined : 'Hace falta señal'}>
            <Plus size={14} aria-hidden="true" /> Agregar
          </button>
        )}
      </div>
      {/* Si no se pudieron traer, no decir "no hay": invitaría a publicar otra igual */}
      {fallo && (
        <p className="acl-ed-vacio" role="status">
          <AlertCircle size={13} aria-hidden="true" /> No se pudieron traer las aclaraciones{senial ? '. Probá de nuevo en un rato.' : ': hace falta señal.'}
        </p>
      )}
      {lista !== null && lista.length === 0 && nueva === null && (
        <p className="acl-ed-vacio">Si varios preguntan lo mismo, respondelo acá una vez: lo ven todos en la actividad.</p>
      )}
      {lista !== null && lista.length > 0 && (
        <ul className="acl-ed-lista">
          {lista.map(a => (
            <li key={a.id}>
              <p>{a.texto}</p>
              <div className="acl-ed-acciones">
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => retirar(a)} disabled={!senial}>
                  <EyeOff size={14} aria-hidden="true" /> Retirar
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {nueva !== null && (
        <div className="acl-ed-nueva">
          <textarea rows={3} maxLength={2000} value={nueva} autoFocus aria-label="Nueva aclaración"
            placeholder="Ej: En la parte 2 alcanza con plantear la ecuación, no hace falta resolverla."
            onChange={e => setNueva(e.target.value)} />
          <p className="acl-ed-vacio">
            No dice quién preguntó: la escribís vos. Una vez publicada no se edita ni se borra; se puede retirar.
          </p>
          <div className="acl-ed-acciones">
            <button type="button" className="btn btn-outline btn-sm" onClick={() => setNueva(null)}>Cancelar</button>
            <button type="button" className="btn btn-primary btn-sm" onClick={publicar} disabled={guardando || !nueva.trim() || !senial}>
              <Megaphone size={14} aria-hidden="true" /> {guardando ? 'Publicando…' : 'Publicar para todos'}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
