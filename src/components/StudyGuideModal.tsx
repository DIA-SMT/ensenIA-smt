/**
 * Modal de guía de estudio (Modo Estudio): la versión "para estudiar"
 * del material, generada por IA y cacheada en el servidor.
 */

import { X, GraduationCap } from 'lucide-react';
import MarkdownRenderer from './MarkdownRenderer';
import Dialogo from './shell/Dialogo';
// Estilos que este componente usa y viven en otra hoja: se importan acá
// para que se vea bien en cualquier pantalla donde aparezca.
import '../pages/Biblioteca.css';
import './Modals.css';

interface Props {
  title: string;
  guide: string;
  onClose: () => void;
}

export default function StudyGuideModal({ title, guide, onClose }: Props) {
  return (
    <Dialogo abierto alCerrar={onClose} etiquetadoPor="guia-titulo" className="dialogo-em">
      <div className="em-modal em-modal-lg">
        <div className="em-modal-header">
          <h3 id="guia-titulo"><GraduationCap size={17} className="text-ia-accent" aria-hidden="true" /> Guía de estudio — {title}</h3>
          <button className="btn-icon" aria-label="Cerrar" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="em-modal-body">
          <div className="summary-markdown">
            <MarkdownRenderer content={guide} />
          </div>
        </div>
        <div className="em-modal-footer">
          <button className="btn btn-primary btn-sm" onClick={onClose}>Cerrar</button>
        </div>
      </div>
    </Dialogo>
  );
}
