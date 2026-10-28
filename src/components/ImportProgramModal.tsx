/**
 * Importar programa anual → planificación con fechas.
 *
 * El docente sube el PDF (o DOCX) de su programa; la IA lo lee una vez y
 * propone unidades + temas con objetivos. Al confirmar, la base los crea de
 * una vez (todo o nada, sin duplicar unidades) y los reparte en los días de
 * su horario fijo (062). El reparto es por reglas, sin IA.
 */

import { useRef, useState } from 'react';
import { X, FileUp, Sparkles, Folder, FileText, AlertCircle, CheckCircle, CalendarDays } from 'lucide-react';
import {
  fileToBase64, extractDocxText, importProgram, uploadFile, formatFileSize,
} from '../services/documents.service';
import { createMaterial } from '../services/library.service';
import { updateMaterial } from '../services/documents.service';
import { importarPrograma, fechaCorta, type ResultadoImportar } from '../services/planificacion.service';
import type { ImportedProgram } from '../types';
import Dialogo from './shell/Dialogo';
import { esErrorDeRed } from '../lib/conexion';
import { confirmar } from './ui/avisar';
import { achicar, convieneAchicar, entraSinAchicar, AchicadoCancelado, NoSePudoAchicar, LIMITE_TEXTO } from '../lib/comprimir';
import './Modals.css';

interface Props {
  teacherId: string;
  schoolId: string;
  subjectId: string;
  courseId: string;
  subjectName: string;
  courseName: string;
  existingUnitsCount: number;
  /** Año lectivo en el que se reparten las fechas (por defecto, el actual). */
  anio?: number;
  /** Desde qué día se reparten (por defecto, hoy). */
  desde?: string;
  onClose: () => void;
  onImported: () => void;
}

type Step = 'pick' | 'processing' | 'preview' | 'creating' | 'done';

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

export default function ImportProgramModal(props: Props) {
  const [step, setStep] = useState<Step>('pick');
  const [file, setFile] = useState<File | null>(null);
  const [program, setProgram] = useState<ImportedProgram | null>(null);
  const [selectedUnits, setSelectedUnits] = useState<Set<number>>(new Set());
  const [saveToLibrary, setSaveToLibrary] = useState(true);
  const [error, setError] = useState('');
  const [resultado, setResultado] = useState<ResultadoImportar | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [achicando, setAchicando] = useState('');
  const [achicado, setAchicado] = useState<{ antes: number; despues: number } | null>(null);
  // El texto de un PDF que se achicó (el achicado ya no lo trae): la IA lee eso, más barato
  const [textoDelPdf, setTextoDelPdf] = useState<string | undefined>();

  const handleFile = async (f: File | null) => {
    setError('');
    setAchicado(null);
    setTextoDelPdf(undefined);
    if (!f) return;
    // Algunos celulares no informan el tipo del Word: se mira la extensión (como en Mis materiales)
    const esWord = f.type === DOCX_MIME || (!f.type && /\.docx$/i.test(f.name));
    const esPdf = f.type === 'application/pdf' || (!f.type && /\.pdf$/i.test(f.name));
    if (!esPdf && !esWord) {
      setError('Formato no soportado. Subí un PDF o un Word (.docx).');
      return;
    }
    const conTipo = esWord && !f.type ? new File([f], f.name, { type: DOCX_MIME }) : f;
    if (!convieneAchicar(conTipo)) { setFile(conTipo); return; }
    // Lo que pesa de más (un escaneo, un Word con fotos) se achica acá, en el
    // equipo, con el mismo criterio que en Mis materiales (lib/comprimir)
    try {
      setAchicando('Preparando…');
      const { archivo, texto } = await achicar(conTipo, m => { setAchicando(m); });
      setFile(archivo);
      setTextoDelPdf(texto);
      if (archivo !== conTipo) setAchicado({ antes: conTipo.size, despues: archivo.size });
    } catch (err) {
      if (err instanceof AchicadoCancelado) return;
      console.error('No se pudo achicar:', err);
      // Era para que ocupe menos, no para que entre: va el original
      if (entraSinAchicar(conTipo)) { setFile(conTipo); return; }
      setError(err instanceof NoSePudoAchicar
        ? err.message
        : `Pesa más de ${LIMITE_TEXTO} y no se pudo achicar. Probá con una versión más liviana.`);
    } finally {
      setAchicando('');
    }
  };

  const analyze = async () => {
    if (!file) return;
    setStep('processing');
    setError('');
    try {
      let result: ImportedProgram;
      if (file.type === DOCX_MIME || textoDelPdf) {
        const text = textoDelPdf ?? await extractDocxText(file);
        result = await importProgram({
          text, title: file.name,
          subjectName: props.subjectName, courseName: props.courseName,
        });
      } else {
        const pdfBase64 = await fileToBase64(file);
        result = await importProgram({
          pdfBase64, title: file.name,
          subjectName: props.subjectName, courseName: props.courseName,
        });
      }
      if (!result.units?.length) {
        setError('La IA no encontró unidades en el documento. ¿Es un programa anual?');
        setStep('pick');
        return;
      }
      setProgram(result);
      setSelectedUnits(new Set(result.units.map((_, i) => i)));
      setStep('preview');
    } catch (err) {
      setError(esErrorDeRed(err)
        ? 'Se cortó la conexión mientras la IA leía el programa. Probá de nuevo cuando vuelva la señal.'
        : err instanceof Error && err.message ? err.message : 'No se pudo leer el programa. Probá de nuevo.');
      setStep('pick');
    }
  };

  const toggleUnit = (idx: number) => {
    setSelectedUnits(prev => {
      const next = new Set(prev);
      next.has(idx) ? next.delete(idx) : next.add(idx);
      return next;
    });
  };

  const createPlanning = async () => {
    if (!program || !file) return;
    setStep('creating');
    setError('');
    try {
      // De una vez: si falla, no queda una planificación a medias
      const res = await importarPrograma({
        subjectId: props.subjectId,
        courseId: props.courseId,
        programa: program,
        unidadesElegidas: [...selectedUnits].sort((a, b) => a - b),
        anio: props.anio ?? new Date().getFullYear(),
        desde: props.desde,
      });
      const unitsCreated = res.unidades;

      // Guardar el programa en la biblioteca (con archivo real)
      if (saveToLibrary) {
        try {
          const { storagePath, fileSizeBytes } = await uploadFile(props.teacherId, file);
          const material = await createMaterial({
            title: `Programa ${props.subjectName} ${props.courseName}`,
            description: `Programa anual importado a la planificación (${unitsCreated} unidades).`,
            fileType: file.type === DOCX_MIME ? 'doc' : 'pdf',
            fileName: file.name,
            fileSize: formatFileSize(fileSizeBytes),
            subjectId: props.subjectId,
            subjectName: props.subjectName,
            courseId: props.courseId,
            teacherId: props.teacherId,
            schoolId: props.schoolId,
            tags: ['programa', 'planificación'],
          });
          await updateMaterial(material.id, { storagePath, fileSizeBytes });
        } catch (err) {
          console.error('No se pudo guardar en biblioteca:', err);
        }
      }

      setResultado(res);
      setStep('done');
    } catch (err) {
      // Lo que armó la IA sigue en pantalla: se puede reintentar sin volver a leer
      setError(esErrorDeRed(err)
        ? 'Se cortó la conexión y no se terminó de crear. Probá de nuevo: lo que armó la IA sigue acá.'
        : 'No se pudo crear la planificación. Probá de nuevo: lo que armó la IA sigue acá.');
      console.error('crear planificación:', err);
      setStep('preview');
    }
  };

  // Ya importado, cerrar de cualquier forma refresca la planificación
  const cerrar = () => {
    if (step === 'done') props.onImported();
    props.onClose();
  };
  // Tocar afuera o Escape: nunca a mitad de camino, y lo que armó la IA se confirma
  const pedirCerrar = async () => {
    if (step === 'processing' || step === 'creating' || achicando) return;
    if (step === 'preview' && !(await confirmar({
      titulo: '¿Descartar lo que armó la IA?',
      mensaje: 'Todavía no se creó la planificación. Si cerrás, hay que volver a leer el programa.',
      accion: 'Descartar',
      peligro: true,
    }))) return;
    cerrar();
  };

  const selectedClassCount = program
    ? program.units.reduce((acc, u, i) => acc + (selectedUnits.has(i) ? u.classes.length : 0), 0)
    : 0;

  return (
    <Dialogo abierto alCerrar={cerrar} alPedirCierre={() => void pedirCerrar()} etiquetadoPor="imp-titulo" className="dialogo-em">
      <div className="em-modal em-modal-lg">
        <div className="em-modal-header">
          <h3 id="imp-titulo"><Sparkles size={18} className="text-ia-accent" /> Subir el programa</h3>
          <button className="btn-icon" onClick={() => void pedirCerrar()} disabled={step === 'processing' || step === 'creating' || Boolean(achicando)} aria-label="Cerrar">
            <X size={18} />
          </button>
        </div>

        <div className="em-modal-body">
          {error && <div className="em-error"><AlertCircle size={15} /> {error}</div>}

          {step === 'pick' && (
            <>
              <p className="em-hint">
                Subí el programa de <strong>{props.subjectName} — {props.courseName}</strong> (PDF o Word).
                La IA va a leerlo (funciona incluso con escaneos) y va a proponer las unidades y temas.
                Después se reparten en los días de tu horario y podés mover cualquier fecha.
              </p>
              <div
                className="em-dropzone"
                role="button"
                tabIndex={0}
                aria-label="Elegir el programa"
                aria-busy={Boolean(achicando)}
                onKeyDown={e => { if ((e.key === 'Enter' || e.key === ' ') && !achicando) { e.preventDefault(); inputRef.current?.click(); } }}
                onClick={() => { if (!achicando) inputRef.current?.click(); }}
                onDragOver={e => e.preventDefault()}
                onDrop={e => { e.preventDefault(); void handleFile(e.dataTransfer.files[0] ?? null); }}
              >
                <FileUp size={28} />
                {achicando
                  ? <span role="status">{achicando}</span>
                  : file
                    ? <span className="em-file-name">{file.name} · {formatFileSize(file.size)}</span>
                    : <span>Arrastrá el programa acá o tocá para elegirlo</span>}
                <input
                  ref={inputRef}
                  type="file"
                  accept="application/pdf,.docx"
                  hidden
                  onChange={e => void handleFile(e.target.files?.[0] ?? null)}
                />
              </div>
              {achicado && (
                <p className="em-hint" role="status">
                  <CheckCircle size={14} /> Pesaba {formatFileSize(achicado.antes)} y quedó en {formatFileSize(achicado.despues)}.
                </p>
              )}
              <label className="em-checkbox-row">
                <input type="checkbox" checked={saveToLibrary} onChange={e => setSaveToLibrary(e.target.checked)} />
                Guardar el programa también en Mis materiales
              </label>
            </>
          )}

          {step === 'processing' && (
            <div className="em-processing">
              <div className="em-spinner" />
              <p><strong>La IA está leyendo el programa...</strong></p>
              <p className="text-sm text-subtle">Esto puede tardar hasta un minuto si el documento es escaneado.</p>
            </div>
          )}

          {step === 'preview' && program && (
            <>
              <div className="em-preview-meta">
                <span className="badge badge-cyan">{program.subject_name || props.subjectName}</span>
                <span className="badge badge-neutral">{program.course_name || props.courseName}</span>
                {program.school_year && <span className="badge badge-neutral">Ciclo {program.school_year}</span>}
                {program.teacher_name && <span className="badge badge-neutral">{program.teacher_name}</span>}
              </div>
              <p className="em-hint">
                Encontré <strong>{program.units.length} unidades</strong>. Destildá las que no quieras importar.
                {props.existingUnitsCount > 0 && ` Se agregan después de tus ${props.existingUnitsCount} unidades actuales.`}
              </p>
              {program.units.map((u, i) => (
                <div key={i} className="em-preview-unit">
                  <label className="em-preview-unit-header em-checkbox-row" style={{ cursor: 'pointer' }}>
                    <input type="checkbox" checked={selectedUnits.has(i)} onChange={() => toggleUnit(i)} />
                    <Folder size={15} className="text-cyan" />
                    <span style={{ color: 'var(--text-primary)' }}>{u.title}</span>
                    <span className="text-xs text-subtle" style={{ marginLeft: 'auto' }}>{u.classes.length} {u.classes.length === 1 ? 'tema' : 'temas'}</span>
                  </label>
                  {selectedUnits.has(i) && u.classes.map((c, j) => (
                    <div key={j} className="em-preview-class">
                      <FileText size={13} className="text-subtle" style={{ marginTop: 2, flexShrink: 0 }} />
                      <div>
                        <div>{c.title}</div>
                        {c.objectives.length > 0 && (
                          <div className="em-objectives">🎯 {c.objectives.join(' · ')}</div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </>
          )}

          {step === 'creating' && (
            <div className="em-processing">
              <div className="em-spinner" />
              <p><strong>Creando tu planificación...</strong></p>
            </div>
          )}

          {step === 'done' && resultado && (
            <div className="em-processing">
              <CheckCircle size={40} className="text-success" />
              <p><strong>Planificación creada</strong></p>
              <p className="text-sm text-secondary">
                {resultado.unidades} {resultado.unidades === 1 ? 'unidad' : 'unidades'} y {resultado.clases} {resultado.clases === 1 ? 'tema' : 'temas'}.
                {resultado.repetidas > 0 && ` ${resultado.repetidas} ya estaban y no se duplicaron.`}
              </p>
              {resultado.fechas.pendiente ? (
                <p className="text-sm text-secondary" role="status">
                  <CalendarDays size={14} aria-hidden="true" /> Las fechas que ya tenías no se tocaron: los temas nuevos quedan sin fecha hasta que toques "Reacomodar fechas".
                </p>
              ) : resultado.fechas.error ? (
                <p className="text-sm text-warning" role="status">
                  <CalendarDays size={14} aria-hidden="true" /> Quedó sin fechas: {resultado.fechas.error}
                </p>
              ) : resultado.fechas.desde && resultado.fechas.hasta ? (
                <p className="text-sm text-secondary">
                  <CalendarDays size={14} aria-hidden="true" /> Repartidos en {resultado.fechas.encuentros} encuentros, del {fechaCorta(resultado.fechas.desde)} al {fechaCorta(resultado.fechas.hasta)}.
                  {resultado.fechas.masClasesQueEncuentros && ' Hay más temas que encuentros: algunos comparten día.'}
                </p>
              ) : null}
            </div>
          )}
        </div>

        <div className="em-modal-footer">
          {step === 'pick' && (
            <>
              <button className="btn btn-outline btn-sm" onClick={props.onClose}>Cancelar</button>
              <button className="btn btn-primary btn-sm" onClick={analyze} disabled={!file}>
                <Sparkles size={15} /> Analizar con IA
              </button>
            </>
          )}
          {step === 'preview' && (
            <>
              <button className="btn btn-outline btn-sm" onClick={() => { setStep('pick'); }}>Volver</button>
              <button className="btn btn-primary btn-sm" onClick={createPlanning} disabled={selectedUnits.size === 0}>
                Crear {selectedUnits.size} {selectedUnits.size === 1 ? 'unidad' : 'unidades'} · {selectedClassCount} {selectedClassCount === 1 ? 'tema' : 'temas'}
              </button>
            </>
          )}
          {step === 'done' && (
            <button className="btn btn-primary btn-sm" onClick={() => { props.onImported(); props.onClose(); }}>
              Ver planificación
            </button>
          )}
        </div>
      </div>
    </Dialogo>
  );
}
