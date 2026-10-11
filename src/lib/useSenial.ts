import { useEffect, useState } from 'react';
import { haySenial, suscribirConexion } from './conexion';

/** ¿Hay señal? Se actualiza sola cuando se corta o vuelve. */
export function useSenial(): boolean {
  const [hay, setHay] = useState(haySenial);
  useEffect(() => suscribirConexion(() => setHay(haySenial())), []);
  return hay;
}
