const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 5500;

http.createServer((req, res) => {
    let filePath = '.' + req.url;
    
    if (filePath === './') {
        filePath = './index.html';
    } else if (req.url.startsWith('/KnowBridge-chat-widget')) {
        // Resolve requests for the widget to the parent directory
        filePath = path.join(__dirname, '..', req.url);
    } else {
        filePath = path.join(__dirname, req.url);
    }

    const extname = String(path.extname(filePath)).toLowerCase();
    const mimeTypes = {
        '.html': 'text/html',
        '.js': 'text/javascript',
        '.css': 'text/css',
        '.json': 'application/json',
        '.png': 'image/png',
        '.jpg': 'image/jpg',
        '.svg': 'image/svg+xml',
    };

    const contentType = mimeTypes[extname] || 'application/octet-stream';

    fs.readFile(filePath, (error, content) => {
        if (error) {
            if(error.code === 'ENOENT') {
                res.writeHead(404);
                res.end('404 Not Found\n');
            } else {
                res.writeHead(500);
                res.end('Server error: ' + error.code + '\n');
            }
        } else {
            res.writeHead(200, { 'Content-Type': contentType });
            res.end(content, 'utf-8');
        }
    });
}).listen(PORT, () => {
    console.log(`\n============================================`);
    console.log(`🚀 Landing Page server running successfully!`);
    console.log(`👉 Open: http://localhost:${PORT}`);
    console.log(`============================================\n`);
});
