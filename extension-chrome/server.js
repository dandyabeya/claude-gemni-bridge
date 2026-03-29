const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const PORT = 52945;
const DATA_DIR = path.join(__dirname, 'channels');

// Ensure channels directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function channelDir(channel) {
  // Sanitize channel name
  const safe = channel.replace(/[^a-zA-Z0-9_-]/g, '_');
  const dir = path.join(DATA_DIR, safe);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

function readJSON(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (e) {
    return fallback;
  }
}

function writeJSON(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const parsed = url.parse(req.url, true);
  const parts = parsed.pathname.split('/').filter(Boolean);

  // Routes: /c/<channel>/updates, /c/<channel>/response, /c/<channel>/clear
  // Legacy routes (no channel): /updates, /response, /clear — use "default" channel

  let channel = 'default';
  let action = '';

  if (parts[0] === 'c' && parts.length >= 3) {
    channel = parts[1];
    action = parts[2];
  } else if (parts.length === 1) {
    action = parts[0];
  }

  const dir = channelDir(channel);
  const updatesFile = path.join(dir, 'updates.json');
  const responseFile = path.join(dir, 'response.json');

  // GET /channels — list all channels
  if (req.method === 'GET' && action === 'channels') {
    try {
      const channels = fs.readdirSync(DATA_DIR).filter(f =>
        fs.statSync(path.join(DATA_DIR, f)).isDirectory()
      );
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(channels));
    } catch (e) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify([]));
    }
    return;
  }

  // GET updates
  if (req.method === 'GET' && action === 'updates') {
    const updates = readJSON(updatesFile, []);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(updates));
    return;
  }

  // POST updates
  if (req.method === 'POST' && action === 'updates') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const update = JSON.parse(body);
        const updates = readJSON(updatesFile, []);
        updates.push({
          id: Date.now(),
          timestamp: new Date().toISOString(),
          message: update.message || '',
          project: update.project || 'default',
          status: update.status || 'update'
        });
        writeJSON(updatesFile, updates);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid JSON' }));
      }
    });
    return;
  }

  // POST clear
  if (req.method === 'POST' && action === 'clear') {
    writeJSON(updatesFile, []);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  // POST response
  if (req.method === 'POST' && action === 'response') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const data = JSON.parse(body);
        writeJSON(responseFile, {
          response: data.response || '',
          timestamp: new Date().toISOString()
        });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid JSON' }));
      }
    });
    return;
  }

  // GET response
  if (req.method === 'GET' && action === 'response') {
    const data = readJSON(responseFile, { response: '', timestamp: null });
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
    return;
  }

  // GET health
  if (req.method === 'GET' && action === 'health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'running' }));
    return;
  }

  res.writeHead(404);
  res.end('Not found');
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Gemini Bridge server running on http://127.0.0.1:${PORT}`);
});
