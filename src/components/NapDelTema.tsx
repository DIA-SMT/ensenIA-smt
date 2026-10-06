/**
 * "NAP que trabaja este tema" (047): el docente vincula a cada tema de su
 * planificación los NAP que trabaja. La app sugiere con la búsqueda de la
 * biblioteca (título + objetivos del tema, filtrado por materia y año);
 * el docente decide marcando o desmarcando. Nada se vincula solo.
 */

import { useState } from 'react';
import { Compass, Sparkles, X, ListChecks } from 'lucide-react';
import {
  buscarReferencias, vincularNap, desvincularNap,
  type NapFragmento, type VinculoNap,
} from '../services/nap.service';
import TextoRecortable from './TextoRecortable';
import { avisar } from './ui/avisar';
import { Cargando } from './ui/Esqueleto';
import type { PlanningClass } from '../types';
import './NapDelTema.css';

type ItemNap = Pick<NapFragmento, 'fragmentoId' | 'titulo' | 'numero' | 'seccion' | 'texto'>;

interface Props {
  tema: PlanningClass;
  area: string | null;
  anio: number | null;
  /** Los vínculos de ESTE tema. */
  vinculos: VinculoNap[];
  /** Todos los NAP publicados para la materia y el año (null: cargando). */
  napDelAnio: NapFragmento[] | null;
  onCambio: () => Promise<void>;
}

function nombreNap(n: Pick<ItemNap, 'numero' | 'titulo'>) {
  return n.numero ? `${n.numero} · ${n.titulo}` : n.titulo;
}

export default function NapDelTema({ tema, area, anio, vinculos, napDelAnio, onCambio }: Props) {
  const [modo, setModo] = useState<'cerrado' | 'sugeridos' | 'todos'>('cerrado');
  const [sugeridos, setSugeridos] = useState<ItemNap[] | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [pendientes, setPendientes] = useState<Set<string>>(new Set());

  const vinculados = new Set(vinculos.map(v => v.fragmentoId));

  const sugerir = async () => {
    setModo('sugeridos');
    setBuscando(true);
    setSugeridos(null);
    try {
      const q = [tema.title, ...(tema.objectives ?? [])].join('. ');
      const r = await buscarReferencias({ q, area, anio, tipos: ['nap'], max: 8 });
      setSugeridos(r);
    } catch (err) {
      console.error(err);
      avisar.error('No se pudieron buscar NAP para este tema.', 'Probá de nuevo en un rato.');
      setModo('cerrado');
    } finally {
      setBuscando(false);
    }
  };

  const alternar = async (fragmentoId: string, vincular: boolean) => {
    setPendientes(prev => new Set(prev).add(fragmentoId));
    try {
      if (vincular) await vincularNap(tema.id, fragmentoId);
      else await desvincularNap(tema.id, fragmentoId);
      await onCambio();
    } catch (err) {
      console.error(err);
      avisar.error(vincular ? 'No se pudo vincular el NAP.' : 'No se pudo quitar el NAP.', 'Probá de nuevo.');
    } finally {
      setPendientes(prev => { const s = new Set(prev); s.delete(fragmentoId); return s; });
    }
  };

  const hayNap = napDelAnio !== null && napDelAnio.length > 0;
  const lista: ItemNap[] = modo === 'todos' ? (napDelAnio ?? []) : (sugeridos ?? []);

  return (
    <div className="nap-tema">
      <div className="nap-tema-head">
        <span className="nap-tema-rotulo"><Compass size={13} aria-hidden="true" /> NAP que trabaja este tema</span>
        {hayNap && (
          <div className="nap-tema-acciones">
            <button type="button" className="btn btn-outline btn-sm" onClick={sugerir} disabled={buscando}>
              <Sparkles size={13} aria-hidden="true" /> Sugerir NAP
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => setModo(modo === 'todos' ? 'cerrado' : 'todos')}
              aria-pressed={modo === 'todos'}
            >
              <ListChecks size={13} aria-hidden="true" /> Todos los del año
            </button>
          </div>
        )}
      </div>

      {vinculos.length === 0 && hayNap && (
        <p className="nap-tema-vacio">Todavía no marcaste qué NAP trabaja este tema.</p>
      )}

      {napDelAnio !== null && !hayNap && vinculos.length === 0 && (
        <p className="nap-tema-vacio">
          Todavía no se cargaron los NAP{area ? ` de ${area}` : ''}{anio ? ` para ${anio}° año` : ''}; los carga la Dirección de Innovación.
        </p>
      )}

      {vinculos.length > 0 && (
        <ul className="nap-tema-vinculados">
          {vinculos.map(v => (
            <li key={v.fragmentoId}>
              <div className="nap-tema-item-texto">
                {v.fragmento ? (
                  <>
                    <span className="nap-tema-doc">{nombreNap(v.fragmento)}</span>
                    {v.fragmento.seccion && <span className="nap-tema-seccion">{v.fragmento.seccion}</span>}
                    <TextoRecortable texto={v.fragmento.texto} largo={180} compacto />
                  </>
                ) : (
                  <span className="nap-tema-seccion">Un NAP que ya no está publicado.</span>
                )}
              </div>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                aria-label="Quitar este NAP del tema"
                title="Quitar"
                disabled={pendientes.has(v.fragmentoId)}
                onClick={() => alternar(v.fragmentoId, false)}
              >
                <X size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}

      {modo !== 'cerrado' && (
        <div className="nap-tema-elegir">
          {modo === 'sugeridos' && buscando && <Cargando texto="Buscando NAP parecidos a este tema…" />}
          {modo === 'sugeridos' && !buscando && sugeridos !== null && sugeridos.length === 0 && (
            <p className="nap-tema-vacio">
              No encontramos NAP parecidos al título y los objetivos de este tema. Podés elegirlos de{' '}
              <button type="button" className="nap-tema-link" onClick={() => setModo('todos')}>todos los del año</button>.
            </p>
          )}
          {!buscando && lista.length > 0 && (
            <>
              <p className="nap-tema-ayuda">
                {modo === 'sugeridos'
                  ? 'Sugeridos por parecido con el tema. Marcá los que de verdad trabaja.'
                  : 'Todos los NAP cargados para esta materia y este año.'}
              </p>
              <ul className="nap-tema-opciones">
                {lista.map(n => {
                  const marcado = vinculados.has(n.fragmentoId);
                  const id = `nap-${tema.id}-${n.fragmentoId}`;
                  return (
                    <li key={n.fragmentoId} className="nap-tema-opcion">
                      <input
                        id={id}
                        type="checkbox"
                        checked={marcado}
                        disabled={pendientes.has(n.fragmentoId)}
                        onChange={() => alternar(n.fragmentoId, !marcado)}
                      />
                      <div className="nap-tema-item-texto">
                        <label htmlFor={id} className="nap-tema-doc">
                          {nombreNap(n)}
                          {n.seccion && <span className="nap-tema-seccion">{n.seccion}</span>}
                        </label>
                        <TextoRecortable texto={n.texto} largo={180} compacto />
                      </div>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
          <button type="button" className="btn btn-ghost btn-sm nap-tema-listo" onClick={() => setModo('cerrado')}>
            Listo
          </button>
        </div>
      )}
    </div>
  );
}
