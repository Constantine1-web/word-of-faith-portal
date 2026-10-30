const http = require('http');
const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'public', 'downloads', 'Word_of_Faith_Schools_Security_Architecture_v3.docx');
const PORT = 3456;

const server = http.createServer((req, res) => {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  
  if (fs.existsSync(filePath)) {
    const stat = fs.statSync(filePath);
    res.writeHead(200, {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'Content-Length': stat.size,
      'Content-Disposition': 'attachment; filename="Word_of_Faith_Schools_Security_Architecture_v3.docx"',
      'Cache-Control': 'no-cache'
    });
    fs.createReadStream(filePath).pipe(res);
  } else {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('File not found');
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Download server running at http://127.0.0.1:${PORT}/download`);
});
