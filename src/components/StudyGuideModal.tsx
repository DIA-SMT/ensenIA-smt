/**
 * Modal de guía de estudio (Modo Estudio): la versión "para estudiar"
 * del material, generada por IA y cacheada en el servidor.
 */

import { X, GraduationCap } from 'lucide-react';
import MarkdownRenderer from './MarkdownRenderer';
import './Modals.css';

interface Props {
  title: string;
  guide: string;
  onClose: () => void;
}

export default function StudyGuideModal({ title, guide, onClose }: Props) {
  return (
    <div className="em-modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="em-modal em-modal-lg">
        <div className="em-modal-header">
          <h3><GraduationCap size={17} className="text-ia-accent" /> Guía de estudio — {title}</h3>
          <button className="btn-icon" onClick={onClose}><X size={18} /></button>
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
    </div>
  );
}
