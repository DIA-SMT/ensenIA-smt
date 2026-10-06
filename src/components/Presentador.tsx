/**
 * SMT EstudIA — Presentar un mazo a pantalla completa.
 *
 * Reemplaza al visor viejo (PresentationViewer), que solo sabía dibujar
 * título y viñetas: un mazo con columnas, preguntas, imágenes y diseño se
 * veía en el editor de una forma y al presentarlo de otra. Acá se dibuja con
 * la MISMA lámina del editor (MazoVisor → Lamina) y se baja el MISMO
 * PowerPoint (pptxMazo).
 *
 * Pensado para proyectar en el aula, con o sin internet: no pide nada a la
 * red salvo las imágenes (que quedan guardadas por el service worker).
 */

import { useCallback, useEffect, useRef, useState, type TouchEvent } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, Download, Expand, Minimize, Palette, StickyNote, X, Presentation } from 'lucide-react';
import { Lamina } from './MazoVisor';
import { DISENOS, DISENO_PREDETERMINADO, disenoDe, varsDiseno, type DisenoId } from '../lib/disenos';
import type { Mazo } from '../lib/diapositivas';
import { avisar } from './ui/avisar';
import './MazoVisor.css';
import './Presentador.css';

export default function Presentador({ mazo, pie, contexto, alCerrar, alCambiarDiseno }: {
  mazo: Mazo;
  /** Materia · curso, al pie de cada lámina. */
  pie?: string;
  contexto?: { subjectName?: string; courseName?: string; teacherName?: string };
  alCerrar: () => void;
  /** Si está, el diseño elegido acá se guarda en el material. */
  alCambiarDiseno?: (id: DisenoId) => void;
}) {
  const [i, setI] = useState(0);
  const [direccion, setDireccion] = useState<1 | -1>(1);
  const [disenoId, setDisenoId] = useState<DisenoId>(mazo.diseno ?? DISENO_PREDETERMINADO);
  const [notas, setNotas] = useState(true);
  const [bajando, setBajando] = useState(false);
  const [completa, setCompleta] = useState(false);
  const [quieto, setQuieto] = useState(false);
  const raiz = useRef<HTMLDivElement>(null);
  const toque = useRef<number | null>(null);

  const total = mazo.diapositivas.length;
  const dia = mazo.diapositivas[Math.min(i, total - 1)];

  const ir = useCallback((paso: 1 | -1) => {
    setDireccion(paso);
    setI(x => Math.max(0, Math.min(total - 1, x + paso)));
  }, [total]);

  const alternarCompleta = useCallback(async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await raiz.current?.requestFullscreen();
    } catch {
      // iPhone no deja pantalla completa en elementos: se sigue igual
    }
  }, []);

  useEffect(() => {
    const onFs = () => setCompleta(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onFs);
    return () => document.removeEventListener('fullscreenchange', onFs);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ') { e.preventDefault(); ir(1); }
      else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); ir(-1); }
      else if (e.key === 'Home') setI(0);
      else if (e.key === 'End') setI(total - 1);
      else if (e.key === 'f' || e.key === 'F') alternarCompleta();
      else if (e.key === 'Escape' && !document.fullscreenElement) alCerrar();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [ir, total, alCerrar, alternarCompleta]);

  // Proyectando, los controles se esconden si nadie mueve el mouse
  useEffect(() => {
    let t: ReturnType<typeof setTimeout>;
    const mover = () => { setQuieto(false); clearTimeout(t); t = setTimeout(() => setQuieto(true), 2500); };
    mover();
    window.addEventListener('mousemove', mover);
    return () => { clearTimeout(t); window.removeEventListener('mousemove', mover); };
  }, []);

  // Al cerrar, salir de pantalla completa
  useEffect(() => () => { if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); }, []);

  const bajar = async () => {
    setBajando(true);
    try {
      const { exportarMazoPptx } = await import('../lib/pptxMazo');
      await exportarMazoPptx({ ...mazo, diseno: disenoId }, contexto ?? {});
    } catch (err) {
      console.error(err);
      avisar.error('No se pudo armar el PowerPoint', 'Probá de nuevo en un rato.');
    } finally {
      setBajando(false);
    }
  };

  if (!dia) return null;
  const diseno = disenoDe(disenoId);

  return createPortal(
    <div
      ref={raiz}
      className={`pz ${completa ? 'pz-completa' : ''} ${quieto && completa ? 'pz-quieto' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-label={`Presentación: ${mazo.titulo}`}
      onTouchStart={(e: TouchEvent) => { toque.current = e.touches[0].clientX; }}
      onTouchEnd={(e: TouchEvent) => {
        if (toque.current === null) return;
        const dx = e.changedTouches[0].clientX - toque.current;
        toque.current = null;
        if (Math.abs(dx) > 50) ir(dx < 0 ? 1 : -1);
      }}
    >
      <div className="pz-barra">
        <span className="pz-titulo"><Presentation size={16} aria-hidden="true" /> {mazo.titulo}</span>
        <div className="pz-acciones">
          <label className="pz-btn" title="Cambiar el diseño">
            <Palette size={15} aria-hidden="true" />
            <select
              value={disenoId}
              aria-label="Diseño de la presentación"
              onChange={e => {
                const id = e.target.value as DisenoId;
                setDisenoId(id);
                alCambiarDiseno?.(id);
              }}
            >
              {DISENOS.map(d => <option key={d.id} value={d.id}>{d.nombre}</option>)}
            </select>
          </label>
          <button className={`pz-btn ${notas ? 'on' : ''}`} onClick={() => setNotas(v => !v)}
            title="Las notas son para vos: ocultalas al proyectar">
            <StickyNote size={15} /> <span className="pz-txt">Notas</span>
          </button>
          <button className="pz-btn" onClick={bajar} disabled={bajando} title="Bajar como PowerPoint">
            <Download size={15} /> <span className="pz-txt">{bajando ? 'Armando…' : 'PowerPoint'}</span>
          </button>
          <button className="pz-btn" onClick={alternarCompleta} title="Pantalla completa (F)">
            {completa ? <Minimize size={15} /> : <Expand size={15} />} <span className="pz-txt">{completa ? 'Salir' : 'Pantalla completa'}</span>
          </button>
          <button className="pz-btn pz-cerrar" onClick={alCerrar} aria-label="Cerrar (Esc)"><X size={17} /></button>
        </div>
      </div>

      <div className="pz-escenario">
        <button className="pz-nav" onClick={() => ir(-1)} disabled={i === 0} aria-label="Anterior"><ChevronLeft size={28} /></button>
        <div className="pz-caja mv mv-grande" style={varsDiseno(diseno, dia.tipo === 'pregunta')}>
          {/* key: cada lámina entra con su animación */}
          <div key={i} className={`pz-entra ${direccion === 1 ? 'pz-desde-der' : 'pz-desde-izq'}`}
            aria-roledescription="diapositiva" aria-label={`Diapositiva ${i + 1} de ${total}`} aria-live="polite">
            <Lamina dia={dia} pie={pie} />
          </div>
        </div>
        <button className="pz-nav" onClick={() => ir(1)} disabled={i >= total - 1} aria-label="Siguiente"><ChevronRight size={28} /></button>
      </div>

      {notas && dia.nota && (
        <div className="pz-nota" role="note"><StickyNote size={14} aria-hidden="true" /> <p><strong>Para vos:</strong> {dia.nota}</p></div>
      )}

      <div className="pz-progreso">
        <div className="pz-barra-avance" style={{ width: `${((i + 1) / total) * 100}%` }} />
        <span className="pz-contador">{i + 1} / {total}</span>
        <div className="pz-puntos">
          {mazo.diapositivas.map((_, k) => (
            <button key={k} className={`pz-punto ${k === i ? 'on' : ''}`} aria-label={`Ir a la diapositiva ${k + 1}`}
              onClick={() => { setDireccion(k > i ? 1 : -1); setI(k); }} />
          ))}
        </div>
      </div>
    </div>,
    document.body,
  );
}
