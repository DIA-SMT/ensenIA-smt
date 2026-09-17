/**
 * SMT EstudIA — Guía rápida ("¿Qué querés hacer?")
 *
 * El roadmap de uso: se abre solo la primera vez y queda siempre a mano
 * en el "?" del topbar. No es un tour que te secuestra la pantalla: es
 * una lista de destinos reales — tocás lo que querés hacer y el sistema
 * te lleva ahí. Con "no volver a mostrarla sola" para quien ya la conoce.
 * Abajo, el disclaimer de la demo: qué es esto, para quién y qué datos usa.
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { X, ChevronRight, Info } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import './GuiaRapida.css';

const AUTO_OFF_KEY = 'estudia_guia_auto_off';
const SEEN_KEY = 'estudia_guia_vista';

interface Destino {
  emoji: string;
  title: string;
  desc: string;
  to: string;
}

const DESTINOS: Record<string, Destino[]> = {
  docente: [
    { emoji: '📖', title: 'Preparar una clase', desc: 'Tus módulos y temas, con la IA como asistente', to: '/ia-lab' },
    { emoji: '🧱', title: 'Armar el material de un tema', desc: 'Placas, podcast y actividad. Se genera una vez y queda', to: '/modulo' },
    { emoji: '📡', title: 'Dar la clase en vivo', desc: 'Los celulares se vuelven la forma de participar', to: '/clase-en-vivo' },
    { emoji: '✋', title: 'Pasar lista', desc: 'Todos presentes por defecto; marcás las excepciones', to: '/asistencia' },
    { emoji: '✅', title: 'Corregir entregas', desc: 'Lo pendiente, ordenado y con ayuda para devolver', to: '/corregir' },
    { emoji: '💙', title: 'Ver cómo están tus estudiantes', desc: 'Señales, logros y alertas de cada uno', to: '/students' },
    { emoji: '👨‍👩‍👧', title: 'Avisar a una familia', desc: 'Comunicados y citaciones sin cadena de WhatsApp', to: '/familias' },
  ],
  director: [
    { emoji: '📡', title: 'Qué está pasando ahora', desc: 'Clases en vivo, clima escolar y alertas', to: '/panel' },
    { emoji: '🧑‍🏫', title: 'Acompañar a tus docentes', desc: 'El pulso de cada docente, sin planillas', to: '/docentes' },
    { emoji: '📣', title: 'Comunicar a las familias', desc: 'Comunicados institucionales con confirmación de lectura', to: '/comunicaciones' },
  ],
  estudiante: [
    { emoji: '🏫', title: 'Mi escuela', desc: 'Tus actividades, tus logros y cómo venís', to: '/mis-actividades' },
    { emoji: '📡', title: 'Entrar a la clase en vivo', desc: 'Participá desde el celu cuando tu docente la abra', to: '/clase' },
    { emoji: '🤖', title: 'Practicar con Mi guía IA', desc: 'Te pregunta y te explica fácil. No te hace la tarea', to: '/mi-guia' },
    { emoji: '📚', title: 'Ver mis materiales', desc: 'Placas, podcasts y resúmenes de tus materias', to: '/mi-biblioteca' },
  ],
  padre: [
    { emoji: '💙', title: 'Cómo le va', desc: 'Notas, logros y asistencia, contados en claro', to: '/mis-hijos' },
    { emoji: '📩', title: 'Comunicados', desc: 'Avisos y citaciones de la escuela', to: '/comunicados-familia' },
  ],
};

export function shouldAutoOpenGuide(role: string): boolean {
  try {
    return !localStorage.getItem(`${SEEN_KEY}_${role}`) && !localStorage.getItem(AUTO_OFF_KEY);
  } catch { return false; }
}

export default function GuiaRapida({ onClose }: { onClose: () => void }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [autoOff, setAutoOff] = useState(false);
  const [showAbout, setShowAbout] = useState(false);

  const role = user?.role ?? 'docente';
  const destinos = DESTINOS[role] ?? DESTINOS.docente;

  useEffect(() => {
    try {
      localStorage.setItem(`${SEEN_KEY}_${role}`, '1');
      setAutoOff(Boolean(localStorage.getItem(AUTO_OFF_KEY)));
    } catch { /* modo privado: la guía funciona igual */ }
  }, [role]);

  const toggleAutoOff = () => {
    const next = !autoOff;
    setAutoOff(next);
    try {
      if (next) localStorage.setItem(AUTO_OFF_KEY, '1');
      else localStorage.removeItem(AUTO_OFF_KEY);
    } catch { /* ídem */ }
  };

  const go = (to: string) => { onClose(); navigate(to); };

  return (
    <div className="em-modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="em-modal guia-modal" role="dialog" aria-label="Guía rápida">
        <div className="em-modal-header">
          <h3>👋 ¿Qué querés hacer?</h3>
          <button className="btn-icon" aria-label="Cerrar" onClick={onClose}><X size={18} /></button>
        </div>

        <div className="em-modal-body guia-body">
          <div className="guia-list">
            {destinos.map(d => (
              <button key={d.to} className="guia-item" onClick={() => go(d.to)}>
                <span className="guia-emoji" aria-hidden>{d.emoji}</span>
                <span className="guia-text">
                  <strong>{d.title}</strong>
                  <em>{d.desc}</em>
                </span>
                <ChevronRight size={16} className="guia-chevron" />
              </button>
            ))}
          </div>

          <button className="guia-about-toggle" onClick={() => setShowAbout(v => !v)}>
            <Info size={14} /> Sobre esta demo {showAbout ? '▴' : '▾'}
          </button>

          {showAbout && (
            <div className="guia-about">
              <p>
                <strong>SMT EstudIA está en etapa de demostración</strong> para las escuelas municipales
                <strong> Gabriela Mistral</strong> y <strong>Alfonsina Storni</strong> (San Miguel de Tucumán).
                Las personas y los datos que ves son de prueba.
              </p>
              <ul>
                <li><strong>Pedagogía primero:</strong> la tecnología acompaña la clase, no la reemplaza. La IA guía y pregunta; nunca hace la tarea por el estudiante.</li>
                <li><strong>Datos mínimos:</strong> las actividades en vivo pesan poco y funcionan con datos móviles escasos. Sin conexión, la app avisa y guarda todo para cuando vuelva.</li>
                <li><strong>Transición cuidada:</strong> pensada para que docentes y estudiantes incorporen la IA de a poco, con control del docente en cada paso.</li>
                <li><strong>Bienestar:</strong> los estudiantes pueden decir cómo se sienten; eso lo ven solo sus docentes.</li>
              </ul>
            </div>
          )}
        </div>

        <div className="em-modal-footer guia-footer">
          <label className="guia-check">
            <input type="checkbox" checked={autoOff} onChange={toggleAutoOff} />
            No mostrar esta guía sola al entrar
          </label>
          <span className="text-xs text-subtle">Siempre está en el «?» de arriba</span>
        </div>
      </div>
    </div>
  );
}
