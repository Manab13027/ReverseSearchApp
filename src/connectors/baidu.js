// src/connectors/baidu.js
const puppeteer = require('puppeteer');

const ENGINE = 'baidu';

async function search({ imagePath, sourceFile, frameIndex = null, useTor = false }) {
  const args = ['--no-sandbox', '--disable-setuid-sandbox'];
  if (useTor) {
    const { getPuppeteerTorArgs } = require('../tor/proxy');
    args.push(...getPuppeteerTorArgs());
  }

  const browser = await puppeteer.launch({
    headless: true,
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    args: [...args, '--disable-dev-shm-usage'],
  });
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
