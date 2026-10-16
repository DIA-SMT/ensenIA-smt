// La vuelta de Derivador: /auth/cidituc/callback llega acá por vercel.json (ver api/_cidituc.ts)
import type { IncomingMessage, ServerResponse } from 'node:http';
import { volver } from '../../_cidituc';

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  await volver(req, res);
}
