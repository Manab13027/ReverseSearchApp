// src/video/extractor.js
const ffmpeg = require('fluent-ffmpeg');
const path = require('path');
const fs = require('fs');
const config = require('../../config');

function extractFrames(videoPath, outputDir) {
  return new Promise((resolve, reject) => {
    fs.mkdirSync(outputDir, { recursive: true });

    ffmpeg(videoPath)
      .outputOptions([
        `-vf fps=1/${config.video.frameInterval}`,
        '-vsync vfr',
      ])
      .output(path.join(outputDir, 'frame-%04d.jpg'))
      .on('end', () => {
        const frames = fs
          .readdirSync(outputDir)
          .filter(f => f.startsWith('frame-') && f.endsWith('.jpg'))
          .sort()
          .map((f, i) => ({ path: path.join(outputDir, f), index: i }));
        resolve(frames);
      })
      .on('error', reject)
      .run();
  });
}

module.exports = { extractFrames };
