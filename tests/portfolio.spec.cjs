const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const vm = require('node:vm');
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
      res.writeHead(503, { 'Content-Type': 'application/json' }).end(JSON.stringify({ error: 'API not configured in static test server' }));
      return;
    }
    if (pathname === '/api/assistant' && req.method === 'POST') {
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', () => {
        const question = String(JSON.parse(body || '{}').question || '');
        const answer = /passeport|passport|salaire|salary/i.test(question)
          ? "Cette information n'est pas présente dans les faits approuvés. Contactez Melek pour confirmation."
          : (/projet|project|مشروع|المشاريع/i.test(question)
            ? 'Projets publiés : elearning-platform, projet-php et Opportunity Hunter.'
            : 'Réponse issue des faits approuvés du portfolio.');
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

test('AI chat renders safe Markdown links, lists, headings and code blocks', () => {
  const source = fs.readFileSync(path.join(root, 'account.js'), 'utf8');
  const match = source.match(/function markdown\\(value\\) \\{[\\s\\S]*?\\n  \\}/);
  assert.ok(match, 'account.js should define the chat Markdown renderer');
  const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
  const markdown = vm.runInNewContext('(' + match[0] + ')', { escapeHTML });

  const cvHtml = markdown('**Melek CV**\\n[📄 Generate / download Melek’s CV (PDF)](https://portfolio.example/?open_cv=1&download_cv=1)');
  assert.match(cvHtml, /<strong>Melek CV<\\/strong>/);
  assert.match(cvHtml, /<a href="https:\\/\\/portfolio\\.example\\/\\?open_cv=1&amp;download_cv=1" target="_blank" rel="noopener noreferrer">/);

  const formatted = markdown('# Skills\\n- **Java**\\n- `PHP`\\n> Verified details');
  assert.match(formatted, /<h1>Skills<\\/h1>/);
  assert.match(formatted, /<ul><li><strong>Java<\\/strong><\\/li><li><code>PHP<\\/code><\\/li><\\/ul>/);
  assert.match(formatted, /<blockquote>Verified details<\\/blockquote>/);

  const unsafe = markdown('[unsafe](javascript:alert(1))\\n\\`\\`\\`html\\n<script>alert(1)</script>\\n\\`\\`\\`');
  assert.doesNotMatch(unsafe, /<a href="javascript:/i);
  assert.match(unsafe, /&lt;script&gt;alert\\(1\\)&lt;\\/script&gt;/);
});

test('CV URL opens the published CV modal automatically', async () => {
  const page = await openPage();
  try {
    await page.goto(baseURL + '/?open_cv=1', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => document.querySelector('#cvModalBackdrop')?.classList.contains('active'), { timeout: 8000 });
    assert.ok((await page.locator('#cvPrintableArea').innerText()).trim().length > 0);
  } finally { await page.close(); }
});

async function openPage() {
  const page = await browser.newPage({ viewport: { width: 1365, height: 900 } });
  // Keep browser tests isolated from the production API Worker.
  await page.addInitScript(() => { window.PORTFOLIO_API_BASE = window.location.origin; });
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

test('floating AI button opens the full-screen Melek AI workspace', async () => {
  const page = await openPage();
  try {
    const overlay = page.locator('#aiWorkspaceOverlay');
    const frame = page.locator('#aiWorkspaceFrame');
    assert.equal(await page.locator('#aiChatToggle').isVisible(), true);
    assert.equal(await overlay.isVisible(), false);
    await page.locator('#aiChatToggle').click();
    assert.equal(await overlay.isVisible(), true);
    assert.equal(await overlay.getAttribute('aria-hidden'), 'false');
    assert.match(await frame.getAttribute('title'), /New Chat.*history.*Chat \/ Analyze/i);
    assert.match(await frame.getAttribute('src'), /login\.html/);
    assert.equal(await page.locator('#aiWorkspaceClose').isVisible(), true);
    assert.equal(await page.locator('#aiWorkspaceNewTab').getAttribute('target'), '_blank');
  } finally { await page.close(); }
});

test('AI workspace modal closes with its close button and Escape key', async () => {
  const page = await openPage();
  try {
    await page.locator('#aiChatToggle').click();
    await page.locator('#aiWorkspaceClose').click();
    assert.equal(await page.locator('#aiWorkspaceOverlay').isVisible(), false);
    await page.locator('#aiChatToggle').click();
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#aiWorkspaceOverlay').isVisible(), false);
    assert.equal(await page.locator('body').evaluate(el => el.classList.contains('ai-workspace-open')), false);
  } finally { await page.close(); }
});

test('new AI workspace does not load the obsolete local engine or a hosted model', async () => {
  const page = await openPage();
  try {
    assert.equal(await page.evaluate(() => typeof window.PortfolioAssistant), 'undefined');
    const scripts = await page.locator('script[src]').evaluateAll(nodes => nodes.map(node => node.src));
    assert.ok(!scripts.some(src => src.includes('ai-engine.js')));
    assert.ok(!scripts.some(src => /openai|anthropic|ollama|huggingface/i.test(src)));
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

test('legacy browser authentication cannot create or grant an admin session', async () => {
  const page = await openPage();
  try {
    const result = await page.evaluate(() => {
      let loginBlocked = false, registerBlocked = false;
      try { AuthService.login('melekabdelmaksoud72@gmail.com', 'guess'); } catch (_) { loginBlocked = true; }
      try { AuthService.register('Melek', 'melekabdelmaksoud72@gmail.com', 'guess'); } catch (_) { registerBlocked = true; }
      return { loginBlocked, registerBlocked, isAdmin: AuthService.isAdmin() };
    });
    assert.equal(result.loginBlocked, true);
    assert.equal(result.registerBlocked, true);
    assert.equal(result.isAdmin, false);
  } finally { await page.close(); }
});

test('admin can approve a fact using the clean multilingual API payload', async () => {
  const page = await browser.newPage({ viewport: { width: 1365, height: 900 } });
  let approvalPayload = null;
  await page.route('**/api/admin/**', async route => {
    const request = route.request();
    const url = new URL(request.url()).pathname;
    if (url === '/api/admin/session') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ authenticated: true, user: { email: 'melek@example.test' } }) });
    }
    if (url === '/api/admin/facts' && request.method() === 'GET') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ facts: [{
        id: 'skills-001', category: 'skills', text_fr: 'Compétences.', text_en: 'Skills.', text_ar: 'المهارات.',
        aliases: ['skills'], aliases_json: '["skills"]', source_file: 'index.html', source_selector: '#skills',
        public_url: '', source: { file: 'index.html', selector: '#skills' }, url: '', approved: false, updated_at: 'now'
      }] }) });
    }
    if (url === '/api/admin/projects') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ projects: [] }) });
    }
    if (url === '/api/admin/facts/skills-001' && request.method() === 'PUT') {
      approvalPayload = request.postDataJSON();
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ saved: true, id: 'skills-001' }) });
    }
    return route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: 'Not found' }) });
  });
  try {
    await page.goto(baseURL + '/admin.html', { waitUntil: 'domcontentloaded' });
    await page.locator('.record-actions button').filter({ hasText: 'Approuver' }).click();
    await page.waitForFunction(() => document.querySelector('#notice').innerText.includes('validation'));
    assert.equal(approvalPayload.approved, true);
    assert.equal(approvalPayload.text_ar, 'المهارات.');
    assert.equal(Object.hasOwn(approvalPayload, 'aliases_json'), false);
  } finally { await page.close(); }
});

test('published API projects replace static cards and follow the selected language', async () => {
  const page = await browser.newPage({ viewport: { width: 1365, height: 900 } });
  await page.route('**/api/projects', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ projects: [{
      id: 'api-project', title: 'API Project', type: 'WEB',
      description_fr: 'Description française.', description_en: 'English project description.',
      url: 'https://github.com/example/api-project', sort_order: 1
    }] })
  }));
  try {
    await page.goto(baseURL, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => document.querySelector('#projets .project-card h3')?.innerText === 'API Project');
    assert.match(await page.locator('#projets .project-card p:not(.project-type)').innerText(), /Description française/);
    await page.locator('.lang-btn[data-lang="en"]').click();
    assert.match(await page.locator('#projets .project-card p:not(.project-type)').innerText(), /English project description/);
    assert.equal(await page.locator('#projets .project-card a').getAttribute('href'), 'https://github.com/example/api-project');
  } finally { await page.close(); }
});

test('an empty published-project response hides every project card', async () => {
  const page = await browser.newPage({ viewport: { width: 1365, height: 900 } });
  await page.route('**/api/projects', route => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({ projects: [] })
  }));
  try {
    await page.goto(baseURL, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => document.querySelector('#projets .projects-grid')?.children.length === 0);
    assert.equal(await page.locator('#projets .project-card').count(), 0);
  } finally { await page.close(); }
});
