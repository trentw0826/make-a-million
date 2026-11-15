import { existsSync, statSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import path from 'node:path';

const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

export type HttpHandler = (req: IncomingMessage, res: ServerResponse) => void;

/**
 * Serves the built client from `dir` with a single-page-app fallback to index.html. If the
 * directory is missing (development, where Vite serves the client) it answers with a note.
 */
export function serveStatic(dir: string): HttpHandler {
  const root = path.resolve(dir);
  const available = existsSync(path.join(root, 'index.html'));

  return (req, res) => {
    if (req.method === 'GET' && req.url === '/healthz') {
      res.writeHead(200, { 'content-type': 'text/plain' });
      res.end('ok\n');
      return;
    }
    if (!available) {
      res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
      res.end(
        'Make-a-Million server is running. The client is served separately in development.\n',
      );
      return;
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405).end();
      return;
    }

    const urlPath = decodeURIComponent((req.url ?? '/').split('?')[0] ?? '/');
    let file = path.normalize(path.join(root, urlPath));
    if (!file.startsWith(root)) {
      res.writeHead(403).end();
      return;
    }
    if (!existsSync(file) || statSync(file).isDirectory()) file = path.join(root, 'index.html');

    readFile(file).then(
      (body) => {
        const ext = path.extname(file);
        const immutable = urlPath.startsWith('/assets/');
        res.writeHead(200, {
          'content-type': CONTENT_TYPES[ext] ?? 'application/octet-stream',
          'cache-control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache',
        });
        res.end(req.method === 'HEAD' ? undefined : body);
      },
      () => {
        res.writeHead(404).end();
      },
    );
  };
}
