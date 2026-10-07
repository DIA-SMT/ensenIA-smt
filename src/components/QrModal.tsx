/**
 * QR gigante para proyectar en el aula o imprimir.
 * El estudiante escanea → cae directo en la actividad
 * (si no tiene sesión, loguea una vez y sigue derecho).
 */

import { useEffect, useRef, useState } from 'react';
import { X, Download, QrCode } from 'lucide-react';
import QRCode from 'qrcode';
import Dialogo from './shell/Dialogo';
import { avisar } from './ui/avisar';
import { enlacePublico } from '../lib/direccion';
import './shell/shell.css';
import './Modals.css';
import './QrModal.css';

interface Props {
  path: string;          // ruta interna, ej: /mis-actividades/<id>
  title: string;
  subtitle?: string;
  onClose: () => void;
}

export default function QrModal({ path, title, subtitle, onClose }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState('');
  const url = enlacePublico(path);

  useEffect(() => {
    if (!canvasRef.current) return;
    QRCode.toCanvas(canvasRef.current, url, {
      width: 560,
      margin: 2,
      errorCorrectionLevel: 'M',
      color: { dark: '#0F1419', light: '#FFFFFF' },
    }).catch(() => setError('No se pudo generar el QR.'));
  }, [url]);

  const handleDownload = async () => {
    try {
      const dataUrl = await QRCode.toDataURL(url, {
        width: 1200,
        margin: 3,
        errorCorrectionLevel: 'M',
        color: { dark: '#0F1419', light: '#FFFFFF' },
      });
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = `qr_${title.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w]+/g, '_').slice(0, 50)}.png`;
      a.click();
      avisar.exito('QR descargado', 'Lo encontrás en la carpeta de descargas.');
    } catch {
      setError('No se pudo descargar el QR.');
    }
  };

  // Sobre el <dialog> nativo: va a la capa de arriba de todo, así que el
  // .animate-in (con transform) de la página que lo abre ya no lo corre ni
  // lo deja tapado por la topbar justo cuando lo estás proyectando.
  return (
    <Dialogo abierto alCerrar={onClose} etiquetadoPor="qr-titulo" className="dialogo-em">
      <div className="em-modal qr-modal">
        <div className="em-modal-header">
          <h3 id="qr-titulo"><QrCode size={17} className="text-cyan" aria-hidden="true" /> {title}</h3>
          <button className="btn-icon" aria-label="Cerrar" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="em-modal-body qr-body">
          {error && <div className="em-error">{error}</div>}
          <div className="qr-canvas-wrap">
            <canvas ref={canvasRef} />
          </div>
          <p className="qr-hint">
            {subtitle ?? 'Proyectalo en el aula o imprimilo: los estudiantes escanean y caen directo en la actividad.'}
          </p>
          <code className="qr-url">{url}</code>
        </div>
        <div className="em-modal-footer">
          <button className="btn btn-outline btn-sm" onClick={handleDownload}>
            <Download size={14} /> Descargar PNG
          </button>
          <button className="btn btn-primary btn-sm" onClick={onClose} data-inicial>Listo</button>
        </div>
      </div>
    </Dialogo>
  );
}
