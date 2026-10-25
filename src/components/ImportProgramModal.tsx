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

  const handleFile = (f: File | null) => {
    setError('');
    if (!f) return;
    if (f.type !== 'application/pdf' && f.type !== DOCX_MIME) {
      setError('Formato no soportado. Subí un PDF o un Word (.docx).');
      return;
    }
    if (f.size > 11 * 1024 * 1024) {
      setError('El archivo supera los 11 MB.');
      return;
    }
    setFile(f);
  };

  const analyze = async () => {
    if (!file) return;
    setStep('processing');
    setError('');
    try {
      let result: ImportedProgram;
      if (file.type === DOCX_MIME) {
        const text = await extractDocxText(file);
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
      setError(err instanceof Error ? err.message : 'Error procesando el documento.');
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
      setError(err instanceof Error ? err.message : 'Error creando la planificación.');
      setStep('preview');
    }
  };

  // Ya importado, cerrar de cualquier forma refresca la planificación
  const cerrar = () => {
    if (step === 'done') props.onImported();
    props.onClose();
  };

  const selectedClassCount = program
    ? program.units.reduce((acc, u, i) => acc + (selectedUnits.has(i) ? u.classes.length : 0), 0)
    : 0;

  return (
    <div className="em-modal-overlay" onClick={e => { if (e.target === e.currentTarget && step !== 'processing' && step !== 'creating') cerrar(); }}>
      <div className="em-modal em-modal-lg">
        <div className="em-modal-header">
          <h3><Sparkles size={18} className="text-ia-accent" /> Importar programa anual</h3>
          <button className="btn-icon" onClick={cerrar} disabled={step === 'processing' || step === 'creating'} aria-label="Cerrar">
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
                onClick={() => inputRef.current?.click()}
                onDragOver={e => e.preventDefault()}
                onDrop={e => { e.preventDefault(); handleFile(e.dataTransfer.files[0] ?? null); }}
              >
                <FileUp size={28} />
                {file
                  ? <span className="em-file-name">{file.name} · {formatFileSize(file.size)}</span>
                  : <span>Arrastrá el programa acá o hacé clic para elegirlo</span>}
                <input
                  ref={inputRef}
                  type="file"
                  accept="application/pdf,.docx"
                  hidden
                  onChange={e => handleFile(e.target.files?.[0] ?? null)}
                />
              </div>
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
                    <span className="text-xs text-subtle" style={{ marginLeft: 'auto' }}>{u.classes.length} clases</span>
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
                Crear {selectedUnits.size} unidades · {selectedClassCount} clases
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
    </div>
  );
}
