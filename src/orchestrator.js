// src/orchestrator.js
const google = require('./connectors/google');
const tineye = require('./connectors/tineye');
const bing = require('./connectors/bing');
const saucenao = require('./connectors/saucenao');
const yandex = require('./connectors/yandex');
const baidu = require('./connectors/baidu');
const { extractFrames } = require('./video/extractor');
const path = require('path');

const ALL_CONNECTORS = { google, tineye, bing, saucenao, yandex, baidu };
const VIDEO_EXTENSIONS = new Set(['.mp4', '.mov', '.avi']);

async function* runSearch({ files, engines, useTor, jobDir }) {
  for (const file of files) {
    const ext = path.extname(file.path).toLowerCase();
    let imagePaths;

    if (VIDEO_EXTENSIONS.has(ext)) {
      const framesDir = path.join(jobDir, 'frames', path.basename(file.path, ext));
      const frames = await extractFrames(file.path, framesDir);
      imagePaths = frames.map(f => ({ path: f.path, frameIndex: f.index }));
    } else {
      imagePaths = [{ path: file.path, frameIndex: null }];
    }

    for (const { path: imagePath, frameIndex } of imagePaths) {
      const connectors = engines.filter(n => ALL_CONNECTORS[n]).map(n => ALL_CONNECTORS[n]);

      const tasks = connectors.map(c =>
        c.search({ imagePath, sourceFile: file.originalname, frameIndex, useTor })
          .then(results => ({ engine: c.ENGINE, results: Array.isArray(results) ? results : [], error: null }))
          .catch(err => ({ engine: c.ENGINE, results: [], error: err.message }))
      );

      const settled = await Promise.allSettled(tasks);
      for (const s of settled) {
        if (s.status === 'fulfilled') yield s.value;
      }
    }
  }
}

module.exports = { runSearch };
