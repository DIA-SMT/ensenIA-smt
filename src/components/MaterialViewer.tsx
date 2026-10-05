/**
 * Visor de material de la biblioteca, para leer sin descargar.
 *
 * Pedido de las escuelas: "no tiene que descargar material y ver cosas
 * los estudiantes". El material se abre acá adentro: el PDF dibujado
 * página por página (en el celular el visor del navegador lo bajaba), el
 * Word con su formato y las imágenes tal cual. El docente lo usa igual,
 * con un botón aparte para descargar el archivo.
 *
 * Una aclaración honesta: esto no impide técnicamente que alguien guarde
 * el archivo (la URL firmada se puede copiar). Lo que logra es que el
 * camino normal sea leer en la plataforma, que es lo que las escuelas
 * querían: que el chico no termine con veinte PDF sueltos en el celular.
 */

import { useCallback, useEffect, useState } from 'react';
import { X, FileText, ExternalLink, Loader2, Download } from 'lucide-react';
import { getSignedUrl, wordAHtml } from '../services/documents.service';
import MarkdownRenderer from './MarkdownRenderer';
import PdfVista from './PdfVista';
import type { LibraryMaterial } from '../types';
// Estilos que este componente usa y viven en otra hoja: se importan acá
// para que se vea bien en cualquier pantalla donde aparezca.
import './Modals.css';
import './MaterialViewer.css';

interface MaterialViewerProps {
  material: LibraryMaterial;
  onClose: () => void;
  /** Solo para el docente: bajar el archivo original. */
  onDescargar?: () => void;
}

const ERROR_ABRIR = 'No se pudo abrir el material. Probá de nuevo en un rato.';

export default function MaterialViewer({ material, onClose, onDescargar }: MaterialViewerProps) {
  const conArchivo = Boolean(material.storagePath);
  const esImagen = conArchivo && material.fileType === 'image';
  const esPdf = conArchivo && material.fileType === 'pdf';
  const esWord = conArchivo && material.fileType === 'doc';
  const esLink = material.fileType === 'link';
  const necesitaArchivo = esImagen || esPdf || esWord;

  const [url, setUrl] = useState<string | null>(null);
  const [wordHtml, setWordHtml] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(necesitaArchivo);
  const [pdfFallo, setPdfFallo] = useState(false);

  useEffect(() => {
    if (!necesitaArchivo || !material.storagePath) return;
    let cancelado = false;
    setCargando(true);
    (async () => {
      try {
        const u = await getSignedUrl(material.storagePath!);
        if (esWord) {
          const resp = await fetch(u);
          if (!resp.ok) throw new Error(`descarga ${resp.status}`);
          const html = await wordAHtml(await resp.blob());
          if (!cancelado) setWordHtml(html);
        } else if (!cancelado) {
          setUrl(u);
        }
      } catch (err) {
        console.error(err);
        if (!cancelado) setError(ERROR_ABRIR);
      } finally {
        if (!cancelado) setCargando(false);
      }
    })();
    return () => { cancelado = true; };
  }, [material.storagePath, necesitaArchivo, esWord]);

  // Cerrar con Escape, como el resto de los modales del proyecto.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const alFallarPdf = useCallback(() => setPdfFallo(true), []);

  const abrirAparte = async () => {
    if (!material.storagePath) return;
    try {
      window.open(await getSignedUrl(material.storagePath), '_blank', 'noopener');
    } catch (err) {
      console.error(err);
      setError(ERROR_ABRIR);
    }
  };

  const texto = material.extractedText?.trim();
  const seVe = (esImagen && url) || (esPdf && url && !pdfFallo) || (esWord && wordHtml);
  // Formato que no se puede mostrar, o falló al mostrarlo
  const sinVistaPrevia = conArchivo && !esLink && !cargando && !seVe;

  return (
    <div className="em-modal-overlay" onClick={onClose}>
      <div className="em-modal mv-modal" role="dialog" aria-label={material.title} onClick={e => e.stopPropagation()}>
        <div className="em-modal-header">
          <h3><FileText size={17} /> {material.title}</h3>
          <div className="mv-acciones">
            {onDescargar && conArchivo && (
              <button className="btn btn-ghost btn-sm" onClick={onDescargar} title="Bajar el archivo original">
                <Download size={15} /> <span className="mv-solo-ancho">Descargar</span>
              </button>
            )}
            <button className="btn btn-ghost" onClick={onClose} aria-label="Cerrar">
              <X size={18} />
            </button>
          </div>
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

          {esPdf && url && !pdfFallo && (
            <PdfVista url={url} titulo={material.title} onError={alFallarPdf} />
          )}

          {esWord && wordHtml && (
            // Sale de mammoth y pasa por DOMPurify (wordAHtml)
            <div className="mv-word" dangerouslySetInnerHTML={{ __html: wordHtml }} />
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
              cuando el archivo es pesado o no se pudo mostrar. */}
          {texto && (
            <details className="mv-texto" open={!seVe && !esLink && !cargando}>
              <summary>Texto del material</summary>
              <MarkdownRenderer content={texto} />
            </details>
          )}

          {sinVistaPrevia && !texto && (
            <div className="mv-externo">
              <p className="text-secondary text-sm">
                Este material no se puede mostrar acá adentro. Podés abrirlo en otra
                pestaña para leerlo.
              </p>
              <button className="btn btn-primary btn-sm" onClick={abrirAparte}>
                <ExternalLink size={14} /> Abrir el material
              </button>
            </div>
          )}

          {!conArchivo && !esLink && !texto && (
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
