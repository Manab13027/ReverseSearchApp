// src/connectors/yandex.js
const puppeteer = require('puppeteer');

const ENGINE = 'yandex';

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
    await page.setUserAgent(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );
    await page.goto('https://yandex.com/images/search', { waitUntil: 'domcontentloaded', timeout: 30000 });

    // Open visual search modal and wait for it to fully initialize
    await page.click('[aria-label="Image search"], .HeaderDesktopActions-CbirButton');
    await new Promise(r => setTimeout(r, 2000));
    const fileInput = await page.$('input[type="file"]');

    await fileInput.uploadFile(imagePath);
    // Yandex navigates to a results URL; wait with generous timeout + fallback
    try {
      await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 55000 });
    } catch (_) {
      // Navigation may still complete — wait a further 8s then proceed
      await new Promise(r => setTimeout(r, 8000));
    }

    const raw = await page.evaluate(() =>
      Array.from(document.querySelectorAll('a[href]'))
        .filter(a => a.href.startsWith('http') && !a.href.includes('yandex.') && !a.href.includes('ya.ru'))
        .slice(0, 10)
        .map(a => {
          const img = a.querySelector('img') || a.closest('[class]') && a.closest('[class]').querySelector('img');
          return {
            url: a.href,
            title: a.textContent.trim().substring(0, 120) || '',
            thumbnail: img ? img.src : null,
          };
        })
    );

    return raw.map(r => ({ engine: ENGINE, ...r, score: null, sourceFile, frameIndex }));
  } finally {
    await browser.close();
  }
}

module.exports = { search, ENGINE };
