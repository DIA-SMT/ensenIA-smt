import { useState, useEffect } from 'react';
import { GraduationCap, HeartPulse } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { getMyChildren } from '../services/guardians.service';
import type { Student } from '../types';
import './Familias.css';
import './StudentPortal.css';

export default function MisHijos() {
  const { user } = useAuth();
  const [children, setChildren] = useState<(Student & { relationship: string })[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    getMyChildren().then(setChildren).catch(console.error).finally(() => setLoading(false));
  }, [user]);

  if (!user) return null;

  const statusBadge = (s: Student) => {
    switch (s.status) {
      case 'excellent': return <span className="badge badge-success">Excelente</span>;
      case 'good': return <span className="badge badge-success" style={{ opacity: 0.8 }}>Buen ritmo</span>;
      case 'warning': return <span className="badge badge-warning">En observación</span>;
      case 'critical': return <span className="badge badge-danger">Necesita apoyo</span>;
    }
  };

  return (
    <div className="sp-container animate-in">
      <h3 className="sp-section-title"><GraduationCap size={17} /> Mis hijos en la escuela</h3>

      {loading && <p className="text-secondary">Cargando...</p>}
      {!loading && children.length === 0 && (
        <div className="card acts-empty">
          <GraduationCap size={30} className="text-secondary" />
          <p className="text-secondary">No hay estudiantes vinculados a tu cuenta. Consultá en la escuela.</p>
        </div>
      )}

      {children.map(c => (
        <div key={c.id} className="card fam-child">
          <div className="fam-child-head">
            <div className="student-avatar" style={{ width: 46, height: 46, fontSize: 16 }}>{c.avatarInitials}</div>
            <div>
              <h4>{c.firstName} {c.lastName}</h4>
              <span className="text-sm text-secondary">{c.courseName} · E.M. Gabriela Mistral</span>
            </div>
            <div style={{ marginLeft: 'auto' }}>{statusBadge(c)}</div>
          </div>
          <div className="fam-child-metrics">
            <div className="metric-box">
              <span className="metric-label">Asistencia</span>
              <span className="metric-val">{c.attendance}%</span>
            </div>
            <div className="metric-box">
              <span className="metric-label">Promedio</span>
              <span className="metric-val">{c.average}</span>
            </div>
            <div className="metric-box">
              <span className="metric-label">Progreso</span>
              <span className="metric-val">{c.progress}%</span>
            </div>
          </div>
          <p className="text-xs text-subtle flex items-center gap-1">
            <HeartPulse size={12} /> Ante cualquier duda sobre su acompañamiento, respondé la citación o acercate a la escuela.
          </p>
        </div>
      ))}
    </div>
  );
}
