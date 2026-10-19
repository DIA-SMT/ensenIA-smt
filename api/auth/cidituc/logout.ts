// Salir: borra las cookies del ingreso con CiDiTuc (ver api/_cidituc.ts)
import type { IncomingMessage, ServerResponse } from 'node:http';
import { salir } from '../../_cidituc';

export default function handler(req: IncomingMessage, res: ServerResponse) {
  salir(req, res);
}
