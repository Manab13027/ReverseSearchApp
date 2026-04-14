// src/connectors/tineye.js
const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const config = require('../../config');

const ENGINE = 'tineye';
const API_URL = 'https://api.tineye.com/rest/search/';

async function search({ imagePath, sourceFile, frameIndex = null, useTor = false }) {
  if (!config.tineye.apiKey) {
    return { engine: ENGINE, disabled: true, reason: 'API key not configured' };
  }

  const form = new FormData();
  form.append('image', fs.createReadStream(imagePath));
  form.append('api_key', config.tineye.apiKey);
  form.append('limit', '10');

  const axiosConfig = { headers: form.getHeaders() };
  if (useTor) {
    const { getTorAgent } = require('../tor/proxy');
    axiosConfig.httpsAgent = getTorAgent();
  }

  const res = await axios.post(API_URL, form, axiosConfig);
  const matches = res.data.results?.matches || [];

  return matches.map(m => ({
    engine: ENGINE,
    url: m.image_url,
    title: m.domain || '',
    thumbnail: m.thumbnail_url || null,
    score: m.score || null,
    sourceFile,
    frameIndex,
  }));
}

module.exports = { search, ENGINE };
