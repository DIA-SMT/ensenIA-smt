/**
 * Buscar una foto real para una diapositiva (Openverse: Wikimedia Commons,
 * Flickr y otros acervos con licencia libre). El docente elige y la foto
 * queda guardada con el crédito al autor, que la licencia exige.
 *
 * Para mapas, próceres, el cuerpo humano o un edificio real, una foto de
 * verdad es mejor que una ilustración de IA: la IA los inventa y quedan mal.
 */

import { useEffect, useRef, useState } from 'react';
import { Search, X, Loader2, ImageOff } from 'lucide-react';
import Dialogo from './shell/Dialogo';
import { buscarFotos, guardarFoto, type FotoEncontrada, type FotoGuardada } from '../services/imagenes.service';
import './BuscarFoto.css';

export default function BuscarFoto({ consultaInicial, alElegir, alCerrar }: {
  consultaInicial: string;
  alElegir: (foto: FotoGuardada) => void;
  alCerrar: () => void;
}) {
  const [consulta, setConsulta] = useState(consultaInicial);
  const [fotos, setFotos] = useState<FotoEncontrada[]>([]);
  const [pagina, setPagina] = useState(1);
  const [hayMas, setHayMas] = useState(false);
  const [buscando, setBuscando] = useState(false);
  const [buscada, setBuscada] = useState('');
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState<string | null>(null);
  // Miniaturas que no cargan (el acervo de origen a veces no responde): se ocultan
  const [rotas, setRotas] = useState<Set<string>>(new Set());
  const pedido = useRef(0);

  const buscar = async (q: string, pag = 1) => {
    if (!q.trim()) return;
    const este = ++pedido.current;
    setBuscando(true);
    setError('');
    try {
      const r = await buscarFotos(q, pag);
      if (este !== pedido.current) return;
      setFotos(prev => (pag === 1 ? r.fotos : [...prev, ...r.fotos]));
      setHayMas(r.hayMas);
      setPagina(pag);
      setBuscada(q.trim());
    } catch (e) {
      if (este === pedido.current) setError(e instanceof Error ? e.message : 'No se pudo buscar.');
    } finally {
      if (este === pedido.current) setBuscando(false);
    }
  };

  // Arranca buscando lo que sugiere la lámina (su título)
  useEffect(() => {
    if (consultaInicial.trim()) void buscar(consultaInicial);
    // Solo al abrir
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const elegir = async (f: FotoEncontrada) => {
    if (guardando) return;
    setGuardando(f.id);
    setError('');
    try {
      alElegir(await guardarFoto(f.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar la imagen.');
    } finally {
      setGuardando(null);
    }
  };

  return (
    <Dialogo abierto alCerrar={alCerrar} etiquetadoPor="bf-titulo" className="bf-dialogo">
      <div className="bf">
        <div className="bf-cabeza">
          <h3 id="bf-titulo">Buscar una foto</h3>
          <button className="btn-icon" aria-label="Cerrar" onClick={alCerrar}><X size={18} /></button>
        </div>

        <form className="bf-form" onSubmit={e => { e.preventDefault(); void buscar(consulta); }}>
          <div className="search-bar bf-buscar">
            <Search size={16} className="search-icon" aria-hidden="true" />
            <input
              type="search"
              className="search-input"
              value={consulta}
              autoFocus
              placeholder="Ej: cabildo de Buenos Aires, volcán, carta antigua"
              aria-label="Qué foto buscás"
              onChange={e => setConsulta(e.target.value)}
            />
          </div>
          <button type="submit" className="btn btn-primary btn-sm" disabled={buscando || !consulta.trim()}>
            {buscando && pagina === 1 ? <Loader2 size={14} className="girando" /> : <Search size={14} />} Buscar
          </button>
        </form>
        <p className="bf-ayuda">
          Fotos con licencia libre de Wikimedia Commons y otros acervos. El crédito al autor se agrega solo.
          Probá en inglés si no aparece lo que buscás.
        </p>

        {error && <p className="bf-error" role="alert">{error}</p>}

        {!buscando && buscada && fotos.length === 0 && !error && (
          <div className="bf-vacio">
            <ImageOff size={22} aria-hidden="true" />
            <span>No hay fotos libres de «{buscada}». Probá con otras palabras o en inglés.</span>
          </div>
        )}

        <ul className="bf-grilla" aria-label="Fotos encontradas">
          {fotos.filter(f => !rotas.has(f.id)).map(f => (
            <li key={f.id}>
              <button
                className={`bf-foto ${guardando === f.id ? 'guardando' : ''}`}
                onClick={() => elegir(f)}
                disabled={guardando !== null}
                title={[f.titulo, f.autor && `de ${f.autor}`].filter(Boolean).join(' — ')}
              >
                <img
                  src={f.miniatura}
                  alt={f.titulo || 'Foto'}
                  loading="lazy"
                  onError={() => setRotas(prev => new Set(prev).add(f.id))}
                />
                {guardando === f.id && <span className="bf-guardando"><Loader2 size={20} className="girando" /> Guardando…</span>}
                {f.autor && <span className="bf-autor">{f.autor}</span>}
              </button>
            </li>
          ))}
        </ul>

        {hayMas && fotos.length > 0 && (
          <button className="btn btn-outline btn-sm bf-mas" onClick={() => buscar(buscada, pagina + 1)} disabled={buscando}>
            {buscando ? <Loader2 size={14} className="girando" /> : null} Ver más fotos
          </button>
        )}
      </div>
    </Dialogo>
  );
}
