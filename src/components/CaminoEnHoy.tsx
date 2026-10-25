/**
 * El Camino Docente Tech en Hoy (082): nivel, cuánto falta para el que sigue
 * y la racha. Acá se festeja: subir de nivel (lo avisa la base) y cada
 * medalla nueva (se comparan con las que ya vio en este equipo; la primera
 * vez no se festeja nada, para no llenar de avisos).
 */

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { getMiCamino, type MiCamino } from '../services/camino.service';
import { EMOJI_GRADO, GRADOS, NIVELES, clavesGanadas, medallasDe, nivelInfo, progresoDe } from '../lib/caminoDocente';
import { avisar } from './ui/avisar';
import './CaminoEnHoy.css';

export default function CaminoEnHoy({ userId }: { userId: string }) {
  const [camino, setCamino] = useState<MiCamino | null>(null);

  useEffect(() => {
    let vigente = true;
    getMiCamino()
      .then(c => {
        if (vigente) setCamino(c);
        // Los festejos van igual aunque ya no esté en pantalla: "subió" llega una sola vez
        const nivel = nivelInfo(c.nivel);
        if (c.subio) avisar.exito(`${nivel.emoji} ¡Subiste a «${nivel.nombre}»!`, nivel.lema);
        // Medallas nuevas desde la última vez que las vio en este equipo
        const clave = `estudia_camino_${userId}_${c.anio}`;
        const ahora = clavesGanadas(medallasDe(c));
        let antes: string[] | null = null;
        try { antes = JSON.parse(localStorage.getItem(clave) ?? 'null'); } catch { antes = null; }
        if (Array.isArray(antes)) {
          const nuevas = medallasDe(c).filter(m => m.grado > 0 && !antes!.includes(`${m.pilar.clave}:${m.grado}`));
          nuevas.slice(0, 2).forEach(m => avisar.exito(
            `${EMOJI_GRADO[m.grado]} Nueva medalla: ${m.pilar.medalla} (${GRADOS[m.grado].toLowerCase()})`,
            `${m.valor} ${m.pilar.unidad}.`,
          ));
          if (nuevas.length > 2) avisar.exito(`Y ${nuevas.length - 2} medallas más`, 'Miralas en "Mi camino".');
        }
        try { localStorage.setItem(clave, JSON.stringify(ahora)); } catch { /* sin storage: se festeja de nuevo otro día */ }
      })
      // Sin la 082 o sin señal: la tarjeta no aparece (Hoy sigue igual)
      .catch(err => console.error('camino:', err));
    return () => { vigente = false; };
  }, [userId]);

  if (!camino) return null;
  const nivel = nivelInfo(camino.nivel);
  const siguiente = NIVELES[camino.nivel];
  const { pct, faltan } = progresoDe(camino);

  return (
    <Link to="/mi-camino" className="card camino-hoy" aria-label={`Mi camino Docente Tech: nivel ${nivel.nombre}. Ver medallas y trofeos`}>
      <span className="camino-hoy-emoji" aria-hidden="true">{nivel.emoji}</span>
      <span className="camino-hoy-texto">
        <span className="camino-hoy-titulo">
          <strong>{nivel.nombre}</strong>
          <small>Nivel {camino.nivel} de {NIVELES.length}{camino.racha > 1 ? ` · 🔥 ${camino.racha} semanas seguidas` : ''}</small>
        </span>
        <span className="camino-hoy-barra" role="progressbar" aria-label="Avance hacia el nivel que sigue"
          aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
          <span style={{ width: `${pct}%` }} />
        </span>
        <small className="camino-hoy-falta">
          {faltan !== null && siguiente ? `${faltan} puntos para «${siguiente.nombre}»` : '¡Llegaste al nivel más alto!'}
        </small>
      </span>
      <ChevronRight size={18} className="camino-hoy-ir" aria-hidden="true" />
    </Link>
  );
}
