/**
 * ¿Está todo listo para usar sin señal? (fase 3)
 *
 * Los datos se bajan solos al abrir la app con señal; las imágenes y los
 * PDF, solos solo con wifi. Acá el estudiante ve cuándo fue la última vez,
 * si faltan archivos, y puede bajar todo de una, sabiendo que usa datos.
 */

import { useEffect, useState } from 'react';
import { CloudDownload, CheckCircle2, Loader2, WifiOff } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { usePreferencias } from '../contexts/PreferencesContext';
import { useSenial } from '../lib/useSenial';
import { puedeGuardarSinConexion } from '../lib/archivosOffline';
import {
  alCambiarEstado, conWifi, estadoSinSenial, prepararSinSenial, sabeSiHayWifi,
  type AvanceSinSenial, type EstadoSinSenial,
} from '../services/sin-senial.service';
import { avisar, confirmar } from './ui/avisar';
import './ListoSinSenial.css';

const mb = (bytes: number) => Math.max(0.1, Math.round(bytes / 104857.6) / 10).toLocaleString('es-AR');

function hace(iso: string): string {
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 1) return 'recién';
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `hace ${h} h`;
  return new Date(iso).toLocaleDateString('es-AR', { day: 'numeric', month: 'numeric' });
}

export default function ListoSinSenial() {
  const { user } = useAuth();
  const { ahorroActivo } = usePreferencias();
  const senial = useSenial();
  const [estado, setEstado] = useState<EstadoSinSenial | null>(() => (user ? estadoSinSenial(user.id) : null));
  const [avance, setAvance] = useState<AvanceSinSenial | null>(null);

  // También lo que se bajó solo (al entrar o al volver la señal)
  useEffect(() => alCambiarEstado(e => { if (e.userId === user?.id) setEstado(e); }), [user?.id]);

  if (!user || user.role !== 'estudiante' || !puedeGuardarSinConexion()) return null;

  const bajarTodo = async () => {
    if (avance) return;
    // Sin wifi (o sin saber), siempre se avisa: son los datos de un chico
    if (!conWifi()) {
      const pesoPdf = estado && estado.pdfBytes > 0 ? ` Solo los PDF que faltan pesan unos ${mb(estado.pdfBytes)} MB.` : '';
      const ok = await confirmar({
        titulo: '¿Bajar todo ahora?',
        mensaje: `Si estás con datos del celular, bajar las fotos y los PDF de tus materiales los usa.${pesoPdf} Con wifi no gasta datos.`,
        accion: 'Bajar todo',
        cancelar: 'Esperar al wifi',
      });
      if (!ok) return;
    }
    setAvance({ hechos: 0, total: 1 });
    try {
      const e = await prepararSinSenial(user, { conArchivos: true }, setAvance);
      setEstado(e);
      if (e.fallaron > 0) {
        avisar.error('Quedó casi todo', `${e.fallaron} cosa${e.fallaron > 1 ? 's' : ''} no se pudo bajar. Probá de nuevo con mejor señal.`);
      } else if (e.archivosFaltan > 0) {
        avisar.exito('Bajó una parte', `Quedan ${e.archivosFaltan} archivos: tocá de nuevo para seguir.`);
      } else {
        avisar.exito('Listo: ya lo podés usar sin señal');
      }
    } catch (err) {
      avisar.error('No se pudo bajar', err instanceof Error ? err.message : 'Probá de nuevo.');
    } finally {
      setAvance(null);
    }
  };

  if (avance) {
    return (
      <div className="lss lss-bajando" role="status">
        <Loader2 size={16} className="spin" aria-hidden="true" />
        <span>Bajando para usar sin señal… {avance.total > 1 ? `${avance.hechos} de ${avance.total}` : ''}</span>
        <progress max={Math.max(avance.total, 1)} value={avance.hechos} aria-hidden="true" />
      </div>
    );
  }

  if (!estado) {
    return (
      <div className="lss">
        {senial ? <CloudDownload size={16} aria-hidden="true" /> : <WifiOff size={16} aria-hidden="true" />}
        <span>
          {senial
            ? 'Bajá tus actividades y materiales para hacerlos aunque no tengas datos.'
            : 'Sin señal: lo que ya abriste con conexión se puede usar igual.'}
        </span>
        {senial && (
          <button type="button" className="btn btn-secondary btn-sm" onClick={bajarTodo}>
            <CloudDownload size={14} /> Bajar ahora
          </button>
        )}
      </div>
    );
  }

  const listo = estado.archivosFaltan === 0 && estado.fallaron === 0;
  // Solo se promete lo que pasa: los archivos se bajan solos con wifi, si
  // el navegador sabe cuándo hay wifi y no está el ahorro de datos
  const solosConWifi = sabeSiHayWifi() && !ahorroActivo;
  return (
    <div className={`lss ${listo ? 'lss-listo' : ''}`}>
      {listo ? <CheckCircle2 size={16} aria-hidden="true" /> : <CloudDownload size={16} aria-hidden="true" />}
      <span>
        {listo ? 'Listo para usar sin señal' : 'Tus actividades ya se pueden hacer sin señal'}
        {': '}{estado.actividades} actividad{estado.actividades !== 1 ? 'es' : ''} y {estado.materiales} material{estado.materiales !== 1 ? 'es' : ''}
        {' · '}{hace(estado.cuando)}.
        {estado.archivosFaltan > 0 && (
          <> Faltan {estado.archivosFaltan} archivo{estado.archivosFaltan !== 1 ? 's' : ''} (fotos o PDF)
            {solosConWifi ? ': se bajan solos con wifi.' : ': bajalos cuando tengas wifi.'}</>
        )}
        {estado.fallaron > 0 && <> {estado.fallaron} cosa{estado.fallaron > 1 ? 's' : ''} no se pudo bajar.</>}
      </span>
      {senial && (
        <button type="button" className="btn btn-ghost btn-sm" onClick={bajarTodo}>
          <CloudDownload size={14} /> {listo ? 'Actualizar' : 'Bajar todo'}
        </button>
      )}
    </div>
  );
}
