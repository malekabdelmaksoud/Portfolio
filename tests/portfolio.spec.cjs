const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
let server;
let browser;
let baseURL;

before(async () => {
  server = http.createServer((req, res) => {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    if (pathname === '/api/projects' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ projects: [] }));
      return;
    }
    if (pathname === '/api/assistant' && req.method === 'POST') {
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', () => {
        const question = String(JSON.parse(body || '{}').question || '');
        const answer = /projet|project|مشروع|المشاريع/i.test(question)
          ? 'Projets publiés : elearning-platform, projet-php et Opportunity Hunter.'
          : 'Réponse issue des faits approuvés du portfolio.';
        res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ answer, sources: [] }));
      });
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
  baseURL = 'http://127.0.0.1:' + server.address().port;
  browser = await chromium.launch({ headless: true });
});

after(async () => {
  if (browser) await browser.close();
  if (server) await new Promise(resolve => server.close(resolve));
});

async function openPage() {
  const page = await browser.newPage({ viewport: { width: 1365, height: 900 } });
  await page.goto(baseURL, { waitUntil: 'domcontentloaded' });
  return page;
}

test('public portfolio loads without a login gate', async () => {
  const page = await openPage();
  try {
    assert.equal(await page.locator('#authGateOverlay').isVisible(), false);
    assert.match(await page.locator('main .hero h1').innerText(), /Melek Abdelmaksoud/);
    assert.equal(await page.locator('#contact a[href^="mailto:"]').isVisible(), true);
  } finally { await page.close(); }
});

test('navigation anchors and bilingual switch work', async () => {
  const page = await openPage();
  try {
    for (const id of ['apropos','competences','experiences','projets','contact']) {
      assert.equal(await page.locator('#' + id).count(), 1, 'missing section ' + id);
      assert.equal(await page.locator('a[href="#' + id + '"]').count() > 0, true, 'missing nav link ' + id);
    }
    await page.locator('.lang-btn[data-lang="en"]').click();
    assert.equal(await page.locator('html').getAttribute('lang'), 'en');
    assert.match(await page.locator('main .hero h1').innerText(), /Hello, I'm/);
    await page.locator('.lang-btn[data-lang="fr"]').click();
    assert.equal(await page.locator('html').getAttribute('lang'), 'fr');
  } finally { await page.close(); }
});

test('project repository links use existing repository names', async () => {
  const page = await openPage();
  try {
    const links = await page.locator('#projets .project-card a[href*="github.com"]').evaluateAll(els => els.map(a => a.href));
    assert.ok(links.length >= 7, 'expected at least 7 project links');
    for (const repo of ['elearning-platform','projetphp','laravel','tpmagasin','tp-poo','projet-symfony','firstApp','opportunity-hunter']) {
      assert.ok(links.some(url => url.endsWith('/' + repo)), 'missing GitHub link for ' + repo);
    }
  } finally { await page.close(); }
});

test('legacy saved projects are migrated without losing the new MCP project', async () => {
  const page = await browser.newPage({ viewport: { width: 1365, height: 900 } });
  try {
    await page.addInitScript(() => {
      localStorage.setItem('portfolio_curated_projects', JSON.stringify([
        { id: 'p_2', name: 'projet-php', type: 'PHP · CSS', description: 'Saved project', github: 'https://github.com/malekabdelmaksoud/projet-php' },
        { id: 'p_3', name: 'projet-laravel', type: 'Laravel', description: 'Saved Laravel project', github: 'https://github.com/malekabdelmaksoud/projet-laravel' }
      ]));
    });
    await page.goto(baseURL, { waitUntil: 'domcontentloaded' });
    const links = await page.locator('#projets .project-card a[href*="github.com"]').evaluateAll(els => els.map(a => a.href));
    assert.ok(links.some(url => url.endsWith('/projetphp')));
    assert.ok(links.some(url => url.endsWith('/laravel')));
    assert.ok(links.some(url => url.endsWith('/opportunity-hunter')));
  } finally { await page.close(); }
});

test('CV modal opens and closes', async () => {
  const page = await openPage();
  try {
    await page.locator('a[onclick*="openCvModal"]').first().click();
    assert.match(await page.locator('#cvModalBackdrop').getAttribute('class'), /active/);
    assert.ok((await page.locator('#cvPrintableArea').innerText()).trim().length > 0);
    await page.locator('#cvModalBackdrop .btn-cv-close').click();
    assert.doesNotMatch(await page.locator('#cvModalBackdrop').getAttribute('class'), /active/);
  } finally { await page.close(); }
});

test('mobile layout has no horizontal overflow and menu toggles', async () => {
  const page = await browser.newPage({ viewport: { width: 375, height: 812 } });
  try {
    await page.goto(baseURL, { waitUntil: 'domcontentloaded' });
    const dimensions = await page.evaluate(() => ({ width: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }));
    assert.ok(dimensions.scroll <= dimensions.width + 1, JSON.stringify(dimensions));
    const toggle = page.locator('#menuToggle');
    await toggle.click();
    assert.equal(await toggle.getAttribute('aria-expanded'), 'true');
    await page.locator('#navLinks a[href="#contact"]').click();
    assert.equal(await toggle.getAttribute('aria-expanded'), 'false');
  } finally { await page.close(); }
});

test('portfolio FAQ assistant answers a project question', async () => {
  const page = await openPage();
  try {
    await page.locator('#aiChatToggle').click();
    await page.locator('#aiChatInput').fill('Quels sont tes projets principaux ?');
    await page.locator('#aiChatSend').click();
    await page.waitForFunction(() => document.querySelector('#aiChatMessages').innerText.includes('Projets'));
    assert.match(await page.locator('#aiChatMessages').innerText(), /Projets/);
  } finally { await page.close(); }
});


test('portfolio assistant handles Arabic questions using published content', async () => {
  const page = await openPage();
  try {
    const result = await page.evaluate(() => window.PortfolioAssistant.answer('شنوة المشاريع اللي عملتهم؟'));
    assert.match(result, /المهارات التقنية/);
    assert.match(result, /Java|PHP/);
  } finally { await page.close(); }
});

test('portfolio assistant refuses unsupported personal facts instead of inventing', async () => {
  const page = await openPage();
  try {
    const result = await page.evaluate(() => window.PortfolioAssistant.answer('Quel est le salaire préféré de Melek et son numéro de passeport ?'));
    assert.match(result, /pas trouvé|pas.*fiable|contact/i);
  } finally { await page.close(); }
});

test('portfolio assistant escapes untrusted text and exposes no remote model endpoint', async () => {
  const page = await openPage();
  try {
    const result = await page.evaluate(() => window.PortfolioAssistant.answer('<img src=x onerror=alert(1)>'));
    assert.doesNotMatch(result, /<img/i);
    assert.equal(await page.evaluate(() => typeof window.PortfolioAssistant.answer), 'function');
    const scripts = await page.locator('script[src]').evaluateAll(nodes => nodes.map(node => node.src));
    assert.ok(scripts.some(src => src.includes('ai-engine.js')));
    assert.ok(!scripts.some(src => /openai|anthropic|ollama|api\.|huggingface/i.test(src)));
  } finally { await page.close(); }
});

test('admin dashboard has no browser password login', async () => {
  const page = await openPage();
  try {
    await page.goto(baseURL + '/admin.html', { waitUntil: 'domcontentloaded' });
    assert.match(await page.locator('h1').innerText(), /Content studio/);
    assert.equal(await page.locator('input[type="password"]').count(), 0);
    assert.match(await page.locator('meta[name="robots"]').getAttribute('content'), /noindex/);
  } finally { await page.close(); }
});
