/**
 * Orientación vocacional (estudiante).
 *
 * Pedido de las escuelas: "orientación vocacional. Completar."
 *
 * Deliberadamente no es un test que devuelve una carrera. Devuelve por
 * dónde te tira y con qué conversarlo. Compartirlo con la escuela lo
 * decide el estudiante: un perfil a medias, leído sin permiso, hace más
 * daño que bien.
 */

import { useState, useEffect } from 'react';
import { Compass, Save, Share2, RotateCcw, CheckCircle, Lock } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { getStudentByUserId } from '../services/activities.service';
import {
  AREAS, ITEMS, calcularAreas, armarDevolucion, hayPreferenciaClara,
  getMyProfile, saveMyProfile,
} from '../services/vocational.service';
import MarkdownRenderer from '../components/MarkdownRenderer';
import type { Student, VocationalProfile } from '../types';
// Estilos compartidos con otras pantallas: desde que cada pantalla se baja
// por separado, lo que no se importa acá no llega.
import '../components/Modals.css';
import './Libreta.css';
import './Vocacional.css';

const ESCALA = [
  { v: 1, label: 'Nada' },
  { v: 2, label: 'Poco' },
  { v: 3, label: 'Más o menos' },
  { v: 4, label: 'Bastante' },
  { v: 5, label: 'Mucho' },
];

export default function Vocacional() {
  const { user } = useAuth();
  const [student, setStudent] = useState<Student | null>(null);
  const [perfil, setPerfil] = useState<VocationalProfile | null>(null);
  const [respuestas, setRespuestas] = useState<Record<string, number>>({});
  const [palabras, setPalabras] = useState('');
  const [cargando, setCargando] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [okMsg, setOkMsg] = useState('');
  const [rehaciendo, setRehaciendo] = useState(false);

  useEffect(() => {
    if (!user) return;
    let cancelado = false;
    (async () => {
      try {
        const st = await getStudentByUserId(user.id);
        if (cancelado) return;
        setStudent(st);
        if (!st) return;
        const p = await getMyProfile(st.id);
        if (cancelado) return;
        setPerfil(p);
        setRespuestas(p?.answers ?? {});
        setPalabras(p?.ownWords ?? '');
      } catch (err) {
        console.error(err);
        if (!cancelado) setError('No se pudo cargar tu perfil.');
      } finally {
        if (!cancelado) setCargando(false);
      }
    })();
    return () => { cancelado = true; };
  }, [user]);

  if (!user) return null;
  if (cargando) return <p className="text-secondary p-6">Cargando…</p>;

  if (!student) {
    return (
      <div className="voc-container">
        <div className="card voc-vacio">
          <Compass size={32} className="text-cyan" />
          <p className="text-secondary text-sm">
            Tu cuenta todavía no está vinculada a un curso. Pedile a tu docente que te
            agregue a la lista.
          </p>
        </div>
      </div>
    );
  }

  const contestadas = ITEMS.filter(i => typeof respuestas[i.id] === 'number').length;
  const completo = contestadas === ITEMS.length;
  const mostrarResultado = perfil !== null && Boolean(perfil.summary) && !rehaciendo;

  const guardar = async (compartir: boolean) => {
    if (!completo) {
      setError(`Te faltan ${ITEMS.length - contestadas} respuestas.`);
      return;
    }
    setBusy(true); setError(''); setOkMsg('');
    try {
      const clara = hayPreferenciaClara(respuestas);
      // Sin preferencia clara no se guarda un ranking: no hay ninguno.
      const topAreas = clara ? calcularAreas(respuestas) : [];
      await saveMyProfile({
        studentId: student.id,
        schoolId: user.schoolId,
        existe: perfil !== null,
        answers: respuestas,
        topAreas,
        ownWords: palabras,
        summary: armarDevolucion(clara ? topAreas : ['_'], clara),
        sharedWithSchool: compartir,
      });
      const p = await getMyProfile(student.id);
      setPerfil(p);
      setRehaciendo(false);
      setOkMsg(compartir
        ? 'Listo. El equipo de orientación de tu escuela lo puede ver.'
        : 'Guardado. Solo lo ves vos.');
    } catch (err: any) {
      console.error(err);
      setError(err?.message ?? 'No se pudo guardar.');
    } finally {
      setBusy(false);
    }
  };

  const cambiarCompartir = async (compartir: boolean) => {
    if (!perfil) return;
    setBusy(true); setError(''); setOkMsg('');
    try {
      await saveMyProfile({
        studentId: student.id, schoolId: user.schoolId, existe: true,
        answers: perfil.answers, topAreas: perfil.topAreas,
        ownWords: perfil.ownWords ?? '', summary: perfil.summary,
        sharedWithSchool: compartir,
      });
      setPerfil(await getMyProfile(student.id));
      setOkMsg(compartir
        ? 'Compartido con el equipo de orientación.'
        : 'Ya no lo ve la escuela. Volvió a ser solo tuyo.');
    } catch (err) {
      console.error(err);
      setError('No se pudo cambiar quién lo ve.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="voc-container animate-in">
      <header className="voc-head">
        <div>
          <h2><Compass size={20} className="text-cyan" /> Orientación vocacional</h2>
          <p className="text-secondary text-sm">
            No es un test que te dice qué estudiar. Es para ver por dónde te tira y
            tener con qué conversarlo.
          </p>
        </div>
      </header>

      {error && <div className="em-error">{error}</div>}
      {okMsg && <div className="libreta-ok"><CheckCircle size={14} /> {okMsg}</div>}

      {mostrarResultado ? (
        <>
          <div className="card voc-resultado">
            <h3>{perfil!.topAreas.length > 0 ? 'Por dónde te tira' : 'Tu perfil por ahora'}</h3>
            <div className="voc-areas">
              {perfil!.topAreas.map((k, i) => {
                const a = AREAS.find(x => x.key === k);
                if (!a) return null;
                return (
                  <div key={k} className={`voc-area puesto-${i + 1}`}>
                    <span className="voc-area-nombre">{a.nombre}</span>
                    <span className="voc-area-desc">{a.descripcion}</span>
                  </div>
                );
              })}
            </div>

            {perfil!.summary && (
              <div className="voc-devolucion">
                <MarkdownRenderer content={perfil!.summary} />
              </div>
            )}

            {perfil!.ownWords && (
              <div className="voc-palabras">
                <span className="text-xs text-subtle">Lo que escribiste vos</span>
                <p>{perfil!.ownWords}</p>
              </div>
            )}
          </div>

          <div className="card voc-compartir">
            <div>
              <strong className="text-sm">
                {perfil!.sharedWithSchool
                  ? 'El equipo de orientación lo puede ver'
                  : 'Por ahora es solo tuyo'}
              </strong>
              <p className="text-secondary text-sm">
                {perfil!.sharedWithSchool
                  ? 'Podés dejar de compartirlo cuando quieras.'
                  : 'Si lo compartís, el equipo de orientación puede prepararse antes de charlar con vos.'}
              </p>
            </div>
            <div className="libreta-actions-right">
              <button className="btn btn-ghost btn-sm" disabled={busy}
                      onClick={() => { setRehaciendo(true); setOkMsg(''); }}>
                <RotateCcw size={14} /> Rehacerlo
              </button>
              {perfil!.sharedWithSchool ? (
                <button className="btn btn-outline btn-sm" disabled={busy}
                        onClick={() => cambiarCompartir(false)}>
                  <Lock size={14} /> Dejar de compartir
                </button>
              ) : (
                <button className="btn btn-primary btn-sm" disabled={busy}
                        onClick={() => cambiarCompartir(true)}>
                  <Share2 size={14} /> Compartir con la escuela
                </button>
              )}
            </div>
          </div>
        </>
      ) : (
        <>
          <div className="voc-progreso">
            <div className="voc-barra">
              <div style={{ width: `${(contestadas / ITEMS.length) * 100}%` }} />
            </div>
            <span className="text-xs text-subtle">{contestadas} de {ITEMS.length}</span>
          </div>

          <div className="voc-items">
            {ITEMS.map(item => (
              <div key={item.id} className="card voc-item">
                <p className="voc-item-texto">{item.texto}</p>
                <div className="voc-escala">
                  {ESCALA.map(e => (
                    <button
                      key={e.v}
                      className={`voc-opcion ${respuestas[item.id] === e.v ? 'activa' : ''}`}
                      disabled={busy}
                      onClick={() => {
                        setRespuestas(r => ({ ...r, [item.id]: e.v }));
                        setError('');
                      }}
                    >
                      {e.label}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="card voc-item">
            <label className="voc-item-texto" htmlFor="voc-palabras">
              ¿Hay algo que te imaginás haciendo? Contalo con tus palabras. (opcional)
            </label>
            <textarea
              id="voc-palabras"
              className="form-textarea"
              rows={4}
              value={palabras}
              disabled={busy}
              placeholder="Me gustaría trabajar con chicos, o algo con música…"
              onChange={e => setPalabras(e.target.value)}
            />
          </div>

          <div className="libreta-actions-right voc-acciones">
            <button className="btn btn-outline btn-sm" disabled={busy || !completo}
                    onClick={() => guardar(false)}>
              <Save size={14} /> Guardar solo para mí
            </button>
            <button className="btn btn-primary btn-sm" disabled={busy || !completo}
                    onClick={() => guardar(true)}>
              <Share2 size={14} /> Guardar y compartir con la escuela
            </button>
          </div>
        </>
      )}
    </div>
  );
}
