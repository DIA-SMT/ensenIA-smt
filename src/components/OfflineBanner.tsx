import { useState, useEffect } from 'react';
import { WifiOff, RefreshCw, CloudUpload } from 'lucide-react';
import { subscribe } from '../services/offline-queue.service';
import { useAuth } from '../contexts/AuthContext';
import './OfflineBanner.css';

export default function OfflineBanner() {
  const { isOfflineProfile } = useAuth();
  const [online, setOnline] = useState(navigator.onLine);
  const [pending, setPending] = useState(0);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    const unsub = subscribe((p, s) => { setPending(p); setSyncing(s); });
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
      unsub();
    };
  }, []);

  const isOffline = !online || isOfflineProfile;
  if (!isOffline && pending === 0) return null;

  return (
    <div className={`offline-banner ${isOffline ? 'is-offline' : 'is-syncing'}`}>
      {isOffline ? (
        <>
          <WifiOff size={14} />
          <span>
            <strong>Modo sin conexión.</strong> Podés seguir trabajando: todo se guarda en este dispositivo
            {pending > 0 && ` (${pending} cambio${pending !== 1 ? 's' : ''} en espera)`} y se envía solo cuando haya wifi.
          </span>
        </>
      ) : syncing ? (
        <>
          <RefreshCw size={14} className="spin" />
          <span>Sincronizando {pending} cambio{pending !== 1 ? 's' : ''}...</span>
        </>
      ) : (
        <>
          <CloudUpload size={14} />
          <span>{pending} cambio{pending !== 1 ? 's' : ''} esperando sincronización.</span>
        </>
      )}
    </div>
  );
}
