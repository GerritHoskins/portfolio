import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../dist/', import.meta.url));
const port = Number(process.env.PORT || 4173);
const types = { '.js': 'text/javascript; charset=utf-8', '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg' };

const server = http.createServer(async (request, response) => {
  if (!['GET', 'HEAD'].includes(request.method)) {
    response.writeHead(405, { Allow: 'GET, HEAD' }).end();
    return;
  }
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    if (pathname === '/__preview/avatar.js' || /^\/__preview\/chunks\/[a-zA-Z0-9_-]+\.js$/.test(pathname)) {
      // Only public widget JS and its emitted chunks. No arbitrary URLs, cookies,
      // keys, cross-origin header changes, or session/API proxying.
      try {
        const upstream = await fetch(`https://avatar.pixeltronic.dev/widget/${pathname.slice('/__preview/'.length)}`, { signal: AbortSignal.timeout(10000), redirect: 'error' });
        if (!upstream.ok) throw new Error('Asset unavailable');
        const script = await upstream.text();
        response.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-store' });
        response.end(request.method === 'HEAD' ? undefined : script);
      } catch { response.writeHead(502).end('Avatar script unavailable'); }
      return;
    }
    const filename = path.resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
    if (!filename.startsWith(root) || path.relative(root, filename).startsWith('..')) {
      response.writeHead(403).end();
      return;
    }
    const body = await fs.readFile(filename);
    response.writeHead(200, { 'Content-Type': types[path.extname(filename)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    response.end(request.method === 'HEAD' ? undefined : body);
  } catch {
    response.writeHead(404).end('Not found');
  }
});

server.listen(port, '127.0.0.1', () => console.log(`Portfolio preview: http://127.0.0.1:${port}`));
