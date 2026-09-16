/**
 * SMT EstudIA — Mis clases
 *
 * Antes el docente tenía que acordarse de que su horario, sus actividades
 * y sus materiales vivían en tres secciones distintas del menú. Ahora es
 * un solo lugar con tres pestañas.
 */

import { useSearchParams } from 'react-router-dom';
import { Calendar, ClipboardList, BookOpen } from 'lucide-react';
import Agenda from './Agenda';
import Actividades from './Actividades';
import Biblioteca from './Biblioteca';
import './MisClases.css';

type Tab = 'agenda' | 'actividades' | 'materiales';

const TABS: { key: Tab; label: string; icon: typeof Calendar }[] = [
    { key: 'agenda', label: 'Mi horario', icon: Calendar },
    { key: 'actividades', label: 'Actividades', icon: ClipboardList },
    { key: 'materiales', label: 'Mis materiales', icon: BookOpen },
];

export default function MisClases() {
    const [searchParams, setSearchParams] = useSearchParams();
    const raw = searchParams.get('tab');
    const active: Tab = TABS.some(t => t.key === raw) ? (raw as Tab) : 'agenda';

    const setTab = (tab: Tab) => {
        searchParams.set('tab', tab);
        setSearchParams(searchParams, { replace: true });
    };

    return (
        <div className="mc-container">
            <div className="mc-tabs">
                {TABS.map(t => (
                    <button
                        key={t.key}
                        className={`mc-tab ${active === t.key ? 'active' : ''}`}
                        onClick={() => setTab(t.key)}
                    >
                        <t.icon size={15} />
                        <span>{t.label}</span>
                    </button>
                ))}
            </div>

            <div className="mc-panel">
                {active === 'agenda' && <Agenda />}
                {active === 'actividades' && <Actividades />}
                {active === 'materiales' && <Biblioteca />}
            </div>
        </div>
    );
}
