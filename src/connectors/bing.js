// src/connectors/bing.js
const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const config = require('../../config');

const ENGINE = 'bing';
const API_URL = 'https://api.bing.microsoft.com/v7.0/images/visualsearch';

async function search({ imagePath, sourceFile, frameIndex = null, useTor = false }) {
  if (!config.bing.apiKey) {
    return { engine: ENGINE, disabled: true, reason: 'API key not configured' };
  }

  const form = new FormData();
  form.append('image', fs.createReadStream(imagePath), { filename: 'image.jpg' });

  const axiosConfig = {
    headers: {
      'Ocp-Apim-Subscription-Key': config.bing.apiKey,
      ...form.getHeaders(),
    },
  };
  if (useTor) {
    const { getTorAgent } = require('../tor/proxy');
    axiosConfig.httpsAgent = getTorAgent();
  }

  const res = await axios.post(API_URL, form, axiosConfig);
  const results = [];

  for (const tag of (res.data.tags || [])) {
    for (const action of (tag.actions || [])) {
      if (action.actionType === 'PagesIncluding') {
        for (const item of (action.data?.value || [])) {
          results.push({
            engine: ENGINE,
            url: item.hostPageUrl,
            title: item.name || '',
            thumbnail: item.thumbnailUrl || null,
            score: null,
            sourceFile,
            frameIndex,
          });
        }
      }
    }
  }
  return results;
}

module.exports = { search, ENGINE };
