const puppeteer = require('puppeteer');

(async () => {
  const b = await puppeteer.launch({
    headless: true,
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
  });
  const p = await b.newPage();
  await p.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
  await p.goto('https://yandex.com/images/search', { waitUntil: 'domcontentloaded', timeout: 20000 });

  // Always click camera button to activate the upload
  await p.click('[aria-label="Image search"], .HeaderDesktopActions-CbirButton');
  await p.waitForSelector('input[type="file"]', { visible: false, timeout: 8000 });
  const fileInput = await p.$('input[type="file"]');

  await fileInput.uploadFile('/tmp/real.jpg');

  // Wait for navigation
  try {
    await p.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 55000 });
  } catch (_) {
    await new Promise(r => setTimeout(r, 8000));
  }

  console.log('URL:', p.url().substring(0, 120));

  // Wait for JS to render content (try up to 15s)
  let links = [];
  for (let i = 0; i < 15; i++) {
    await new Promise(r => setTimeout(r, 1000));
    links = await p.evaluate(() =>
      Array.from(document.querySelectorAll('a[href]'))
        .filter(a => a.href.startsWith('http') && !a.href.includes('yandex.') && !a.href.includes('ya.ru'))
        .map(a => a.href.substring(0, 80))
    );
    if (links.length > 0) {
      console.log('Got links after', i + 1, 'seconds');
      break;
    }
  }

  console.log('Links:', links.length, '\n', links.slice(0, 5).join('\n'));
  await p.screenshot({ path: '/tmp/yandex-result3.png' });
  await b.close();
})().catch(e => console.error('ERR:', e.message.split('\n')[0]));
