// server.js
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const net = require('net');
const { v4: uuidv4 } = require('uuid');
const config = require('./config');
const { runSearch } = require('./src/orchestrator');

const app = express();
app.use(express.json());
app.use(express.static('public'));

const upload = multer({
  dest: 'uploads/',
  limits: { fileSize: config.upload.maxFileSize },
  fileFilter: (_req, file, cb) => {
    const allowed = /\.(jpe?g|png|gif|webp|mp4|mov|avi)$/i;
    cb(null, allowed.test(file.originalname));
  },
});

const jobs = {};

app.post('/api/search', upload.array('files', 20), (req, res) => {
  try {
    const engines = JSON.parse(req.body.engines || '[]');
    const useTor = req.body.useTor === 'true';
    const jobId = uuidv4();
    const jobDir = path.join('uploads', jobId);

    fs.mkdirSync(jobDir, { recursive: true });

    const files = req.files.map(f => {
      const dest = path.join(jobDir, f.originalname);
      fs.renameSync(f.path, dest);
      return { path: dest, originalname: f.originalname };
    });

    jobs[jobId] = { files, engines, useTor, jobDir };
    res.json({ jobId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/search/:jobId/stream', async (req, res) => {
  const job = jobs[req.params.jobId];
  if (!job) return res.status(404).json({ error: 'Job not found' });

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const send = (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

  try {
    for await (const { engine, results, error } of runSearch(job)) {
      if (error) {
        send('engineError', { engine, error });
      } else {
        results.forEach(r => send('result', r));
        send('engineDone', { engine });
      }
    }
    send('done', { jobId: req.params.jobId });
  } catch (err) {
    send('engineError', { engine: 'orchestrator', error: err.message });
  } finally {
    fs.rmSync(job.jobDir, { recursive: true, force: true });
    delete jobs[req.params.jobId];
    res.end();
  }
});

app.get('/api/tor/status', (_req, res) => {
  const sock = new net.Socket();
  const timeout = 1000;
  sock.setTimeout(timeout);
  sock.connect(config.tor.port, config.tor.host, () => {
    sock.destroy();
    res.json({ running: true });
  });
  sock.on('error', () => res.json({ running: false }));
  sock.on('timeout', () => { sock.destroy(); res.json({ running: false }); });
});

app.get('/api/config/engines', (_req, res) => {
  res.json({
    google: !!(config.google.apiKey && config.google.cx),
    tineye: !!config.tineye.apiKey,
    bing: !!config.bing.apiKey,
    saucenao: !!config.saucenao.apiKey,
    yandex: true,
    baidu: true,
  });
});

if (require.main === module) {
  app.listen(config.port, () => console.log(`REVERSE TRACE running at http://localhost:${config.port}`));
}

module.exports = app;
