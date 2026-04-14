// src/connectors/baidu.js
const puppeteer = require('puppeteer');

const ENGINE = 'baidu';

async function search({ imagePath, sourceFile, frameIndex = null, useTor = false }) {
  const args = ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'];
  if (useTor) {
    const { getPuppeteerTorArgs } = require('../tor/proxy');
    args.push(...getPuppeteerTorArgs());
  }

  const browser = await puppeteer.launch({
    headless: true,
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    args,
  });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );

    await page.goto('https://image.baidu.com/', { waitUntil: 'domcontentloaded', timeout: 20000 });
    await new Promise(r => setTimeout(r, 2000));

    // Find camera icon — last .ci-tool-item in the search bar toolbar
    const camPos = await page.evaluate(() => {
      const tools = Array.from(document.querySelectorAll('.ci-tool-item'));
      const cam = tools[tools.length - 1];
      if (!cam) return null;
      const r = cam.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    });
    if (!camPos) throw new Error('Camera icon not found');

    // Capture upload response
    let uploadData = null;
    page.on('response', async resp => {
      if (resp.url().includes('graph.baidu.com/upload')) {
        try { uploadData = await resp.json(); } catch (_) {}
      }
    });

    // Open file chooser via camera icon click
    const [fc] = await Promise.all([
      page.waitForFileChooser({ timeout: 8000 }),
      page.mouse.click(camPos.x, camPos.y),
    ]);
    await fc.accept([imagePath]);

    // Wait for upload API response (up to 15s)
    for (let i = 0; i < 15; i++) {
      await new Promise(r => setTimeout(r, 1000));
      if (uploadData) break;
    }
    if (!uploadData?.data?.url) throw new Error('No upload response from Baidu');

    // Navigate to results page
    await page.goto(uploadData.data.url, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await new Promise(r => setTimeout(r, 4000));

    const raw = await page.evaluate(() => {
      const imageExts = /\.(jpg|jpeg|png|gif|webp|svg|bmp|ico|avif|tiff)(\?|$)/i;
      return Array.from(document.querySelectorAll('a[href]'))
        .filter(a =>
          a.href.startsWith('http') &&
          !a.href.includes('baidu.com') &&
          !imageExts.test(a.href)
        )
        .slice(0, 15)
        .map(a => {
          const img = a.querySelector('img') ||
            (a.closest('[class]') && a.closest('[class]').querySelector('img'));
          return {
            url: a.href,
            title: a.textContent.trim().replace(/\s+/g, ' ').substring(0, 120) || '',
            thumbnail: img ? img.src : null,
          };
        })
        .filter((r, i, arr) => arr.findIndex(x => x.url === r.url) === i);
    });

    return raw.map(r => ({ engine: ENGINE, ...r, score: null, sourceFile, frameIndex }));
  } finally {
    await browser.close();
  }
}

module.exports = { search, ENGINE };
