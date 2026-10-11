/**
 * Calendario: los trimestres del año y los días sin clase (feriados,
 * recesos, jornadas). Lo carga la dirección una vez por escuela (decisión
 * del usuario, oct 2026) y de acá salen las fechas de la planificación de
 * cada docente: los encuentros de su horario fijo dentro de los trimestres,
 * menos estos días (migración 062).
 */

import { useCallback, useEffect, useState } from 'react';
import { CalendarX, Flag, Trash2, Plus, Save } from 'lucide-react';
import { getTerms, ensureTerms } from '../../services/gradebook.service';
import {
  getDiasSinClase, agregarDiaSinClase, borrarDiaSinClase, cargarFeriadosNacionales, actualizarTrimestre,
  ETIQUETA_DIA, type DiaSinClase, type TipoDiaSinClase,
} from '../../services/planificacion.service';
import { avisar, confirmar } from '../../components/ui/avisar';
import { Barra, Campo, Vacio } from './ui';
import type { TabProps } from './GestionEscuela';
import type { AcademicTerm } from '../../types';

function fecha(iso: string): string {
  return new Date(iso + 'T12:00').toLocaleDateString('es-AR', { weekday: 'short', day: 'numeric', month: 'short' });
}

export default function CalendarioTab({ data, isSuperadmin }: TabProps) {
  const anioActual = new Date().getFullYear();
  const [anio, setAnio] = useState(anioActual);
  const [trimestres, setTrimestres] = useState<AcademicTerm[] | null>(null);
  const [borrador, setBorrador] = useState<Record<string, { desde: string; hasta: string }>>({});
  const [dias, setDias] = useState<DiaSinClase[] | null>(null);
  const [nuevo, setNuevo] = useState<{ desde: string; hasta: string; motivo: string; tipo: TipoDiaSinClase }>({
    desde: '', hasta: '', motivo: '', tipo: 'escuela',
  });
  const [ocupado, setOcupado] = useState(false);

  const cargar = useCallback(() => {
    getTerms(data.school.id, anio)
      .then(ts => {
        setTrimestres(ts);
        setBorrador(Object.fromEntries(ts.map(t => [t.id, { desde: t.startsOn, hasta: t.endsOn }])));
      })
      .catch(() => setTrimestres([]));
    getDiasSinClase(data.school.id, anio).then(setDias).catch(() => setDias([]));
  }, [data.school.id, anio]);
  useEffect(() => { cargar(); }, [cargar]);

  const accion = async (fn: () => Promise<void>) => {
    setOcupado(true);
    try { await fn(); cargar(); } catch (err) { avisar.error((err as Error).message); } finally { setOcupado(false); }
  };

  const feriados = () => accion(async () => {
    const n = await cargarFeriadosNacionales(data.school.id, anio);
    avisar.exito(n > 0 ? `Se cargaron ${n} feriados nacionales de ${anio}.` : `Los feriados nacionales de ${anio} ya estaban.`,
      'Revisalos: el Gobierno puede mover fechas por decreto. Los días no laborables y los feriados provinciales se agregan a mano.');
  });

  const agregar = (e: React.FormEvent) => {
    e.preventDefault();
    if (!nuevo.desde || !nuevo.motivo.trim()) { avisar.error('Poné la fecha y el motivo.'); return; }
    void accion(async () => {
      await agregarDiaSinClase(data.school.id, { ...nuevo, hasta: nuevo.hasta || nuevo.desde });
      setNuevo({ desde: '', hasta: '', motivo: '', tipo: 'escuela' });
    });
  };

  const borrar = async (d: DiaSinClase) => {
    const si = await confirmar({ titulo: `¿Borrar «${d.motivo}»?`, mensaje: 'Ese día vuelve a contar como día de clase cuando cada docente reacomode sus fechas.', accion: 'Borrar', peligro: true });
    if (si) void accion(() => borrarDiaSinClase(d.id));
  };

  return (
    <div className="adm-form">
      <Barra
        titulo="Calendario escolar"
        detalle="De acá salen las fechas de la planificación de cada docente: los días de su horario dentro de los trimestres, menos los días sin clase. Lo que cambies se aplica cuando cada docente reacomoda sus fechas; mientras, su planificación le avisa qué temas caen en un día sin clase."
      >
        <label className="sr-only" htmlFor="cal-anio">Año</label>
        <select id="cal-anio" className="form-select" value={anio} onChange={e => setAnio(Number(e.target.value))}>
          <option value={anioActual}>{anioActual}</option>
          <option value={anioActual + 1}>{anioActual + 1}</option>
        </select>
      </Barra>

      <section className="card adm-tarjeta" aria-labelledby="cal-trimestres">
        <h3 id="cal-trimestres" className="adm-subtitulo">Trimestres de {anio}</h3>
        {trimestres === null ? <p className="text-secondary text-sm">Cargando…</p> : trimestres.length === 0 ? (
          <div>
            <p className="text-secondary text-sm">Todavía no están cargados.</p>
            {!isSuperadmin && (
              <button type="button" className="btn btn-secondary btn-sm" disabled={ocupado}
                onClick={() => accion(async () => { await ensureTerms(data.school.id, anio); })}>
                <Plus size={14} aria-hidden="true" /> Crear los trimestres de {anio}
              </button>
            )}
          </div>
        ) : trimestres.map(t => (
          <div key={t.id} className="adm-fila cal-trimestre">
            <Campo label={`${t.name}: empieza`} htmlFor={`cal-${t.id}-d`}>
              <input id={`cal-${t.id}-d`} type="date" className="form-input" value={borrador[t.id]?.desde ?? ''} disabled={isSuperadmin}
                onChange={e => setBorrador(b => ({ ...b, [t.id]: { ...b[t.id], desde: e.target.value } }))} />
            </Campo>
            <Campo label="Termina" htmlFor={`cal-${t.id}-h`}>
              <div className="adm-alta">
                <input id={`cal-${t.id}-h`} type="date" className="form-input" value={borrador[t.id]?.hasta ?? ''} disabled={isSuperadmin}
                  onChange={e => setBorrador(b => ({ ...b, [t.id]: { ...b[t.id], hasta: e.target.value } }))} />
                {!isSuperadmin && (borrador[t.id]?.desde !== t.startsOn || borrador[t.id]?.hasta !== t.endsOn) && (
                  <button type="button" className="btn btn-primary btn-sm" disabled={ocupado}
                    onClick={() => accion(() => actualizarTrimestre(t.id, borrador[t.id].desde, borrador[t.id].hasta))}>
                    <Save size={14} aria-hidden="true" /> Guardar
                  </button>
                )}
              </div>
            </Campo>
          </div>
        ))}
        {isSuperadmin && trimestres && trimestres.length > 0 && (
          <p className="adm-ayuda">Las fechas de los trimestres las cambia la dirección de la escuela.</p>
        )}
      </section>

      <section className="card adm-tarjeta" aria-labelledby="cal-dias">
        <div className="adm-barra">
          <h3 id="cal-dias" className="adm-subtitulo"><CalendarX size={16} aria-hidden="true" /> Días sin clase</h3>
          <button type="button" className="btn btn-secondary btn-sm" onClick={feriados} disabled={ocupado}>
            <Flag size={14} aria-hidden="true" /> Cargar los feriados nacionales de {anio}
          </button>
        </div>

        <form className="adm-alta" onSubmit={agregar} aria-label="Agregar un día sin clase">
          <label className="sr-only" htmlFor="cal-desde">Desde</label>
          <input id="cal-desde" type="date" className="form-input" value={nuevo.desde}
            onChange={e => setNuevo(n => ({ ...n, desde: e.target.value }))} />
          <label className="sr-only" htmlFor="cal-hasta">Hasta (si son varios días)</label>
          <input id="cal-hasta" type="date" className="form-input" value={nuevo.hasta} min={nuevo.desde || undefined}
            title="Hasta (si son varios días)" onChange={e => setNuevo(n => ({ ...n, hasta: e.target.value }))} />
          <label className="sr-only" htmlFor="cal-motivo">Motivo</label>
          <input id="cal-motivo" className="form-input" placeholder="Receso invernal, jornada institucional…" maxLength={120}
            value={nuevo.motivo} onChange={e => setNuevo(n => ({ ...n, motivo: e.target.value }))} />
          <label className="sr-only" htmlFor="cal-tipo">Tipo</label>
          <select id="cal-tipo" className="form-select" value={nuevo.tipo} onChange={e => setNuevo(n => ({ ...n, tipo: e.target.value as TipoDiaSinClase }))}>
            {(Object.keys(ETIQUETA_DIA) as TipoDiaSinClase[]).map(t => <option key={t} value={t}>{ETIQUETA_DIA[t]}</option>)}
          </select>
          <button type="submit" className="btn btn-primary btn-sm" disabled={ocupado}><Plus size={14} aria-hidden="true" /> Agregar</button>
        </form>
        <p className="adm-ayuda">En Tucumán, sumá el 24 de septiembre (Batalla de Tucumán) y los días no laborables que decrete el Gobierno.</p>

        {dias === null ? <p className="text-secondary text-sm">Cargando…</p> : dias.length === 0 ? (
          <Vacio icono={CalendarX} titulo={`Todavía no hay días sin clase en ${anio}`}
            texto="Empezá por los feriados nacionales y después agregá el receso y las jornadas de la escuela." />
        ) : (
          <ul className="cal-lista">
            {dias.map(d => (
              <li key={d.id} className="cal-dia">
                <span className="cal-dia-fecha">{fecha(d.desde)}{d.hasta !== d.desde && ` al ${fecha(d.hasta)}`}</span>
                <span className="cal-dia-motivo">{d.motivo}</span>
                <span className={`badge ${d.tipo === 'feriado' ? 'badge-cyan' : 'badge-neutral'}`}>{ETIQUETA_DIA[d.tipo]}</span>
                <button type="button" className="btn-icon" onClick={() => borrar(d)} aria-label={`Borrar ${d.motivo}`}>
                  <Trash2 size={15} aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
