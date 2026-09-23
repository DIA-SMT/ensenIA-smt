/**
 * Si una pantalla no se puede abrir (sin conexión y todavía no guardada,
 * o un error del código), se dice qué pasó y qué hacer, en vez de dejar
 * la pantalla en blanco.
 */

import { Component, type ReactNode } from 'react';
import { WifiOff, RefreshCw } from 'lucide-react';

interface Props { children: ReactNode }
interface State { error: Error | null }

export default class LimitePantalla extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error('La pantalla no se pudo abrir:', error);
  }

  render() {
    if (!this.state.error) return this.props.children;
    const sinConexion = typeof navigator !== 'undefined' && !navigator.onLine;
    return (
      <div className="limite-pantalla card" role="alert">
        <WifiOff size={28} aria-hidden="true" className="limite-icono" />
        <h2>{sinConexion ? 'Esta pantalla todavía no está en este dispositivo' : 'No pudimos abrir esta pantalla'}</h2>
        <p>
          {sinConexion
            ? 'Sin conexión solo se abren las pantallas que ya usaste acá. Cuando vuelva la señal, se abre sola.'
            : 'Puede ser un corte de conexión o una versión nueva de la app. Probá recargar.'}
        </p>
        <button type="button" className="btn btn-primary" onClick={() => window.location.reload()}>
          <RefreshCw size={16} aria-hidden="true" /> Recargar
        </button>
      </div>
    );
  }
}
