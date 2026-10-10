// A tiny web app around slugify(), used by ATLAS browser QA and staging verification demos.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { slugify } from './src/slugify.js';

const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? '127.0.0.1';

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://${host}`);
  if (url.pathname === '/healthz') return send(res, 200, 'text/plain', 'ok');
  if (url.pathname === '/version') return send(res, 200, 'application/json', JSON.stringify({ revision: process.env.ATLAS_REVISION ?? 'unknown' }));
  if (url.pathname === '/api/slug') return send(res, 200, 'application/json', JSON.stringify({ slug: slugify(url.searchParams.get('title') ?? '') }));
  if (url.pathname === '/') return send(res, 200, 'text/html; charset=utf-8', await readFile(new URL('./public/index.html', import.meta.url)));
  return send(res, 404, 'text/plain', 'not found');
});

function send(res, status, type, body) {
  res.writeHead(status, { 'content-type': type });
  res.end(body);
}

server.listen(port, host, () => console.log(`sample app on http://${host}:${port}`));
