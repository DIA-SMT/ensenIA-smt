/**
 * Reproductor de video embebido (YouTube en modo nocookie).
 * El estudiante ve el video dentro de la plataforma, junto a su
 * consigna, sin caer en el algoritmo ni los comentarios de YouTube.
 */

import { X } from 'lucide-react';
import { parseYouTubeId, youTubeEmbedUrl } from '../lib/youtube';
import './VideoModal.css';
import './Modals.css';

export default function VideoModal({ url, title, onClose }: {
  url: string;
  title: string;
  onClose: () => void;
}) {
  const videoId = parseYouTubeId(url);

  return (
    <div className="em-modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="em-modal video-modal" role="dialog" aria-label={title}>
        <div className="em-modal-header">
          <h3>🎬 {title}</h3>
          <button className="btn-icon" aria-label="Cerrar" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="video-frame-wrap">
          {videoId ? (
            <iframe
              className="video-frame"
              src={youTubeEmbedUrl(videoId)}
              title={title}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          ) : (
            <p className="text-secondary p-6">No se pudo leer la dirección del video.</p>
          )}
        </div>
        <p className="video-hint text-xs text-subtle">
          El video se transmite desde YouTube (consume datos). Lo generado a partir de él —resumen, placas, podcast— sí queda disponible sin conexión.
        </p>
      </div>
    </div>
  );
}
