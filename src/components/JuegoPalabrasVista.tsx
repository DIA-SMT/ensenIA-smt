/**
 * Jugar un crucigrama o un criptograma (lib/juegos).
 *
 * Lo usan el docente (vista previa) y el estudiante (desde Mis materiales).
 * Es liviano a propósito: solo inputs y CSS, sin librerías, para que ande en
 * los celulares viejos que tienen los chicos.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle, Eye, RotateCcw } from 'lucide-react';
import { soloLetras, type Crucigrama, type Criptograma, type JuegoPalabras } from '../lib/juegos';
import { confirmar } from './ui/avisar';
import './JuegoPalabras.css';

export default function JuegoPalabrasVista({ juego }: { juego: JuegoPalabras }) {
  return juego.tipo === 'crucigrama' ? <CrucigramaVista juego={juego} /> : <CriptogramaVista juego={juego} />;
}

type Estado = 'jugando' | 'revisado' | 'resuelto';

// ── Crucigrama ──

function CrucigramaVista({ juego }: { juego: Crucigrama }) {
  const vacio = () => juego.celdas.map(f => f.map(c => (c ? '' : null)));
  const [escrito, setEscrito] = useState<(string | null)[][]>(vacio);
  const [activa, setActiva] = useState<{ f: number; c: number } | null>(null);
  const [direccion, setDireccion] = useState<'horizontal' | 'vertical'>('horizontal');
  const [estado, setEstado] = useState<Estado>('jugando');
  const refs = useRef<Record<string, HTMLInputElement | null>>({});

  // El casillero se achica para que la grilla entre en el ancho (celular o
  // diálogo), con un mínimo para que se pueda tocar con el dedo
  const contenedor = useRef<HTMLDivElement>(null);
  const [lado, setLado] = useState(38);
  useEffect(() => {
    const el = contenedor.current;
    if (!el) return;
    const medir = () => {
      const disponible = el.clientWidth - (juego.columnas - 1) * 2 - 4;
      setLado(Math.max(24, Math.min(40, Math.floor(disponible / juego.columnas))));
    };
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    return () => ro.disconnect();
  }, [juego.columnas]);

  const palabraDe = (f: number, c: number, dir: 'horizontal' | 'vertical') =>
    juego.palabras.find(p => p.direccion === dir && (dir === 'horizontal'
      ? p.fila === f && c >= p.col && c < p.col + p.respuesta.length
      : p.col === c && f >= p.fila && f < p.fila + p.respuesta.length));

  const actual = activa ? (palabraDe(activa.f, activa.c, direccion) ?? palabraDe(activa.f, activa.c, direccion === 'horizontal' ? 'vertical' : 'horizontal')) : null;
  const enActual = (f: number, c: number) => !!actual && (actual.direccion === 'horizontal'
    ? actual.fila === f && c >= actual.col && c < actual.col + actual.respuesta.length
    : actual.col === c && f >= actual.fila && f < actual.fila + actual.respuesta.length);

  const enfocar = (f: number, c: number) => refs.current[`${f},${c}`]?.focus();
  const existe = (f: number, c: number) => !!juego.celdas[f]?.[c];

  const mover = (f: number, c: number, paso: 1 | -1) => {
    const dir = actual?.direccion ?? direccion;
    const nf = dir === 'vertical' ? f + paso : f;
    const nc = dir === 'horizontal' ? c + paso : c;
    if (existe(nf, nc)) enfocar(nf, nc);
  };

  const escribir = (f: number, c: number, valor: string) => {
    const letra = soloLetras(valor).slice(-1);
    setEscrito(prev => prev.map((fila, i) => fila.map((x, j) => (i === f && j === c ? letra : x))));
    if (estado !== 'jugando') setEstado('jugando');
    if (letra) mover(f, c, 1);
  };

  const completo = escrito.every((fila, f) => fila.every((x, c) => x === null || x === juego.celdas[f][c]!.letra));
  if (completo && estado !== 'resuelto' && escrito.some(fila => fila.some(x => x))) setEstado('resuelto');

  const mostrarSolucion = async () => {
    const ok = await confirmar({ titulo: '¿Mostrar la solución?', mensaje: 'Se completan todos los casilleros.', accion: 'Mostrar' });
    if (!ok) return;
    setEscrito(juego.celdas.map(f => f.map(c => (c ? c.letra : null))));
    setEstado('resuelto');
  };

  const pistas = (dir: 'horizontal' | 'vertical') => juego.palabras.filter(p => p.direccion === dir);

  return (
    <div className="jp">
      <div className="jp-grilla-scroll" ref={contenedor} style={{ ["--jp-celda" as string]: `${lado}px` }}>
        <div className="jp-grilla" style={{ gridTemplateColumns: `repeat(${juego.columnas}, var(--jp-celda))` }} role="group" aria-label={`Crucigrama: ${juego.titulo}`}>
          {juego.celdas.map((fila, f) => fila.map((celda, c) => {
            if (!celda) return <div key={`${f},${c}`} className="jp-celda jp-vacia" aria-hidden="true" />;
            const valor = escrito[f][c] ?? '';
            const mal = estado === 'revisado' && valor && valor !== celda.letra;
            const bien = estado !== 'jugando' && valor === celda.letra;
            return (
              <div key={`${f},${c}`} className={`jp-celda ${enActual(f, c) ? 'jp-en-palabra' : ''} ${mal ? 'jp-mal' : ''} ${bien ? 'jp-bien' : ''}`}>
                {celda.numero && <span className="jp-numero" aria-hidden="true">{celda.numero}</span>}
                <input
                  ref={el => { refs.current[`${f},${c}`] = el; }}
                  value={valor}
                  inputMode="text"
                  autoCapitalize="characters"
                  autoComplete="off"
                  maxLength={2}
                  aria-label={`Fila ${f + 1}, columna ${c + 1}${celda.numero ? `, empieza la ${celda.numero}` : ''}`}
                  onFocus={() => setActiva({ f, c })}
                  onClick={() => {
                    // Tocar de nuevo el mismo casillero cambia de horizontal a vertical
                    if (activa?.f === f && activa?.c === c) setDireccion(d => (d === 'horizontal' ? 'vertical' : 'horizontal'));
                  }}
                  onChange={e => escribir(f, c, e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Backspace' && !valor) { e.preventDefault(); mover(f, c, -1); }
                    else if (e.key === 'ArrowRight') { setDireccion('horizontal'); if (existe(f, c + 1)) enfocar(f, c + 1); }
                    else if (e.key === 'ArrowLeft') { setDireccion('horizontal'); if (existe(f, c - 1)) enfocar(f, c - 1); }
                    else if (e.key === 'ArrowDown') { setDireccion('vertical'); if (existe(f + 1, c)) enfocar(f + 1, c); }
                    else if (e.key === 'ArrowUp') { setDireccion('vertical'); if (existe(f - 1, c)) enfocar(f - 1, c); }
                  }}
                />
              </div>
            );
          }))}
        </div>
      </div>

      {actual && (
        <p className="jp-pista-actual" aria-live="polite">
          <strong>{actual.numero} {actual.direccion === 'horizontal' ? '→' : '↓'}</strong> {actual.pista} <span className="jp-largo">({actual.respuesta.length} letras)</span>
        </p>
      )}

      <div className="jp-pistas">
        {(['horizontal', 'vertical'] as const).map(dir => pistas(dir).length > 0 && (
          <div key={dir}>
            <h4>{dir === 'horizontal' ? 'Horizontales →' : 'Verticales ↓'}</h4>
            <ol>
              {pistas(dir).map(p => (
                <li key={`${dir}-${p.numero}`}>
                  <button
                    className={`jp-pista ${actual === p ? 'activa' : ''}`}
                    onClick={() => { setDireccion(dir); enfocar(p.fila, p.col); }}
                  >
                    <strong>{p.numero}.</strong> {p.pista} <span className="jp-largo">({p.respuesta.length})</span>
                  </button>
                </li>
              ))}
            </ol>
          </div>
        ))}
      </div>

      <Acciones
        estado={estado}
        alComprobar={() => setEstado('revisado')}
        alMostrar={mostrarSolucion}
        alBorrar={() => { setEscrito(vacio()); setEstado('jugando'); }}
        mensajeResuelto="¡Completaste el crucigrama! 🎉"
      />
    </div>
  );
}

// ── Criptograma ──

function CriptogramaVista({ juego }: { juego: Criptograma }) {
  // Lo escrito va por NÚMERO: escribir una letra la pone en todos los casilleros con ese número
  const inicial = () => Object.fromEntries(juego.reveladas.map(l => [juego.clave[l], l])) as Record<number, string>;
  const [escrito, setEscrito] = useState<Record<number, string>>(inicial);
  const [estado, setEstado] = useState<Estado>('jugando');
  const fijas = useMemo(() => new Set(juego.reveladas.map(l => juego.clave[l])), [juego]);
  const letraDe = useMemo(() => Object.fromEntries(Object.entries(juego.clave).map(([l, n]) => [n, l])) as Record<number, string>, [juego]);
  const refs = useRef<(HTMLInputElement | null)[]>([]);

  const palabras = juego.frase.split(' ');
  const numerosEnFrase = [...new Set([...juego.frase].filter(ch => juego.clave[ch]).map(ch => juego.clave[ch]))];
  const completo = numerosEnFrase.every(n => escrito[n] === letraDe[n]);
  if (completo && estado !== 'resuelto') setEstado('resuelto');

  let indice = 0;
  const siguiente = (i: number) => {
    for (let k = i + 1; k < refs.current.length; k++) {
      const el = refs.current[k];
      if (el && !el.readOnly) { el.focus(); return; }
    }
  };

  const mostrarSolucion = async () => {
    const ok = await confirmar({ titulo: '¿Mostrar la solución?', mensaje: 'Se completa la frase entera.', accion: 'Mostrar' });
    if (!ok) return;
    setEscrito({ ...letraDe });
    setEstado('resuelto');
  };

  return (
    <div className="jp">
      {juego.pista && <p className="jp-pista-actual"><strong>Pista:</strong> {juego.pista}</p>}
      <p className="jp-ayuda">Cada número es siempre la misma letra. Ya te dejamos {juego.reveladas.length} para arrancar.</p>
      <div className="jp-frase" role="group" aria-label={`Criptograma: ${juego.titulo}`}>
        {palabras.map((palabra, pi) => (
          <span key={pi} className="jp-palabra">
            {[...palabra].map((ch, ci) => {
              const n = juego.clave[ch];
              if (!n) return <span key={ci} className="jp-signo">{ch}</span>;
              const i = indice++;
              const valor = escrito[n] ?? '';
              const fija = fijas.has(n);
              const mal = estado === 'revisado' && valor && valor !== letraDe[n];
              return (
                <span key={ci} className={`jp-cripto ${fija ? 'jp-fija' : ''} ${mal ? 'jp-mal' : ''} ${estado !== 'jugando' && valor === letraDe[n] && !fija ? 'jp-bien' : ''}`}>
                  <input
                    ref={el => { refs.current[i] = el; }}
                    value={valor}
                    readOnly={fija}
                    maxLength={2}
                    autoCapitalize="characters"
                    autoComplete="off"
                    aria-label={`Letra número ${n}`}
                    onChange={e => {
                      const letra = soloLetras(e.target.value).slice(-1);
                      setEscrito(prev => ({ ...prev, [n]: letra }));
                      if (estado !== 'jugando') setEstado('jugando');
                      if (letra) siguiente(i);
                    }}
                  />
                  <span className="jp-num">{n}</span>
                </span>
              );
            })}
          </span>
        ))}
      </div>

      <Acciones
        estado={estado}
        alComprobar={() => setEstado('revisado')}
        alMostrar={mostrarSolucion}
        alBorrar={() => { setEscrito(inicial()); setEstado('jugando'); }}
        mensajeResuelto="¡Descubriste la frase! 🎉"
      />
    </div>
  );
}

function Acciones({ estado, alComprobar, alMostrar, alBorrar, mensajeResuelto }: {
  estado: Estado;
  alComprobar: () => void;
  alMostrar: () => void;
  alBorrar: () => void;
  mensajeResuelto: string;
}) {
  return (
    <div className="jp-acciones">
      {estado === 'resuelto'
        ? <p className="jp-resuelto" role="status"><CheckCircle size={18} aria-hidden="true" /> {mensajeResuelto}</p>
        : estado === 'revisado' && <p className="jp-revisado" role="status">Lo que está en rojo, revisalo.</p>}
      <div className="jp-botones">
        <button className="btn btn-primary btn-sm" onClick={alComprobar} disabled={estado === 'resuelto'}>
          <CheckCircle size={14} /> Comprobar
        </button>
        <button className="btn btn-outline btn-sm" onClick={alMostrar} disabled={estado === 'resuelto'}>
          <Eye size={14} /> Ver solución
        </button>
        <button className="btn btn-outline btn-sm" onClick={alBorrar}>
          <RotateCcw size={14} /> Empezar de nuevo
        </button>
      </div>
    </div>
  );
}
