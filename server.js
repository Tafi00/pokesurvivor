/* ============ server.js — Servidor local de PokéSurvivor con caché inteligente de sprites ============
 * Sirve el juego en http://localhost:3000 y descarga/guarda automáticamente en disco
 * cualquier sprite de Pokémon (/assets/pokemon/...) que aún no esté en la carpeta local.
 */
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const ORIGIN = 'https://pokesurvivor.com';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.svg': 'image/svg+xml',
  '.ttf': 'font/ttf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2'
};

function fetchAndCache(relPath, localFile, res) {
  const url = ORIGIN + '/' + relPath.replace(/\\/g, '/');
  https.get(url, up => {
    if (up.statusCode !== 200) {
      up.resume();
      res.writeHead(up.statusCode || 404);
      res.end('Not found');
      return;
    }
    const chunks = [];
    up.on('data', c => chunks.push(c));
    up.on('end', () => {
      const buf = Buffer.concat(chunks);
      try {
        fs.mkdirSync(path.dirname(localFile), { recursive: true });
        fs.writeFileSync(localFile, buf);
      } catch (e) { /* ignorar errores de escritura */ }
      const ext = path.extname(localFile).toLowerCase();
      res.writeHead(200, {
        'Content-Type': MIME[ext] || 'application/octet-stream',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=86400'
      });
      res.end(buf);
    });
  }).on('error', () => {
    res.writeHead(502);
    res.end('Upstream error');
  });
}

const server = http.createServer((req, res) => {
  const rawUrl = (req.url || '/').split('?')[0];
  let rel = decodeURIComponent(rawUrl);
  if (rel === '/' || rel === '/en' || rel === '/en/') rel = '/index.html';
  else if (rel.endsWith('/')) rel += 'index.html';

  const safeRel = path.normalize(rel).replace(/^(\.\.(\/|\\|$))+/, '').replace(/^[/\\]+/, '');
  const filePath = path.join(ROOT, safeRel);

  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  fs.stat(filePath, (err, st) => {
    if (!err && st.isFile()) {
      const ext = path.extname(filePath).toLowerCase();
      res.writeHead(200, {
        'Content-Type': MIME[ext] || 'application/octet-stream',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-cache'
      });
      fs.createReadStream(filePath).pipe(res);
      return;
    }

    // Si es un recurso dentro de assets/ que aún no está descargado, lo trae de pokesurvivor.com y lo guarda
    if (safeRel.startsWith('assets' + path.sep) || safeRel.startsWith('assets/')) {
      fetchAndCache(safeRel, filePath, res);
      return;
    }

    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('404 Not Found: ' + safeRel);
  });
});

server.listen(PORT, () => {
  console.log(`PokéSurvivor servidor listo en http://localhost:${PORT}`);
});
