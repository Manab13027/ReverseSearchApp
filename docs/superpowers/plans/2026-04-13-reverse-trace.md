# Reverse Trace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a locally-hosted web app that reverse-searches uploaded images and videos across 6 engines simultaneously, streaming results into a dark terminal-aesthetic tabbed UI.

**Architecture:** Express server receives file uploads, assigns a job ID, then streams results back via SSE as each engine connector (API or Puppeteer) returns. Videos are pre-processed with ffmpeg to extract keyframes before searching. All HTTP traffic optionally routes through a local Tor SOCKS5 proxy.

**Tech Stack:** Node.js 18+, Express 4, Multer, Puppeteer 21, fluent-ffmpeg, axios, socks-proxy-agent, form-data, uuid, Jest 29

---

## File Map

| File | Responsibility |
|---|---|
| `package.json` | Dependencies, scripts |
| `config.js` | API keys + tunable constants (reads env vars) |
| `server.js` | Express routes: POST /api/search, GET /api/search/:id/stream, static |
| `src/tor/proxy.js` | Returns SocksProxyAgent and Puppeteer launch args |
| `src/video/extractor.js` | Runs ffmpeg to extract one JPEG frame every N seconds |
| `src/connectors/google.js` | Google Vision API — web detection |
| `src/connectors/tineye.js` | TinEye REST API |
| `src/connectors/bing.js` | Bing Visual Search API |
| `src/connectors/saucenao.js` | SauceNAO REST API |
| `src/connectors/yandex.js` | Yandex Images — Puppeteer upload + scrape |
| `src/connectors/baidu.js` | Baidu Image Search — Puppeteer upload + scrape |
| `src/orchestrator.js` | Async generator: iterates files/frames, fires connectors in parallel |
| `public/index.html` | Single-page shell |
| `public/styles.css` | Dark terminal theme |
| `public/app.js` | Upload UI, SSE listener, tab/card renderer |
| `tests/tor/proxy.test.js` | Unit tests for proxy module |
| `tests/video/extractor.test.js` | Unit tests for extractor |
| `tests/connectors/*.test.js` | Unit tests per connector (axios/puppeteer mocked) |
| `tests/orchestrator.test.js` | Unit tests for orchestrator |

---

## Task 1: Project Scaffolding

**Files:**
- Create: `package.json`
- Create: `.gitignore`
- Create: `uploads/.gitkeep`

- [ ] **Step 1: Create package.json**

```json
{
  "name": "reverse-trace",
  "version": "1.0.0",
  "description": "Reverse image and video search across 6 engines",
  "main": "server.js",
  "scripts": {
    "start": "node server.js",
    "dev": "nodemon server.js",
    "test": "jest --runInBand --forceExit"
  },
  "dependencies": {
    "axios": "^1.6.0",
    "express": "^4.18.0",
    "fluent-ffmpeg": "^2.1.2",
    "form-data": "^4.0.0",
    "multer": "^1.4.5-lts.1",
    "puppeteer": "^21.0.0",
    "socks-proxy-agent": "^8.0.0",
    "uuid": "^9.0.0"
  },
  "devDependencies": {
    "jest": "^29.0.0",
    "nodemon": "^3.0.0"
  }
}
```

- [ ] **Step 2: Create .gitignore**

```
node_modules/
uploads/*
!uploads/.gitkeep
config.local.js
.env
.superpowers/
```

- [ ] **Step 3: Create folder structure and placeholder**

```bash
mkdir -p src/connectors src/video src/tor public tests/connectors tests/video tests/tor uploads
touch uploads/.gitkeep
```

- [ ] **Step 4: Install dependencies**

```bash
npm install
```

Expected: `node_modules/` created, no errors.

- [ ] **Step 5: Commit**

```bash
git init
git add package.json package-lock.json .gitignore uploads/.gitkeep
git commit -m "chore: project scaffolding"
```

---

## Task 2: Config Module

**Files:**
- Create: `config.js`

- [ ] **Step 1: Create config.js**

```js
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
```

- [ ] **Step 2: Commit**

```bash
git add config.js
git commit -m "feat: config module"
```

---

## Task 3: Tor Proxy Module

**Files:**
- Create: `src/tor/proxy.js`
- Create: `tests/tor/proxy.test.js`

- [ ] **Step 1: Write failing test**

```js
// tests/tor/proxy.test.js
const { getTorAgent, getPuppeteerTorArgs } = require('../../src/tor/proxy');

describe('getTorAgent', () => {
  it('returns an agent with correct proxy hostname', () => {
    const agent = getTorAgent();
    expect(agent).toBeDefined();
    expect(agent.proxy.hostname).toBe('127.0.0.1');
    expect(Number(agent.proxy.port)).toBe(9050);
  });
});

describe('getPuppeteerTorArgs', () => {
  it('returns socks5 proxy server arg', () => {
    const args = getPuppeteerTorArgs();
    expect(args).toContain('--proxy-server=socks5://127.0.0.1:9050');
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
npm test -- tests/tor/proxy.test.js
```

Expected: `Cannot find module '../../src/tor/proxy'`

- [ ] **Step 3: Implement proxy.js**

```js
// src/tor/proxy.js
const { SocksProxyAgent } = require('socks-proxy-agent');
const config = require('../../config');

function getTorAgent() {
  const { host, port } = config.tor;
  return new SocksProxyAgent(`socks5://${host}:${port}`);
}

function getPuppeteerTorArgs() {
  const { host, port } = config.tor;
  return [`--proxy-server=socks5://${host}:${port}`];
}

module.exports = { getTorAgent, getPuppeteerTorArgs };
```

- [ ] **Step 4: Run test — expect PASS**

```bash
npm test -- tests/tor/proxy.test.js
```

Expected: `2 passed`

- [ ] **Step 5: Commit**

```bash
git add src/tor/proxy.js tests/tor/proxy.test.js
git commit -m "feat: tor proxy module"
```

---

## Task 4: Video Frame Extractor

**Files:**
- Create: `src/video/extractor.js`
- Create: `tests/video/extractor.test.js`

- [ ] **Step 1: Write failing test**

```js
// tests/video/extractor.test.js
jest.mock('fluent-ffmpeg');

let extractFrames;

beforeEach(() => {
  jest.resetModules();
  jest.mock('fluent-ffmpeg');
  extractFrames = require('../../src/video/extractor').extractFrames;
});

const path = require('path');
const os = require('os');
const fs = require('fs');

it('calls ffmpeg with fps filter and resolves frame list', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'frames-'));
  fs.writeFileSync(path.join(tmpDir, 'frame-0001.jpg'), '');

  const runMock = jest.fn();
  const onMock = jest.fn((event, cb) => {
    if (event === 'end') setImmediate(cb);
    return { run: runMock };
  });
  const outputMock = jest.fn(() => ({ on: onMock }));
  const outputOptionsMock = jest.fn(() => ({ output: outputMock }));

  require('fluent-ffmpeg').mockReturnValue({ outputOptions: outputOptionsMock });

  const frames = await extractFrames('/fake/video.mp4', tmpDir);

  expect(outputOptionsMock).toHaveBeenCalledWith(
    expect.arrayContaining([expect.stringContaining('fps=1/')])
  );
  expect(frames).toHaveLength(1);
  expect(frames[0]).toMatchObject({ index: 0 });

  fs.rmSync(tmpDir, { recursive: true });
});
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
npm test -- tests/video/extractor.test.js
```

Expected: `Cannot find module '../../src/video/extractor'`

- [ ] **Step 3: Implement extractor.js**

```js
// src/video/extractor.js
const ffmpeg = require('fluent-ffmpeg');
const path = require('path');
const fs = require('fs');
const config = require('../../config');

/**
 * Extract one JPEG frame every config.video.frameInterval seconds.
 * @param {string} videoPath  Absolute path to the video file
 * @param {string} outputDir  Directory to write frame JPEGs into
 * @returns {Promise<Array<{path: string, index: number}>>}
 */
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
```

- [ ] **Step 4: Run test — expect PASS**

```bash
npm test -- tests/video/extractor.test.js
```

Expected: `1 passed`

- [ ] **Step 5: Commit**

```bash
git add src/video/extractor.js tests/video/extractor.test.js
git commit -m "feat: video frame extractor"
```

---

## Task 5: Google Vision Connector

**Files:**
- Create: `src/connectors/google.js`
- Create: `tests/connectors/google.test.js`

- [ ] **Step 1: Write failing test**

```js
// tests/connectors/google.test.js
jest.mock('axios');
jest.mock('fs');
const axios = require('axios');
const fs = require('fs');

fs.readFileSync = jest.fn().mockReturnValue(Buffer.from('fake-image'));

const mockVisionResponse = {
  data: {
    responses: [{
      webDetection: {
        pagesWithMatchingImages: [
          {
            url: 'https://example.com/page',
            pageTitle: 'Example',
            score: 0.98,
            fullMatchingImages: [{ url: 'https://example.com/thumb.jpg' }],
          },
        ],
        webEntities: [{ description: 'Test entity' }],
      },
    }],
  },
};

it('returns normalized results from Vision API', async () => {
  axios.post.mockResolvedValue(mockVisionResponse);
  jest.resetModules();
  jest.mock('axios');
  jest.mock('fs');
  require('fs').readFileSync = jest.fn().mockReturnValue(Buffer.from('img'));
  require('axios').post = jest.fn().mockResolvedValue(mockVisionResponse);
  jest.mock('../../config', () => ({ google: { apiKey: 'k', cx: 'cx' } }));

  const { search } = require('../../src/connectors/google');
  const results = await search({ imagePath: '/fake/img.jpg', sourceFile: 'img.jpg', frameIndex: null, useTor: false });

  expect(Array.isArray(results)).toBe(true);
  expect(results[0]).toMatchObject({
    engine: 'google',
    url: 'https://example.com/page',
    title: 'Example',
    score: 0.98,
    sourceFile: 'img.jpg',
    frameIndex: null,
  });
});

it('returns disabled object when API key missing', async () => {
  jest.resetModules();
  jest.mock('../../config', () => ({ google: { apiKey: '', cx: '' } }));
  const { search } = require('../../src/connectors/google');
  const result = await search({ imagePath: '/fake/img.jpg', sourceFile: 'img.jpg', frameIndex: null, useTor: false });
  expect(result).toMatchObject({ engine: 'google', disabled: true });
});
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
npm test -- tests/connectors/google.test.js
```

Expected: `Cannot find module '../../src/connectors/google'`

- [ ] **Step 3: Implement google.js**

```js
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
```

- [ ] **Step 4: Run test — expect PASS**

```bash
npm test -- tests/connectors/google.test.js
```

Expected: `2 passed`

- [ ] **Step 5: Commit**

```bash
git add src/connectors/google.js tests/connectors/google.test.js
git commit -m "feat: google vision connector"
```

---

## Task 6: TinEye Connector

**Files:**
- Create: `src/connectors/tineye.js`
- Create: `tests/connectors/tineye.test.js`

- [ ] **Step 1: Write failing test**

```js
// tests/connectors/tineye.test.js
const mockResponse = {
  data: {
    results: {
      matches: [
        { image_url: 'https://site.com/img.jpg', domain: 'site.com', score: 0.95, thumbnail_url: 'https://site.com/thumb.jpg' },
      ],
    },
  },
};

it('returns normalized results', async () => {
  jest.resetModules();
  jest.mock('axios', () => ({ post: jest.fn().mockResolvedValue(mockResponse) }));
  jest.mock('fs', () => ({ createReadStream: jest.fn().mockReturnValue('stream') }));
  jest.mock('../../config', () => ({ tineye: { apiKey: 'test-key' } }));
  const { search } = require('../../src/connectors/tineye');
  const results = await search({ imagePath: '/fake/img.jpg', sourceFile: 'img.jpg', frameIndex: null, useTor: false });
  expect(results[0]).toMatchObject({ engine: 'tineye', url: 'https://site.com/img.jpg', score: 0.95 });
});

it('returns disabled when no API key', async () => {
  jest.resetModules();
  jest.mock('../../config', () => ({ tineye: { apiKey: '' } }));
  const { search } = require('../../src/connectors/tineye');
  const result = await search({ imagePath: '/fake/img.jpg', sourceFile: 'img.jpg', frameIndex: null, useTor: false });
  expect(result).toMatchObject({ disabled: true });
});
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
npm test -- tests/connectors/tineye.test.js
```

- [ ] **Step 3: Implement tineye.js**

```js
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
```

- [ ] **Step 4: Run test — expect PASS**

```bash
npm test -- tests/connectors/tineye.test.js
```

- [ ] **Step 5: Commit**

```bash
git add src/connectors/tineye.js tests/connectors/tineye.test.js
git commit -m "feat: tineye connector"
```

---

## Task 7: Bing Visual Search Connector

**Files:**
- Create: `src/connectors/bing.js`
- Create: `tests/connectors/bing.test.js`

- [ ] **Step 1: Write failing test**

```js
// tests/connectors/bing.test.js
const mockResponse = {
  data: {
    tags: [{
      actions: [{
        actionType: 'PagesIncluding',
        data: {
          value: [
            { hostPageUrl: 'https://page.com', name: 'Page Title', thumbnailUrl: 'https://page.com/thumb.jpg' },
          ],
        },
      }],
    }],
  },
};

it('returns normalized results', async () => {
  jest.resetModules();
  jest.mock('axios', () => ({ post: jest.fn().mockResolvedValue(mockResponse) }));
  jest.mock('fs', () => ({ createReadStream: jest.fn().mockReturnValue('stream') }));
  jest.mock('../../config', () => ({ bing: { apiKey: 'test-key' } }));
  const { search } = require('../../src/connectors/bing');
  const results = await search({ imagePath: '/fake/img.jpg', sourceFile: 'img.jpg', frameIndex: null, useTor: false });
  expect(results[0]).toMatchObject({ engine: 'bing', url: 'https://page.com', title: 'Page Title' });
});

it('returns disabled when no API key', async () => {
  jest.resetModules();
  jest.mock('../../config', () => ({ bing: { apiKey: '' } }));
  const { search } = require('../../src/connectors/bing');
  const result = await search({ imagePath: '/fake/img.jpg', sourceFile: 'img.jpg', frameIndex: null, useTor: false });
  expect(result).toMatchObject({ disabled: true });
});
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
npm test -- tests/connectors/bing.test.js
```

- [ ] **Step 3: Implement bing.js**

```js
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
```

- [ ] **Step 4: Run test — expect PASS**

```bash
npm test -- tests/connectors/bing.test.js
```

- [ ] **Step 5: Commit**

```bash
git add src/connectors/bing.js tests/connectors/bing.test.js
git commit -m "feat: bing visual search connector"
```

---

## Task 8: SauceNAO Connector

**Files:**
- Create: `src/connectors/saucenao.js`
- Create: `tests/connectors/saucenao.test.js`

- [ ] **Step 1: Write failing test**

```js
// tests/connectors/saucenao.test.js
const mockResponse = {
  data: {
    results: [
      {
        header: { similarity: '92.50', thumbnail: 'https://saucenao.com/thumb.jpg', index_name: 'Pixiv' },
        data: { ext_urls: ['https://pixiv.net/artworks/123'] },
      },
    ],
  },
};

it('returns results with score as 0-1 float', async () => {
  jest.resetModules();
  jest.mock('axios', () => ({ post: jest.fn().mockResolvedValue(mockResponse) }));
  jest.mock('fs', () => ({ createReadStream: jest.fn().mockReturnValue('stream') }));
  jest.mock('../../config', () => ({ saucenao: { apiKey: 'test-key' } }));
  const { search } = require('../../src/connectors/saucenao');
  const results = await search({ imagePath: '/fake/img.jpg', sourceFile: 'img.jpg', frameIndex: null, useTor: false });
  expect(results[0]).toMatchObject({
    engine: 'saucenao',
    url: 'https://pixiv.net/artworks/123',
    score: 0.925,
    title: 'Pixiv',
  });
});

it('returns disabled when no API key', async () => {
  jest.resetModules();
  jest.mock('../../config', () => ({ saucenao: { apiKey: '' } }));
  const { search } = require('../../src/connectors/saucenao');
  const result = await search({ imagePath: '/fake/img.jpg', sourceFile: 'img.jpg', frameIndex: null, useTor: false });
  expect(result).toMatchObject({ disabled: true });
});
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
npm test -- tests/connectors/saucenao.test.js
```

- [ ] **Step 3: Implement saucenao.js**

```js
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
```

- [ ] **Step 4: Run test — expect PASS**

```bash
npm test -- tests/connectors/saucenao.test.js
```

- [ ] **Step 5: Commit**

```bash
git add src/connectors/saucenao.js tests/connectors/saucenao.test.js
git commit -m "feat: saucenao connector"
```

---

## Task 9: Yandex Connector (Puppeteer)

**Files:**
- Create: `src/connectors/yandex.js`
- Create: `tests/connectors/yandex.test.js`

- [ ] **Step 1: Write failing test**

```js
// tests/connectors/yandex.test.js
jest.mock('puppeteer');
const puppeteer = require('puppeteer');

const mockEvaluate = jest.fn().mockResolvedValue([
  { url: 'https://result.com/page', title: 'Result Page', thumbnail: 'https://result.com/thumb.jpg' },
]);
const mockPage = {
  setUserAgent: jest.fn().mockResolvedValue(),
  goto: jest.fn().mockResolvedValue(),
  click: jest.fn().mockResolvedValue(),
  waitForSelector: jest.fn().mockResolvedValue(),
  waitForNavigation: jest.fn().mockResolvedValue(),
  $: jest.fn().mockResolvedValue({ uploadFile: jest.fn().mockResolvedValue() }),
  evaluate: mockEvaluate,
};
const mockBrowser = {
  newPage: jest.fn().mockResolvedValue(mockPage),
  close: jest.fn().mockResolvedValue(),
};
puppeteer.launch.mockResolvedValue(mockBrowser);

it('returns normalized results from Yandex', async () => {
  const { search } = require('../../src/connectors/yandex');
  const results = await search({ imagePath: '/fake/img.jpg', sourceFile: 'img.jpg', frameIndex: null, useTor: false });
  expect(puppeteer.launch).toHaveBeenCalledWith(expect.objectContaining({ headless: 'new' }));
  expect(results[0]).toMatchObject({ engine: 'yandex', url: 'https://result.com/page', score: null });
});

it('closes browser even on navigation error', async () => {
  mockPage.goto.mockRejectedValueOnce(new Error('navigation failed'));
  const { search } = require('../../src/connectors/yandex');
  await expect(
    search({ imagePath: '/fake/img.jpg', sourceFile: 'img.jpg', frameIndex: null, useTor: false })
  ).rejects.toThrow('navigation failed');
  expect(mockBrowser.close).toHaveBeenCalled();
});
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
npm test -- tests/connectors/yandex.test.js
```

- [ ] **Step 3: Implement yandex.js**

```js
// src/connectors/yandex.js
const puppeteer = require('puppeteer');

const ENGINE = 'yandex';

async function search({ imagePath, sourceFile, frameIndex = null, useTor = false }) {
  const args = ['--no-sandbox', '--disable-setuid-sandbox'];
  if (useTor) {
    const { getPuppeteerTorArgs } = require('../tor/proxy');
    args.push(...getPuppeteerTorArgs());
  }

  const browser = await puppeteer.launch({ headless: 'new', args });
  try {
    const page = await browser.newPage();
    await page.setUserAgent(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );
    await page.goto('https://yandex.com/images/search', { waitUntil: 'networkidle2', timeout: 30000 });
    await page.click('[data-bem*="cbir-button"], .cbir-panel__open-btn');
    await page.waitForSelector('input[type="file"]', { timeout: 8000 });

    const fileInput = await page.$('input[type="file"]');
    await fileInput.uploadFile(imagePath);
    await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 });

    const raw = await page.evaluate(() =>
      Array.from(document.querySelectorAll('.serp-item')).slice(0, 10).map(item => {
        const link = item.querySelector('a.serp-item__title-link, a[href]');
        const img = item.querySelector('img');
        return {
          url: link ? link.href : '',
          title: link ? link.textContent.trim() : '',
          thumbnail: img ? img.src : null,
        };
      }).filter(r => r.url && r.url.indexOf('yandex.') === -1)
    );

    return raw.map(r => ({ engine: ENGINE, ...r, score: null, sourceFile, frameIndex }));
  } finally {
    await browser.close();
  }
}

module.exports = { search, ENGINE };
```

- [ ] **Step 4: Run test — expect PASS**

```bash
npm test -- tests/connectors/yandex.test.js
```

- [ ] **Step 5: Commit**

```bash
git add src/connectors/yandex.js tests/connectors/yandex.test.js
git commit -m "feat: yandex puppeteer connector"
```

---

## Task 10: Baidu Connector (Puppeteer)

**Files:**
- Create: `src/connectors/baidu.js`
- Create: `tests/connectors/baidu.test.js`

- [ ] **Step 1: Write failing test**

```js
// tests/connectors/baidu.test.js
jest.mock('puppeteer');
const puppeteer = require('puppeteer');

const mockEvaluate = jest.fn().mockResolvedValue([
  { url: 'https://baidu-result.com', title: 'Baidu Result', thumbnail: null },
]);
const mockPage = {
  setUserAgent: jest.fn().mockResolvedValue(),
  goto: jest.fn().mockResolvedValue(),
  click: jest.fn().mockResolvedValue(),
  waitForSelector: jest.fn().mockResolvedValue(),
  waitForNavigation: jest.fn().mockResolvedValue(),
  $: jest.fn().mockResolvedValue({ uploadFile: jest.fn().mockResolvedValue() }),
  evaluate: mockEvaluate,
};
const mockBrowser = {
  newPage: jest.fn().mockResolvedValue(mockPage),
  close: jest.fn().mockResolvedValue(),
};
puppeteer.launch.mockResolvedValue(mockBrowser);

it('returns normalized results from Baidu', async () => {
  const { search } = require('../../src/connectors/baidu');
  const results = await search({ imagePath: '/fake/img.jpg', sourceFile: 'img.jpg', frameIndex: null, useTor: false });
  expect(results[0]).toMatchObject({ engine: 'baidu', url: 'https://baidu-result.com', score: null });
});
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
npm test -- tests/connectors/baidu.test.js
```

- [ ] **Step 3: Implement baidu.js**

```js
// src/connectors/baidu.js
const puppeteer = require('puppeteer');

const ENGINE = 'baidu';

async function search({ imagePath, sourceFile, frameIndex = null, useTor = false }) {
  const args = ['--no-sandbox', '--disable-setuid-sandbox'];
  if (useTor) {
    const { getPuppeteerTorArgs } = require('../tor/proxy');
    args.push(...getPuppeteerTorArgs());
  }

  const browser = await puppeteer.launch({ headless: 'new', args });
  try {
    const page = await browser.newPage();
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );
    await page.goto('https://image.baidu.com/', { waitUntil: 'networkidle2', timeout: 30000 });
    await page.click('.soutu-btn, [data-module="searchbox"] .soutu-btn');
    await page.waitForSelector('input[type="file"]', { timeout: 8000 });

    const fileInput = await page.$('input[type="file"]');
    await fileInput.uploadFile(imagePath);
    await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 });

    const raw = await page.evaluate(() =>
      Array.from(document.querySelectorAll('.result-list .result, .imgitem')).slice(0, 10).map(item => {
        const link = item.querySelector('a');
        const img = item.querySelector('img');
        const titleEl = item.querySelector('.result-title, h3, .imgitem-title');
        return {
          url: link ? link.href : '',
          title: titleEl ? titleEl.textContent.trim() : '',
          thumbnail: img ? img.src : null,
        };
      }).filter(r => r.url)
    );

    return raw.map(r => ({ engine: ENGINE, ...r, score: null, sourceFile, frameIndex }));
  } finally {
    await browser.close();
  }
}

module.exports = { search, ENGINE };
```

- [ ] **Step 4: Run test — expect PASS**

```bash
npm test -- tests/connectors/baidu.test.js
```

- [ ] **Step 5: Commit**

```bash
git add src/connectors/baidu.js tests/connectors/baidu.test.js
git commit -m "feat: baidu puppeteer connector"
```

---

## Task 11: Search Orchestrator

**Files:**
- Create: `src/orchestrator.js`
- Create: `tests/orchestrator.test.js`

- [ ] **Step 1: Write failing test**

```js
// tests/orchestrator.test.js
jest.mock('../src/connectors/google', () => ({
  ENGINE: 'google',
  search: jest.fn().mockResolvedValue([
    { engine: 'google', url: 'https://g.com', title: 'G', thumbnail: null, score: 0.9, sourceFile: 'img.jpg', frameIndex: null },
  ]),
}));
jest.mock('../src/connectors/tineye', () => ({ ENGINE: 'tineye', search: jest.fn().mockResolvedValue([]) }));
jest.mock('../src/connectors/bing', () => ({ ENGINE: 'bing', search: jest.fn().mockResolvedValue([]) }));
jest.mock('../src/connectors/saucenao', () => ({ ENGINE: 'saucenao', search: jest.fn().mockResolvedValue([]) }));
jest.mock('../src/connectors/yandex', () => ({ ENGINE: 'yandex', search: jest.fn().mockResolvedValue([]) }));
jest.mock('../src/connectors/baidu', () => ({ ENGINE: 'baidu', search: jest.fn().mockResolvedValue([]) }));
jest.mock('../src/video/extractor', () => ({ extractFrames: jest.fn().mockResolvedValue([]) }));

const { runSearch } = require('../src/orchestrator');

it('yields engine results for image files', async () => {
  const files = [{ path: '/fake/img.jpg', originalname: 'img.jpg' }];
  const yielded = [];
  for await (const chunk of runSearch({ files, engines: ['google'], useTor: false, jobDir: '/tmp/job' })) {
    yielded.push(chunk);
  }
  expect(yielded.length).toBeGreaterThan(0);
  expect(yielded[0]).toMatchObject({ engine: 'google' });
});

it('calls extractFrames for video files', async () => {
  const { extractFrames } = require('../src/video/extractor');
  const files = [{ path: '/fake/clip.mp4', originalname: 'clip.mp4' }];
  for await (const _ of runSearch({ files, engines: ['google'], useTor: false, jobDir: '/tmp/job' })) {}
  expect(extractFrames).toHaveBeenCalledWith('/fake/clip.mp4', expect.stringContaining('frames'));
});
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
npm test -- tests/orchestrator.test.js
```

- [ ] **Step 3: Implement orchestrator.js**

```js
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
```

- [ ] **Step 4: Run test — expect PASS**

```bash
npm test -- tests/orchestrator.test.js
```

- [ ] **Step 5: Commit**

```bash
git add src/orchestrator.js tests/orchestrator.test.js
git commit -m "feat: search orchestrator"
```

---

## Task 12: Express Server

**Files:**
- Create: `server.js`

- [ ] **Step 1: Implement server.js**

```js
// server.js
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
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
```

- [ ] **Step 2: Smoke test the server starts**

```bash
node server.js &
sleep 2
curl http://localhost:3000/api/config/engines
kill %1
```

Expected: `{"google":false,"tineye":false,"bing":false,"saucenao":false,"yandex":true,"baidu":true}`

- [ ] **Step 3: Commit**

```bash
git add server.js
git commit -m "feat: express server with upload and SSE endpoints"
```

---

## Task 13: Frontend HTML and CSS

**Files:**
- Create: `public/index.html`
- Create: `public/styles.css`

- [ ] **Step 1: Create index.html**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>REVERSE TRACE</title>
  <link rel="stylesheet" href="styles.css">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Share+Tech+Mono&family=Orbitron:wght@400;700;900&family=JetBrains+Mono:wght@400;600&display=swap" rel="stylesheet">
</head>
<body>
  <div class="topbar">
    <div class="logo">REVERSE TRACE</div>
    <div class="tor-row">
      <span class="tor-label">TOR PROXY</span>
      <div class="toggle-pill" id="torToggle">
        <span class="pill-opt" data-val="on">ON</span>
        <span class="pill-opt active" data-val="off">OFF</span>
      </div>
    </div>
  </div>

  <div class="upload-zone" id="dropZone">
    <div class="upload-icon">drop</div>
    <div class="upload-title">DROP FILES TO SCAN</div>
    <div class="upload-sub">JPG / PNG / GIF / WEBP / MP4 / MOV / AVI -- multiple files supported</div>
    <button class="btn-browse" id="browseBtn">[ BROWSE FILES ]</button>
    <input type="file" id="fileInput" multiple accept=".jpg,.jpeg,.png,.gif,.webp,.mp4,.mov,.avi" style="display:none">
  </div>

  <div class="file-queue" id="fileQueue"></div>

  <div class="engine-row">
    <span class="engine-label">ENGINES:</span>
    <div id="engineChips"></div>
  </div>

  <button class="btn-search" id="scanBtn">INITIATE SCAN</button>

  <div class="results-container" id="resultsContainer" style="display:none">
    <div class="file-tabs" id="fileTabs"></div>
    <div class="engine-tabs" id="engineTabs"></div>
    <div class="results-grid" id="resultsGrid"></div>
    <div class="statusbar">
      <span id="statusLeft">STANDBY</span>
      <span id="statusTor"></span>
    </div>
  </div>

  <script src="app.js"></script>
</body>
</html>
```

- [ ] **Step 2: Create styles.css**

```css
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

body {
  background: #050510;
  color: #e0e0e0;
  font-family: 'JetBrains Mono', monospace;
  font-size: 13px;
  padding: 1rem;
  min-height: 100vh;
}

body::before {
  content: '';
  position: fixed;
  inset: 0;
  background: repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,255,100,0.012) 2px, rgba(0,255,100,0.012) 4px);
  pointer-events: none;
  z-index: 999;
}

.topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.6rem 1rem;
  background: #0a0a1a;
  border-bottom: 1px solid #00ff9950;
  border-radius: 4px 4px 0 0;
  margin-bottom: 1rem;
}

.logo {
  font-family: 'Orbitron', monospace;
  font-weight: 900;
  font-size: 1.1em;
  letter-spacing: 4px;
  color: #00ff99;
  text-shadow: 0 0 10px #00ff99, 0 0 22px #00ff9950;
}

.tor-row { display: flex; align-items: center; gap: 0.5rem; }
.tor-label { font-family: 'Share Tech Mono', monospace; font-size: 0.8em; color: #888; letter-spacing: 1px; }

.toggle-pill {
  background: #111;
  border: 1px solid #00ff9950;
  border-radius: 20px;
  display: flex;
  overflow: hidden;
  cursor: pointer;
}

.pill-opt { padding: 3px 12px; font-size: 0.78em; font-family: 'Share Tech Mono', monospace; color: #555; }
.pill-opt.active { background: #00ff99; color: #000; font-weight: bold; box-shadow: 0 0 8px #00ff99; }

.upload-zone {
  border: 1px dashed #00ff9960;
  border-radius: 6px;
  padding: 1.75rem;
  text-align: center;
  background: #0a0a1a;
  margin-bottom: 1rem;
  transition: border-color 0.2s, background 0.2s;
}

.upload-zone.drag-over { border-color: #00ff99; background: #0a1a0a; }
.upload-icon { font-size: 2em; margin-bottom: 0.5rem; color: #00ff9960; }
.upload-title { font-family: 'Orbitron', monospace; font-size: 0.85em; letter-spacing: 2px; color: #00ff99; margin-bottom: 0.3rem; }
.upload-sub { color: #555; font-size: 0.78em; margin-bottom: 0.75rem; font-family: 'Share Tech Mono', monospace; }

.btn-browse {
  background: transparent;
  border: 1px solid #00ff99;
  color: #00ff99;
  padding: 6px 20px;
  border-radius: 3px;
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.8em;
  letter-spacing: 1px;
  cursor: pointer;
  text-shadow: 0 0 6px #00ff9980;
  box-shadow: 0 0 8px #00ff9920;
  transition: all 0.2s;
}

.btn-browse:hover { background: #00ff9915; box-shadow: 0 0 14px #00ff9950; }

.file-queue { display: flex; gap: 0.5rem; flex-wrap: wrap; margin-bottom: 0.75rem; }

.file-chip {
  background: #0d0d20;
  border: 1px solid #00e5ff50;
  border-radius: 4px;
  padding: 4px 10px;
  display: flex;
  align-items: center;
  gap: 6px;
  font-family: 'Share Tech Mono', monospace;
  font-size: 0.8em;
  color: #00e5ff;
}

.chip-remove { color: #ff4d6d; cursor: pointer; margin-left: 4px; }
.chip-remove:hover { color: #ff0040; }

.engine-row { display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; margin-bottom: 0.75rem; }
.engine-label { color: #555; font-family: 'Share Tech Mono', monospace; font-size: 0.78em; letter-spacing: 1px; }
#engineChips { display: flex; gap: 0.5rem; flex-wrap: wrap; }

.engine-chip {
  border-radius: 3px;
  padding: 4px 12px;
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.75em;
  cursor: pointer;
  border: 1px solid transparent;
  letter-spacing: 0.5px;
  user-select: none;
  transition: all 0.15s;
}

.engine-chip.on { background: #0d1a0d; border-color: #39ff1480; color: #39ff14; box-shadow: 0 0 6px #39ff1420; }
.engine-chip.off { background: #111; border-color: #2a2a2a; color: #444; }
.engine-chip.disabled-key { opacity: 0.4; cursor: not-allowed; }

.btn-search {
  background: transparent;
  border: 1px solid #ff00ff;
  color: #ff00ff;
  padding: 8px 28px;
  border-radius: 3px;
  font-family: 'Orbitron', monospace;
  font-size: 0.82em;
  letter-spacing: 2px;
  cursor: pointer;
  text-shadow: 0 0 8px #ff00ff80;
  box-shadow: 0 0 12px #ff00ff20;
  margin-bottom: 1rem;
  transition: all 0.2s;
}

.btn-search:hover { background: #ff00ff12; box-shadow: 0 0 20px #ff00ff50; }
.btn-search:disabled { opacity: 0.4; cursor: not-allowed; }

.results-container { border: 1px solid #1a1a3a; border-radius: 6px; overflow: hidden; background: #080818; }

.file-tabs { display: flex; background: #050510; border-bottom: 1px solid #1a1a3a; overflow-x: auto; }
.file-tab { padding: 7px 18px; font-family: 'Share Tech Mono', monospace; font-size: 0.78em; color: #555; cursor: pointer; border-right: 1px solid #1a1a3a; white-space: nowrap; }
.file-tab:hover { color: #888; }
.file-tab.active { color: #00e5ff; background: #0a0a1a; border-bottom: 2px solid #00e5ff; text-shadow: 0 0 6px #00e5ff70; }
.frame-badge { color: #ff00ff; font-size: 0.85em; margin-left: 4px; }

.engine-tabs { display: flex; background: #0a0a1a; border-bottom: 1px solid #1a1a3a; padding: 0 0.5rem; overflow-x: auto; }
.engine-tab { padding: 5px 14px; font-family: 'JetBrains Mono', monospace; font-size: 0.75em; color: #444; cursor: pointer; white-space: nowrap; }
.engine-tab.active { color: #39ff14; border-bottom: 2px solid #39ff14; text-shadow: 0 0 6px #39ff1450; }
.engine-tab.loading { color: #666; }
.engine-tab.error { color: #ff4d6d; }

.results-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 0.6rem; padding: 0.75rem; min-height: 120px; }

.result-card {
  border: 1px solid #1a1a3a;
  border-radius: 4px;
  overflow: hidden;
  cursor: pointer;
  text-decoration: none;
  display: block;
  transition: border-color 0.2s, box-shadow 0.2s;
  background: #0a0a1a;
}

.result-card:hover { border-color: #39ff1460; box-shadow: 0 0 10px #39ff1415; }

.card-thumb {
  background: #111128;
  height: 90px;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.card-thumb img { width: 100%; height: 100%; object-fit: cover; }
.card-no-thumb { color: #2a2a4a; font-size: 0.7em; font-family: 'Share Tech Mono', monospace; }

.card-info { padding: 0.4rem 0.5rem; }
.card-url { color: #00e5ff; font-size: 0.72em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; display: block; }
.card-score { color: #39ff14; font-size: 0.68em; margin-top: 2px; font-family: 'Share Tech Mono', monospace; }

.no-results { color: #333; font-family: 'Share Tech Mono', monospace; font-size: 0.82em; padding: 1.5rem; text-align: center; grid-column: 1 / -1; }

.statusbar { display: flex; justify-content: space-between; padding: 0.35rem 0.75rem; background: #050510; border-top: 1px solid #1a1a3a; font-family: 'Share Tech Mono', monospace; font-size: 0.7em; color: #444; }
.status-ok { color: #39ff14; }
.status-tor { color: #00ff99; }
```

- [ ] **Step 3: Commit**

```bash
git add public/index.html public/styles.css
git commit -m "feat: frontend HTML and dark theme CSS"
```

---

## Task 14: Frontend JavaScript

**Files:**
- Create: `public/app.js`

**Security note:** All result data (URLs, titles, thumbnails) is placed into the DOM using `setAttribute`, `textContent`, and `createElement` — never via `innerHTML` with external data — to prevent XSS.

- [ ] **Step 1: Create app.js**

```js
// public/app.js
'use strict';

const ENGINE_NAMES = ['google', 'yandex', 'tineye', 'bing', 'saucenao', 'baidu'];

const state = {
  files: [],
  engines: {},
  useTor: false,
  activeFile: null,
  activeEngine: null,
  results: {},        // results[filename][engine] = [result, ...]
  engineStatus: {},   // engineStatus[filename][engine] = 'loading'|'done'|'error'
};

// ── Boot ───────────────────────────────────────────────────────────────────
async function boot() {
  const cfg = await fetch('/api/config/engines').then(r => r.json());
  ENGINE_NAMES.forEach(name => { state.engines[name] = true; });
  renderEngineChips(cfg);
  bindEvents();
}

// ── Engine chips ───────────────────────────────────────────────────────────
function renderEngineChips(cfg) {
  const container = document.getElementById('engineChips');
  container.textContent = '';
  ENGINE_NAMES.forEach(name => {
    const hasKey = cfg[name];
    const chip = document.createElement('span');
    chip.className = 'engine-chip ' + (state.engines[name] ? 'on' : 'off') + (hasKey === false ? ' disabled-key' : '');
    chip.dataset.engine = name;
    if (hasKey === false) chip.title = 'API key not configured';
    chip.textContent = (state.engines[name] ? '\u2713 ' : '') + name.toUpperCase();
    if (hasKey !== false) chip.addEventListener('click', () => toggleEngine(name, cfg));
    container.appendChild(chip);
  });
}

function toggleEngine(name, cfg) {
  state.engines[name] = !state.engines[name];
  const chip = document.querySelector('.engine-chip[data-engine="' + name + '"]');
  chip.className = 'engine-chip ' + (state.engines[name] ? 'on' : 'off');
  chip.textContent = (state.engines[name] ? '\u2713 ' : '') + name.toUpperCase();
}

// ── Tor toggle ────────────────────────────────────────────────────────────
function bindTorToggle() {
  document.getElementById('torToggle').addEventListener('click', function(e) {
    const opt = e.target.closest('.pill-opt');
    if (!opt) return;
    state.useTor = opt.dataset.val === 'on';
    document.querySelectorAll('.pill-opt').forEach(el => el.classList.remove('active'));
    opt.classList.add('active');
    const torStatus = document.getElementById('statusTor');
    torStatus.textContent = '';
    if (state.useTor) {
      const span = document.createElement('span');
      span.className = 'status-tor';
      span.textContent = 'TOR ACTIVE';
      torStatus.appendChild(span);
    }
  });
}

// ── File handling ─────────────────────────────────────────────────────────
function bindDropZone() {
  const zone = document.getElementById('dropZone');
  zone.addEventListener('dragover', function(e) { e.preventDefault(); zone.classList.add('drag-over'); });
  zone.addEventListener('dragleave', function() { zone.classList.remove('drag-over'); });
  zone.addEventListener('drop', function(e) {
    e.preventDefault();
    zone.classList.remove('drag-over');
    addFiles(Array.from(e.dataTransfer.files));
  });
  document.getElementById('browseBtn').addEventListener('click', function() {
    document.getElementById('fileInput').click();
  });
  document.getElementById('fileInput').addEventListener('change', function(e) {
    addFiles(Array.from(e.target.files));
    e.target.value = '';
  });
}

function addFiles(newFiles) {
  newFiles.forEach(function(f) {
    if (!state.files.find(function(x) { return x.name === f.name && x.size === f.size; })) {
      state.files.push(f);
    }
  });
  renderFileQueue();
}

function renderFileQueue() {
  const queue = document.getElementById('fileQueue');
  queue.textContent = '';
  state.files.forEach(function(f, i) {
    const isVideo = /\.(mp4|mov|avi)$/i.test(f.name);
    const chip = document.createElement('div');
    chip.className = 'file-chip';

    const icon = document.createElement('span');
    icon.textContent = isVideo ? '[vid]' : '[img]';

    const name = document.createElement('span');
    name.textContent = f.name;

    const remove = document.createElement('span');
    remove.className = 'chip-remove';
    remove.textContent = 'x';
    remove.dataset.idx = String(i);
    remove.addEventListener('click', function() {
      state.files.splice(Number(remove.dataset.idx), 1);
      renderFileQueue();
    });

    chip.appendChild(icon);
    chip.appendChild(name);
    chip.appendChild(remove);
    queue.appendChild(chip);
  });
}

// ── Scan ──────────────────────────────────────────────────────────────────
function bindScan() {
  document.getElementById('scanBtn').addEventListener('click', startScan);
}

async function startScan() {
  if (!state.files.length) return;
  const selectedEngines = ENGINE_NAMES.filter(function(n) { return state.engines[n]; });
  if (!selectedEngines.length) return;

  state.results = {};
  state.engineStatus = {};
  state.activeFile = state.files[0].name;
  state.activeEngine = selectedEngines[0];

  state.files.forEach(function(f) {
    state.results[f.name] = {};
    state.engineStatus[f.name] = {};
    selectedEngines.forEach(function(e) {
      state.results[f.name][e] = [];
      state.engineStatus[f.name][e] = 'loading';
    });
  });

  document.getElementById('scanBtn').disabled = true;
  document.getElementById('resultsContainer').style.display = 'block';
  renderFileTabs();
  renderEngineTabs();
  renderGrid();

  const form = new FormData();
  state.files.forEach(function(f) { form.append('files', f); });
  form.append('engines', JSON.stringify(selectedEngines));
  form.append('useTor', String(state.useTor));

  const res = await fetch('/api/search', { method: 'POST', body: form });
  const { jobId } = await res.json();

  const sse = new EventSource('/api/search/' + jobId + '/stream');

  sse.addEventListener('result', function(e) {
    const r = JSON.parse(e.data);
    if (state.results[r.sourceFile] && state.results[r.sourceFile][r.engine]) {
      state.results[r.sourceFile][r.engine].push(r);
    }
    if (state.activeFile === r.sourceFile && state.activeEngine === r.engine) {
      appendCard(r);
    }
    refreshEngineTabLabel(r.sourceFile, r.engine);
  });

  sse.addEventListener('engineDone', function(e) {
    const { engine } = JSON.parse(e.data);
    state.files.forEach(function(f) {
      if (state.engineStatus[f.name] && state.engineStatus[f.name][engine] === 'loading') {
        state.engineStatus[f.name][engine] = 'done';
      }
    });
    renderEngineTabs();
    updateStatusBar();
  });

  sse.addEventListener('engineError', function(e) {
    const { engine } = JSON.parse(e.data);
    state.files.forEach(function(f) {
      if (state.engineStatus[f.name] && state.engineStatus[f.name][engine]) {
        state.engineStatus[f.name][engine] = 'error';
      }
    });
    renderEngineTabs();
  });

  sse.addEventListener('done', function() {
    sse.close();
    document.getElementById('scanBtn').disabled = false;
  });
}

// ── Render ────────────────────────────────────────────────────────────────
function renderFileTabs() {
  const container = document.getElementById('fileTabs');
  container.textContent = '';
  state.files.forEach(function(f) {
    const isVideo = /\.(mp4|mov|avi)$/i.test(f.name);
    const tab = document.createElement('div');
    tab.className = 'file-tab' + (state.activeFile === f.name ? ' active' : '');
    tab.dataset.file = f.name;
    tab.textContent = f.name;
    if (isVideo) {
      const badge = document.createElement('span');
      badge.className = 'frame-badge';
      badge.textContent = '[video]';
      tab.appendChild(badge);
    }
    tab.addEventListener('click', function() {
      state.activeFile = f.name;
      const engines = Object.keys(state.engineStatus[f.name] || {});
      if (engines.length) state.activeEngine = engines[0];
      renderFileTabs();
      renderEngineTabs();
      renderGrid();
    });
    container.appendChild(tab);
  });
}

function renderEngineTabs() {
  const container = document.getElementById('engineTabs');
  container.textContent = '';
  const statuses = state.engineStatus[state.activeFile] || {};
  const results = state.results[state.activeFile] || {};

  Object.keys(statuses).forEach(function(engine) {
    const count = (results[engine] || []).length;
    const status = statuses[engine];
    const tab = document.createElement('div');
    tab.className = 'engine-tab' + (state.activeEngine === engine ? ' active' : '') + ' ' + status;
    tab.dataset.engine = engine;
    if (status === 'loading') tab.textContent = engine.toUpperCase() + ' ...';
    else if (status === 'error') tab.textContent = engine.toUpperCase() + ' (err)';
    else tab.textContent = engine.toUpperCase() + ' (' + count + ')';
    tab.addEventListener('click', function() {
      state.activeEngine = engine;
      renderEngineTabs();
      renderGrid();
    });
    container.appendChild(tab);
  });
}

function refreshEngineTabLabel(file, engine) {
  if (state.activeFile !== file) return;
  const tab = document.querySelector('.engine-tab[data-engine="' + engine + '"]');
  if (!tab || tab.classList.contains('loading')) return;
  const count = (state.results[file] && state.results[file][engine] ? state.results[file][engine].length : 0);
  tab.textContent = engine.toUpperCase() + ' (' + count + ')';
}

function renderGrid() {
  const grid = document.getElementById('resultsGrid');
  grid.textContent = '';
  const list = (state.results[state.activeFile] && state.results[state.activeFile][state.activeEngine])
    ? state.results[state.activeFile][state.activeEngine] : [];
  if (!list.length) {
    const msg = document.createElement('div');
    msg.className = 'no-results';
    const isLoading = state.engineStatus[state.activeFile] && state.engineStatus[state.activeFile][state.activeEngine] === 'loading';
    msg.textContent = isLoading ? 'SCANNING...' : 'NO RESULTS';
    grid.appendChild(msg);
    return;
  }
  list.forEach(function(r) { appendCard(r); });
}

function appendCard(r) {
  if (state.activeFile !== r.sourceFile || state.activeEngine !== r.engine) return;
  const grid = document.getElementById('resultsGrid');
  const placeholder = grid.querySelector('.no-results');
  if (placeholder) placeholder.remove();

  // Build card using safe DOM methods (no innerHTML with external data)
  const card = document.createElement('a');
  card.className = 'result-card';
  card.setAttribute('href', r.url);
  card.setAttribute('target', '_blank');
  card.setAttribute('rel', 'noopener noreferrer');

  const thumbDiv = document.createElement('div');
  thumbDiv.className = 'card-thumb';
  if (r.thumbnail) {
    const img = document.createElement('img');
    img.setAttribute('src', r.thumbnail);
    img.setAttribute('alt', '');
    img.setAttribute('loading', 'lazy');
    img.onerror = function() {
      thumbDiv.textContent = '';
      const span = document.createElement('span');
      span.className = 'card-no-thumb';
      span.textContent = '[NO PREVIEW]';
      thumbDiv.appendChild(span);
    };
    thumbDiv.appendChild(img);
  } else {
    const span = document.createElement('span');
    span.className = 'card-no-thumb';
    span.textContent = '[NO PREVIEW]';
    thumbDiv.appendChild(span);
  }

  const infoDiv = document.createElement('div');
  infoDiv.className = 'card-info';

  const urlSpan = document.createElement('span');
  urlSpan.className = 'card-url';
  try { urlSpan.textContent = new URL(r.url).hostname; } catch (_) { urlSpan.textContent = r.url; }

  infoDiv.appendChild(urlSpan);

  if (r.score !== null || r.frameIndex !== null) {
    const scoreDiv = document.createElement('div');
    scoreDiv.className = 'card-score';
    scoreDiv.textContent = r.score !== null
      ? ('> ' + Math.round(r.score * 100) + '% match')
      : ('> frame ' + r.frameIndex);
    infoDiv.appendChild(scoreDiv);
  }

  card.appendChild(thumbDiv);
  card.appendChild(infoDiv);
  grid.appendChild(card);
}

function updateStatusBar() {
  const allStatuses = Object.values(state.engineStatus).flatMap(function(f) { return Object.values(f); });
  const done = allStatuses.filter(function(s) { return s === 'done'; }).length;
  const total = allStatuses.length;
  const left = document.getElementById('statusLeft');
  left.textContent = '';
  const span = document.createElement('span');
  span.className = done === total ? 'status-ok' : '';
  span.textContent = done + '/' + total + ' engines complete';
  left.appendChild(span);
}

function bindEvents() {
  bindTorToggle();
  bindDropZone();
  bindScan();
}

boot();
```

- [ ] **Step 2: Commit**

```bash
git add public/app.js
git commit -m "feat: frontend JS -- upload, SSE, tabs, result cards"
```

---

## Task 15: End-to-End Smoke Test

- [ ] **Step 1: Run full test suite**

```bash
npm test
```

Expected: All unit tests pass.

- [ ] **Step 2: Start the server**

```bash
npm start
```

Expected: `REVERSE TRACE running at http://localhost:3000`

- [ ] **Step 3: Open the app**

Open `http://localhost:3000`. Verify:
- Dark terminal theme renders with neon green/cyan/magenta accents
- Upload zone is visible with drag-and-drop instruction
- Engine chips show all 6 engines toggled on
- Yandex and Baidu have no "API key" tooltip (no key needed)
- Tor toggle defaults to OFF

- [ ] **Step 4: Test with a real image (no API keys needed)**

Upload any JPG. Select only YANDEX and BAIDU. Click INITIATE SCAN.

Expected:
- Results container appears with file tab and engine tabs
- Engine tabs show `YANDEX ...` and `BAIDU ...` while loading
- After results arrive, tabs show count e.g. `YANDEX (8)`
- Result cards appear with hostname and match score
- Clicking a card opens the source URL in a new browser tab

- [ ] **Step 5: Test with a video file**

Upload a short MP4 (under 30s). Select Yandex. Click INITIATE SCAN.

Expected:
- File tab shows `[video]` badge
- Server extracts frames and searches each one
- Results appear per frame

- [ ] **Step 6: Final commit**

```bash
git add .
git commit -m "chore: complete reverse trace v1.0"
```

---

## Prerequisites

Before running the app:

| Requirement | Install command | Check |
|---|---|---|
| Node.js 18+ | `brew install node` | `node --version` |
| ffmpeg | `brew install ffmpeg` | `ffmpeg -version` |
| Tor (optional) | `brew install tor && tor` | `curl --socks5 127.0.0.1:9050 https://check.torproject.org` |

API keys (all optional — Yandex and Baidu work without any keys):

```bash
export GOOGLE_API_KEY=your_key
export GOOGLE_CX=your_cx_id
export TINEYE_API_KEY=your_key
export BING_API_KEY=your_key
export SAUCENAO_API_KEY=your_key
```
