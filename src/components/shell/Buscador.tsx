/**
 * Buscador de la barra superior (Ctrl K / ⌘K).
 *
 * Antes era un recuadro dibujado que no hacía nada. Ahora encuentra:
 *   - pantallas del rol, también por palabras sueltas ("notas" → Libreta);
 *   - acciones rápidas ("nueva actividad");
 *   - ajustes de lectura y datos, que se aplican sin salir de donde estás;
 *   - estudiantes (docente: de sus cursos; dirección: de su escuela) y,
 *     para dirección, cursos.
 *
 * Patrón ARIA de combobox con listbox: las flechas mueven la opción activa
 * sin sacar el foco del campo, Enter la elige y Escape cierra.
 */

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search, CornerDownLeft, Type, Contrast, Wifi, Wind, User as UserIcon, School, type LucideIcon,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { usePreferencias } from '../../contexts/PreferencesContext';
import { NAV_POR_ROL, ACCIONES_POR_ROL } from '../../lib/navegacion';
import {
  estudiantesBuscables, cursosBuscables, plegar,
  type EstudianteBuscable, type CursoBuscable,
} from '../../services/busqueda.service';
import Dialogo from './Dialogo';

interface Opcion {
  id: string;
  grupo: string;
  etiqueta: string;
  detalle?: string;
  icono: LucideIcon;
  ejecutar: () => void;
  /** Texto contra el que se compara, ya plegado. */
  indice: string;
}

const MAX_POR_GRUPO = 6;

function coincide(indice: string, palabras: string[]): boolean {
  return palabras.every(p => indice.includes(p));
}

export default function Buscador({ abierto, alCerrar }: { abierto: boolean; alCerrar: () => void }) {
  const { user } = useAuth();
  const { preferencias, cambiar } = usePreferencias();
  const navigate = useNavigate();
  const idBase = useId();
  const idLista = `${idBase}-lista`;
  const idTitulo = `${idBase}-titulo`;

  const [texto, setTexto] = useState('');
  const [activa, setActiva] = useState(0);
  const [estudiantes, setEstudiantes] = useState<EstudianteBuscable[] | null>(null);
  const [cursos, setCursos] = useState<CursoBuscable[] | null>(null);
  const [errorPersonas, setErrorPersonas] = useState(false);
  const listaRef = useRef<HTMLUListElement>(null);

  const esStaff = user?.role === 'docente' || user?.role === 'director';

  // Cada vez que se abre, arranca limpio.
  useEffect(() => {
    if (abierto) { setTexto(''); setActiva(0); }
  }, [abierto]);

  // Personas: se piden recién cuando alguien escribe dos letras.
  const quierePersonas = esStaff && plegar(texto).length >= 2;
  useEffect(() => {
    if (!abierto || !quierePersonas || !user || estudiantes) return;
    let vigente = true;
    setErrorPersonas(false);
    Promise.all([estudiantesBuscables(user), cursosBuscables(user)])
      .then(([e, c]) => { if (vigente) { setEstudiantes(e); setCursos(c); } })
      .catch(() => { if (vigente) setErrorPersonas(true); });
    return () => { vigente = false; };
  }, [abierto, quierePersonas, user, estudiantes]);

  const cerrarE = (fn: () => void) => () => { alCerrar(); fn(); };

  const opciones = useMemo<Opcion[]>(() => {
    if (!user) return [];
    const rol = user.role;
    const palabras = plegar(texto).split(/\s+/).filter(Boolean);
    const lista: Opcion[] = [];

    for (const item of NAV_POR_ROL[rol]) {
      lista.push({
        id: `pantalla-${item.ruta}`,
        grupo: 'Ir a',
        etiqueta: item.titulo ?? item.etiqueta,
        detalle: item.grupo,
        icono: item.icono,
        ejecutar: cerrarE(() => navigate(item.ruta)),
        indice: plegar(`${item.etiqueta} ${item.titulo ?? ''} ${item.claves ?? ''}`),
      });
    }
    for (const a of ACCIONES_POR_ROL[rol]) {
      lista.push({
        id: `accion-${a.ruta}`,
        grupo: 'Acciones',
        etiqueta: a.etiqueta,
        icono: a.icono,
        ejecutar: cerrarE(() => navigate(a.ruta)),
        indice: plegar(`${a.etiqueta} ${a.claves ?? ''}`),
      });
    }

    const letraSig = preferencias.letra === 'normal' ? 'grande' : preferencias.letra === 'grande' ? 'muy-grande' : 'normal';
    lista.push(
      {
        id: 'ajuste-letra', grupo: 'Ajustes de lectura', icono: Type,
        etiqueta: letraSig === 'normal' ? 'Volver a la letra normal' : letraSig === 'grande' ? 'Letra más grande' : 'Letra todavía más grande',
        ejecutar: () => cambiar('letra', letraSig),
        indice: plegar('letra tamaño grande agrandar texto zoom leer'),
      },
      {
        id: 'ajuste-contraste', grupo: 'Ajustes de lectura', icono: Contrast,
        etiqueta: preferencias.contraste === 'alto' ? 'Desactivar contraste alto' : 'Activar contraste alto',
        ejecutar: () => cambiar('contraste', preferencias.contraste === 'alto' ? 'normal' : 'alto'),
        indice: plegar('contraste alto ver mejor colores oscuro'),
      },
      {
        id: 'ajuste-movimiento', grupo: 'Ajustes de lectura', icono: Wind,
        etiqueta: preferencias.movimiento === 'reducido' ? 'Volver a las animaciones' : 'Reducir movimiento',
        ejecutar: () => cambiar('movimiento', preferencias.movimiento === 'reducido' ? 'auto' : 'reducido'),
        indice: plegar('movimiento animaciones mareo reducir'),
      },
      {
        id: 'ajuste-ahorro', grupo: 'Ajustes de lectura', icono: Wifi,
        etiqueta: preferencias.ahorro === 'si' ? 'Ahorro de datos: volver a automático' : 'Activar ahorro de datos',
        ejecutar: () => cambiar('ahorro', preferencias.ahorro === 'si' ? 'auto' : 'si'),
        indice: plegar('ahorro datos megas plan celular wifi liviano'),
      },
    );

    if (palabras.length === 0) {
      // Sin texto: pantallas y acciones, nada de personas.
      return lista.filter(o => o.grupo !== 'Ajustes de lectura');
    }

    const filtradas = lista.filter(o => coincide(o.indice, palabras));

    if (estudiantes) {
      const hallados = estudiantes
        .filter(e => coincide(plegar(`${e.nombre} ${e.curso}`), palabras))
        .slice(0, MAX_POR_GRUPO);
      for (const e of hallados) {
        filtradas.push({
          id: `estudiante-${e.id}`,
          grupo: 'Estudiantes',
          etiqueta: e.nombre,
          detalle: rol === 'director' ? `${e.curso} · abre la ficha del curso` : e.curso,
          icono: UserIcon,
          ejecutar: cerrarE(() => navigate(rol === 'director'
            ? `/cursos/${e.courseId}`
            : `/students?estudiante=${encodeURIComponent(e.id)}`)),
          indice: '',
        });
      }
    }
    if (cursos) {
      for (const c of cursos.filter(c => coincide(plegar(c.nombre), palabras)).slice(0, MAX_POR_GRUPO)) {
        filtradas.push({
          id: `curso-${c.id}`, grupo: 'Cursos', etiqueta: c.nombre, detalle: 'Ficha del curso',
          icono: School, ejecutar: cerrarE(() => navigate(`/cursos/${c.id}`)), indice: '',
        });
      }
    }
    return filtradas;
    // cerrarE es estable en la práctica: depende de alCerrar y navigate.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, texto, estudiantes, cursos, preferencias, navigate, cambiar]);

  // La opción activa nunca queda fuera de rango al filtrar.
  useEffect(() => { setActiva(a => (opciones.length === 0 ? 0 : Math.min(a, opciones.length - 1))); }, [opciones.length]);

  // Que la opción activa se vea al moverse con flechas.
  useEffect(() => {
    listaRef.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [activa]);

  const alTeclear = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiva(a => (opciones.length ? (a + 1) % opciones.length : 0)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActiva(a => (opciones.length ? (a - 1 + opciones.length) % opciones.length : 0)); }
    else if (e.key === 'Home' && e.ctrlKey) { e.preventDefault(); setActiva(0); }
    else if (e.key === 'End' && e.ctrlKey) { e.preventDefault(); setActiva(Math.max(0, opciones.length - 1)); }
    else if (e.key === 'Enter') { e.preventDefault(); opciones[activa]?.ejecutar(); }
  };

  const grupos = useMemo(() => {
    const m = new Map<string, { opcion: Opcion; indice: number }[]>();
    opciones.forEach((o, i) => {
      if (!m.has(o.grupo)) m.set(o.grupo, []);
      m.get(o.grupo)!.push({ opcion: o, indice: i });
    });
    return [...m.entries()];
  }, [opciones]);

  const idOpcion = (i: number) => `${idBase}-op-${i}`;
  const buscandoPersonas = quierePersonas && !estudiantes && !errorPersonas;
  const resumen = opciones.length === 0
    ? 'Sin resultados'
    : `${opciones.length} ${opciones.length === 1 ? 'resultado' : 'resultados'}`;

  return (
    <Dialogo abierto={abierto} alCerrar={alCerrar} etiquetadoPor={idTitulo} className="dialogo-buscador">
      <h2 id={idTitulo} className="sr-only">Buscar o ir a</h2>
      <div className="buscador-campo">
        <Search size={20} aria-hidden="true" />
        <input
          data-inicial=""
          type="text"
          role="combobox"
          aria-expanded="true"
          aria-controls={idLista}
          aria-autocomplete="list"
          aria-activedescendant={opciones.length ? idOpcion(activa) : undefined}
          aria-describedby={`${idBase}-ayuda`}
          placeholder={esStaff ? 'Pantalla, estudiante, curso o ajuste…' : 'Pantalla o ajuste…'}
          value={texto}
          onChange={e => { setTexto(e.target.value); setActiva(0); }}
          onKeyDown={alTeclear}
          autoComplete="off"
          spellCheck={false}
        />
        <kbd className="buscador-esc" aria-hidden="true">Esc</kbd>
      </div>

      <ul id={idLista} role="listbox" aria-label="Resultados" className="buscador-lista" ref={listaRef}>
        {grupos.map(([grupo, items]) => (
          <li key={grupo} role="presentation">
            <div className="buscador-grupo" role="presentation" aria-hidden="true">{grupo}</div>
            <ul role="group" aria-label={grupo} className="buscador-sublista">
              {items.map(({ opcion, indice }) => (
                <li
                  key={opcion.id}
                  id={idOpcion(indice)}
                  role="option"
                  aria-selected={indice === activa}
                  className="buscador-opcion"
                  onMouseMove={() => { if (indice !== activa) setActiva(indice); }}
                  onClick={() => opcion.ejecutar()}
                >
                  <opcion.icono size={18} aria-hidden="true" className="buscador-opcion-icono" />
                  <span className="buscador-opcion-texto">
                    <span className="buscador-opcion-etiqueta">{opcion.etiqueta}</span>
                    {opcion.detalle && <span className="buscador-opcion-detalle">{opcion.detalle}</span>}
                  </span>
                  {indice === activa && <CornerDownLeft size={15} aria-hidden="true" className="buscador-opcion-enter" />}
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>

      <div className="buscador-pie">
        <span role="status" aria-live="polite" className="buscador-estado">
          {buscandoPersonas ? 'Buscando personas…' : errorPersonas ? 'No se pudo buscar personas. Revisá la conexión.' : resumen}
        </span>
        <span id={`${idBase}-ayuda`} className="buscador-teclas">
          <kbd>↑</kbd><kbd>↓</kbd> para moverte · <kbd>Enter</kbd> para elegir
        </span>
      </div>
    </Dialogo>
  );
}
