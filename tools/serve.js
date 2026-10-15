// A small static server for public/, run inside the tool's own process so the checks load pages
// over HTTP the way a visitor does, with no separate server to start or stop.
//
//   const { serve } = require('./serve');  const srv = await serve();  srv.url  // http://127.0.0.1:<port>/
//   await srv.close();
//
//   node tools/serve.js [port]   serve public/ for a browser (default port 8000)
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', 'public');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8' };

function handler(req, res) {
  let rel;
  try { rel = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch { res.writeHead(400).end(); return; }
  let file = path.normalize(path.join(ROOT, rel));
  if (file !== ROOT && !file.startsWith(ROOT + path.sep)) { res.writeHead(403).end(); return; }
  if (rel.endsWith('/')) file = path.join(file, 'index.html');
  else if (fs.existsSync(file) && fs.statSync(file).isDirectory()) { res.writeHead(301, { Location: rel + '/' }).end(); return; }
  fs.readFile(file, (err, body) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain' }).end('not found'); return; }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' }).end(body);
  });
}

function serve(port = 0) {
  return new Promise((resolve, reject) => {
    const server = http.createServer(handler);
    server.on('error', reject);
    server.listen(port, '127.0.0.1', () => resolve({
      url: `http://127.0.0.1:${server.address().port}/`,
      close: () => new Promise(r => { server.closeAllConnections(); server.close(r); }),
    }));
  });
}

// tools/baselines.json is written by lab.js and review.js; both use this so the file keeps one shape:
// indented objects, with each list of plain values on one line.
const writeBaselines = (file, B) => fs.writeFileSync(file, JSON.stringify(B, null, 1).replace(/\[\n\s+([^\[\]{}]*?)\n\s+\]/g, (m, inner) => '[' + inner.split(/,\n\s+/).join(', ') + ']') + '\n');

module.exports = { serve, ROOT, writeBaselines };

if (require.main === module) serve(+process.argv[2] || 8000).then(s => console.log(`Serving public/ at ${s.url}`));
