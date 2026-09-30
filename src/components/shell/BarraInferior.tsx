/**
 * Barra de navegación inferior (celular).
 *
 * Los chicos y las familias usan la app con una mano, en el celular: lo
 * principal va abajo, al alcance del pulgar, siempre con su nombre escrito
 * (un ícono solo no alcanza para saber a dónde lleva). Lo que no entra en
 * la barra va a "Más", junto con los ajustes de lectura y el cierre de
 * sesión.
 */

import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { LogOut, Menu, Accessibility, type LucideIcon } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { NAV_POR_ROL, ETIQUETA_ROL, itemActivo } from '../../lib/navegacion';
import Dialogo from './Dialogo';

interface Props {
  alAbrirPreferencias: () => void;
}

function ItemBarra({ ruta, etiqueta, icono: Icono, activo, ia }: {
  ruta: string; etiqueta: string; icono: LucideIcon; activo: boolean; ia?: boolean;
}) {
  return (
    <li>
      <Link to={ruta} className={`barra-item${activo ? ' activo' : ''}${ia ? ' barra-ia' : ''}`} aria-current={activo ? 'page' : undefined}>
        <span className="barra-icono"><Icono size={22} aria-hidden="true" /></span>
        <span className="barra-etiqueta">{etiqueta}</span>
      </Link>
    </li>
  );
}

export default function BarraInferior({ alAbrirPreferencias }: Props) {
  const { user, school, logout } = useAuth();
  const { pathname } = useLocation();
  const [masAbierto, setMasAbierto] = useState(false);

  if (!user) return null;
  const items = NAV_POR_ROL[user.role];
  const enBarra = items.filter(i => i.enBarra);
  const resto = items.filter(i => !i.enBarra);
  const activo = itemActivo(user.role, pathname);
  const masActivo = resto.some(i => i.ruta === activo);

  const grupos = [...new Set(resto.map(i => i.grupo))];

  return (
    <>
      <nav className="barra-inferior" aria-label="Principal">
        <ul>
          {enBarra.map(i => (
            <ItemBarra key={i.ruta} ruta={i.ruta} etiqueta={i.etiqueta} icono={i.icono} ia={i.ia} activo={activo === i.ruta} />
          ))}
          {resto.length > 0 && (
            <li>
              <button
                type="button"
                className={`barra-item${masActivo ? ' activo' : ''}`}
                aria-haspopup="dialog"
                aria-expanded={masAbierto}
                onClick={() => setMasAbierto(true)}
              >
                <span className="barra-icono"><Menu size={22} aria-hidden="true" /></span>
                <span className="barra-etiqueta">Más</span>
              </button>
            </li>
          )}
        </ul>
      </nav>

      <Dialogo abierto={masAbierto} alCerrar={() => setMasAbierto(false)} etiquetadoPor="hoja-mas-titulo" className="dialogo-hoja">
        <div className="hoja-agarre" aria-hidden="true" />
        <div className="hoja-quien">
          <div className="hoja-avatar" aria-hidden="true">{user.avatarInitials}</div>
          <div>
            <h2 id="hoja-mas-titulo" className="hoja-nombre">{user.firstName} {user.lastName}</h2>
            <p className="hoja-rol">{ETIQUETA_ROL[user.role]} · {school?.shortName ?? school?.name ?? 'Escuela municipal'}</p>
          </div>
        </div>

        {grupos.map(g => (
          <div key={g} className="hoja-grupo">
            <h3 className="hoja-grupo-titulo">{g}</h3>
            <ul>
              {resto.filter(i => i.grupo === g).map(i => (
                <li key={i.ruta}>
                  <Link
                    to={i.ruta}
                    className={`hoja-item${activo === i.ruta ? ' activo' : ''}`}
                    aria-current={activo === i.ruta ? 'page' : undefined}
                    onClick={() => setMasAbierto(false)}
                    data-inicial={g === grupos[0] && i === resto.find(x => x.grupo === g) ? '' : undefined}
                  >
                    <i.icono size={20} aria-hidden="true" />
                    <span>{i.titulo ?? i.etiqueta}</span>
                    {i.ia && <span className="ia-tag" aria-hidden="true">IA</span>}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}

        <div className="hoja-acciones">
          <button type="button" className="hoja-item" onClick={() => { setMasAbierto(false); alAbrirPreferencias(); }}>
            <Accessibility size={20} aria-hidden="true" />
            <span>Accesibilidad y datos</span>
          </button>
          <button type="button" className="hoja-item hoja-salir" onClick={() => { setMasAbierto(false); logout(); }}>
            <LogOut size={20} aria-hidden="true" />
            <span>Cerrar sesión</span>
          </button>
        </div>
      </Dialogo>
    </>
  );
}
