/**
 * Fichas por materia y año para Migue (077), dentro de la Biblioteca de
 * referencia: qué materias y años se dan, si tienen NAP o diseño curricular
 * cargado y si ya tienen su ficha. La ficha se arma una vez con la IA y la
 * reaprovechan todos los docentes de esa materia y año.
 */

import { useEffect, useState } from 'react';
import { BookMarked, Loader2, Sparkles, RefreshCw, Eye, AlertCircle } from 'lucide-react';
import { getFichasPosibles, getFicha, armarFicha, type FichaPosible } from '../../services/fichas.service';
import { avisar } from '../../components/ui/avisar';
import { Esqueleto } from '../../components/ui/Esqueleto';
import MarkdownRenderer from '../../components/MarkdownRenderer';
import Dialogo from '../../components/shell/Dialogo';

const clave = (f: FichaPosible) => `${f.area}-${f.anio}`;

export default function FichasMigue({ version }: { version: number }) {
  const [filas, setFilas] = useState<FichaPosible[] | null>(null);
  const [error, setError] = useState('');
  const [armando, setArmando] = useState<string | null>(null);
  const [enTanda, setEnTanda] = useState(false);
  const [viendo, setViendo] = useState<{ titulo: string; texto: string } | null>(null);
  const [recargar, setRecargar] = useState(0);

  useEffect(() => {
    let vivo = true;
    getFichasPosibles()
      .then(f => { if (vivo) { setFilas(f); setError(''); } })
      .catch(e => { if (vivo) setError(e instanceof Error ? e.message : 'No se pudieron traer las fichas.'); });
    return () => { vivo = false; };
  }, [version, recargar]);

  const armar = async (f: FichaPosible): Promise<boolean> => {
    setArmando(clave(f));
    try {
      await armarFicha(f.materia, f.anio);
      return true;
    } catch (e) {
      avisar.error(`No se pudo armar la ficha de ${f.materia} ${f.anio}°`, e instanceof Error ? e.message : undefined);
      return false;
    } finally {
      setArmando(null);
    }
  };

  const armarUna = async (f: FichaPosible) => {
    if (await armar(f)) {
      avisar.exito(`Ficha de ${f.materia} ${f.anio}° lista`);
      setRecargar(n => n + 1);
    }
  };

  const pendientes = (filas ?? []).filter(f => f.documentos > 0 && (!f.tieneFicha || f.desactualizada));
  const armarPendientes = async () => {
    setEnTanda(true);
    let hechas = 0;
    for (const f of pendientes) if (await armar(f)) hechas++;
    setEnTanda(false);
    setRecargar(n => n + 1);
    if (hechas) avisar.exito(`${hechas} ficha${hechas !== 1 ? 's' : ''} lista${hechas !== 1 ? 's' : ''}`);
  };

  const ver = async (f: FichaPosible) => {
    try {
      const fi = await getFicha(f.area, f.anio);
      if (fi) setViendo({ titulo: `${fi.materia} · ${f.anio}° año`, texto: fi.texto });
    } catch {
      avisar.error('No se pudo abrir la ficha.');
    }
  };

  const sinDocs = (filas ?? []).filter(f => f.documentos === 0);

  return (
    <section className="card rfa-fichas" aria-labelledby="rfa-fichas-titulo">
      <div className="rfa-fichas-cabeza">
        <div>
          <h3 id="rfa-fichas-titulo"><BookMarked size={17} aria-hidden="true" /> Fichas para Migue</h3>
          <p className="text-sm text-secondary">
            El NAP o el diseño curricular de cada materia y año, resumido una vez. Migue la usa cuando
            el docente está en un tema, un material o una actividad de ese curso, y la comparten todos
            los docentes de esa materia y año: conoce el programa oficial sin gastar en cada mensaje.
          </p>
        </div>
        {pendientes.length > 0 && (
          <button type="button" className="btn btn-primary btn-sm" onClick={() => void armarPendientes()} disabled={enTanda || armando !== null}>
            {enTanda ? <Loader2 size={15} className="spin" aria-hidden="true" /> : <Sparkles size={15} aria-hidden="true" />}
            {enTanda ? 'Armando…' : `Armar las que faltan (${pendientes.length})`}
          </button>
        )}
      </div>

      {error && <div className="adm-error" role="alert"><AlertCircle size={15} aria-hidden="true" /> {error}</div>}
      {!filas && !error && <Esqueleto tipo="filas" cantidad={3} etiqueta="Buscando materias y años…" />}

      {filas && filas.length === 0 && (
        <p className="text-sm text-secondary">Todavía no hay materias asignadas a docentes en ninguna escuela.</p>
      )}

      {filas && filas.length > 0 && (
        <ul className="rfa-fichas-lista">
          {filas.map(f => {
            const ocupada = armando === clave(f);
            const estado = f.documentos === 0 ? 'Falta el NAP o el diseño curricular'
              : !f.tieneFicha ? 'Sin ficha'
                : f.desactualizada ? 'Cambió un documento: conviene rearmarla' : 'Al día';
            return (
              <li key={clave(f)} className={`rfa-ficha${f.documentos === 0 ? ' sin-docs' : ''}`}>
                <span className="rfa-ficha-nombre">
                  <strong>{f.materia} · {f.anio}°</strong>
                  <small>{f.documentos > 0 ? `${f.documentos} documento${f.documentos !== 1 ? 's' : ''} · ` : ''}{estado}</small>
                </span>
                <span className="rfa-ficha-acciones">
                  {f.tieneFicha && (
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => void ver(f)}>
                      <Eye size={14} aria-hidden="true" /> Ver
                    </button>
                  )}
                  {f.documentos > 0 && (
                    <button type="button" className="btn btn-outline btn-sm" onClick={() => void armarUna(f)} disabled={armando !== null || enTanda}>
                      {ocupada ? <Loader2 size={14} className="spin" aria-hidden="true" />
                        : f.tieneFicha ? <RefreshCw size={14} aria-hidden="true" /> : <Sparkles size={14} aria-hidden="true" />}
                      {ocupada ? 'Armando…' : f.tieneFicha ? 'Rearmar' : 'Armar'}
                    </button>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      )}

      {sinDocs.length > 0 && (
        <p className="text-sm text-secondary rfa-fichas-nota">
          Para las que dicen "Falta el NAP o el diseño curricular": cargá el documento oficial con
          "Agregar documento", tipo NAP o Diseño curricular, con su área y sus años, y publicalo.
        </p>
      )}

      <Dialogo abierto={viendo !== null} alCerrar={() => setViendo(null)} etiqueta={viendo?.titulo ?? 'Ficha'} className="dialogo-em">
        {viendo && (
          <div className="em-modal">
            <div className="em-modal-header">
              <h3>{viendo.titulo}</h3>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setViendo(null)}>Cerrar</button>
            </div>
            <div className="em-modal-body"><MarkdownRenderer content={viendo.texto} /></div>
          </div>
        )}
      </Dialogo>
    </section>
  );
}
