import http from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const host = process.env.QA_PROXY_HOST || '127.0.0.1';
const port = Number(process.env.QA_PROXY_PORT || 4174);
const apiOrigin = process.env.QA_API_ORIGIN || 'http://127.0.0.1:4175';
const prefix = '/04-projection-treehouse';
const mime = new Map([
  ['.html', 'text/html; charset=utf-8'], ['.js', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'], ['.json', 'application/json; charset=utf-8'],
  ['.svg', 'image/svg+xml'], ['.png', 'image/png'], ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'], ['.webp', 'image/webp'], ['.mp4', 'video/mp4'],
]);

async function proxyApi(request, response) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  const headers = { ...request.headers, host: new URL(apiOrigin).host };
  if (request.headers.origin) headers.origin = new URL(apiOrigin).origin;
  delete headers['content-length'];
  const upstream = await fetch(`${apiOrigin}${request.url}`, {
    method: request.method,
    headers,
    body: ['GET', 'HEAD'].includes(request.method) ? undefined : Buffer.concat(chunks),
    redirect: 'manual',
  });
  const outputHeaders = Object.fromEntries(upstream.headers.entries());
  const setCookie = upstream.headers.getSetCookie?.();
  if (setCookie?.length) outputHeaders['set-cookie'] = setCookie;
  response.writeHead(upstream.status, outputHeaders);
  if (request.method === 'HEAD' || !upstream.body) return response.end();
  for await (const chunk of upstream.body) response.write(chunk);
  response.end();
}

async function createQaBrowserSession(response) {
  const upstream = await fetch(`${apiOrigin}/api/auth/guest`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
  const setCookie = upstream.headers.getSetCookie?.() || [];
  if (!upstream.ok || !setCookie.length) throw new Error(`QA login failed: ${upstream.status}`);
  response.writeHead(302, { location: `${prefix}/`, 'set-cookie': setCookie });
  response.end();
}

async function sessionProbe(response) {
  const upstream = await fetch(`${apiOrigin}/api/auth/guest`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
  const setCookie = upstream.headers.getSetCookie?.() || [];
  if (!upstream.ok || !setCookie.length) throw new Error(`QA login failed: ${upstream.status}`);
  const tokenCookie = setCookie[0].split(';', 1)[0];
  const session = await fetch(`${apiOrigin}/api/auth/session`, { headers: { cookie: tokenCookie } });
  const body = await session.text();
  response.writeHead(session.status, { 'content-type': 'application/json; charset=utf-8', 'set-cookie': setCookie });
  response.end(body);
}

async function serveStatic(request, response) {
  const url = new URL(request.url, `http://${request.headers.host}`);
  if (url.pathname === '/' || url.pathname === prefix) {
    response.writeHead(302, { location: `${prefix}/` });
    return response.end();
  }
  if (!url.pathname.startsWith(`${prefix}/`)) {
    response.writeHead(404);
    return response.end('Not found');
  }
  const relative = decodeURIComponent(url.pathname.slice(prefix.length + 1)) || 'index.html';
  const target = path.resolve(appDir, relative);
  if (target !== appDir && !target.startsWith(`${appDir}${path.sep}`)) {
    response.writeHead(403);
    return response.end('Forbidden');
  }
  const info = await stat(target);
  if (!info.isFile()) throw new Error('Not a file');
  response.writeHead(200, { 'content-type': mime.get(path.extname(target).toLowerCase()) || 'application/octet-stream', 'content-length': info.size });
  createReadStream(target).pipe(response);
}

const server = http.createServer((request, response) => {
  const operation = request.url === '/__qa_session'
    ? sessionProbe(response)
    : request.url === '/__qa_login' ? createQaBrowserSession(response)
    : request.url.startsWith('/api/') ? proxyApi(request, response) : serveStatic(request, response);
  Promise.resolve(operation)
    .catch((error) => {
      if (!response.headersSent) response.writeHead(502, { 'content-type': 'text/plain; charset=utf-8' });
      response.end(`QA proxy error: ${error.message}`);
    });
});

server.listen(port, host, () => console.log(`QA browser proxy: http://${host}:${port}${prefix}/ -> ${apiOrigin}`));
