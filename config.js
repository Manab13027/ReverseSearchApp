// config.js
module.exports = {
  google: {
    apiKey: process.env.GOOGLE_API_KEY || '',
    cx: process.env.GOOGLE_CX || '',
  },
  tineye: {
    apiKey: process.env.TINEYE_API_KEY || '',
  },
  bing: {
    apiKey: process.env.BING_API_KEY || '',
  },
  saucenao: {
    apiKey: process.env.SAUCENAO_API_KEY || '',
  },
  tor: {
    host: '127.0.0.1',
    port: 9050,
  },
  upload: {
    maxFileSize: 100 * 1024 * 1024,   // 100 MB per file
    maxTotalSize: 500 * 1024 * 1024,  // 500 MB per job
  },
  video: {
    frameInterval: 5,  // extract one frame every N seconds
  },
  port: process.env.PORT || 3000,
};
