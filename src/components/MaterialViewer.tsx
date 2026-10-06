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

import { useCallback, useEffect, useMemo, useState } from 'react';
import { X, FileText, ExternalLink, Download } from 'lucide-react';
import { getSignedUrl, wordAHtml } from '../services/documents.service';
import MarkdownRenderer from './MarkdownRenderer';
import PdfVista from './PdfVista';
import Dialogo from './shell/Dialogo';
import { Cargando } from './ui/Esqueleto';
import { parseYouTubeId, youTubeEmbedUrl } from '../lib/youtube';
import { mazoDe } from '../lib/mazoDe';
import { TAG_LETRA_GRANDE } from '../services/library.service';
import MazoVisor from './MazoVisor';
import JuegoPalabrasVista from './JuegoPalabrasVista';
import { esJuego } from '../lib/juegos';
import { esDiagrama } from '../lib/diagramas';
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
  /** Pantalla completa y letra grande, para el proyector del aula. */
  proyectar?: boolean;
  /** Solo para el docente: si el material son diapositivas, ofrecer sus notas. */
  verNotas?: boolean;
}

const ERROR_ABRIR = 'No se pudo abrir el material. Probá de nuevo en un rato.';

export default function MaterialViewer({ material, onClose, onDescargar, proyectar = false, verNotas = false }: MaterialViewerProps) {
  const conArchivo = Boolean(material.storagePath);
  const esImagen = conArchivo && material.fileType === 'image';
  const esPdf = conArchivo && material.fileType === 'pdf';
  const esWord = conArchivo && material.fileType === 'doc';
  const esLink = material.fileType === 'link';
  const videoId = material.videoUrl ? parseYouTubeId(material.videoUrl) : null;
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
  // Crucigrama o criptograma (054): se juega acá adentro, no se lee su texto
  const juego = esJuego(material.visual) ? material.visual : null;
  // Diagrama: es una imagen; su texto alternativo es la descripción
  const diagrama = esDiagrama(material.visual) ? material.visual : null;
  const soloTexto = Boolean(texto) && !conArchivo && !esLink && !videoId && !juego;
  // Diapositivas guardadas: se pasan una por una en vez de leerse como texto.
  // Las mismas láminas que en el editor (tipos, imágenes y diseño), venga el
  // mazo en el formato nuevo o en el viejo.
  const deck = useMemo(() => (soloTexto ? mazoDe(material) : null), [soloTexto, material]);
  // Versión adaptada con "letra grande e interlineado"
  const letraGrande = (material.tags ?? []).includes(TAG_LETRA_GRANDE);
  const seVe = Boolean(videoId) || (esImagen && url) || (esPdf && url && !pdfFallo) || (esWord && wordHtml);
  // Formato que no se puede mostrar, o falló al mostrarlo
  const sinVistaPrevia = conArchivo && !esLink && !cargando && !seVe;

  // <dialog> con showModal(): va en la capa de arriba del navegador, así que
  // un ancestro con transform (la animación de entrada de las páginas) ya no
  // lo deja atrapado debajo de las barras. Escape y tocar afuera cierran.
  return (
    <Dialogo
      abierto
      alCerrar={onClose}
      etiqueta={material.title}
      className={`dialogo-em ${proyectar ? 'mv-overlay-proyector' : ''}`}
    >
      <div className={`em-modal mv-modal ${proyectar ? 'mv-proyector' : ''}`}>
        <div className="em-modal-header">
          <h3><FileText size={17} aria-hidden="true" /> {material.title}</h3>
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
          {cargando && <Cargando texto="Abriendo el material…" />}

          {videoId && (
            <div className="mv-video">
              <iframe src={youTubeEmbedUrl(videoId)} title={material.title}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen />
            </div>
          )}

          {esImagen && url && (
            <img className="mv-imagen" src={url} alt={diagrama?.descripcion || material.title} />
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

          {juego && <JuegoPalabrasVista juego={juego} />}

          {/* Material que es solo texto (un tema del temario, un módulo armado
              con IA): se lee directo, sin desplegable. */}
          {deck && (
            <MazoVisor
              mazo={deck}
              notas={verNotas && !proyectar}
              grande={proyectar}
              pie={material.subjectName || undefined}
            />
          )}
          {soloTexto && !deck && texto && (
            <div className={`mv-texto-solo ${letraGrande ? 'mv-letra-grande' : ''}`}><MarkdownRenderer content={texto} /></div>
          )}

          {/* El texto extraído sirve para buscar, copiar una cita o leer
              cuando el archivo es pesado o no se pudo mostrar. */}
          {texto && (conArchivo || videoId) && (
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

          {!conArchivo && !esLink && !texto && !videoId && (
            <p className="text-secondary text-sm">
              Este material no tiene una vista previa disponible. Pedile a tu docente
              que lo vuelva a subir.
            </p>
          )}
        </div>
      </div>
    </Dialogo>
  );
}
