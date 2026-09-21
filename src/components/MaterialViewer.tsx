/**
 * Visor de material de la biblioteca, para leer sin descargar.
 *
 * Pedido de las escuelas: "no tiene que descargar material y ver cosas
 * los estudiantes". El material se abre acá adentro.
 *
 * Una aclaración honesta: esto quita el botón de descarga y muestra el
 * contenido embebido, pero NO impide técnicamente que alguien guarde el
 * archivo — el visor de PDF del navegador tiene su propio botón y la URL
 * firmada se puede copiar. Lo que sí logra es que el camino normal sea
 * leer en la plataforma, que es lo que las escuelas querían: que el chico
 * no termine con veinte PDF sueltos en el celular.
 */

import { useEffect, useState } from 'react';
import { X, FileText, ExternalLink, Loader2 } from 'lucide-react';
import { getSignedUrl } from '../services/documents.service';
import MarkdownRenderer from './MarkdownRenderer';
import type { LibraryMaterial } from '../types';
import './MaterialViewer.css';

interface MaterialViewerProps {
  material: LibraryMaterial;
  onClose: () => void;
}

export default function MaterialViewer({ material, onClose }: MaterialViewerProps) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(false);

  const esImagen = material.fileType === 'image';
  const esPdf = material.fileType === 'pdf';
  const esLink = material.fileType === 'link';
  const necesitaArchivo = Boolean(material.storagePath) && (esImagen || esPdf);
  // Un .docx no se puede embeber. Casi siempre trae texto extraído y con
  // eso alcanza; cuando no, hace falta una salida honesta en vez de un
  // "no hay vista previa" que deja al estudiante sin el material.
  const sinVistaPrevia = Boolean(material.storagePath) && !necesitaArchivo && !esLink;

  useEffect(() => {
    if (!necesitaArchivo || !material.storagePath) return;
    let cancelado = false;
    setCargando(true);
    getSignedUrl(material.storagePath)
      .then(u => { if (!cancelado) setUrl(u); })
      .catch(err => {
        console.error(err);
        if (!cancelado) setError('No se pudo abrir el material. Probá de nuevo en un rato.');
      })
      .finally(() => { if (!cancelado) setCargando(false); });
    return () => { cancelado = true; };
  }, [material.storagePath, necesitaArchivo]);

  // Cerrar con Escape, como el resto de los modales del proyecto.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const texto = material.extractedText?.trim();

  return (
    <div className="em-modal-overlay" onClick={onClose}>
      <div className="em-modal mv-modal" onClick={e => e.stopPropagation()}>
        <div className="em-modal-header">
          <h3><FileText size={17} /> {material.title}</h3>
          <button className="btn btn-ghost" onClick={onClose} aria-label="Cerrar">
            <X size={18} />
          </button>
        </div>

        <div className="em-modal-body mv-body">
          {material.description && (
            <p className="text-secondary text-sm">{material.description}</p>
          )}

          {error && <div className="em-error">{error}</div>}
          {cargando && (
            <p className="text-secondary text-sm mv-cargando">
              <Loader2 size={14} className="spin" /> Abriendo el material…
            </p>
          )}

          {esImagen && url && (
            <img className="mv-imagen" src={url} alt={material.title} />
          )}

          {esPdf && url && (
            <iframe className="mv-pdf" src={url} title={material.title} />
          )}

          {esLink && (
            <div className="mv-externo">
              <p className="text-secondary text-sm">
                Este material es un enlace a otro sitio.
              </p>
              <a className="btn btn-primary btn-sm" href={material.fileName}
                 target="_blank" rel="noopener noreferrer">
                <ExternalLink size={14} /> Abrir el enlace
              </a>
            </div>
          )}

          {/* El texto extraído sirve para buscar, copiar una cita o leer
              cuando el PDF es pesado y la conexión no acompaña. */}
          {texto && (
            <details className="mv-texto" open={!necesitaArchivo && !esLink}>
              <summary>Texto del material</summary>
              <MarkdownRenderer content={texto} />
            </details>
          )}

          {sinVistaPrevia && !texto && !error && (
            <div className="mv-externo">
              <p className="text-secondary text-sm">
                Este formato no se puede mostrar acá adentro. Podés abrirlo en otra
                pestaña para leerlo.
              </p>
              <button
                className="btn btn-primary btn-sm"
                onClick={async () => {
                  if (!material.storagePath) return;
                  try {
                    const u = await getSignedUrl(material.storagePath);
                    window.open(u, '_blank', 'noopener');
                  } catch (err) {
                    console.error(err);
                    setError('No se pudo abrir el material. Probá de nuevo en un rato.');
                  }
                }}
              >
                <ExternalLink size={14} /> Abrir el material
              </button>
            </div>
          )}

          {!necesitaArchivo && !esLink && !sinVistaPrevia && !texto && !error && (
            <p className="text-secondary text-sm">
              Este material no tiene una vista previa disponible. Pedile a tu docente
              que lo vuelva a subir.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
