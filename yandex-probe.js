const puppeteer = require('puppeteer');

(async () => {
  const b = await puppeteer.launch({
    headless: true,
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
  });
  const p = await b.newPage();
  await p.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
  await p.goto('https://yandex.com/images/search', { waitUntil: 'networkidle2', timeout: 30000 });

  await p.click('[aria-label="Image search"]');
  await new Promise(r => setTimeout(r, 1500));

  const fileInput = await p.$('input[type=file]');
  if (!fileInput) { console.log('NO FILE INPUT'); await b.close(); return; }

  await fileInput.uploadFile('/tmp/test.jpg');
  console.log('uploaded, waiting nav...');
  await p.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 });
  console.log('url:', p.url());

  const results = await p.evaluate(() => {
    const candidates = ['.serp-item', '.SerpItem', '[class*="serp-item"]', 'li[class*="serp"]', '.ImagesViewer-ResultItem', '[data-type="image"]'];
    return candidates.map(s => ({ s, n: document.querySelectorAll(s).length }));
  });
  console.log('selectors:', JSON.stringify(results));

  // Grab first few links from whatever found
  const links = await p.evaluate(() => {
    const anchors = Array.from(document.querySelectorAll('a[href]'))
      .filter(a => a.href && !a.href.includes('yandex.') && a.href.startsWith('http'))
      .slice(0, 5);
    return anchors.map(a => ({ href: a.href, text: a.textContent.trim().substring(0, 50) }));
  });
  console.log('sample links:', JSON.stringify(links, null, 2));

  await b.close();
})().catch(e => console.error('ERR:', e.message.split('\n')[0]));
