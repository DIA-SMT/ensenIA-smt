/**
 * SMT EstudIA — Reproductor del mini podcast de un material.
 * Resuelve la URL firmada del MP3 y muestra un audio player simple.
 */

import { useState, useEffect } from 'react';
import { X, Headphones, Download } from 'lucide-react';
import { getSignedUrl } from '../services/documents.service';
import './Modals.css';

interface Props {
  path: string;
  title: string;
  onClose: () => void;
}

export default function PodcastPlayer({ path, title, onClose }: Props) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    getSignedUrl(path)
      .then(setUrl)
      .catch(() => setError('No se pudo cargar el audio. Probá de nuevo.'));
  }, [path]);

  return (
    <div className="em-modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="em-modal">
        <div className="em-modal-header">
          <h3><Headphones size={17} className="text-ia-accent" /> Podcast — {title}</h3>
          <button className="btn-icon" aria-label="Cerrar" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="em-modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {error && <p className="text-sm text-danger">{error}</p>}
          {!url && !error && <p className="text-sm text-secondary">Cargando audio...</p>}
          {url && (
            <>
              {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
              <audio controls autoPlay src={url} style={{ width: '100%' }} />
              <p className="text-xs text-subtle">
                Resumen en audio generado con IA a partir del material. Ideal para repasar en el colectivo 🚌
              </p>
              <a className="btn btn-outline btn-sm" href={url} download={`podcast_${title.slice(0, 40)}.mp3`}>
                <Download size={14} /> Descargar MP3 (escuchalo sin conexión)
              </a>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
