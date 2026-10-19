// Quién es la persona de la sesión de CiDiTuc; con ?entregar=1, también la sesión de EstudIA (ver api/_cidituc.ts)
import type { IncomingMessage, ServerResponse } from 'node:http';
import { quienSoy } from '../../_cidituc.js';

export default function handler(req: IncomingMessage, res: ServerResponse) {
  quienSoy(req, res);
}
