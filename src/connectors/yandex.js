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
