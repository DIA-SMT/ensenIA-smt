/**
 * SMT EstudIA — Mis clases
 *
 * El horario de la semana, qué temas conviene repasar (según lo que
 * respondieron en actividades y clases en vivo) y cómo viene el clima de
 * cada curso, y "Mi devolución": su uso de la app y lo que dicen sus
 * estudiantes, lo mismo que ve la dirección de él (058). Actividades
 * y materiales tienen su propio lugar en el menú: antes también eran
 * pestañas acá, y había dos caminos a lo mismo.
 */

import { Navigate, useSearchParams } from 'react-router-dom';
import { Calendar, HeartPulse, Target, MessageSquareHeart } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import FichaDocente from '../components/FichaDocente';
import Agenda from './Agenda';
import ClimaDelAula from './ClimaDelAula';
import QueRepasar from '../components/QueRepasar';
import '../components/ui/ui.css';
import './MisClases.css';

type Tab = 'agenda' | 'repasar' | 'clima' | 'devolucion';

const TABS: { key: Tab; label: string; icon: typeof Calendar }[] = [
    { key: 'agenda', label: 'Mi horario', icon: Calendar },
    { key: 'repasar', label: 'Qué repasar', icon: Target },
    { key: 'clima', label: 'Clima del aula', icon: HeartPulse },
    { key: 'devolucion', label: 'Mi devolución', icon: MessageSquareHeart },
];

/** Enlaces viejos a pestañas que ya no están acá */
const MUDADAS: Record<string, string> = {
    actividades: '/actividades',
    materiales: '/biblioteca',
};

export default function MisClases() {
    const { user } = useAuth();
    const [searchParams, setSearchParams] = useSearchParams();
    const raw = searchParams.get('tab');
    const active: Tab = TABS.some(t => t.key === raw) ? (raw as Tab) : 'agenda';

    if (raw && MUDADAS[raw]) return <Navigate to={MUDADAS[raw]} replace />;

    const setTab = (tab: Tab) => {
        searchParams.set('tab', tab);
        setSearchParams(searchParams, { replace: true });
    };

    return (
        <div className="mc-container">
            <div className="mc-tabs fila-desplazable" role="tablist" aria-label="Mis clases">
                {TABS.map(t => (
                    <button
                        key={t.key}
                        role="tab"
                        id={`mc-tab-${t.key}`}
                        aria-selected={active === t.key}
                        aria-controls="mc-panel"
                        className={`mc-tab ${active === t.key ? 'active' : ''}`}
                        onClick={() => setTab(t.key)}
                    >
                        <t.icon size={15} aria-hidden="true" />
                        <span>{t.label}</span>
                    </button>
                ))}
            </div>

            <div className="mc-panel" id="mc-panel" role="tabpanel" aria-labelledby={`mc-tab-${active}`}>
                {active === 'agenda' && <Agenda />}
                {active === 'repasar' && <QueRepasar />}
                {active === 'clima' && <ClimaDelAula />}
                {active === 'devolucion' && user && (
                    <div className="card mc-devolucion">
                        <p className="mc-devolucion-intro">
                            Lo que sigue es lo mismo que ve la dirección de vos. Lo que dicen tus estudiantes es
                            anónimo: nadie, ni vos ni la escuela, ve quién respondió.
                        </p>
                        <FichaDocente teacherId={user.id} voz="propia" />
                    </div>
                )}
            </div>
        </div>
    );
}
