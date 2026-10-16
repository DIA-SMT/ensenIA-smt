/**
 * Ingreso con CiDiTuc (la identidad ciudadana de la Municipalidad), vía Derivador.
 *
 * El contrato de Derivador:
 *   1. /api/auth/cidituc/login genera un `state`, lo guarda en una cookie
 *      httpOnly corta y manda a <CIDITUC_LOGIN_URL>/login?next=<clave>&state=…
 *   2. Derivador pide CUIL y clave y vuelve a /auth/cidituc/callback?auth=<JWT>&state=…
 *      (el JWT se entrega una sola vez; Derivador no guarda sesión).
 *   3. El callback compara el state con la cookie, valida el JWT contra
 *      <CIDITUC_BACKEND_URL>/usuarios/authStatus (Authorization: el token crudo,
 *      sin "Bearer"), busca la cuenta de EstudIA por DNI y crea la sesión.
 *
 * La app entera funciona con la sesión de Supabase (RLS): por eso el final del
 * ingreso es una sesión NORMAL de EstudIA de esa persona. La crea el servidor
 * de EstudIA (función `cidituc-sesion`, con la clave maestra que nunca sale de
 * ahí); este código solo le pide "la sesión de este DNI" con una clave
 * compartida, y se la entrega a la app una sola vez por una cookie httpOnly.
 * El JWT de CiDiTuc se valida y se descarta: no llega al navegador.
 *
 * Quién entra (decidido el 16/10/2026): solo quien ya tiene cuenta en
 * EstudIA con ese DNI; nunca el superadmin. El rol y las escuelas son los
 * de su cuenta: CiDiTuc solo dice quién es la persona.
 *
 * Lo comparten las funciones de Vercel (api/auth/cidituc/*) y el servidor de
 * desarrollo de Vite (vite.config.ts), con el mismo código. Los archivos de
 * api/ que empiezan con "_" no son rutas.
 */
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { request as httpsRequest } from 'node:https';
import { request as httpRequest } from 'node:http';
import { rootCertificates } from 'node:tls';
import type { IncomingMessage, ServerResponse } from 'node:http';

// ── Configuración (variables de entorno; ver .env.example) ──

export interface Config {
  loginUrl: string;
  backendUrl: string;
  nextKey: string;
  sessionSecret: string;
  puenteSecret: string;
  supabaseUrl: string;
  supabaseAnonKey: string;
  /** Certificados que le faltan a la cadena TLS del backend municipal (PEM), opcional */
  caExtra?: string;
}

export function leerConfig(env: NodeJS.ProcessEnv = process.env): Config | null {
  const sinBarra = (s?: string) => s?.replace(/\/+$/, '');
  const loginUrl = sinBarra(env.CIDITUC_LOGIN_URL);
  const backendUrl = sinBarra(env.CIDITUC_BACKEND_URL);
  const nextKey = env.CIDITUC_NEXT_KEY;
  const sessionSecret = env.CIDITUC_SESSION_SECRET;
  const puenteSecret = env.CIDITUC_PUENTE_SECRET;
  const supabaseUrl = sinBarra(env.SUPABASE_URL ?? env.VITE_SUPABASE_URL);
  const supabaseAnonKey = env.SUPABASE_ANON_KEY ?? env.VITE_SUPABASE_ANON_KEY;
  if (!loginUrl || !backendUrl || !nextKey || !sessionSecret || !puenteSecret || !supabaseUrl || !supabaseAnonKey) return null;
  // El secreto firma las cookies: corto, alguien podría adivinarlo
  if (sessionSecret.length < 32) return null;
  return {
    loginUrl, backendUrl, nextKey, sessionSecret, puenteSecret, supabaseUrl, supabaseAnonKey,
    caExtra: certificadosExtra(env),
  };
}

/**
 * Lo que le falta a la cadena TLS del backend municipal: el PEM en
 * CIDITUC_CA_PEM (cómodo en Vercel) o la ruta a un archivo en CIDITUC_CA_FILE
 * (cómodo en local). En local también sirve NODE_EXTRA_CA_CERTS, que Node lee
 * solo al arrancar.
 */
function certificadosExtra(env: NodeJS.ProcessEnv): string | undefined {
  if (env.CIDITUC_CA_PEM?.includes('BEGIN CERTIFICATE')) return env.CIDITUC_CA_PEM.replace(/\\n/g, '\n');
  if (env.CIDITUC_CA_FILE) {
    try { return readFileSync(env.CIDITUC_CA_FILE, 'utf8'); } catch { /* sin el archivo, solo las raíces de siempre */ }
  }
  return undefined;
}

// ── Cookies ──

export const COOKIE_STATE = 'cidituc_state';
export const COOKIE_SESION = 'estudia_cidituc';
export const COOKIE_ENTREGA = 'estudia_cidituc_entrega';
const DURACION_STATE_S = 10 * 60;
const DURACION_SESION_S = 12 * 60 * 60;
const DURACION_ENTREGA_S = 2 * 60;
/** La entrega de la sesión solo la lee el pedido de la app a /me */
const PATH_ENTREGA = '/api/auth/cidituc';

export function leerCookies(req: IncomingMessage): Record<string, string> {
  const salida: Record<string, string> = {};
  for (const parte of (req.headers.cookie ?? '').split(';')) {
    const i = parte.indexOf('=');
    if (i < 0) continue;
    const k = parte.slice(0, i).trim();
    if (!k || k in salida) continue;
    try { salida[k] = decodeURIComponent(parte.slice(i + 1).trim()); } catch { /* cookie rota: se ignora */ }
  }
  return salida;
}

/** En local (http://localhost) no hay https: la cookie no puede ser Secure */
function esLocal(req: IncomingMessage): boolean {
  const host = (req.headers.host ?? '').split(':')[0];
  return host === 'localhost' || host === '127.0.0.1' || host.endsWith('.localhost');
}

export function cookie(req: IncomingMessage, nombre: string, valor: string, opciones: {
  maxAge: number; path?: string; sameSite?: 'Lax' | 'Strict';
}): string {
  return [
    `${nombre}=${encodeURIComponent(valor)}`,
    `Path=${opciones.path ?? '/'}`,
    `Max-Age=${opciones.maxAge}`,
    'HttpOnly',
    `SameSite=${opciones.sameSite ?? 'Lax'}`,
    ...(esLocal(req) ? [] : ['Secure']),
  ].join('; ');
}

const borrar = (req: IncomingMessage, nombre: string, path = '/') =>
  cookie(req, nombre, '', { maxAge: 0, path });

// ── Firma (HMAC-SHA256): las cookies no se pueden inventar ni retocar ──

export function firmar(datos: object, secreto: string): string {
  const cuerpo = Buffer.from(JSON.stringify(datos)).toString('base64url');
  const firma = createHmac('sha256', secreto).update(cuerpo).digest('base64url');
  return `${cuerpo}.${firma}`;
}

/** Devuelve los datos si la firma es buena y no venció (campo `exp`, en segundos) */
export function verificar<T extends { exp: number }>(valor: string | undefined, secreto: string): T | null {
  if (!valor) return null;
  const [cuerpo, firma, sobra] = valor.split('.');
  if (!cuerpo || !firma || sobra !== undefined) return null;
  const esperada = createHmac('sha256', secreto).update(cuerpo).digest();
  let recibida: Buffer;
  try { recibida = Buffer.from(firma, 'base64url'); } catch { return null; }
  if (recibida.length !== esperada.length || !timingSafeEqual(recibida, esperada)) return null;
  try {
    const datos = JSON.parse(Buffer.from(cuerpo, 'base64url').toString('utf8')) as T;
    return typeof datos.exp === 'number' && datos.exp * 1000 > Date.now() ? datos : null;
  } catch {
    return null;
  }
}

const ahoraS = () => Math.floor(Date.now() / 1000);

// ── CUIL → DNI ──

/**
 * El documento que trae CiDiTuc es el CUIL (11 dígitos: prefijo, DNI de 8 con
 * ceros adelante, verificador). EstudIA guarda el DNI sin ceros adelante.
 * También acepta un DNI suelto (7 u 8 dígitos), por si viniera así.
 */
export function dniDeDocumento(documento: unknown): string | null {
  const d = String(documento ?? '').replace(/\D/g, '');
  const dni = d.length === 11 ? d.slice(2, 10) : d.length >= 6 && d.length <= 8 ? d : '';
  const limpio = dni.replace(/^0+/, '');
  return limpio.length >= 6 && limpio.length <= 8 ? limpio : null;
}

// ── Validar el token contra el backend de CiDiTuc ──

export interface PersonaCidituc {
  documento: string;
  nombre: string;
  apellido: string;
}

export type ResultadoValidacion =
  | { ok: true; persona: PersonaCidituc }
  | { ok: false; motivo: 'token' | 'red' };

/**
 * GET authStatus con el token crudo. El backend municipal manda la cadena TLS
 * incompleta: se completa con CIDITUC_CA_PEM (o NODE_EXTRA_CA_CERTS en local),
 * sumada a las raíces de siempre. La verificación TLS NUNCA se apaga.
 */
export function validarToken(config: Config, token: string): Promise<ResultadoValidacion> {
  const url = new URL(`${config.backendUrl}/usuarios/authStatus`);
  const esHttps = url.protocol === 'https:';
  return new Promise(resolve => {
    const pedido = (esHttps ? httpsRequest : httpRequest)(url, {
      method: 'GET',
      headers: { Authorization: token, Accept: 'application/json' },
      timeout: 10_000,
      ...(esHttps && config.caExtra ? { ca: [...rootCertificates, config.caExtra] } : {}),
    }, res => {
      const partes: Buffer[] = [];
      res.on('data', (c: Buffer) => partes.push(c));
      res.on('end', () => {
        if (res.statusCode !== 200) return resolve({ ok: false, motivo: 'token' });
        try {
          const cuerpo = JSON.parse(Buffer.concat(partes).toString('utf8'));
          const p = cuerpo?.usuarioSinContraseña ?? cuerpo?.data?.usuarioSinContraseña ?? cuerpo?.user?.usuarioSinContraseña;
          const documento = p?.documento_persona ?? p?.cuil ?? p?.dni;
          if (!p || !documento) return resolve({ ok: false, motivo: 'token' });
          resolve({ ok: true, persona: {
            documento: String(documento),
            nombre: String(p.nombre_persona ?? p.nombre ?? ''),
            apellido: String(p.apellido_persona ?? p.apellido ?? ''),
          } });
        } catch {
          resolve({ ok: false, motivo: 'token' });
        }
      });
    });
    pedido.on('timeout', () => pedido.destroy(new Error('timeout')));
    // Error de red o de certificado: no es culpa de la persona
    pedido.on('error', () => resolve({ ok: false, motivo: 'red' }));
    pedido.end();
  });
}

// ── Pedirle la sesión al servidor de EstudIA ──

export interface SesionSupabase {
  access_token: string;
  refresh_token: string;
  expires_at?: number;
  expires_in?: number;
  token_type?: string;
}
export interface PerfilEstudia { id: string; nombre: string; apellido: string; rol: string }

export type ResultadoSesion =
  | { ok: true; sesion: SesionSupabase; perfil: PerfilEstudia }
  | { ok: false; motivo: 'no_existe' | 'superadmin' | 'servidor' };

export async function pedirSesion(config: Config, dni: string): Promise<ResultadoSesion> {
  try {
    const r = await fetch(`${config.supabaseUrl}/functions/v1/cidituc-sesion`, {
      method: 'POST',
      headers: {
        // La puerta de las funciones pide un token válido de EstudIA: la clave pública
        Authorization: `Bearer ${config.supabaseAnonKey}`,
        apikey: config.supabaseAnonKey,
        'Content-Type': 'application/json',
        'x-cidituc-puente': config.puenteSecret,
      },
      body: JSON.stringify({ dni }),
      signal: AbortSignal.timeout(20_000),
    });
    const cuerpo = await r.json().catch(() => null) as Record<string, unknown> | null;
    if (r.ok && cuerpo?.ok && cuerpo.sesion && cuerpo.perfil) {
      return { ok: true, sesion: cuerpo.sesion as SesionSupabase, perfil: cuerpo.perfil as PerfilEstudia };
    }
    const motivo = cuerpo?.motivo;
    return { ok: false, motivo: motivo === 'no_existe' || motivo === 'superadmin' ? motivo : 'servidor' };
  } catch {
    return { ok: false, motivo: 'servidor' };
  }
}

// ── Las cuatro piezas ──

export interface Dependencias {
  validarToken: (config: Config, token: string) => Promise<ResultadoValidacion>;
  pedirSesion: (config: Config, dni: string) => Promise<ResultadoSesion>;
}
const DEPENDENCIAS: Dependencias = { validarToken, pedirSesion };

interface DatosSesion { sub: string; nombre: string; apellido: string; rol: string; exp: number }
interface DatosEntrega { sesion: SesionSupabase; exp: number }

function cabecerasComunes(res: ServerResponse) {
  res.setHeader('Cache-Control', 'no-store');
  // Que la dirección del callback (trae el token en la URL) no se filtre
  res.setHeader('Referrer-Policy', 'no-referrer');
}

function redirigir(res: ServerResponse, a: string, cookies: string[] = []) {
  cabecerasComunes(res);
  if (cookies.length) res.setHeader('Set-Cookie', cookies);
  res.statusCode = 302;
  res.setHeader('Location', a);
  res.end();
}

function json(res: ServerResponse, status: number, cuerpo: unknown, cookies: string[] = []) {
  cabecerasComunes(res);
  if (cookies.length) res.setHeader('Set-Cookie', cookies);
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(cuerpo));
}

const conError = (codigo: string) => `/login?cidituc_error=${codigo}`;

/** 1 · "Ingresar con CiDiTuc": state nuevo y a Derivador */
export function iniciar(req: IncomingMessage, res: ServerResponse, config = leerConfig()) {
  if (!config) return redirigir(res, conError('config'));
  const state = randomBytes(32).toString('base64url');
  const destino = `${config.loginUrl}/login?next=${encodeURIComponent(config.nextKey)}&state=${encodeURIComponent(state)}`;
  redirigir(res, destino, [cookie(req, COOKIE_STATE, state, { maxAge: DURACION_STATE_S })]);
}

/** 2 · La vuelta de Derivador */
export async function volver(req: IncomingMessage, res: ServerResponse, config = leerConfig(), dep: Dependencias = DEPENDENCIAS) {
  // El state es de un solo uso: se borra pase lo que pase
  const sinState = borrar(req, COOKIE_STATE);
  if (!config) return redirigir(res, conError('config'), [sinState]);

  const url = new URL(req.url ?? '/', 'http://x');
  const token = url.searchParams.get('auth') ?? '';
  const state = url.searchParams.get('state') ?? '';
  const guardado = Buffer.from(leerCookies(req)[COOKIE_STATE] ?? '');
  const recibido = Buffer.from(state);
  const iguales = recibido.length > 0 && recibido.length === guardado.length && timingSafeEqual(recibido, guardado);
  if (!iguales) return redirigir(res, conError('estado'), [sinState]);
  if (!token) return redirigir(res, conError('token'), [sinState]);

  const v = await dep.validarToken(config, token);
  if (!v.ok) return redirigir(res, conError(v.motivo === 'red' ? 'validacion' : 'token'), [sinState]);

  const dni = dniDeDocumento(v.persona.documento);
  if (!dni) return redirigir(res, conError('token'), [sinState]);

  const s = await dep.pedirSesion(config, dni);
  if (!s.ok) return redirigir(res, conError(s.motivo), [sinState]);

  const datosSesion: DatosSesion = {
    sub: s.perfil.id, nombre: s.perfil.nombre, apellido: s.perfil.apellido, rol: s.perfil.rol,
    exp: ahoraS() + DURACION_SESION_S,
  };
  const datosEntrega: DatosEntrega = { sesion: s.sesion, exp: ahoraS() + DURACION_ENTREGA_S };
  redirigir(res, '/login?cidituc=listo', [
    sinState,
    cookie(req, COOKIE_SESION, firmar(datosSesion, config.sessionSecret), { maxAge: DURACION_SESION_S }),
    cookie(req, COOKIE_ENTREGA, firmar(datosEntrega, config.sessionSecret), {
      maxAge: DURACION_ENTREGA_S, path: PATH_ENTREGA, sameSite: 'Strict',
    }),
  ]);
}

/**
 * 3 · Quién es la persona de esta sesión. Con ?entregar=1, además, la sesión
 * de EstudIA para que la app la tome (una sola vez: después se borra).
 */
export function quienSoy(req: IncomingMessage, res: ServerResponse, config = leerConfig()) {
  if (!config) return json(res, 503, { error: 'config' });
  const cookies = leerCookies(req);
  const sesion = verificar<DatosSesion>(cookies[COOKIE_SESION], config.sessionSecret);
  if (!sesion) return json(res, 401, { error: 'sin_sesion' });
  const usuario = { id: sesion.sub, nombre: sesion.nombre, apellido: sesion.apellido, rol: sesion.rol };

  const url = new URL(req.url ?? '/', 'http://x');
  if (url.searchParams.get('entregar') !== '1') return json(res, 200, { usuario });
  const entrega = verificar<DatosEntrega>(cookies[COOKIE_ENTREGA], config.sessionSecret);
  return json(res, 200, { usuario, sesion: entrega?.sesion ?? null }, [borrar(req, COOKIE_ENTREGA, PATH_ENTREGA)]);
}

/** 4 · Salir: borra lo nuestro (la sesión de EstudIA la cierra la app) */
export function salir(req: IncomingMessage, res: ServerResponse) {
  const cookies = [borrar(req, COOKIE_SESION), borrar(req, COOKIE_ENTREGA, PATH_ENTREGA), borrar(req, COOKIE_STATE)];
  if (req.method === 'GET') return redirigir(res, '/login', cookies);
  json(res, 200, { ok: true }, cookies);
}
