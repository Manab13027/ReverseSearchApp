// src/connectors/yandex.js
const puppeteer = require('puppeteer');

const ENGINE = 'yandex';
const IMAGE_EXT = /\.(jpg|jpeg|png|gif|webp|svg|bmp|ico|avif|tiff|heic)(\?|$)/i;

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

    // Open visual search modal
    await page.click('[aria-label="Image search"], .HeaderDesktopActions-CbirButton');
    await new Promise(r => setTimeout(r, 2000));
    const fileInput = await page.$('input[type="file"]');
    await fileInput.uploadFile(imagePath);

    // Wait for results page (Yandex is slow)
    try {
      await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 55000 });
    } catch (_) {
      await new Promise(r => setTimeout(r, 8000));
    }

    // Dismiss the crop overlay by pressing Enter, then wait for page to settle
    await page.keyboard.press('Enter');
    await new Promise(r => setTimeout(r, 3000));

    // Navigate to the "Sites" tab — pages that contain this image
    const sitesUrl = await page.evaluate(() => {
      const tab = document.querySelector('[class*="CbirNavigation-TabsItem_name_sites-page"]');
      return tab ? tab.href : null;
    });

    if (sitesUrl) {
      await page.goto(sitesUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
      await new Promise(r => setTimeout(r, 5000));
    }

    const raw = await page.evaluate(() => {
      const imageExts = /\.(jpg|jpeg|png|gif|webp|svg|bmp|ico|avif|tiff|heic)(\?|$)/i;
      const imageCdns = /googleusercontent\.com|ytimg\.com|fbcdn\.net|twimg\.com|\/images\/w_\d+|cloudinary-marketing-res\.|psstatic\.|bdstatic\./;
      const dimsOnly = /^\d+[×x]\d+$/;

      return Array.from(document.querySelectorAll('a[href]'))
        .filter(a =>
          a.href.startsWith('http') &&
          !a.href.includes('yandex.') &&
          !a.href.includes('ya.ru') &&
          !imageExts.test(a.href) &&
          !imageCdns.test(a.href)
        )
        .slice(0, 20)
        .map(a => {
          const img = a.querySelector('img') ||
            (a.closest('[class]') && a.closest('[class]').querySelector('img'));
          return {
            url: a.href,
            title: a.textContent.trim().replace(/\s+/g, ' ').substring(0, 120) || '',
            thumbnail: img ? img.src : null,
          };
        })
        .filter(r => !dimsOnly.test(r.title)) // skip "1000×872" label-only links
        .filter((r, i, arr) => arr.findIndex(x => x.url === r.url) === i); // dedupe
    });

    return raw.map(r => ({ engine: ENGINE, ...r, score: null, sourceFile, frameIndex }));
  } finally {
    await browser.close();
  }
}

module.exports = { search, ENGINE };
