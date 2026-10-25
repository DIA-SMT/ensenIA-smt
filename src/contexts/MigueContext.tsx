/**
 * Migue conectado: qué está mirando el docente y cómo se abre Migue desde
 * cualquier pantalla.
 *
 * Cada pantalla avisa lo que muestra (un tema, un material, una actividad,
 * la clase en vivo) con useContextoMigue; Migue lo recibe al abrirse. Al
 * servidor viajan solo el tipo y el id: lo lee él, con los permisos del
 * docente, así nadie le hace creer a Migue algo que no es.
 */

import { createContext, useCallback, useContext, useEffect, useId, useMemo, useState, type ReactNode } from 'react';

export type TipoContextoMigue = 'tema' | 'material' | 'actividad' | 'clase_en_vivo';

export interface ContextoMigue {
    tipo: TipoContextoMigue;
    id: string;
    /** Para mostrar ("Hablando de «…»"); el servidor no lo usa */
    titulo: string;
    /** Materia · curso, si se sabe */
    detalle?: string;
}

interface Estado {
    abierto: boolean;
    /** Lo que muestra la pantalla de ahora (el último que se anotó) */
    contexto: ContextoMigue | null;
    /** Texto para dejar escrito en el compositor al abrir (Migue se monta de nuevo en cada apertura) */
    borrador: string;
    abrir: (opciones?: { contexto?: ContextoMigue | null; borrador?: string }) => void;
    cerrar: () => void;
    anotar: (clave: string, c: ContextoMigue | null) => void;
}

const MigueCtx = createContext<Estado | null>(null);

export function MigueProvider({ children }: { children: ReactNode }) {
    const [abierto, setAbierto] = useState(false);
    // Lo que anotan las pantallas montadas, en orden: vale el último
    const [anotados, setAnotados] = useState<{ clave: string; c: ContextoMigue }[]>([]);
    // El que se pidió al abrir (desde un botón "Preguntale a Migue"), si hay
    const [pedido, setPedido] = useState<ContextoMigue | null | undefined>(undefined);
    const [borrador, setBorrador] = useState('');

    const anotar = useCallback((clave: string, c: ContextoMigue | null) => {
        setAnotados(prev => {
            const sin = prev.filter(x => x.clave !== clave);
            return c ? [...sin, { clave, c }] : sin;
        });
    }, []);

    const abrir = useCallback((opciones?: { contexto?: ContextoMigue | null; borrador?: string }) => {
        setPedido(opciones && 'contexto' in opciones ? opciones.contexto ?? null : undefined);
        setBorrador(opciones?.borrador ?? '');
        setAbierto(true);
    }, []);

    const cerrar = useCallback(() => { setAbierto(false); setPedido(undefined); }, []);

    const contexto = pedido !== undefined ? pedido : anotados[anotados.length - 1]?.c ?? null;

    const valor = useMemo<Estado>(() => ({
        abierto, contexto, borrador, abrir, cerrar, anotar,
    }), [abierto, contexto, borrador, abrir, cerrar, anotar]);

    return <MigueCtx.Provider value={valor}>{children}</MigueCtx.Provider>;
}

/** Sin el proveedor (estudiantes, familias, el login) no hace nada */
export function useMigue(): Estado | null {
    return useContext(MigueCtx);
}

/**
 * La pantalla avisa qué está mirando el docente. Se borra sola al salir.
 * Con null (o mientras carga) no anota nada.
 */
export function useContextoMigue(c: ContextoMigue | null) {
    const migue = useMigue();
    const anotar = migue?.anotar;
    const clave = useId();
    const tipo = c?.tipo, id = c?.id, titulo = c?.titulo, detalle = c?.detalle;
    useEffect(() => {
        if (!anotar) return;
        anotar(clave, tipo && id ? { tipo, id, titulo: titulo ?? '', detalle } : null);
        return () => anotar(clave, null);
    }, [anotar, clave, tipo, id, titulo, detalle]);
}
