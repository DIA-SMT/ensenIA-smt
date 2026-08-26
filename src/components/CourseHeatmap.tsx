import { Fragment, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { HeatmapCell, HeatmapMetric } from '../types';
import './CourseHeatmap.css';

const METRIC_META: Record<HeatmapMetric, { label: string; caption: string; goodIsHigh: boolean }> = {
  riesgo: {
    label: 'Riesgo académico',
    caption: '% de inscriptos con entregas vencidas o puntaje bajo en esa materia',
    goodIsHigh: false,
  },
  cobertura: {
    label: 'Cobertura curricular',
    caption: '% de clases planificadas que ya se dictaron',
    goodIsHigh: true,
  },
  entregas: {
    label: 'Entregas',
    caption: '% de actividades esperadas que fueron entregadas',
    goodIsHigh: true,
  },
};

const METRIC_ORDER: HeatmapMetric[] = ['riesgo', 'cobertura', 'entregas'];

function severityClass(pct: number, goodIsHigh: boolean): string {
  const bad = goodIsHigh ? 100 - pct : pct;
  if (bad >= 35) return 'heat-c2';
  if (bad >= 15) return 'heat-c1';
  return 'heat-c0';
}

interface CourseHeatmapProps {
  cellsByMetric: Record<HeatmapMetric, HeatmapCell[]>;
}

export default function CourseHeatmap({ cellsByMetric }: CourseHeatmapProps) {
  const navigate = useNavigate();
  const [metric, setMetric] = useState<HeatmapMetric>('riesgo');

  const { rows, cols, grid } = useMemo(() => {
    const courseMap = new Map<string, string>();
    const subjectMap = new Map<string, string>();
    for (const m of METRIC_ORDER) {
      for (const c of cellsByMetric[m]) {
        courseMap.set(c.courseId, c.courseName);
        subjectMap.set(c.subjectId, c.subjectName);
      }
    }
    const rows = [...courseMap.entries()].sort((a, b) => a[1].localeCompare(b[1]));
    const cols = [...subjectMap.entries()].sort((a, b) => a[1].localeCompare(b[1]));
    const grid = new Map<string, HeatmapCell>();
    for (const c of cellsByMetric[metric]) grid.set(`${c.courseId}|${c.subjectId}`, c);
    return { rows, cols, grid };
  }, [cellsByMetric, metric]);

  const meta = METRIC_META[metric];

  return (
    <div className="heatmap-widget">
      <div className="heatmap-header">
        <div className="heatmap-tabs">
          {METRIC_ORDER.map(m => (
            <button
              key={m}
              className={`heatmap-tab ${metric === m ? 'active' : ''}`}
              onClick={() => setMetric(m)}
            >
              {METRIC_META[m].label}
            </button>
          ))}
        </div>
        <span className="heatmap-caption">{meta.caption}</span>
      </div>

      {rows.length === 0 || cols.length === 0 ? (
        <p className="text-secondary text-sm">Todavía no hay materias con estudiantes inscriptos para mostrar el mapa.</p>
      ) : (
        <div className="table-responsive">
          <div
            className="heat-grid"
            style={{ gridTemplateColumns: `8rem repeat(${cols.length}, minmax(4.5rem, 1fr))` }}
          >
            <span className="heat-corner" />
            {cols.map(([id, name]) => <span key={id} className="heat-collab">{name}</span>)}
            {rows.map(([courseId, courseName]) => (
              <Fragment key={courseId}>
                <button className="heat-rowlab" onClick={() => navigate(`/cursos/${courseId}`)}>
                  {courseName}
                </button>
                {cols.map(([subjectId]) => {
                  const cell = grid.get(`${courseId}|${subjectId}`);
                  if (!cell || cell.pct === null) {
                    return <div key={`${courseId}|${subjectId}`} className="heat-cell heat-na">—</div>;
                  }
                  return (
                    <button
                      key={`${courseId}|${subjectId}`}
                      className={`heat-cell ${severityClass(cell.pct, meta.goodIsHigh)}`}
                      onClick={() => navigate(`/cursos/${courseId}`)}
                      title={`${cell.courseName} · ${cell.subjectName}: ${cell.numerator}/${cell.denominator}`}
                    >
                      {cell.pct}
                    </button>
                  );
                })}
              </Fragment>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
