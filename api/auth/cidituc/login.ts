// "Ingresar con CiDiTuc": genera el state y manda a Derivador (ver api/_cidituc.ts)
import type { IncomingMessage, ServerResponse } from 'node:http';
import { iniciar } from '../../_cidituc';

export default function handler(req: IncomingMessage, res: ServerResponse) {
  iniciar(req, res);
}
