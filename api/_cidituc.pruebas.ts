/**
 * Pruebas del ingreso con CiDiTuc (api/_cidituc.ts): npm run pruebas:cidituc
 *
 * Sin tocar CiDiTuc ni el servidor de datos: el backend de CiDiTuc y la
 * función cidituc-sesion se reemplazan por servidores de prueba locales.
 */
import { createServer as crearHttp, type IncomingMessage, type ServerResponse } from 'node:http';
import { createServer as crearHttps } from 'node:https';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import {
  dniDeDocumento, firmar, verificar, iniciar, volver, quienSoy, salir, leerConfig,
  validarToken, pedirSesion, COOKIE_STATE, COOKIE_SESION, COOKIE_ENTREGA,
  type Config, type Dependencias,
} from './_cidituc';

let fallas = 0;
let total = 0;
const ok = (cond: unknown, msg: string) => {
  total++;
  if (!cond) fallas++;
  console.log(`${cond ? '  ✓' : '  ✗'} ${msg}`);
};

// ── Pedidos y respuestas falsos ──

interface ResPrueba { statusCode: number; headers: Record<string, string | string[]>; cuerpo: string }
function pedido(url: string, opciones: { cookies?: Record<string, string>; host?: string; method?: string } = {}) {
  const cookie = Object.entries(opciones.cookies ?? {}).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('; ');
  const req = { url, method: opciones.method ?? 'GET', headers: { host: opciones.host ?? 'estudia.smt.gob.ar', ...(cookie ? { cookie } : {}) } };
  const r: ResPrueba = { statusCode: 200, headers: {}, cuerpo: '' };
  const res = {
    get statusCode() { return r.statusCode; },
    set statusCode(v: number) { r.statusCode = v; },
    setHeader(k: string, v: string | string[]) { r.headers[k.toLowerCase()] = v; },
    end(c?: string) { r.cuerpo = c ?? ''; },
  };
  return { req: req as unknown as IncomingMessage, res: res as unknown as ServerResponse, r };
}
const cookiesDe = (r: ResPrueba): string[] => {
  const c = r.headers['set-cookie'];
  return Array.isArray(c) ? c : c ? [c] : [];
};
const cookieLlamada = (r: ResPrueba, nombre: string) => cookiesDe(r).find(c => c.startsWith(`${nombre}=`));
const valorDe = (cookie: string | undefined) => decodeURIComponent((cookie ?? '').split(';')[0].split('=').slice(1).join('='));

const CONFIG: Config = {
  loginUrl: 'https://cidituc.ejemplo',
  backendUrl: 'https://backend.ejemplo',
  nextKey: 'estudia',
  sessionSecret: 'un-secreto-de-prueba-bien-largo-de-mas-de-32-caracteres',
  puenteSecret: 'clave-compartida-de-prueba-larga-de-mas-de-32',
  supabaseUrl: 'https://datos.ejemplo',
  supabaseAnonKey: 'anon-de-prueba',
};

// ═══ 1. CUIL → DNI ═══
console.log('1. CUIL → DNI');
ok(dniDeDocumento('20-12345678-9') === '12345678', 'CUIL con guiones → DNI de 8');
ok(dniDeDocumento('27071234563') === '7123456', 'CUIL de un DNI de 7 dígitos (con cero adelante) → 7123456');
ok(dniDeDocumento('12345678') === '12345678', 'DNI suelto de 8');
ok(dniDeDocumento('7123456') === '7123456', 'DNI suelto de 7');
ok(dniDeDocumento('123') === null, 'muy corto → nada');
ok(dniDeDocumento('20000000009') === null, 'CUIL con DNI vacío → nada');
ok(dniDeDocumento(undefined) === null, 'sin documento → nada');

// ═══ 2. Firma ═══
console.log('2. Cookies firmadas');
const exp = Math.floor(Date.now() / 1000) + 60;
const firmado = firmar({ sub: 'u1', exp }, CONFIG.sessionSecret);
ok(verificar<{ sub: string; exp: number }>(firmado, CONFIG.sessionSecret)?.sub === 'u1', 'ida y vuelta');
ok(verificar(firmado, 'otro-secreto-cualquiera-de-mas-de-32-caracteres') === null, 'con otro secreto no vale');
const [cuerpo, firma] = firmado.split('.');
const retocado = Buffer.from(JSON.stringify({ sub: 'admin', exp })).toString('base64url');
ok(verificar(`${retocado}.${firma}`, CONFIG.sessionSecret) === null, 'retocada (otro usuario) no vale');
ok(verificar(`${cuerpo}.${firma}x`, CONFIG.sessionSecret) === null, 'firma alterada no vale');
ok(verificar(firmar({ sub: 'u1', exp: exp - 120 }, CONFIG.sessionSecret), CONFIG.sessionSecret) === null, 'vencida no vale');
ok(verificar('basura', CONFIG.sessionSecret) === null && verificar(undefined, CONFIG.sessionSecret) === null, 'rota o ausente no vale');

// ═══ 3. Configuración ═══
console.log('3. Configuración');
ok(leerConfig({}) === null, 'sin variables → no hay ingreso con CiDiTuc');
ok(leerConfig({
  CIDITUC_LOGIN_URL: 'x', CIDITUC_BACKEND_URL: 'x', CIDITUC_NEXT_KEY: 'x', CIDITUC_SESSION_SECRET: 'corto',
  CIDITUC_PUENTE_SECRET: 'x', VITE_SUPABASE_URL: 'x', VITE_SUPABASE_ANON_KEY: 'x',
}) === null, 'secreto de firma corto → no arranca');
const conf = leerConfig({
  CIDITUC_LOGIN_URL: 'https://cidituc.ejemplo/', CIDITUC_BACKEND_URL: 'https://b.ejemplo', CIDITUC_NEXT_KEY: 'estudia',
  CIDITUC_SESSION_SECRET: CONFIG.sessionSecret, CIDITUC_PUENTE_SECRET: 'p', VITE_SUPABASE_URL: 'https://d.ejemplo', VITE_SUPABASE_ANON_KEY: 'a',
});
ok(conf?.loginUrl === 'https://cidituc.ejemplo', 'completa → arranca (sin la barra del final)');

// ═══ 4. Iniciar ═══
console.log('4. Ingresar con CiDiTuc');
{
  const { req, res, r } = pedido('/api/auth/cidituc/login');
  iniciar(req, res, null);
  ok(r.statusCode === 302 && r.headers.location === '/login?cidituc_error=config', 'sin configurar → vuelve al login con aviso');
}
let stateGuardado = '';
{
  const { req, res, r } = pedido('/api/auth/cidituc/login');
  iniciar(req, res, CONFIG);
  const c = cookieLlamada(r, COOKIE_STATE);
  stateGuardado = valorDe(c);
  const destino = new URL(String(r.headers.location));
  ok(r.statusCode === 302 && destino.origin + destino.pathname === 'https://cidituc.ejemplo/login', 'manda a Derivador /login');
  ok(destino.searchParams.get('next') === 'estudia' && destino.searchParams.get('state') === stateGuardado, 'con next y el mismo state que la cookie');
  ok(stateGuardado.length >= 40, 'state largo y al azar');
  ok(!!c && /HttpOnly/.test(c) && /Secure/.test(c) && /SameSite=Lax/.test(c) && /Max-Age=600/.test(c) && /Path=\//.test(c), 'cookie httpOnly, Secure, Lax, 10 minutos');
}
{
  const { req, res, r } = pedido('/api/auth/cidituc/login', { host: 'localhost:5173' });
  iniciar(req, res, CONFIG);
  ok(!/Secure/.test(cookieLlamada(r, COOKIE_STATE) ?? ''), 'en localhost (http) la cookie no es Secure');
}
{
  const a = pedido('/x'); iniciar(a.req, a.res, CONFIG);
  const b = pedido('/x'); iniciar(b.req, b.res, CONFIG);
  ok(valorDe(cookieLlamada(a.r, COOKIE_STATE)) !== valorDe(cookieLlamada(b.r, COOKIE_STATE)), 'cada ingreso tiene su propio state');
}

// ═══ 5. La vuelta ═══
console.log('5. La vuelta de Derivador');
const llamadas: { token?: string; dni?: string } = {};
const dep = (v: Awaited<ReturnType<Dependencias['validarToken']>>, s: Awaited<ReturnType<Dependencias['pedirSesion']>>): Dependencias => ({
  validarToken: async (_c, token) => { llamadas.token = token; return v; },
  pedirSesion: async (_c, dni) => { llamadas.dni = dni; return s; },
});
const PERSONA = { ok: true as const, persona: { documento: '20123456789', nombre: 'Ana', apellido: 'Pérez' } };
const SESION = { ok: true as const, sesion: { access_token: 'acceso', refresh_token: 'renueva', expires_at: 999 }, perfil: { id: 'p1', nombre: 'Ana', apellido: 'Pérez', rol: 'docente' } };
const vuelta = async (url: string, cookies: Record<string, string>, d: Dependencias) => {
  const p = pedido(url, { cookies });
  await volver(p.req, p.res, CONFIG, d);
  return p.r;
};
const errorDe = (r: ResPrueba) => new URL(String(r.headers.location), 'http://x').searchParams.get('cidituc_error');
{
  const r = await vuelta(`/auth/cidituc/callback?auth=t&state=${stateGuardado}`, {}, dep(PERSONA, SESION));
  ok(errorDe(r) === 'estado', 'sin la cookie del state → "venció o no coincide"');
  ok(llamadas.token === undefined, '… y ni siquiera se valida el token');
}
{
  const r = await vuelta('/auth/cidituc/callback?auth=t&state=otro', { [COOKIE_STATE]: stateGuardado }, dep(PERSONA, SESION));
  ok(errorDe(r) === 'estado', 'state distinto → rechazo');
  ok(/cidituc_state=;/.test(cookieLlamada(r, COOKIE_STATE) ?? '') && /Max-Age=0/.test(cookieLlamada(r, COOKIE_STATE) ?? ''), 'el state se borra igual (un solo uso)');
}
{
  const raro = 'ñ'.repeat(stateGuardado.length);
  let tiro = false;
  try { await vuelta(`/auth/cidituc/callback?auth=t&state=${encodeURIComponent(raro)}`, { [COOKIE_STATE]: stateGuardado }, dep(PERSONA, SESION)); } catch { tiro = true; }
  ok(!tiro, 'state con caracteres raros del mismo largo → se rechaza sin romperse');
}
{
  const r = await vuelta(`/auth/cidituc/callback?state=${stateGuardado}`, { [COOKIE_STATE]: stateGuardado }, dep(PERSONA, SESION));
  ok(errorDe(r) === 'token', 'sin token → rechazo');
}
{
  const r = await vuelta(`/auth/cidituc/callback?auth=malo&state=${stateGuardado}`, { [COOKIE_STATE]: stateGuardado }, dep({ ok: false, motivo: 'token' }, SESION));
  ok(errorDe(r) === 'token', 'CiDiTuc no reconoce el token → rechazo');
}
{
  const r = await vuelta(`/auth/cidituc/callback?auth=t&state=${stateGuardado}`, { [COOKIE_STATE]: stateGuardado }, dep({ ok: false, motivo: 'red' }, SESION));
  ok(errorDe(r) === 'validacion', 'el backend no responde (o el certificado) → aviso de conexión, no de la persona');
}
{
  const r = await vuelta(`/auth/cidituc/callback?auth=t&state=${stateGuardado}`, { [COOKIE_STATE]: stateGuardado }, dep({ ok: true, persona: { documento: 'x', nombre: '', apellido: '' } }, SESION));
  ok(errorDe(r) === 'token', 'documento ilegible → rechazo');
}
{
  const r = await vuelta(`/auth/cidituc/callback?auth=t&state=${stateGuardado}`, { [COOKIE_STATE]: stateGuardado }, dep(PERSONA, { ok: false, motivo: 'no_existe' }));
  ok(errorDe(r) === 'no_existe', 'no tiene cuenta en EstudIA → rechazo con su mensaje');
  ok(!cookieLlamada(r, COOKIE_SESION), '… y no se crea ninguna sesión');
}
{
  const r = await vuelta(`/auth/cidituc/callback?auth=t&state=${stateGuardado}`, { [COOKIE_STATE]: stateGuardado }, dep(PERSONA, { ok: false, motivo: 'superadmin' }));
  ok(errorDe(r) === 'superadmin', 'superadmin → rechazo');
}
let cookieSesion = '';
let cookieEntrega = '';
{
  llamadas.token = undefined; llamadas.dni = undefined;
  const r = await vuelta(`/auth/cidituc/callback?auth=el-jwt&state=${stateGuardado}`, { [COOKIE_STATE]: stateGuardado }, dep(PERSONA, SESION));
  ok(r.statusCode === 302 && r.headers.location === '/login?cidituc=listo', 'todo bien → vuelve a la app sin nada en la dirección');
  ok(llamadas.token === 'el-jwt' && llamadas.dni === '12345678', 'valida ESE token y pide la sesión del DNI del CUIL');
  const s = cookieLlamada(r, COOKIE_SESION) ?? '';
  const e = cookieLlamada(r, COOKIE_ENTREGA) ?? '';
  cookieSesion = valorDe(s); cookieEntrega = valorDe(e);
  ok(/HttpOnly/.test(s) && /Secure/.test(s) && /Max-Age=43200/.test(s), 'sesión propia: cookie httpOnly firmada de 12 h');
  ok(/HttpOnly/.test(e) && /SameSite=Strict/.test(e) && /Path=\/api\/auth\/cidituc/.test(e) && /Max-Age=120/.test(e), 'entrega: httpOnly, Strict, solo para /api/auth/cidituc, 2 minutos');
  ok(!cookiesDe(r).some(c => c.includes('el-jwt')), 'el token de CiDiTuc no queda en ninguna cookie');
  ok(r.headers['referrer-policy'] === 'no-referrer' && r.headers['cache-control'] === 'no-store', 'sin referer ni caché');
}

// ═══ 6. Quién soy y la entrega ═══
console.log('6. /me y la entrega de la sesión');
{
  const p = pedido('/api/auth/cidituc/me');
  quienSoy(p.req, p.res, CONFIG);
  ok(p.r.statusCode === 401, 'sin sesión → 401');
}
{
  const p = pedido('/api/auth/cidituc/me', { cookies: { [COOKIE_SESION]: cookieSesion } });
  quienSoy(p.req, p.res, CONFIG);
  const c = JSON.parse(p.r.cuerpo);
  ok(p.r.statusCode === 200 && c.usuario?.id === 'p1' && c.usuario?.rol === 'docente' && !('sesion' in c), 'con sesión → quién es (sin tokens)');
}
{
  const p = pedido('/api/auth/cidituc/me?entregar=1', { cookies: { [COOKIE_SESION]: cookieSesion, [COOKIE_ENTREGA]: cookieEntrega } });
  quienSoy(p.req, p.res, CONFIG);
  const c = JSON.parse(p.r.cuerpo);
  ok(c.sesion?.access_token === 'acceso' && c.sesion?.refresh_token === 'renueva', 'entregar=1 → la sesión de EstudIA para la app');
  ok(/Max-Age=0/.test(cookieLlamada(p.r, COOKIE_ENTREGA) ?? ''), '… y la entrega se borra (una sola vez)');
}
{
  const p = pedido('/api/auth/cidituc/me?entregar=1', { cookies: { [COOKIE_SESION]: cookieSesion } });
  quienSoy(p.req, p.res, CONFIG);
  ok(JSON.parse(p.r.cuerpo).sesion === null, 'segunda vez (ya sin la cookie) → no hay sesión para entregar');
}
{
  const falsa = firmar({ sub: 'otro', nombre: '', apellido: '', rol: 'director', exp: exp + 999 }, 'secreto-de-un-atacante-con-mas-de-32-caracteres');
  const p = pedido('/api/auth/cidituc/me', { cookies: { [COOKIE_SESION]: falsa } });
  quienSoy(p.req, p.res, CONFIG);
  ok(p.r.statusCode === 401, 'cookie inventada → 401');
}

// ═══ 7. Salir ═══
console.log('7. Salir');
{
  const p = pedido('/api/auth/cidituc/logout', { method: 'POST' });
  salir(p.req, p.res);
  ok(p.r.statusCode === 200 && [COOKIE_SESION, COOKIE_ENTREGA, COOKIE_STATE].every(n => /Max-Age=0/.test(cookieLlamada(p.r, n) ?? '')), 'POST → borra las tres cookies');
  const g = pedido('/api/auth/cidituc/logout');
  salir(g.req, g.res);
  ok(g.r.statusCode === 302 && g.r.headers.location === '/login', 'GET → además vuelve al login');
}

// ═══ 8. Validar contra un backend de prueba (http) ═══
console.log('8. Validar el token (backend de prueba)');
const escuchar = (s: ReturnType<typeof crearHttp>) => new Promise<number>(r => s.listen(0, '127.0.0.1', () => r((s.address() as AddressInfo).port)));
{
  let autorizacion: string | undefined;
  const backend = crearHttp((req, res) => {
    autorizacion = req.headers.authorization;
    if (req.url !== '/usuarios/authStatus') { res.statusCode = 404; return res.end(); }
    if (req.headers.authorization === 'bueno') {
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify({ usuarioSinContraseña: { documento_persona: '20123456789', nombre_persona: 'Ana', apellido_persona: 'Pérez', email_persona: 'a@b' } }));
    }
    if (req.headers.authorization === 'anidado') return res.end(JSON.stringify({ data: { usuarioSinContraseña: { documento_persona: '27071234563', nombre_persona: 'B', apellido_persona: 'C' } } }));
    res.statusCode = 401; res.end('{}');
  });
  const puerto = await escuchar(backend);
  const c = { ...CONFIG, backendUrl: `http://127.0.0.1:${puerto}` };
  const v1 = await validarToken(c, 'bueno');
  ok(v1.ok && v1.persona.documento === '20123456789' && v1.persona.nombre === 'Ana', '200 → persona (documento, nombre, apellido)');
  ok(autorizacion === 'bueno', 'manda el token crudo, sin "Bearer"');
  const v2 = await validarToken(c, 'anidado');
  ok(v2.ok && v2.persona.documento === '27071234563', 'también con la respuesta dentro de data');
  const v3 = await validarToken(c, 'vencido');
  ok(!v3.ok && v3.motivo === 'token', '401 → token rechazado');
  await new Promise(r => backend.close(r));
  const v4 = await validarToken({ ...CONFIG, backendUrl: 'http://127.0.0.1:1' }, 'x');
  ok(!v4.ok && v4.motivo === 'red', 'backend caído → error de red');
}

// ═══ 9. Certificado incompleto: se completa, NUNCA se apaga la verificación ═══
console.log('9. Cadena TLS incompleta');
{
  let carpeta = '';
  try {
    carpeta = mkdtempSync(join(tmpdir(), 'cidituc-tls-'));
    execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1',
      '-keyout', join(carpeta, 'clave.pem'), '-out', join(carpeta, 'cert.pem'),
      '-subj', '/CN=127.0.0.1', '-addext', 'subjectAltName=IP:127.0.0.1'], { stdio: 'ignore' });
  } catch {
    carpeta = '';
  }
  if (!carpeta) {
    console.log('  (sin openssl: se saltea)');
  } else {
    const cert = readFileSync(join(carpeta, 'cert.pem'), 'utf8');
    const servidor = crearHttps({ key: readFileSync(join(carpeta, 'clave.pem')), cert }, (_req, res) => {
      res.end(JSON.stringify({ usuarioSinContraseña: { documento_persona: '20123456789', nombre_persona: 'A', apellido_persona: 'B' } }));
    });
    const puerto = await new Promise<number>(r => servidor.listen(0, '127.0.0.1', () => r((servidor.address() as AddressInfo).port)));
    const c = { ...CONFIG, backendUrl: `https://127.0.0.1:${puerto}` };
    const sin = await validarToken(c, 'x');
    ok(!sin.ok && sin.motivo === 'red', 'certificado que no cierra la cadena → se rechaza (la verificación sigue prendida)');
    const con = await validarToken({ ...c, caExtra: cert }, 'x');
    ok(con.ok, 'con el certificado que falta (CIDITUC_CA_PEM / CIDITUC_CA_FILE) → anda');
    await new Promise(r => servidor.close(r));
    rmSync(carpeta, { recursive: true, force: true });
  }
}

// ═══ 10. Pedir la sesión al servidor de datos (función de prueba) ═══
console.log('10. Pedir la sesión a cidituc-sesion (función de prueba)');
{
  let recibido: { auth?: string; apikey?: string; puente?: string; cuerpo?: string } = {};
  const funcion = crearHttp((req, res) => {
    let cuerpo = '';
    req.on('data', d => { cuerpo += d; });
    req.on('end', () => {
      recibido = { auth: req.headers.authorization, apikey: req.headers.apikey as string, puente: req.headers['x-cidituc-puente'] as string, cuerpo };
      res.setHeader('Content-Type', 'application/json');
      const { dni } = JSON.parse(cuerpo);
      if (req.url !== '/functions/v1/cidituc-sesion') { res.statusCode = 404; return res.end('{}'); }
      if (dni === '11111111') { res.statusCode = 404; return res.end(JSON.stringify({ ok: false, motivo: 'no_existe' })); }
      if (dni === '22222222') { res.statusCode = 500; return res.end('no es json'); }
      res.end(JSON.stringify({ ok: true, sesion: { access_token: 'a', refresh_token: 'r' }, perfil: { id: 'p', nombre: 'N', apellido: 'A', rol: 'docente' } }));
    });
  });
  const puerto = await escuchar(funcion);
  const c = { ...CONFIG, supabaseUrl: `http://127.0.0.1:${puerto}` };
  const s1 = await pedirSesion(c, '12345678');
  ok(s1.ok && s1.perfil.rol === 'docente', 'devuelve la sesión y el perfil');
  ok(recibido.auth === 'Bearer anon-de-prueba' && recibido.apikey === 'anon-de-prueba', 'pasa la puerta con la clave pública');
  ok(recibido.puente === CONFIG.puenteSecret && JSON.parse(recibido.cuerpo ?? '{}').dni === '12345678', 'con la clave compartida y solo el DNI');
  const s2 = await pedirSesion(c, '11111111');
  ok(!s2.ok && s2.motivo === 'no_existe', 'no existe → no_existe');
  const s3 = await pedirSesion(c, '22222222');
  ok(!s3.ok && s3.motivo === 'servidor', 'respuesta rota → error del servidor');
  await new Promise(r => funcion.close(r));
  const s4 = await pedirSesion({ ...CONFIG, supabaseUrl: 'http://127.0.0.1:1' }, '1');
  ok(!s4.ok && s4.motivo === 'servidor', 'servidor caído → error del servidor');
}

console.log(fallas ? `\n${fallas} FALLAS de ${total}` : `\nTodo OK (${total} comprobaciones)`);
process.exitCode = fallas ? 1 : 0;
