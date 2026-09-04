// Minimal zero-dependency static file server + reverse proxy.
// Proxies /api/* to the backend over Railway's private network so the browser sees ONE origin
// (www.ilteriscam.com) for both the app and the API - this makes the auth refresh cookie same-site,
// avoiding Safari/WebKit's strict cross-site cookie handling that was causing iOS-only logouts.
import { createServer, request as httpRequest } from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const DIST_DIR = join(__dirname, 'dist');
const PORT = Number(process.env.PORT || 4173);
const BACKEND_HOST = process.env.BACKEND_INTERNAL_HOST || 'localhost';
const BACKEND_PORT = Number(process.env.BACKEND_INTERNAL_PORT || 4100);

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

function proxyToBackend(req, res) {
  const proxyReq = httpRequest(
    {
      host: BACKEND_HOST,
      port: BACKEND_PORT,
      path: req.url,
      method: req.method,
      headers: { ...req.headers, host: `${BACKEND_HOST}:${BACKEND_PORT}` },
    },
    (proxyRes) => {
      res.writeHead(proxyRes.statusCode ?? 502, proxyRes.headers);
      proxyRes.pipe(res);
    },
  );

  proxyReq.on('error', (error) => {
    console.error('Proxy error:', error);
    if (!res.headersSent) {
      res.writeHead(502, { 'Content-Type': 'application/json' });
    }
    res.end(JSON.stringify({ message: 'Bad gateway' }));
  });

  req.pipe(proxyReq);
}

function serveStatic(req, res) {
  const urlPath = decodeURIComponent(req.url.split('?')[0]);
  const isAsset = urlPath.startsWith('/assets/');
  let filePath = join(DIST_DIR, normalize(urlPath));

  if (!filePath.startsWith(DIST_DIR)) {
    res.writeHead(400);
    res.end('Bad request');
    return;
  }

  if (!existsSync(filePath) || statSync(filePath).isDirectory()) {
    // SPA fallback: any unknown path (client-side route) serves the app shell.
    filePath = join(DIST_DIR, 'index.html');
  }

  const ext = extname(filePath);
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';
  // Hashed assets are safe to cache forever; everything else (the app shell) must always revalidate
  // so a deploy is never masked by a stale cached page/JS bundle.
  const cacheControl = isAsset ? 'public, max-age=31536000, immutable' : 'no-cache, no-store, must-revalidate';

  res.writeHead(200, { 'Content-Type': contentType, 'Cache-Control': cacheControl });
  createReadStream(filePath).pipe(res);
}

const server = createServer((req, res) => {
  if (req.url?.startsWith('/api/')) {
    proxyToBackend(req, res);
    return;
  }
  serveStatic(req, res);
});

server.listen(PORT, () => {
  console.log(`Serving dist/ on port ${PORT}, proxying /api/* to ${BACKEND_HOST}:${BACKEND_PORT}`);
});
