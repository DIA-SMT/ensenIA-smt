import { useState } from 'react';
import { Search, Upload, FileText, Link2, Image, Filter, BookOpen } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { getMaterialsByTeacher, searchMaterials, subjects } from '../data';
import type { LibraryMaterial } from '../types';
import './Biblioteca.css';

const fileIcons: Record<string, typeof FileText> = {
  pdf: FileText,
  doc: FileText,
  link: Link2,
  image: Image,
};

export default function Biblioteca() {
  const { user } = useAuth();
  const [query, setQuery] = useState('');
  const [activeSubject, setActiveSubject] = useState<string | null>(null);

  if (!user) return null;

  const allMaterials = getMaterialsByTeacher(user.id);

  let filtered: LibraryMaterial[];
  if (query.trim()) {
    filtered = searchMaterials(query, user.id);
  } else {
    filtered = allMaterials;
  }

  if (activeSubject) {
    filtered = filtered.filter(m => m.subjectId === activeSubject);
  }

  const mySubjectIds = [...new Set(allMaterials.map(m => m.subjectId))];
  const mySubjects = subjects.filter(s => mySubjectIds.includes(s.id));

  return (
    <div className="biblioteca-container">
      {/* Left: Filters */}
      <aside className="card biblioteca-sidebar">
        <div className="biblioteca-sidebar-header">
          <BookOpen size={18} />
          <h3>Biblioteca Docente</h3>
        </div>

        <div className="biblioteca-filters">
          <p className="filter-label">Materias</p>
          <button
            className={`filter-chip ${!activeSubject ? 'active' : ''}`}
            onClick={() => setActiveSubject(null)}
          >
            Todas
          </button>
          {mySubjects.map(s => (
            <button
              key={s.id}
              className={`filter-chip ${activeSubject === s.id ? 'active' : ''}`}
              onClick={() => setActiveSubject(s.id)}
            >
              {s.name}
            </button>
          ))}
        </div>

        <div className="biblioteca-upload">
          <button className="btn btn-primary w-full">
            <Upload size={16} />
            Subir Material
          </button>
        </div>
      </aside>

      {/* Main: Grid */}
      <main className="biblioteca-main">
        <div className="biblioteca-main-header">
          <div className="search-bar biblioteca-search">
            <Search size={16} className="search-icon" />
            <input
              className="search-input"
              placeholder="Buscar por título, tag o contenido..."
              value={query}
              onChange={e => setQuery(e.target.value)}
            />
          </div>
          <button className="btn btn-outline">
            <Filter size={16} />
            Filtros
          </button>
        </div>

        <div className="biblioteca-count">
          <span className="text-secondary text-sm">{filtered.length} material{filtered.length !== 1 ? 'es' : ''}</span>
        </div>

        <div className="biblioteca-grid">
          {filtered.map(mat => {
            const Icon = fileIcons[mat.fileType] || FileText;
            return (
              <div key={mat.id} className="card card-interactive biblioteca-card">
                <div className="mat-icon-wrap">
                  <Icon size={24} />
                </div>
                <div className="mat-info">
                  <h4 className="mat-title">{mat.title}</h4>
                  <p className="mat-desc">{mat.description}</p>
                  <div className="mat-meta">
                    <span className="badge badge-cyan">{mat.subjectName}</span>
                    {mat.unitName && <span className="badge badge-neutral">{mat.unitName}</span>}
                    <span className="mat-size">{mat.fileSize}</span>
                  </div>
                  <div className="mat-tags">
                    {mat.tags.slice(0, 3).map(tag => (
                      <span key={tag} className="mat-tag">{tag}</span>
                    ))}
                  </div>
                </div>
                <span className="mat-date">{mat.uploadedAt}</span>
              </div>
            );
          })}

          {filtered.length === 0 && (
            <div className="biblioteca-empty">
              <BookOpen size={40} />
              <p>No se encontraron materiales</p>
              <span className="text-secondary text-sm">Intentá con otra búsqueda o subí un nuevo material</span>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
