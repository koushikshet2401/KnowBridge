/**
 * Minimal static server for the local widget test site.
 * Usage: node demo-site/server.js   (serves http://localhost:3000)
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.DEMO_PORT || 3000;
const ROOT = __dirname;
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' };

http.createServer((req, res) => {
  const urlPath = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  const filePath = path.join(ROOT, urlPath === '/' ? 'index.html' : urlPath);

  // Stay inside the demo-site folder
  if (!filePath.startsWith(ROOT + path.sep) || path.basename(filePath) === 'server.js') {
    res.writeHead(404).end('Not found');
    return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404).end('Not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(filePath)] || 'application/octet-stream' });
    res.end(data);
  });
}).listen(PORT, () => {
  console.log(`Demo site running at http://localhost:${PORT}`);
});
