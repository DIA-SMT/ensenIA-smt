/**
 * QR gigante para proyectar en el aula o imprimir.
 * El estudiante escanea → cae directo en la actividad
 * (si no tiene sesión, loguea una vez y sigue derecho).
 */

import { useEffect, useRef, useState } from 'react';
import { X, Download, QrCode } from 'lucide-react';
import QRCode from 'qrcode';
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
  const url = `${window.location.origin}${path}`;

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
    } catch {
      setError('No se pudo descargar el QR.');
    }
  };

  return (
    <div className="em-modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="em-modal qr-modal">
        <div className="em-modal-header">
          <h3><QrCode size={17} className="text-cyan" /> {title}</h3>
          <button className="btn-icon" onClick={onClose}><X size={18} /></button>
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
          <button className="btn btn-primary btn-sm" onClick={onClose}>Listo</button>
        </div>
      </div>
    </div>
  );
}
