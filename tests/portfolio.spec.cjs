const { test, expect } = require('@playwright/test');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
let server;
let baseURL;

test.beforeAll(async () => {
  server = http.createServer((req, res) => {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const file = path.resolve(root, '.' + pathname);
    if (!file.startsWith(root + path.sep) && file !== path.join(root, 'index.html')) {
      res.writeHead(403).end('Forbidden'); return;
    }
    const target = pathname === '/' ? path.join(root, 'index.html') : file;
    if (!fs.existsSync(target) || fs.statSync(target).isDirectory()) {
      res.writeHead(404).end('Not found'); return;
    }
    const ext = path.extname(target);
    const types = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8', '.png':'image/png', '.svg':'image/svg+xml' };
    res.writeHead(200, { 'Content-Type': types[ext] || 'application/octet-stream' });
    fs.createReadStream(target).pipe(res);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  baseURL = 'http://127.0.0.1:' + server.address().port;
});

test.afterAll(async () => {
  if (server) await new Promise(resolve => server.close(resolve));
});

test('public portfolio loads without a login gate', async ({ page }) => {
  await page.goto(baseURL, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#authGateOverlay')).toBeHidden();
  await expect(page.locator('h1')).toContainText('Melek Abdelmaksoud');
  await expect(page.locator('#contact a[href^="mailto:"]')).toBeVisible();
});

test('navigation anchors and bilingual switch work', async ({ page }) => {
  await page.goto(baseURL);
  for (const id of ['apropos','competences','experiences','projets','contact']) {
    await expect(page.locator('a[href="#' + id + '"]').first()).toHaveAttribute('href', '#' + id);
    await expect(page.locator('#' + id)).toHaveCount(1);
  }
  await page.locator('.lang-btn[data-lang="en"]').click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.locator('h1')).toContainText("Hello, I'm");
  await page.locator('.lang-btn[data-lang="fr"]').click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
});

test('project repository links point to real repository names', async ({ page }) => {
  await page.goto(baseURL);
  const links = await page.locator('#projets .project-card a[href*="github.com"]').evaluateAll(els => els.map(a => a.href));
  expect(links.length).toBeGreaterThanOrEqual(7);
  for (const repo of ['elearning-platform','projetphp','laravel','tpmagasin','tp-poo','projet-symfony','firstApp']) {
    expect(links.some(url => url.endsWith('/' + repo))).toBeTruthy();
  }
});

test('CV modal opens and closes', async ({ page }) => {
  await page.goto(baseURL);
  await page.locator('a[onclick*="openCvModal"]').first().click();
  await expect(page.locator('#cvModalBackdrop')).toHaveClass(/active/);
  await expect(page.locator('#cvPrintableArea')).not.toBeEmpty();
  await page.locator('#cvModalBackdrop .btn-cv-close').click();
  await expect(page.locator('#cvModalBackdrop')).not.toHaveClass(/active/);
});

test('mobile viewport has no horizontal overflow and menu toggles', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(baseURL);
  const dimensions = await page.evaluate(() => ({ width: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }));
  expect(dimensions.scroll).toBeLessThanOrEqual(dimensions.width + 1);
  const toggle = page.locator('#menuToggle');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await page.locator('#navLinks a[href="#contact"]').click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
});

test('portfolio assistant returns a relevant FAQ answer', async ({ page }) => {
  await page.goto(baseURL);
  await page.locator('#aiChatToggle').click();
  await page.locator('#aiChatInput').fill('Quels sont tes projets principaux ?');
  await page.locator('#aiChatSend').click();
  await expect(page.locator('#aiChatMessages')).toContainText('Projets');
});
