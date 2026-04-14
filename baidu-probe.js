const puppeteer = require('puppeteer');

(async () => {
  const b = await puppeteer.launch({
    headless: true,
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
  });
  const p = await b.newPage();
  await p.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

  await p.goto('https://image.baidu.com/', { waitUntil: 'domcontentloaded', timeout: 20000 });
  console.log('loaded:', p.url());

  // Dump clickable elements near search
  const els = await p.evaluate(() =>
    Array.from(document.querySelectorAll('button,[class*="upload"],[class*="camera"],[class*="soutu"],[class*="image-search"],input[type=file]'))
      .slice(0,10).map(e => ({ tag: e.tagName, cls: e.className.substring(0,60), type: e.type||'' }))
  );
  console.log('elements:', JSON.stringify(els, null, 2));
  await p.screenshot({ path: '/tmp/baidu-before.png' });

  // Try clicking the camera/upload button
  const btn = await p.$('.soutu-btn, [class*="soutu"], [class*="camera"], button');
  if (btn) {
    await btn.click();
    await new Promise(r => setTimeout(r, 2000));
    await p.screenshot({ path: '/tmp/baidu-after-click.png' });
    console.log('clicked btn, url:', p.url());
  }

  const fileInput = await p.$('input[type=file]');
  if (fileInput) {
    console.log('file input found, uploading...');
    await fileInput.uploadFile('/tmp/real.jpg');
    try {
      await p.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 30000 });
    } catch (_) { await new Promise(r => setTimeout(r, 5000)); }
    console.log('after upload url:', p.url());
    const links = await p.evaluate(() =>
      Array.from(document.querySelectorAll('a[href]'))
        .filter(a => a.href.startsWith('http') && !a.href.includes('baidu.com'))
        .map(a => a.href).slice(0, 5)
    );
    console.log('links:', JSON.stringify(links));
    await p.screenshot({ path: '/tmp/baidu-result.png' });
  } else {
    console.log('NO FILE INPUT');
  }

  await b.close();
})().catch(e => console.error('ERR:', e.message.split('\n')[0]));
