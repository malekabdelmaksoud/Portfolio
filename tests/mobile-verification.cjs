const { chromium } = require('playwright');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const outDir1 = path.join(root, 'artifacts', 'browser-verification', 'mobile');
const outDir2 = 'C:\\Users\\pc\\.gemini\\antigravity\\brain\\2cfd36fa-277e-4814-8497-760364d1c2f7\\browser-verification\\mobile';

fs.mkdirSync(outDir1, { recursive: true });
fs.mkdirSync(outDir2, { recursive: true });

async function run() {
  const server = http.createServer((req, res) => {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    if (pathname === '/api/user/me') {
      res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ authenticated: true, user: { email: 'melek@example.test' } }));
      return;
    }
    if (pathname === '/api/user/chats' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({
        chats: [
          { id: 'c1', title: 'Questions sur les projets', updated_at: new Date().toISOString() },
          { id: 'c2', title: 'Compétences Java et Laravel', updated_at: new Date(Date.now() - 86400000).toISOString() }
        ]
      }));
      return;
    }
    if (pathname.startsWith('/api/user/chats/') && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({
        chat: { id: 'c1', title: 'Questions sur les projets' },
        messages: [
          { role: 'user', content: 'Quels sont les projets majeurs de Melek ?' },
          { role: 'assistant', content: 'Les projets incluent elearning-platform (Java), projet-php, Laravel, Opportunity Hunter (Cloudflare Workers MCP) et des applications de gestion.' }
        ]
      }));
      return;
    }
    if (pathname === '/api/assistant' && req.method === 'POST') {
      res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({
        answer: 'Melek est étudiante en dernière année de Licence en Technologie de l\'Informatique (Développement Web & Multimédia).'
      }));
      return;
    }
    if (pathname === '/api/projects' && req.method === 'GET') {
      res.writeHead(503, { 'Content-Type': 'application/json' }).end(JSON.stringify({ error: 'API not configured in static test' }));
      return;
    }
    const target = pathname === '/' ? path.join(root, 'index.html') : path.resolve(root, '.' + pathname);
    if (!target.startsWith(root + path.sep)) { res.writeHead(403).end('Forbidden'); return; }
    if (!fs.existsSync(target) || fs.statSync(target).isDirectory()) { res.writeHead(404).end('Not found'); return; }
    const ext = path.extname(target);
    const types = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8', '.png':'image/png', '.svg':'image/svg+xml' };
    res.writeHead(200, { 'Content-Type': types[ext] || 'application/octet-stream' });
    fs.createReadStream(target).pipe(res);
  });

  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const baseURL = 'http://127.0.0.1:' + server.address().port;
  console.log('Test server running at:', baseURL);

  const browser = await chromium.launch({ headless: true });

  const viewports = [
    { name: 'android_360x800', width: 360, height: 800, isMobile: true, hasTouch: true, userAgent: 'Mozilla/5.0 (Linux; Android 14; SM-S901B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36' },
    { name: 'iphone_390x844', width: 390, height: 844, isMobile: true, hasTouch: true, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' },
    { name: 'iphone_pro_max_430x932', width: 430, height: 932, isMobile: true, hasTouch: true, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1' },
    { name: 'ipad_768x1024', width: 768, height: 1024, isMobile: true, hasTouch: true, userAgent: 'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' },
    { name: 'desktop_1366x768', width: 1366, height: 768, isMobile: false, hasTouch: false, userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' }
  ];

  for (const vp of viewports) {
    console.log(`\nTesting viewport: ${vp.name} (${vp.width}x${vp.height})...`);

    for (const theme of ['dark', 'light']) {
      const context = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
        isMobile: vp.isMobile,
        hasTouch: vp.hasTouch,
        userAgent: vp.userAgent,
        colorScheme: theme
      });

      const page = await context.newPage();
      await page.addInitScript(() => { window.PORTFOLIO_API_BASE = window.location.origin; });

      // 1. Portfolio Homepage
      await page.goto(baseURL, { waitUntil: 'networkidle' });
      const overflow = await page.evaluate(() => ({
        clientWidth: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
        hasOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1
      }));
      console.log(`  [Portfolio] ${vp.name} (${theme}) - Overflow: ${overflow.hasOverflow ? 'FAIL' : 'PASS'} (${overflow.scrollWidth} vs ${overflow.clientWidth})`);
      if (overflow.hasOverflow) throw new Error(`Horizontal overflow on ${vp.name} (${theme})`);

      const shotPath1 = path.join(outDir1, `${vp.name}_${theme}_portfolio.png`);
      const shotPath2 = path.join(outDir2, `${vp.name}_${theme}_portfolio.png`);
      await page.screenshot({ path: shotPath1, fullPage: false });
      fs.copyFileSync(shotPath1, shotPath2);

      // 2. Mobile Menu toggle test (if mobile)
      if (vp.isMobile && vp.width < 992) {
        const toggle = page.locator('#menuToggle');
        if (await toggle.isVisible()) {
          await toggle.click();
          await page.waitForTimeout(200);
          const menuShot1 = path.join(outDir1, `${vp.name}_${theme}_menu.png`);
          const menuShot2 = path.join(outDir2, `${vp.name}_${theme}_menu.png`);
          await page.screenshot({ path: menuShot1 });
          fs.copyFileSync(menuShot1, menuShot2);
          await toggle.click();
          await page.waitForTimeout(200);
        }
      }

      // 3. AI Assistant Floating Popup test
      const aiBtn = page.locator('#aiChatToggle');
      if (await aiBtn.isVisible()) {
        await aiBtn.click();
        await page.waitForTimeout(300);
        const aiShot1 = path.join(outDir1, `${vp.name}_${theme}_ai_chat.png`);
        const aiShot2 = path.join(outDir2, `${vp.name}_${theme}_ai_chat.png`);
        await page.screenshot({ path: aiShot1 });
        fs.copyFileSync(aiShot1, aiShot2);
        await page.locator('#aiChatClose').click();
        await page.waitForTimeout(200);
      }

      // 4. Account Page (AI Workspace)
      await page.goto(baseURL + '/account.html', { waitUntil: 'networkidle' });
      await page.waitForTimeout(300);
      const accOverflow = await page.evaluate(() => ({
        clientWidth: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
        hasOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1
      }));
      console.log(`  [Account AI] ${vp.name} (${theme}) - Overflow: ${accOverflow.hasOverflow ? 'FAIL' : 'PASS'}`);
      if (accOverflow.hasOverflow) throw new Error(`Horizontal overflow on Account ${vp.name} (${theme})`);

      const accShot1 = path.join(outDir1, `${vp.name}_${theme}_account.png`);
      const accShot2 = path.join(outDir2, `${vp.name}_${theme}_account.png`);
      await page.screenshot({ path: accShot1 });
      fs.copyFileSync(accShot1, accShot2);

      // 5. Test Account Mobile Sidebar toggle
      if (vp.isMobile && vp.width < 760) {
        const mobileMenu = page.locator('#mobile-menu');
        if (await mobileMenu.isVisible()) {
          await mobileMenu.click();
          await page.waitForTimeout(250);
          const sidebarShot1 = path.join(outDir1, `${vp.name}_${theme}_account_sidebar.png`);
          const sidebarShot2 = path.join(outDir2, `${vp.name}_${theme}_account_sidebar.png`);
          await page.screenshot({ path: sidebarShot1 });
          fs.copyFileSync(sidebarShot1, sidebarShot2);
          await page.locator('#sidebar-toggle').click();
          await page.waitForTimeout(200);
        }
      }

      await context.close();
    }
  }

  await browser.close();
  server.close();
  console.log('\nAll mobile browser tests passed! Real screenshots captured and saved in both output directories.');
}

run().catch(err => {
  console.error('Error during mobile testing:', err);
  process.exit(1);
});
