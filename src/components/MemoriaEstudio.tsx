/**
 * Memoria de estudio de EstudIA (061), del lado del estudiante y de su
 * familia.
 *
 *  - <MemoriaEstudiante/>: en Mi guía. Pide su aceptación, muestra si falta
 *    la de la familia y, si está activa, deja ver y borrar todo lo que
 *    EstudIA recuerda, y cuándo lo revisó la dirección.
 *  - <MemoriaFamilia/>: en Mis hijos. La familia lee el texto y autoriza o
 *    retira la autorización.
 *
 * Mientras no haya un texto de consentimiento publicado no se muestra nada:
 * no se ofrece lo que todavía no se puede dar.
 */

import { useCallback, useEffect, useState } from 'react';
import { Brain, Trash2, X } from 'lucide-react';
import Dialogo from './shell/Dialogo';
import MarkdownRenderer from './MarkdownRenderer';
import { avisar, confirmar } from './ui/avisar';
import {
  agruparPorMateria, borrarMiMemoria, ETIQUETA_TIPO_VOS, getEstadoMemoria, getMiMemoria,
  responderConsentimiento, type EstadoMemoria, type NotaMemoria,
} from '../services/memoria.service';
import './MemoriaEstudio.css';

function fecha(iso: string): string {
  return new Date(iso.length === 10 ? iso + 'T12:00' : iso)
    .toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

/** Diálogo con el texto del consentimiento y las dos respuestas. */
function DialogoConsentimiento({ abierto, alCerrar, titulo, texto, version, alResponder, ocupado }: {
  abierto: boolean;
  alCerrar: () => void;
  titulo: string;
  texto: string;
  version: string;
  alResponder: (acepta: boolean) => void;
  ocupado: boolean;
}) {
  return (
    <Dialogo abierto={abierto} alCerrar={alCerrar} etiquetadoPor="mem-consent-titulo" className="mem-dialogo">
      <div className="dialogo-encabezado">
        <h2 id="mem-consent-titulo">{titulo}</h2>
        <button type="button" className="btn-icon" onClick={alCerrar} aria-label="Cerrar">
          <X size={18} aria-hidden="true" />
        </button>
      </div>
      {/* El foco arranca en el texto, no en "Acepto": un Enter no puede aceptar sin leer */}
      <div className="mem-dialogo-cuerpo" tabIndex={-1} data-inicial>
        <MarkdownRenderer content={texto} />
        <p className="mem-version">Versión del texto: {version}</p>
      </div>
      <div className="mem-dialogo-pie">
        <button type="button" className="btn btn-secondary" disabled={ocupado} onClick={() => alResponder(false)}>
          No, gracias
        </button>
        <button type="button" className="btn btn-primary" disabled={ocupado} onClick={() => alResponder(true)}>
          Acepto
        </button>
      </div>
    </Dialogo>
  );
}

// ══ Estudiante ══

export function MemoriaEstudiante() {
  const [estado, setEstado] = useState<EstadoMemoria | null>(null);
  const [verTexto, setVerTexto] = useState(false);
  const [verMemoria, setVerMemoria] = useState(false);
  const [notas, setNotas] = useState<NotaMemoria[] | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const cargar = useCallback(() => {
    getEstadoMemoria().then(setEstado).catch(err => { console.error(err); setEstado(null); });
  }, []);
  useEffect(() => { cargar(); }, [cargar]);

  useEffect(() => {
    if (!verMemoria) return;
    setNotas(null);
    getMiMemoria().then(setNotas).catch(err => { console.error(err); avisar.error(err.message); setNotas([]); });
  }, [verMemoria]);

  if (!estado?.texto) return null;

  const yoAcepte = Boolean(estado.estudiante?.acepta && estado.estudiante.vigente);
  const familiaAcepto = Boolean(estado.familia?.acepta && estado.familia.vigente);

  const responder = async (acepta: boolean) => {
    setOcupado(true);
    try {
      setEstado(await responderConsentimiento(null, acepta, estado.texto?.version));
      setVerTexto(false);
      if (acepta) avisar.exito('Listo, aceptaste la memoria de estudio.');
    } catch (err) {
      avisar.error((err as Error).message);
    } finally {
      setOcupado(false);
    }
  };

  const apagar = async () => {
    const si = await confirmar({
      titulo: '¿Apagar la memoria de estudio?',
      mensaje: 'EstudIA borra todo lo que recuerda de vos ahora mismo y deja de recordar. Podés volver a activarla cuando quieras.',
      accion: 'Apagar y borrar',
      peligro: true,
    });
    if (!si) return;
    setOcupado(true);
    try {
      setEstado(await responderConsentimiento(null, false));
      setVerMemoria(false);
      avisar.exito('Memoria apagada. Se borró todo lo que recordaba.');
    } catch (err) {
      avisar.error((err as Error).message);
    } finally {
      setOcupado(false);
    }
  };

  const borrar = async (nota?: NotaMemoria) => {
    if (!nota) {
      const si = await confirmar({ titulo: '¿Borrar todo lo que recuerda?', mensaje: 'La memoria sigue prendida: va a volver a anotar desde tu próxima charla.', accion: 'Borrar todo', peligro: true });
      if (!si) return;
    }
    try {
      await borrarMiMemoria(nota?.id);
      setNotas(prev => (nota ? (prev ?? []).filter(n => n.id !== nota.id) : []));
      cargar();
    } catch (err) {
      avisar.error((err as Error).message);
    }
  };

  let tarjeta;
  if (estado.activa) {
    tarjeta = (
      <div className="mem-tarjeta activa">
        <Brain size={22} className="mem-tarjeta-icono" aria-hidden="true" />
        <div className="mem-tarjeta-texto">
          <strong>EstudIA recuerda cómo estudiás</strong>
          <span>{estado.items === 0 ? 'Todavía no anotó nada: empieza con tu próxima charla.' : `${estado.items} ${estado.items === 1 ? 'nota' : 'notas'}. Las ves y las borrás cuando quieras.`}</span>
        </div>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => setVerMemoria(true)}>Ver qué recuerda</button>
      </div>
    );
  } else if (yoAcepte && !familiaAcepto) {
    tarjeta = (
      <div className="mem-tarjeta">
        <Brain size={22} className="mem-tarjeta-icono" aria-hidden="true" />
        <div className="mem-tarjeta-texto">
          <strong>Aceptaste la memoria de estudio</strong>
          <span>
            Falta la autorización de tu familia: la dan desde su cuenta o firmando en la escuela.
            {estado.items > 0
              ? ` Hasta entonces EstudIA no usa ni suma nada a las ${estado.items} notas guardadas de antes.`
              : ' Hasta entonces EstudIA no recuerda nada.'}
          </span>
        </div>
        {estado.items > 0 && (
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setVerMemoria(true)}>Ver o borrar</button>
        )}
        <button type="button" className="btn btn-secondary btn-sm" disabled={ocupado} onClick={apagar}>Ya no quiero</button>
      </div>
    );
  } else if (estado.items > 0) {
    // Autorizada antes con un texto que cambió: las notas siguen guardadas
    // (en pausa) y el chico las tiene que poder ver y borrar
    tarjeta = (
      <div className="mem-tarjeta">
        <Brain size={22} className="mem-tarjeta-icono" aria-hidden="true" />
        <div className="mem-tarjeta-texto">
          <strong>La memoria de estudio está en pausa</strong>
          <span>Cambió el texto de la autorización. Hay {estado.items} {estado.items === 1 ? 'nota guardada' : 'notas guardadas'} que EstudIA no usa hasta que vos y tu familia acepten el texto nuevo.</span>
        </div>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => setVerMemoria(true)}>Ver o borrar</button>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => setVerTexto(true)}>Leer el texto nuevo</button>
      </div>
    );
  } else {
    tarjeta = (
      <div className="mem-tarjeta">
        <Brain size={22} className="mem-tarjeta-icono" aria-hidden="true" />
        <div className="mem-tarjeta-texto">
          <strong>¿Querés que EstudIA recuerde cómo estudiás?</strong>
          <span>{estado.estudiante && !estado.estudiante.acepta ? 'La tenés apagada. Podés activarla cuando quieras.' : 'Así no arranca de cero cada vez. Vos decidís.'}</span>
        </div>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => setVerTexto(true)}>Ver cómo funciona</button>
      </div>
    );
  }

  return (
    <>
      {tarjeta}

      <DialogoConsentimiento
        abierto={verTexto}
        alCerrar={() => setVerTexto(false)}
        titulo="Memoria de estudio"
        texto={estado.texto.paraEstudiante}
        version={estado.texto.version}
        alResponder={responder}
        ocupado={ocupado}
      />

      <Dialogo abierto={verMemoria} alCerrar={() => setVerMemoria(false)} etiquetadoPor="mem-lo-que-recuerda" className="mem-dialogo">
        <div className="dialogo-encabezado">
          <h2 id="mem-lo-que-recuerda">Lo que EstudIA recuerda de vos</h2>
          <button type="button" className="btn-icon" onClick={() => setVerMemoria(false)} aria-label="Cerrar">
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        <div className="mem-dialogo-cuerpo">
          {estado.revisiones.length > 0 && (
            <div className="mem-revisiones">
              La dirección de la escuela revisó tu memoria:
              <ul>
                {estado.revisiones.map((r, i) => (
                  <li key={i}>{fecha(r.fecha)}{r.accion === 'borrar' ? ' (borró una nota)' : ''}</li>
                ))}
              </ul>
            </div>
          )}
          {notas === null && <p className="text-secondary">Cargando…</p>}
          {notas?.length === 0 && <p className="text-secondary">Todavía no recuerda nada. Va anotando cuando terminás una charla.</p>}
          {notas && agruparPorMateria(notas).map(([materia, lista]) => (
            <section key={materia || 'general'} className="mem-grupo">
              <h3>{materia || 'Cómo aprendés'}</h3>
              {lista.map(n => (
                <div key={n.id} className="mem-nota">
                  <div className="mem-nota-texto">
                    <span className="mem-nota-tipo">{ETIQUETA_TIPO_VOS[n.tipo]}:</span>
                    {n.texto}
                    <span className="mem-nota-fecha">Última vez: {fecha(n.ultimaVez)}</span>
                  </div>
                  <button type="button" className="btn-icon" onClick={() => borrar(n)} aria-label={`Borrar: ${n.texto}`} title="Borrar">
                    <Trash2 size={15} aria-hidden="true" />
                  </button>
                </div>
              ))}
            </section>
          ))}
        </div>
        <div className="mem-dialogo-pie">
          <button type="button" className="btn btn-secondary" disabled={ocupado} onClick={apagar}>Apagar la memoria</button>
          {notas && notas.length > 0 && (
            <button type="button" className="btn btn-secondary" onClick={() => borrar()}>Borrar todo</button>
          )}
          <button type="button" className="btn btn-primary" onClick={() => setVerMemoria(false)} data-inicial>Listo</button>
        </div>
      </Dialogo>
    </>
  );
}

// ══ Familia ══

export function MemoriaFamilia({ studentId, nombre }: { studentId: string; nombre: string }) {
  const [estado, setEstado] = useState<EstadoMemoria | null>(null);
  const [verTexto, setVerTexto] = useState(false);
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    getEstadoMemoria(studentId).then(setEstado).catch(err => { console.error(err); setEstado(null); });
  }, [studentId]);

  if (!estado?.texto) return null;

  const fam = estado.familia;
  const autorizaron = Boolean(fam?.acepta && fam.vigente);

  const responder = async (acepta: boolean) => {
    if (!acepta && autorizaron) {
      const si = await confirmar({
        titulo: '¿Retirar la autorización?',
        mensaje: `EstudIA borra ahora mismo todo lo que recuerda de cómo estudia ${nombre} y deja de recordar.`,
        accion: 'Retirar y borrar',
        peligro: true,
      });
      if (!si) return;
    }
    setOcupado(true);
    try {
      setEstado(await responderConsentimiento(studentId, acepta, estado.texto?.version));
      setVerTexto(false);
      avisar.exito(acepta ? 'Autorización guardada.' : 'Listo: no hay autorización y no se guarda nada.');
    } catch (err) {
      avisar.error((err as Error).message);
    } finally {
      setOcupado(false);
    }
  };

  let situacion: string;
  if (autorizaron) {
    situacion = `Autorizaron el ${fecha(fam!.fecha)}${fam!.via === 'papel' ? ' (en papel, en la escuela)' : ''}. `
      + (estado.activa
        ? `${nombre} también aceptó: la memoria está activa.`
        : `${nombre} todavía no la aceptó desde su cuenta: hasta entonces no se guarda nada.`);
  } else if (fam && fam.acepta && !fam.vigente) {
    situacion = 'Cambió el texto desde que autorizaron: para seguir, hay que leerlo y responder de nuevo.';
  } else if (fam && !fam.acepta) {
    situacion = 'No autorizaron. EstudIA funciona igual, sin recordar nada.';
  } else {
    situacion = 'Todavía no respondieron. Mientras tanto, EstudIA funciona sin recordar nada.';
  }

  return (
    <section className="mh-section" aria-labelledby={`mem-fam-${studentId}`}>
      <h3 id={`mem-fam-${studentId}`} className="fam-subtitulo"><Brain size={15} aria-hidden="true" /> Memoria de estudio de EstudIA</h3>
      <p className="mem-familia-estado">{situacion}</p>
      <div className="mem-familia-acciones">
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => setVerTexto(true)}>
          {autorizaron ? 'Leer de nuevo' : 'Leer y decidir'}
        </button>
        {autorizaron && (
          <button type="button" className="btn btn-secondary btn-sm" disabled={ocupado} onClick={() => responder(false)}>
            Retirar autorización
          </button>
        )}
      </div>
      <DialogoConsentimiento
        abierto={verTexto}
        alCerrar={() => setVerTexto(false)}
        titulo={estado.texto.titulo}
        texto={estado.texto.paraFamilia}
        version={estado.texto.version}
        alResponder={responder}
        ocupado={ocupado}
      />
    </section>
  );
}
