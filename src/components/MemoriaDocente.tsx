/**
 * Memoria del docente (062), en Ajustes: lo que la IA recuerda de cómo
 * trabaja (formatos, enfoque, lo que corrige, cómo es cada curso en general,
 * lo que ya trabajó). Sale de sus charlas con la IA; la ve, la borra y la
 * apaga él. Nadie más la lee, y nunca guarda nada de un estudiante en
 * particular.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Brain, Trash2 } from 'lucide-react';
import { avisar, confirmar } from './ui/avisar';
import {
  getEstadoMemoriaDocente, cambiarMemoriaDocente, getNotasDocente, borrarNotaDocente,
  ETIQUETA_NOTA_DOCENTE, type NotaDocente,
} from '../services/planificacion.service';
import './MemoriaEstudio.css';

export default function MemoriaDocente() {
  const [activa, setActiva] = useState<boolean | null>(null);
  const [notas, setNotas] = useState<NotaDocente[] | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const ref = useRef<HTMLElement>(null);

  const cargar = useCallback(() => {
    getEstadoMemoriaDocente().then(e => setActiva(e.activa)).catch(() => setActiva(null));
    getNotasDocente().then(setNotas).catch(() => setNotas([]));
  }, []);
  useEffect(() => { cargar(); }, [cargar]);

  // Llega desde Mi planificación con #memoria-docente
  useEffect(() => {
    if (window.location.hash === '#memoria-docente' && activa !== null) ref.current?.scrollIntoView({ block: 'start' });
  }, [activa]);

  // Sin la migración 062 no hay nada que mostrar
  if (activa === null) return null;

  const cambiar = async () => {
    if (activa) {
      const si = await confirmar({
        titulo: '¿Apagar la memoria?',
        mensaje: 'La IA borra ahora todo lo que recuerda de cómo trabajás y deja de anotar. La podés volver a prender.',
        accion: 'Apagar y borrar', peligro: true,
      });
      if (!si) return;
    }
    setOcupado(true);
    try {
      const e = await cambiarMemoriaDocente(!activa);
      setActiva(e.activa);
      if (!e.activa) setNotas([]);
    } catch (err) {
      avisar.error((err as Error).message);
    } finally {
      setOcupado(false);
    }
  };

  const borrar = async (n: NotaDocente) => {
    try {
      await borrarNotaDocente(n.id);
      setNotas(prev => (prev ?? []).filter(x => x.id !== n.id));
    } catch (err) {
      avisar.error((err as Error).message);
    }
  };

  return (
    <section ref={ref} id="memoria-docente" className="card settings-section" aria-labelledby="ajustes-memoria">
      <h2 className="settings-section-title" id="ajustes-memoria">
        <Brain size={18} aria-hidden="true" /> Lo que la IA recuerda de cómo trabajás
      </h2>
      <p className="settings-section-desc">
        Para no pedirte lo mismo cada vez: el formato de tus materiales, tu enfoque, lo que le corregís y cómo es cada curso
        en general. Sale de lo que le pedís a la IA y solo lo ves vos. Está pensada para no guardar nada de un estudiante en
        particular y filtra lo que lo parezca; si ves algo así, borralo.
      </p>
      <label className="mem-familia-acciones" style={{ alignItems: 'center' }}>
        <input type="checkbox" checked={activa} onChange={cambiar} disabled={ocupado} />
        <span>{activa ? 'Prendida' : 'Apagada: la IA no recuerda nada'}</span>
      </label>

      {activa && notas && notas.length === 0 && (
        <p className="text-secondary text-sm">Todavía no anotó nada. Va anotando cuando terminás una charla con la IA.</p>
      )}
      {activa && notas && notas.length > 0 && (
        <div>
          {notas.map(n => (
            <div key={n.id} className="mem-nota">
              <div className="mem-nota-texto">
                <span className="mem-nota-tipo">{ETIQUETA_NOTA_DOCENTE[n.tipo]}:</span>
                {n.texto}
                <span className="mem-nota-fecha">{[n.materia, n.curso].filter(Boolean).join(' · ') || 'En general'}</span>
              </div>
              <button type="button" className="btn-icon" onClick={() => borrar(n)} aria-label={`Borrar: ${n.texto}`} title="Borrar">
                <Trash2 size={15} aria-hidden="true" />
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
