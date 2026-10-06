/**
 * SMT EstudIA — Mis clases
 *
 * El horario de la semana, qué temas conviene repasar (según lo que
 * respondieron en actividades y clases en vivo) y cómo viene el clima de
 * cada curso. Actividades
 * y materiales tienen su propio lugar en el menú: antes también eran
 * pestañas acá, y había dos caminos a lo mismo.
 */

import { Navigate, useSearchParams } from 'react-router-dom';
import { Calendar, HeartPulse, Target } from 'lucide-react';
import Agenda from './Agenda';
import ClimaDelAula from './ClimaDelAula';
import QueRepasar from '../components/QueRepasar';
import '../components/ui/ui.css';
import './MisClases.css';

type Tab = 'agenda' | 'repasar' | 'clima';

const TABS: { key: Tab; label: string; icon: typeof Calendar }[] = [
    { key: 'agenda', label: 'Mi horario', icon: Calendar },
    { key: 'repasar', label: 'Qué repasar', icon: Target },
    { key: 'clima', label: 'Clima del aula', icon: HeartPulse },
];

/** Enlaces viejos a pestañas que ya no están acá */
const MUDADAS: Record<string, string> = {
    actividades: '/actividades',
    materiales: '/biblioteca',
};

export default function MisClases() {
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
            </div>
        </div>
    );
}
