import { lazy, Suspense, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { useLocation } from 'react-router-dom';
import Dialogo from './shell/Dialogo';
import { Cargando } from './ui/Esqueleto';
import './FloatingMigue.css';

const Migue = lazy(() => import('../pages/Migue'));

const TAMANIO = 72;
const MARGEN = 14;
const CLAVE_POSICION = 'estudia_migue_flotante_posicion';

interface Posicion { x: number; y: number }

function limitar(posicion: Posicion): Posicion {
  return {
    x: Math.min(Math.max(MARGEN, posicion.x), Math.max(MARGEN, window.innerWidth - TAMANIO - MARGEN)),
    y: Math.min(Math.max(MARGEN, posicion.y), Math.max(MARGEN, window.innerHeight - TAMANIO - MARGEN)),
  };
}

function posicionInicial(): Posicion {
  const margenInferior = window.innerWidth <= 860 ? 112 : 24;
  const predeterminada = limitar({
    x: window.innerWidth - TAMANIO - 24,
    y: window.innerHeight - TAMANIO - margenInferior,
  });
  try {
    const guardada = JSON.parse(localStorage.getItem(CLAVE_POSICION) ?? 'null');
    if (guardada && Number.isFinite(guardada.x) && Number.isFinite(guardada.y)) {
      return limitar({ x: guardada.x, y: guardada.y });
    }
  } catch { /* Si el navegador bloquea el almacenamiento, igual se puede mover. */ }
  return predeterminada;
}

export default function FloatingMigue() {
  const { pathname } = useLocation();
  const [abierto, setAbierto] = useState(false);
  const [posicion, setPosicion] = useState<Posicion>(posicionInicial);
  const arrastre = useRef<{
    pointerId: number;
    inicioX: number;
    inicioY: number;
    origen: Posicion;
    movido: boolean;
  } | null>(null);
  const ignorarClick = useRef(false);

  useEffect(() => {
    const alRedimensionar = () => setPosicion(actual => limitar(actual));
    window.addEventListener('resize', alRedimensionar);
    return () => window.removeEventListener('resize', alRedimensionar);
  }, []);

  const alEmpezarArrastre = (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0) return;
    arrastre.current = {
      pointerId: e.pointerId,
      inicioX: e.clientX,
      inicioY: e.clientY,
      origen: posicion,
      movido: false,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const alArrastrar = (e: ReactPointerEvent<HTMLButtonElement>) => {
    const actual = arrastre.current;
    if (!actual || actual.pointerId !== e.pointerId) return;
    const dx = e.clientX - actual.inicioX;
    const dy = e.clientY - actual.inicioY;
    if (!actual.movido && Math.hypot(dx, dy) < 5) return;
    actual.movido = true;
    setPosicion(limitar({ x: actual.origen.x + dx, y: actual.origen.y + dy }));
  };

  const alTerminarArrastre = (e: ReactPointerEvent<HTMLButtonElement>) => {
    const actual = arrastre.current;
    if (!actual || actual.pointerId !== e.pointerId) return;
    const final = limitar({
      x: actual.origen.x + e.clientX - actual.inicioX,
      y: actual.origen.y + e.clientY - actual.inicioY,
    });
    if (actual.movido) {
      ignorarClick.current = true;
      setPosicion(final);
      try { localStorage.setItem(CLAVE_POSICION, JSON.stringify(final)); } catch { /* opcional */ }
    }
    arrastre.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
  };

  // En la pantalla completa de Migue no hace falta mostrar un segundo acceso.
  if (pathname === '/migue') return null;

  return (
    <>
      <button
        type="button"
        className="migue-flotante-burbuja"
        style={{ left: posicion.x, top: posicion.y }}
        aria-label="Abrir Migue, asistente pedagógico. Podés arrastrarlo para moverlo."
        title="Migue · Arrastrá para mover"
        onPointerDown={alEmpezarArrastre}
        onPointerMove={alArrastrar}
        onPointerUp={alTerminarArrastre}
        onPointerCancel={alTerminarArrastre}
        onClick={() => {
          if (ignorarClick.current) { ignorarClick.current = false; return; }
          setAbierto(true);
        }}
      >
        <span className="migue-flotante-retrato" aria-hidden="true">
          <img src="/migue-docente.jpeg" alt="" draggable={false} />
        </span>
        <span className="migue-flotante-ia" aria-hidden="true">IA</span>
        <span className="migue-flotante-agarre" aria-hidden="true">•••</span>
      </button>

      <Dialogo abierto={abierto} alCerrar={() => setAbierto(false)} etiqueta="Migue, asistente pedagógico" className="dialogo-migue">
        <Suspense fallback={<Cargando texto="Abriendo a Migue…" />}>
          <Migue enPanel alCerrar={() => setAbierto(false)} />
        </Suspense>
      </Dialogo>
    </>
  );
}
