'use strict';

const http = require('node:http');
const path = require('node:path');
const fs = require('node:fs');
const fsp = require('node:fs/promises');

const ROOT = __dirname;
const DIST = path.join(ROOT, 'dist');
const PORT = Number(process.env.PORT || process.env.SERVER_PORT || 8080);
const VERSION = process.env.WTM_VERSION || '1.0.0';
const ENVIRONMENT = process.env.WTM_ENVIRONMENT || process.env.NODE_ENV || 'production';
const AUTH_MODE = String(process.env.WTM_AUTH_MODE || 'off').toLowerCase() === 'appservice' ? 'appservice' : 'off';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

function securityHeaders(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Content-Security-Policy', "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'self'; img-src 'self' data: blob:; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self' data:; connect-src 'self'; worker-src 'self' blob:");
}

function json(res, status, payload) {
  securityHeaders(res);
  const body = JSON.stringify(payload);
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Length', Buffer.byteLength(body));
  res.end(body);
}

async function exists(filePath) {
  try { return await fsp.stat(filePath); } catch { return null; }
}

function safeFilePath(pathname) {
  let decoded;
  try { decoded = decodeURIComponent(pathname); } catch { return null; }
  const relative = decoded.replace(/^\/+/, '') || 'index.html';
  const candidate = path.resolve(DIST, relative);
  return candidate === DIST || candidate.startsWith(`${DIST}${path.sep}`) ? candidate : null;
}

async function serveFile(req, res, filePath, requestPath) {
  const stat = await exists(filePath);
  if (!stat || !stat.isFile()) return false;
  securityHeaders(res);
  const ext = path.extname(filePath).toLowerCase();
  res.statusCode = 200;
  res.setHeader('Content-Type', MIME[ext] || 'application/octet-stream');
  res.setHeader('Content-Length', stat.size);
  if (requestPath.startsWith('/assets/')) res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  else if (ext === '.html') res.setHeader('Cache-Control', 'no-cache');
  else res.setHeader('Cache-Control', 'public, max-age=3600');
  if (req.method === 'HEAD') { res.end(); return true; }
  fs.createReadStream(filePath).pipe(res);
  return true;
}

const server = http.createServer(async (req, res) => {
  try {
    const method = req.method || 'GET';
    if (method !== 'GET' && method !== 'HEAD') {
      res.setHeader('Allow', 'GET, HEAD');
      return json(res, 405, { error: 'Method not allowed' });
    }

    const url = new URL(req.url || '/', 'http://localhost');
    if (url.pathname === '/healthz') {
      const ready = Boolean(await exists(path.join(DIST, 'index.html')));
      return json(res, ready ? 200 : 503, { status: ready ? 'ok' : 'build-missing', version: VERSION });
    }
    if (url.pathname === '/api/runtime-config') {
      return json(res, 200, { authMode: AUTH_MODE, environment: ENVIRONMENT, version: VERSION });
    }
    if (url.pathname.startsWith('/api/')) return json(res, 404, { error: 'Not found' });

    const requested = safeFilePath(url.pathname);
    if (!requested) return json(res, 400, { error: 'Invalid path' });
    if (await serveFile(req, res, requested, url.pathname)) return;

    // WTM currently uses in-app state rather than URL routing, but serving index.html
    // here keeps the host SPA-safe if route-based navigation is added later.
    const indexPath = path.join(DIST, 'index.html');
    if (await serveFile(req, res, indexPath, '/index.html')) return;
    return json(res, 503, { error: 'WTM production build is missing. Run npm run build before starting the production host.' });
  } catch (error) {
    console.error('WTM host error', error);
    return json(res, 500, { error: 'Internal server error' });
  }
});

server.listen(PORT, () => {
  console.log(`WTM ${VERSION} listening on port ${PORT} (${ENVIRONMENT}, auth=${AUTH_MODE})`);
});
