/**
 * Cargar estudiantes (y sus familias) desde una planilla.
 *
 * Primero se lee y se valida todo, sin crear nada: la persona ve qué se va a
 * cargar, qué ya estaba y qué tiene errores. Recién ahí se crean las cuentas,
 * de a una, con su avance; al final se imprimen o descargan los usuarios y
 * claves. Los cursos que no existen se pueden crear en el mismo paso: así se
 * carga la escuela entera, todos los años, de una vez.
 */

import { useMemo, useState } from 'react';
import { FileSpreadsheet, Download, Upload, AlertCircle, Check, Printer, Loader2 } from 'lucide-react';
import {
  createAccount, createCourse, listCourses, addGuardianLink, getStudentIdByUser,
} from '../../services/admin.service';
import {
  leerCsv, interpretar, validar, plantillaCsv, credencialesCsv,
  type FilaPlanilla, type EstadoFila,
} from '../../lib/planilla';
import { DialogoForm } from './ui';
import { printCredenciales, type Credencial } from './credenciales';
import type { TabProps } from './GestionEscuela';

type Paso = 'elegir' | 'revisar' | 'cargando' | 'listo';
interface Resultado { fila: FilaPlanilla; ok: boolean; detalle: string }

function descargar(nombre: string, contenido: string) {
  const url = URL.createObjectURL(new Blob([contenido], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url; a.download = nombre; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const nombreCurso = (c: { year: number; division: string }) => `${c.year}° ${c.division}`;

export default function ImportarPlanilla({ abierto, alCerrar, data, reload }: TabProps & {
  abierto: boolean;
  alCerrar: () => void;
}) {
  const [paso, setPaso] = useState<Paso>('elegir');
  const [archivo, setArchivo] = useState('');
  const [filas, setFilas] = useState<FilaPlanilla[]>([]);
  const [ignoradas, setIgnoradas] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [crearCursos, setCrearCursos] = useState(true);
  const [cursoFijoId, setCursoFijoId] = useState('');
  const [hechos, setHechos] = useState(0);
  const [resultados, setResultados] = useState<Resultado[]>([]);
  const [creds, setCreds] = useState<(Credencial & { tipo: string; curso: string })[]>([]);

  const cursos = data.courses.map(c => ({ year: c.year, division: c.division.toUpperCase() }));
  const cursoFijo = data.courses.find(c => c.id === cursoFijoId);
  const sinColumnaCurso = filas.length > 0 && filas.every(f => !f.cursoTexto);

  const estados: EstadoFila[] = useMemo(() => validar(filas, {
    cursos,
    dnisExistentes: new Set(data.students.map(s => s.dni).filter((d): d is string => Boolean(d))),
    crearCursos,
    cursoFijo: cursoFijo ? { year: cursoFijo.year, division: cursoFijo.division.toUpperCase() } : null,
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [filas, data.students, data.courses, crearCursos, cursoFijoId]);

  const nuevos = estados.filter(e => e.tipo === 'ok').length;
  const yaEstan = estados.filter(e => e.tipo === 'existe').length;
  const conError = estados.filter(e => e.tipo === 'error').length;
  const familiasNuevas = filas.filter((f, i) => f.tutor && estados[i].tipo !== 'error').length;
  const cursosNuevos = [...new Set(filas
    .filter((_, i) => estados[i].tipo === 'ok' && (estados[i] as { cursoNuevo: boolean }).cursoNuevo)
    .map(f => nombreCurso(f.curso!)))];
  const porCurso = useMemo(() => {
    const m = new Map<string, number>();
    filas.forEach((f, i) => { if (estados[i].tipo === 'ok') { const c = f.curso ?? cursoFijo; if (c) m.set(nombreCurso(c), (m.get(nombreCurso(c)) ?? 0) + 1); } });
    return [...m.entries()].sort();
  }, [filas, estados, cursoFijo]);

  const reiniciar = () => {
    setPaso('elegir'); setArchivo(''); setFilas([]); setIgnoradas([]); setError('');
    setHechos(0); setResultados([]); setCreds([]); setCursoFijoId('');
  };
  const cerrar = () => { if (paso === 'cargando') return; reiniciar(); alCerrar(); };

  const leer = async (file: File | undefined) => {
    if (!file) return;
    setError('');
    try {
      let grilla: unknown[][];
      if (/\.xlsx$/i.test(file.name)) {
        const { default: readXlsxFile } = await import('read-excel-file');
        grilla = await readXlsxFile(file);
      } else if (/\.(csv|txt)$/i.test(file.name)) {
        grilla = leerCsv(await file.text());
      } else {
        setError('Usá un archivo de Excel (.xlsx) o CSV. Si es un .xls viejo, guardalo como .xlsx.');
        return;
      }
      const l = interpretar(grilla);
      if (l.error) { setError(l.error); return; }
      if (l.filas.length === 0) { setError('La planilla no tiene estudiantes debajo del encabezado.'); return; }
      setArchivo(file.name);
      setFilas(l.filas);
      setIgnoradas(l.ignoradas);
      setPaso('revisar');
    } catch (err) {
      console.error(err);
      setError('No pude leer el archivo. ¿Está abierto en otro programa o protegido con contraseña?');
    }
  };

  const cargar = async () => {
    setPaso('cargando');
    setHechos(0);
    const res: Resultado[] = [];
    const cr: (Credencial & { tipo: string; curso: string })[] = [];
    try {
      // 1. Los cursos que faltan
      for (const nombre of cursosNuevos) {
        const [y, d] = nombre.split('° ');
        await createCourse(data.school.id, Number(y), d).catch(() => { /* si ya existe, sigue */ });
      }
      const todos = await listCourses(data.school.id);
      const idCurso = (c: { year: number; division: string }) =>
        todos.find(x => x.year === c.year && x.division.toUpperCase() === c.division)?.id;

      // 2. Estudiante por estudiante (y su familia)
      for (let i = 0; i < filas.length; i++) {
        const f = filas[i];
        const e = estados[i];
        if (e.tipo === 'error') { res.push({ fila: f, ok: false, detalle: e.motivo }); setHechos(h => h + 1); continue; }
        const curso = f.curso ?? (cursoFijo ? { year: cursoFijo.year, division: cursoFijo.division.toUpperCase() } : null);
        try {
          let studentId: string | null;
          if (e.tipo === 'existe') {
            studentId = data.students.find(s => s.dni === f.dni)?.id ?? null;
          } else {
            const courseId = curso && idCurso(curso);
            if (!courseId) throw new Error('No se encontró el curso');
            const c = await createAccount({ schoolId: data.school.id, role: 'estudiante', firstName: f.nombre, lastName: f.apellido, dni: f.dni, courseId });
            cr.push({ name: `${f.nombre} ${f.apellido}`, login: c.login, password: c.password, existing: c.existing, tipo: 'Estudiante', curso: curso ? nombreCurso(curso) : '' });
            studentId = await getStudentIdByUser(c.userId);
          }
          let detalle = e.tipo === 'existe' ? 'Ya estaba cargado' : 'Cuenta creada';
          if (f.tutor && studentId) {
            const t = f.tutor;
            const ct = await createAccount({
              schoolId: data.school.id, role: 'padre', firstName: t.nombre, lastName: t.apellido,
              dni: t.dni || undefined, email: t.email || undefined,
            });
            if (!ct.existing) cr.push({ name: `${t.nombre} ${t.apellido}`, login: ct.login, password: ct.password, tipo: `Familia de ${f.nombre}`, curso: curso ? nombreCurso(curso) : '' });
            await addGuardianLink(studentId, ct.userId, t.parentesco).catch(err => {
              if (!(err instanceof Error && /vinculados/.test(err.message))) throw err;
            });
            detalle += ct.existing ? ' · familia vinculada' : ' · familia creada';
          }
          res.push({ fila: f, ok: true, detalle });
        } catch (err) {
          res.push({ fila: f, ok: false, detalle: err instanceof Error ? err.message : 'No se pudo crear' });
        }
        setHechos(h => h + 1);
      }
    } finally {
      setResultados(res);
      setCreds(cr);
      setPaso('listo');
      await reload().catch(console.error);
    }
  };

  const okFinal = resultados.filter(r => r.ok).length;
  const fallidos = resultados.filter(r => !r.ok);

  return (
    <DialogoForm abierto={abierto} alCerrar={cerrar} id="importar-planilla" titulo="Cargar desde planilla"
      bajada="Estudiantes de todos los cursos de una vez, con su familia si la planilla la trae."
      pie={<>
        {paso === 'revisar' && <>
          <button type="button" className="btn btn-ghost" onClick={reiniciar}>Elegir otro archivo</button>
          <button type="button" className="btn btn-primary" onClick={cargar} disabled={nuevos + (familiasNuevas ? 1 : 0) === 0 || (sinColumnaCurso && !cursoFijoId)}>
            <Upload size={15} aria-hidden="true" /> Cargar {nuevos} estudiante{nuevos !== 1 ? 's' : ''}
          </button>
        </>}
        {paso === 'listo' && <>
          {creds.some(c => c.password) && <>
            <button type="button" className="btn btn-secondary" onClick={() => descargar(`claves-${data.school.name}.csv`,
              credencialesCsv(creds.filter(c => c.password).map(c => ({ tipo: c.tipo, nombre: c.name, curso: c.curso, usuario: c.login, clave: c.password ?? '' }))))}>
              <Download size={15} aria-hidden="true" /> Descargar claves
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => printCredenciales(creds, data.school.name)}>
              <Printer size={15} aria-hidden="true" /> Imprimir {creds.filter(c => c.password).length}
            </button>
          </>}
          <button type="button" className="btn btn-primary" onClick={cerrar}>Terminar</button>
        </>}
        {paso === 'elegir' && <button type="button" className="btn btn-ghost" onClick={cerrar}>Cancelar</button>}
      </>}>

      {paso === 'elegir' && (
        <div className="adm-form imp">
          {error && <div className="adm-error" role="alert"><AlertCircle size={15} aria-hidden="true" /> {error}</div>}
          <label className="imp-archivo">
            <FileSpreadsheet size={28} aria-hidden="true" />
            <strong>Elegí la planilla</strong>
            <span className="adm-ayuda">Excel (.xlsx) o CSV. Una fila por estudiante.</span>
            <input type="file" accept=".xlsx,.csv,.txt" onChange={e => leer(e.target.files?.[0])} />
          </label>
          <div className="imp-ayuda">
            <p><b>Columnas que reconoce</b> (en cualquier orden y con estos u otros nombres parecidos):</p>
            <ul>
              <li><b>Curso</b>: "2° A", "2do A", "2A"… Puede tener estudiantes de varios años.</li>
              <li><b>Apellido</b> y <b>Nombre</b>, o una sola columna <b>Apellido y nombre</b> ("Pérez, Juan").</li>
              <li><b>DNI</b>, con o sin puntos: es su usuario para entrar.</li>
              <li>Opcional, la familia: <b>Apellido tutor</b>, <b>Nombre tutor</b>, <b>DNI tutor</b> o <b>Email tutor</b>, <b>Parentesco</b>.</li>
            </ul>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => descargar('plantilla-estudiantes.csv', plantillaCsv())}>
              <Download size={14} aria-hidden="true" /> Descargar la plantilla vacía
            </button>
          </div>
        </div>
      )}

      {paso === 'revisar' && (
        <div className="adm-form imp">
          <p className="adm-ayuda">{archivo} · {filas.length} fila{filas.length !== 1 ? 's' : ''}{ignoradas.length ? ` · no uso las columnas: ${ignoradas.join(', ')}` : ''}</p>
          <div className="imp-resumen">
            <span className="imp-chip ok">{nuevos} nuevos</span>
            {yaEstan > 0 && <span className="imp-chip">{yaEstan} ya estaban</span>}
            {conError > 0 && <span className="imp-chip err">{conError} con errores (no se cargan)</span>}
            {familiasNuevas > 0 && <span className="imp-chip">{familiasNuevas} con familia</span>}
          </div>
          {porCurso.length > 0 && <p className="adm-ayuda">Por curso: {porCurso.map(([c, n]) => `${c} (${n})`).join(' · ')}</p>}

          {sinColumnaCurso && (
            <label className="adm-campo">
              <span>La planilla no tiene columna Curso: ¿en qué curso van todos?</span>
              <select className="form-select" value={cursoFijoId} onChange={e => setCursoFijoId(e.target.value)}>
                <option value="">Elegir...</option>
                {data.courses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
          )}
          {(cursosNuevos.length > 0 || !crearCursos) && !sinColumnaCurso && (
            <label className="imp-check">
              <input type="checkbox" checked={crearCursos} onChange={e => setCrearCursos(e.target.checked)} />
              <span>Crear los cursos que no existen{cursosNuevos.length ? `: ${cursosNuevos.join(', ')}` : ''}</span>
            </label>
          )}

          <div className="imp-tabla-wrap">
            <table className="imp-tabla">
              <thead><tr><th>Fila</th><th>Estudiante</th><th>DNI</th><th>Curso</th><th>Familia</th><th>Estado</th></tr></thead>
              <tbody>
                {filas.map((f, i) => {
                  const e = estados[i];
                  return (
                    <tr key={f.fila} className={e.tipo === 'error' ? 'err' : e.tipo === 'existe' ? 'ya' : ''}>
                      <td>{f.fila}</td>
                      <td>{f.apellido}, {f.nombre}</td>
                      <td>{f.dni || '—'}</td>
                      <td>{f.curso ? nombreCurso(f.curso) : (f.cursoTexto || (cursoFijo?.name ?? '—'))}</td>
                      <td>{f.tutor ? `${f.tutor.apellido}, ${f.tutor.nombre}` : '—'}</td>
                      <td>{e.tipo === 'ok' ? (e.cursoNuevo ? 'Nuevo · curso nuevo' : 'Nuevo') : e.tipo === 'existe' ? (f.tutor ? 'Ya estaba · se suma la familia' : 'Ya estaba') : e.motivo}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="adm-ayuda">Al cargar se crea una cuenta por estudiante con su DNI como usuario y una clave inicial que cambia al entrar. Quedan inscriptos en todas las materias que tienen docente en su curso.</p>
        </div>
      )}

      {paso === 'cargando' && (
        <div className="adm-form imp" aria-live="polite">
          <p><Loader2 size={15} className="spin" aria-hidden="true" /> Cargando {hechos} de {filas.length}… No cierres esta ventana.</p>
          <div className="imp-barra"><i style={{ width: `${filas.length ? (hechos / filas.length) * 100 : 0}%` }} /></div>
        </div>
      )}

      {paso === 'listo' && (
        <div className="adm-form imp" aria-live="polite">
          <p className="imp-final"><Check size={18} aria-hidden="true" /> Listo: {okFinal} cargado{okFinal !== 1 ? 's' : ''}{fallidos.length ? `, ${fallidos.length} sin cargar` : ''}.</p>
          {creds.some(c => c.password) && (
            <p className="adm-ayuda">Imprimí o descargá los usuarios y claves ahora: las claves no se vuelven a mostrar (se pueden regenerar con "Nueva clave").</p>
          )}
          {fallidos.length > 0 && (
            <div className="imp-tabla-wrap">
              <table className="imp-tabla">
                <thead><tr><th>Fila</th><th>Estudiante</th><th>Por qué no se cargó</th></tr></thead>
                <tbody>{fallidos.map(r => <tr key={r.fila.fila} className="err"><td>{r.fila.fila}</td><td>{r.fila.apellido}, {r.fila.nombre}</td><td>{r.detalle}</td></tr>)}</tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </DialogoForm>
  );
}
