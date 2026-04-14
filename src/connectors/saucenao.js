// src/connectors/saucenao.js
const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const config = require('../../config');

const ENGINE = 'saucenao';
const API_URL = 'https://saucenao.com/search.php';

async function search({ imagePath, sourceFile, frameIndex = null, useTor = false }) {
  if (!config.saucenao.apiKey) {
    return { engine: ENGINE, disabled: true, reason: 'API key not configured' };
  }

  const form = new FormData();
  form.append('file', fs.createReadStream(imagePath), { filename: 'image.jpg' });
  form.append('api_key', config.saucenao.apiKey);
  form.append('output_type', '2');
  form.append('numres', '10');

  const axiosConfig = { headers: form.getHeaders() };
  if (useTor) {
    const { getTorAgent } = require('../tor/proxy');
    axiosConfig.httpsAgent = getTorAgent();
  }

  const res = await axios.post(API_URL, form, axiosConfig);

  return (res.data.results || [])
    .map(r => ({
      engine: ENGINE,
      url: r.data?.ext_urls?.[0] || r.data?.source || '',
      title: r.header?.index_name || '',
      thumbnail: r.header?.thumbnail || null,
      score: r.header?.similarity ? parseFloat(r.header.similarity) / 100 : null,
      sourceFile,
      frameIndex,
    }))
    .filter(r => r.url);
}

module.exports = { search, ENGINE };
