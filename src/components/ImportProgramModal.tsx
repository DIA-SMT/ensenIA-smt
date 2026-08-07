/**
 * Importar programa anual → planificación automática.
 *
 * El docente sube el PDF (o DOCX) de su programa; la IA lo analiza y
 * propone unidades + clases con objetivos, que se crean en la planificación
 * con un clic.
 */

import { useRef, useState } from 'react';
import { X, FileUp, Sparkles, Folder, FileText, AlertCircle, CheckCircle } from 'lucide-react';
import {
  fileToBase64, extractDocxText, importProgram, uploadFile, formatFileSize,
} from '../services/documents.service';
import { createMaterial } from '../services/library.service';
import { updateMaterial } from '../services/documents.service';
import { createUnit, createClass } from '../services/planning.service';
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
  const [createdCount, setCreatedCount] = useState({ units: 0, classes: 0 });
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
      let unitOrder = props.existingUnitsCount + 1;
      let unitsCreated = 0;
      let classesCreated = 0;
      for (let i = 0; i < program.units.length; i++) {
        if (!selectedUnits.has(i)) continue;
        const u = program.units[i];
        const unit = await createUnit({
          title: u.title,
          subjectId: props.subjectId,
          courseId: props.courseId,
          teacherId: props.teacherId,
          order: unitOrder++,
        });
        unitsCreated++;
        for (let j = 0; j < u.classes.length; j++) {
          const c = u.classes[j];
          await createClass({
            unitId: unit.id,
            title: c.title,
            order: j + 1,
            objectives: c.objectives,
          });
          classesCreated++;
        }
      }

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
            teacherId: props.teacherId,
            schoolId: props.schoolId,
            tags: ['programa', 'planificación'],
          });
          await updateMaterial(material.id, { storagePath, fileSizeBytes });
        } catch (err) {
          console.error('No se pudo guardar en biblioteca:', err);
        }
      }

      setCreatedCount({ units: unitsCreated, classes: classesCreated });
      setStep('done');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error creando la planificación.');
      setStep('preview');
    }
  };

  const selectedClassCount = program
    ? program.units.reduce((acc, u, i) => acc + (selectedUnits.has(i) ? u.classes.length : 0), 0)
    : 0;

  return (
    <div className="em-modal-overlay" onClick={e => { if (e.target === e.currentTarget && step !== 'processing' && step !== 'creating') props.onClose(); }}>
      <div className="em-modal em-modal-lg">
        <div className="em-modal-header">
          <h3><Sparkles size={18} className="text-ia-accent" /> Importar programa anual</h3>
          <button className="btn-icon" onClick={props.onClose} disabled={step === 'processing' || step === 'creating'}>
            <X size={18} />
          </button>
        </div>

        <div className="em-modal-body">
          {error && <div className="em-error"><AlertCircle size={15} /> {error}</div>}

          {step === 'pick' && (
            <>
              <p className="em-hint">
                Subí el programa de <strong>{props.subjectName} — {props.courseName}</strong> (PDF o Word).
                La IA va a leerlo (funciona incluso con escaneos) y va a proponer las unidades y clases
                para tu planificación. Después podés editar todo.
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
                Guardar el programa también en mi Biblioteca
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

          {step === 'done' && (
            <div className="em-processing">
              <CheckCircle size={40} className="text-success" />
              <p><strong>¡Planificación creada!</strong></p>
              <p className="text-sm text-secondary">
                {createdCount.units} unidades y {createdCount.classes} clases listas para trabajar con la IA.
              </p>
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
