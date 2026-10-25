/**
 * Mi perfil docente (070): quién soy, mi formación y lo que logré.
 *
 * Lo carga el docente y es suyo. La dirección de su escuela lo ve solo si
 * lo comparte (apagado de entrada); estudiantes y colegas, nunca. Sirve
 * para tener todo junto el día que hay que presentar antecedentes: se baja
 * como CV en PDF. Lo que hizo en la app se cuenta solo, sin comparar con
 * nadie.
 */

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  GraduationCap, BookOpenCheck, Trophy, FolderKanban, BookOpenText, Medal, Download, Plus, Pencil, Trash2,
  Eye, Sparkles, type LucideIcon,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { getSubjects } from '../services/subjects.service';
import { getTeacherAwards } from '../services/awards.service';
import {
  getPerfilDocente, guardarPerfilDocente, getAntecedentes, guardarAntecedente, borrarAntecedente, getMiRecorrido,
} from '../services/perfil-docente.service';
import { descargarCV, lineaAntecedente, SECCIONES_CV } from '../lib/cvDocente';
import { avisar, confirmar } from '../components/ui/avisar';
import { Esqueleto } from '../components/ui/Esqueleto';
import EstadoVacio from '../components/ui/EstadoVacio';
import MisAcompanamientos from '../components/MisAcompanamientos';
import {
  TEACHER_AWARD_META,
  type AntecedenteDocente, type PerfilDocente as Perfil, type RecorridoEnEstudia, type TeacherAward, type TipoAntecedente,
} from '../types';
import './PerfilDocente.css';

const INTERESES_SUGERIDOS = [
  'ESI', 'Educación digital', 'Robótica y programación', 'Inclusión', 'Lectura y escritura', 'Ciencias',
  'Arte', 'Deporte', 'Ambiente', 'Convivencia', 'Proyectos comunitarios', 'Orientación vocacional',
];

const ICONO: Record<TipoAntecedente, LucideIcon> = {
  titulo: GraduationCap,
  capacitacion: BookOpenCheck,
  logro: Trophy,
  proyecto: FolderKanban,
  publicacion: BookOpenText,
};

/** Ejemplos para que se entienda qué va en cada campo */
const EJEMPLO: Record<TipoAntecedente, { titulo: string; institucion: string; vacio: string }> = {
  titulo: { titulo: 'Profesorado de Educación Secundaria en Lengua y Literatura', institucion: 'Instituto, profesorado o universidad', vacio: 'Tus títulos docentes y de grado o posgrado.' },
  capacitacion: { titulo: 'ESI en la escuela secundaria', institucion: 'Quién la dio (Ministerio, INFoD, universidad…)', vacio: 'Cursos y capacitaciones, con sus horas: se suman solas.' },
  logro: { titulo: 'Mención en la Feria de Ciencias provincial', institucion: 'Quién lo otorgó', vacio: 'Premios, menciones, olimpíadas o ferias con tus estudiantes.' },
  proyecto: { titulo: 'Radio escolar con 4° año', institucion: 'Dónde (la escuela, el barrio, otra institución)', vacio: 'Proyectos institucionales o comunitarios que llevaste adelante.' },
  publicacion: { titulo: 'Título del artículo, libro o material', institucion: 'Revista, editorial o sitio', vacio: 'Artículos, libros o materiales que publicaste.' },
};

const ANIO = new Date().getFullYear();

type Borrador = { id?: string; tipo: TipoAntecedente; titulo: string; institucion: string; anio: string; horas: string; detalle: string };

const aBorrador = (a: AntecedenteDocente): Borrador => ({
  id: a.id, tipo: a.tipo, titulo: a.titulo, institucion: a.institucion,
  anio: a.anio ? String(a.anio) : '', horas: a.horas ? String(a.horas) : '', detalle: a.detalle,
});

/** Un número entero dentro del rango, o null */
function numero(v: string, min: number, max: number): number | null {
  const n = Number(v.trim());
  return v.trim() && Number.isInteger(n) && n >= min && n <= max ? n : null;
}

export default function PerfilDocente() {
  const { user, school } = useAuth();
  const [cargado, setCargado] = useState(false);
  const [fallo, setFallo] = useState(false);
  const [perfil, setPerfil] = useState<Perfil | null>(null);
  const [antecedentes, setAntecedentes] = useState<AntecedenteDocente[]>([]);
  const [premios, setPremios] = useState<TeacherAward[]>([]);
  const [recorrido, setRecorrido] = useState<RecorridoEnEstudia | null>(null);
  const [materias, setMaterias] = useState<string[]>([]);

  // Lo que se está escribiendo de "Sobre vos"
  const [sobreMi, setSobreMi] = useState('');
  const [desde, setDesde] = useState('');
  const [intereses, setIntereses] = useState<string[]>([]);
  const [otroInteres, setOtroInteres] = useState('');
  const [compartir, setCompartir] = useState(false);
  const [guardando, setGuardando] = useState(false);

  const [editando, setEditando] = useState<Borrador | null>(null);
  const [guardandoItem, setGuardandoItem] = useState(false);
  const [bajando, setBajando] = useState(false);

  useEffect(() => {
    if (!user) return;
    let vigente = true;
    (async () => {
      const [p, a, pr, r, s] = await Promise.allSettled([
        getPerfilDocente(user.id), getAntecedentes(user.id), getTeacherAwards(user.id), getMiRecorrido(), getSubjects(user.schoolId),
      ]);
      if (!vigente) return;
      // Sin perfil ni antecedentes no hay pantalla; lo demás es un extra
      if (p.status === 'rejected' || a.status === 'rejected') { setFallo(true); setCargado(true); return; }
      const actual = p.value;
      setPerfil(actual);
      setSobreMi(actual?.sobreMi ?? '');
      setDesde(actual?.docenteDesde ? String(actual.docenteDesde) : '');
      setIntereses(actual?.intereses ?? []);
      setCompartir(actual?.compartirConDireccion ?? false);
      setAntecedentes(a.value);
      if (pr.status === 'fulfilled') setPremios(pr.value);
      if (r.status === 'fulfilled') setRecorrido(r.value);
      const nombres = new Map((s.status === 'fulfilled' ? s.value : []).map(m => [m.id, m.name]));
      setMaterias((user.subjects ?? []).map(a2 => [nombres.get(a2.subjectId), a2.courseName].filter(Boolean).join(' · ')));
      setCargado(true);
    })();
    return () => { vigente = false; };
  }, [user]);

  const desdeNumero = numero(desde, 1960, ANIO);
  const cambiosSinGuardar = cargado && !fallo && (
    sobreMi.trim() !== (perfil?.sobreMi ?? '')
    || desdeNumero !== (perfil?.docenteDesde ?? null)
    || intereses.join('|') !== (perfil?.intereses ?? []).join('|')
    || compartir !== (perfil?.compartirConDireccion ?? false)
  );

  const horasTotales = useMemo(
    () => antecedentes.filter(a => a.tipo === 'capacitacion').reduce((n, a) => n + (a.horas ?? 0), 0),
    [antecedentes],
  );

  if (!user) return null;

  const guardarSobreMi = async (e?: FormEvent) => {
    e?.preventDefault();
    if (desde.trim() && desdeNumero === null) {
      avisar.error('Revisá el año', `Tiene que ser un año entre 1960 y ${ANIO}.`);
      return;
    }
    setGuardando(true);
    try {
      const nuevo = await guardarPerfilDocente({
        userId: user.id, sobreMi, docenteDesde: desdeNumero, intereses, compartirConDireccion: compartir,
      });
      setPerfil(nuevo);
      // Como quedó guardado (sin espacios de más ni intereses repetidos)
      setSobreMi(nuevo.sobreMi);
      setIntereses(nuevo.intereses);
      avisar.exito('Perfil guardado', nuevo.compartirConDireccion ? 'La dirección de tu escuela lo puede ver.' : 'Solo lo ves vos.');
    } catch (err) {
      console.error(err);
      avisar.error('No se pudo guardar', 'Probá de nuevo en un rato.');
    } finally {
      setGuardando(false);
    }
  };

  const alternarInteres = (i: string) =>
    setIntereses(prev => (prev.some(x => x.toLowerCase() === i.toLowerCase())
      ? prev.filter(x => x.toLowerCase() !== i.toLowerCase())
      : prev.length >= 12 ? prev : [...prev, i]));

  const sumarOtroInteres = () => {
    const i = otroInteres.trim().slice(0, 40);
    if (!i) return;
    if (!intereses.some(x => x.toLowerCase() === i.toLowerCase())) alternarInteres(i);
    setOtroInteres('');
  };

  const guardarItem = async (e: FormEvent) => {
    e.preventDefault();
    if (!editando || !editando.titulo.trim()) return;
    const anio = numero(editando.anio, 1960, ANIO + 1);
    const horas = editando.tipo === 'capacitacion' ? numero(editando.horas, 1, 5000) : null;
    if (editando.anio.trim() && anio === null) { avisar.error('Revisá el año', `Tiene que ser un año entre 1960 y ${ANIO + 1}.`); return; }
    if (editando.tipo === 'capacitacion' && editando.horas.trim() && horas === null) { avisar.error('Revisá las horas', 'Un número entero, como figura en la constancia.'); return; }
    setGuardandoItem(true);
    try {
      const guardado = await guardarAntecedente({
        id: editando.id, userId: user.id, tipo: editando.tipo, titulo: editando.titulo,
        institucion: editando.institucion, anio, horas, detalle: editando.detalle,
      });
      setAntecedentes(prev => {
        const sin = prev.filter(a => a.id !== guardado.id);
        return [...sin, guardado].sort((x, y) => (y.anio ?? 0) - (x.anio ?? 0));
      });
      setEditando(null);
    } catch (err) {
      console.error(err);
      avisar.error('No se pudo guardar', 'Probá de nuevo en un rato.');
    } finally {
      setGuardandoItem(false);
    }
  };

  const borrarItem = async (a: AntecedenteDocente) => {
    const ok = await confirmar({ titulo: `¿Borrar «${a.titulo}»?`, mensaje: 'Se borra de tu perfil y de tu CV.', accion: 'Borrar', peligro: true });
    if (!ok) return;
    try {
      await borrarAntecedente(a.id);
      setAntecedentes(prev => prev.filter(x => x.id !== a.id));
    } catch (err) {
      console.error(err);
      avisar.error('No se pudo borrar', 'Probá de nuevo en un rato.');
    }
  };

  const bajarCV = async () => {
    setBajando(true);
    try {
      await descargarCV({
        nombre: `${user.firstName} ${user.lastName}`.trim(),
        email: user.email,
        escuela: school?.name,
        materias,
        // Lo que se ve en pantalla, aunque no lo haya guardado todavía
        perfil: { userId: user.id, sobreMi: sobreMi.trim(), docenteDesde: desdeNumero, intereses, compartirConDireccion: compartir },
        antecedentes,
      });
    } catch (err) {
      console.error(err);
      avisar.error('No se pudo armar el PDF', 'Probá de nuevo.');
    } finally {
      setBajando(false);
    }
  };

  if (!cargado) return <div className="pd-contenedor"><Esqueleto tipo="tarjetas" cantidad={3} etiqueta="Cargando tu perfil…" /></div>;

  if (fallo) {
    return (
      <div className="pd-contenedor">
        <EstadoVacio titulo="No se pudo cargar tu perfil" texto="Puede ser la conexión. Probá de nuevo en un rato." />
      </div>
    );
  }

  const anios = desdeNumero ? ANIO - desdeNumero : null;

  return (
    <div className="pd-contenedor">
      {/* ── Quién es ── */}
      <section className="card pd-cabecera" aria-labelledby="pd-nombre">
        <div className="pd-avatar" aria-hidden="true">{user.avatarInitials}</div>
        <div className="pd-cabecera-texto">
          <h2 id="pd-nombre">{user.firstName} {user.lastName}</h2>
          <p className="pd-sub">
            {[school?.name, anios !== null ? (anios > 0 ? `${anios} ${anios === 1 ? 'año' : 'años'} de docencia` : 'Primer año de docencia') : ''].filter(Boolean).join(' · ')}
          </p>
          {materias.length > 0 && (
            <ul className="pd-chips" aria-label="Tus materias">
              {materias.map((m, i) => <li key={i} className="pd-chip">{m}</li>)}
            </ul>
          )}
        </div>
        <button type="button" className="btn btn-outline btn-sm pd-cv" onClick={() => void bajarCV()} disabled={bajando}>
          <Download size={15} aria-hidden="true" /> {bajando ? 'Armando…' : 'Bajar mi CV (PDF)'}
        </button>
      </section>

      {/* ── Sobre vos ── */}
      <form className="card pd-seccion" aria-labelledby="pd-sobre" onSubmit={e => void guardarSobreMi(e)}>
        <h3 id="pd-sobre">Sobre vos</h3>
        <label className="pd-campo">
          <span>Una presentación corta <small>(cómo das clase, qué te mueve)</small></span>
          <textarea className="form-textarea" rows={3} maxLength={600} value={sobreMi} onChange={e => setSobreMi(e.target.value)}
            placeholder="Doy Lengua hace diez años. Me gusta trabajar con proyectos de lectura y escritura con la comunidad." />
        </label>
        <label className="pd-campo pd-campo-corto">
          <span>Doy clases desde</span>
          <input className="form-input" type="number" inputMode="numeric" min={1960} max={ANIO} value={desde}
            onChange={e => setDesde(e.target.value)} placeholder={String(ANIO - 5)} />
        </label>
        <fieldset className="pd-campo">
          <legend>Lo que te interesa <small>(tocá para sumar o sacar)</small></legend>
          <div className="pd-intereses">
            {[...INTERESES_SUGERIDOS, ...intereses.filter(i => !INTERESES_SUGERIDOS.some(s => s.toLowerCase() === i.toLowerCase()))].map(i => {
              const activo = intereses.some(x => x.toLowerCase() === i.toLowerCase());
              return (
                <button key={i} type="button" className={`pd-interes ${activo ? 'si' : ''}`} aria-pressed={activo} onClick={() => alternarInteres(i)}>
                  {i}
                </button>
              );
            })}
          </div>
          <div className="pd-otro">
            <input className="form-input" type="text" maxLength={40} value={otroInteres} onChange={e => setOtroInteres(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); sumarOtroInteres(); } }}
              placeholder="Otro (por ejemplo, Huerta escolar)" aria-label="Otro interés" />
            <button type="button" className="btn btn-outline btn-sm" onClick={sumarOtroInteres} disabled={!otroInteres.trim() || intereses.length >= 12}>Sumar</button>
          </div>
        </fieldset>
        <div className="pref-fila pd-compartir">
          <Eye size={18} aria-hidden="true" className="pref-icono" />
          <div className="pref-texto">
            <span className="pref-etiqueta" id="pd-compartir-et">Que lo vea la dirección de tu escuela</span>
            <span className="pref-detalle" id="pd-compartir-det">
              {compartir
                ? 'La dirección ve tu presentación, tu formación y tus logros. Nadie más: ni estudiantes ni colegas.'
                : 'Apagado: lo ves solo vos. Si lo prendés, lo ve la dirección de tu escuela, nadie más.'}
            </span>
          </div>
          <button type="button" role="switch" aria-checked={compartir} aria-labelledby="pd-compartir-et" aria-describedby="pd-compartir-det"
            className="interruptor" onClick={() => setCompartir(v => !v)}>
            <span className="interruptor-perilla" aria-hidden="true" />
          </button>
        </div>
        <div className="pd-acciones">
          <button type="submit" className="btn btn-primary btn-sm" disabled={guardando || !cambiosSinGuardar}>
            {guardando ? 'Guardando…' : cambiosSinGuardar ? 'Guardar' : 'Guardado'}
          </button>
        </div>
      </form>

      {/* ── Formación, logros, proyectos y publicaciones ── */}
      {SECCIONES_CV.map(s => {
        const items = antecedentes.filter(a => a.tipo === s.tipo);
        const Icono = ICONO[s.tipo];
        const ej = EJEMPLO[s.tipo];
        const formAqui = editando?.tipo === s.tipo;
        return (
          <section key={s.tipo} className="card pd-seccion" aria-labelledby={`pd-${s.tipo}`}>
            <div className="pd-seccion-cabecera">
              <h3 id={`pd-${s.tipo}`}><Icono size={17} aria-hidden="true" /> {s.titulo}</h3>
              {s.tipo === 'capacitacion' && horasTotales > 0 && <span className="pd-total">{horasTotales} horas en total</span>}
            </div>
            {items.length === 0 && !formAqui && <p className="pd-vacio">{ej.vacio}</p>}
            {items.length > 0 && (
              <ul className="pd-lista">
                {items.map(a => (
                  <li key={a.id} className="pd-item">
                    <span className="pd-item-texto">
                      <span className="pd-item-titulo">{a.titulo}</span>
                      <small>{lineaAntecedente({ ...a, titulo: '' })}</small>
                      {a.detalle && <small className="pd-detalle">{a.detalle}</small>}
                    </span>
                    <button type="button" className="btn-icon" onClick={() => setEditando(aBorrador(a))} aria-label={`Editar ${a.titulo}`} title="Editar"><Pencil size={15} /></button>
                    <button type="button" className="btn-icon" onClick={() => void borrarItem(a)} aria-label={`Borrar ${a.titulo}`} title="Borrar"><Trash2 size={15} /></button>
                  </li>
                ))}
              </ul>
            )}
            {formAqui && editando ? (
              <form className="pd-form" onSubmit={e => void guardarItem(e)} aria-label={editando.id ? `Editar en ${s.titulo}` : `Agregar a ${s.titulo}`}>
                <label className="pd-campo">
                  <span>Nombre</span>
                  <input className="form-input" required maxLength={200} value={editando.titulo} autoFocus
                    onChange={e => setEditando({ ...editando, titulo: e.target.value })} placeholder={ej.titulo} />
                </label>
                <label className="pd-campo">
                  <span>Institución</span>
                  <input className="form-input" maxLength={200} value={editando.institucion}
                    onChange={e => setEditando({ ...editando, institucion: e.target.value })} placeholder={ej.institucion} />
                </label>
                <div className="pd-fila">
                  <label className="pd-campo pd-campo-corto">
                    <span>Año</span>
                    <input className="form-input" type="number" inputMode="numeric" min={1960} max={ANIO + 1} value={editando.anio}
                      onChange={e => setEditando({ ...editando, anio: e.target.value })} placeholder={String(ANIO)} />
                  </label>
                  {s.tipo === 'capacitacion' && (
                    <label className="pd-campo pd-campo-corto">
                      <span>Horas</span>
                      <input className="form-input" type="number" inputMode="numeric" min={1} max={5000} value={editando.horas}
                        onChange={e => setEditando({ ...editando, horas: e.target.value })} placeholder="40" />
                    </label>
                  )}
                </div>
                <label className="pd-campo">
                  <span>Detalle <small>(opcional)</small></span>
                  <textarea className="form-textarea" rows={2} maxLength={500} value={editando.detalle}
                    onChange={e => setEditando({ ...editando, detalle: e.target.value })} />
                </label>
                <div className="pd-acciones">
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditando(null)}>Cancelar</button>
                  <button type="submit" className="btn btn-primary btn-sm" disabled={guardandoItem || !editando.titulo.trim()}>
                    {guardandoItem ? 'Guardando…' : 'Guardar'}
                  </button>
                </div>
              </form>
            ) : (
              <button type="button" className="btn btn-outline btn-sm pd-agregar"
                onClick={() => setEditando({ tipo: s.tipo, titulo: '', institucion: '', anio: '', horas: '', detalle: '' })}>
                <Plus size={14} aria-hidden="true" /> Agregar
              </button>
            )}
          </section>
        );
      })}

      {/* ── Las observaciones de clase que le compartió la dirección (081); sin ninguna, no aparece ── */}
      <MisAcompanamientos docenteId={user.id} />

      {/* ── Lo que le reconoció la dirección (lo da la dirección, no se edita acá) ── */}
      {premios.length > 0 && (
        <section className="card pd-seccion" aria-labelledby="pd-premios">
          <h3 id="pd-premios"><Medal size={17} aria-hidden="true" /> Reconocimientos de la dirección</h3>
          <ul className="pd-lista">
            {premios.map(p => {
              const meta = TEACHER_AWARD_META[p.badgeCode] ?? { emoji: '🏅', label: 'Reconocimiento', description: '' };
              return (
                <li key={p.id} className="pd-item">
                  <span className="pd-emoji" aria-hidden="true">{meta.emoji}</span>
                  <span className="pd-item-texto">
                    <span className="pd-item-titulo">{meta.label}</span>
                    <small>{p.message || meta.description}{p.directorName ? ` · ${p.directorName}` : ''} · {new Date(p.createdAt).toLocaleDateString('es-AR')}</small>
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* ── Su año en la app: se cuenta solo, sin comparar con nadie ── */}
      {recorrido && (
        <section className="card pd-seccion" aria-labelledby="pd-recorrido">
          <h3 id="pd-recorrido"><Sparkles size={17} aria-hidden="true" /> Tu {recorrido.anio} en EstudIA</h3>
          <dl className="pd-numeros">
            <div><dt>Temas dados</dt><dd>{recorrido.temasDados}</dd></div>
            <div><dt>Materiales subidos</dt><dd>{recorrido.materiales}</dd></div>
            <div><dt>Actividades publicadas</dt><dd>{recorrido.actividades}</dd></div>
            <div><dt>Clases en vivo</dt><dd>{recorrido.clasesEnVivo}</dd></div>
          </dl>
          <Link to="/mi-camino" className="btn btn-outline btn-sm pd-camino">Ver mis medallas y trofeos (Mi camino Docente Tech)</Link>
        </section>
      )}
    </div>
  );
}
