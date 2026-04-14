// src/connectors/google.js
const axios = require('axios');
const fs = require('fs');
const config = require('../../config');

const ENGINE = 'google';

async function search({ imagePath, sourceFile, frameIndex = null, useTor = false }) {
  if (!config.google.apiKey || !config.google.cx) {
    return { engine: ENGINE, disabled: true, reason: 'API key not configured' };
  }

  const base64Image = fs.readFileSync(imagePath).toString('base64');
  const axiosConfig = {};
  if (useTor) {
    const { getTorAgent } = require('../tor/proxy');
    axiosConfig.httpsAgent = getTorAgent();
  }

  const res = await axios.post(
    `https://vision.googleapis.com/v1/images:annotate?key=${config.google.apiKey}`,
    {
      requests: [{
        image: { content: base64Image },
        features: [{ type: 'WEB_DETECTION', maxResults: 10 }],
      }],
    },
    axiosConfig
  );

  const webDetection = res.data.responses[0]?.webDetection || {};
  const pages = webDetection.pagesWithMatchingImages || [];
  const entities = webDetection.webEntities || [];

  return pages.map(page => ({
    engine: ENGINE,
    url: page.url,
    title: page.pageTitle || entities[0]?.description || '',
    thumbnail: page.fullMatchingImages?.[0]?.url || null,
    score: page.score || null,
    sourceFile,
    frameIndex,
  }));
}

module.exports = { search, ENGINE };
