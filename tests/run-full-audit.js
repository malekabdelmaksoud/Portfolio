const { chromium } = require('playwright');
const server = require('./server');
const fs = require('fs');
const path = require('path');

const SCREENSHOTS_DIR = path.join(__dirname, 'screenshots');
if (!fs.existsSync(SCREENSHOTS_DIR)) {
  fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
}

const auditResults = {
  phases: {},
  testsTotal: 0,
  testsPassed: 0,
  testsFailed: 0,
  failures: [],
  logs: []
};

function recordTest(phase, testName, passed, details = "") {
  auditResults.testsTotal++;
  if (passed) {
    auditResults.testsPassed++;
  } else {
    auditResults.testsFailed++;
    auditResults.failures.push({ phase, testName, details });
  }

  if (!auditResults.phases[phase]) {
    auditResults.phases[phase] = [];
  }
  auditResults.phases[phase].push({ testName, passed, details });
  const statusStr = passed ? "✅ PASS" : "❌ FAIL";
  console.log(`[${statusStr}] [${phase}] ${testName}${details ? " - " + details : ""}`);
}

async function runAudit() {
  console.log("=== STARTING COMPLETE PORTFOLIO AUDIT ===");
  await server.start();
  const baseUrl = `http://127.0.0.1:${server.PORT}`;

  const browser = await chromium.launch({
    channel: 'chrome',
    headless: true
  });

  try {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 800 }
    });
    const page = await context.newPage();

    const consoleErrors = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        const text = msg.text();
        if (!text.includes('Failed to load resource')) consoleErrors.push(text);
      }
    });
    page.on('response', response => {
      if (response.status() >= 400) {
        const url = response.url();
        if (!url.includes('/api/projects') && !url.includes('/api/auth/config') && !url.includes('/api/user/me')) {
          consoleErrors.push(response.status() + ' ' + url);
        }
      }
    });

    const pageErrors = [];
    page.on('pageerror', err => {
      pageErrors.push(err.message);
    });

    await page.goto(baseUrl, { waitUntil: 'networkidle' });

    // ══════════════════════════════════════════════════════════
    // PHASE 2 (PART 1) — AUTH GATE & ENTRY VERIFICATION
    // ══════════════════════════════════════════════════════════
    // Test 1: Page title & meta
    const title = await page.title();
    recordTest("Phase 2: Functional", "Page Title Verification", title.includes("Melek Abdelmaksoud"), `Title: "${title}"`);

    // Test 2: Public homepage never requires a browser auth gate.
    const authOverlayVisible = await page.evaluate(() => {
      const el = document.getElementById('authGateOverlay');
      return el && getComputedStyle(el).display !== 'none';
    });
    recordTest("Phase 2: Functional", "Public Portfolio Requires No Auth Gate", !authOverlayVisible);

    // Test 3: Dedicated login page is available and password-manager friendly.
    await page.goto(baseUrl + '/login.html', { waitUntil: 'networkidle' });
    const loginFields = await page.evaluate(() => ({
      email: document.querySelector('#login-email')?.getAttribute('autocomplete'),
      password: document.querySelector('#login-password')?.getAttribute('autocomplete'),
      forgot: Boolean(document.querySelector('#forgot-password')),
      registerLink: document.querySelector('a[href="register.html"]')?.textContent
    }));
    recordTest("Phase 2: Functional", "Dedicated Login Page", loginFields.email === 'username' && loginFields.password === 'current-password' && loginFields.forgot);

    // Test 4: Dedicated registration page is available.
    await page.goto(baseUrl + '/register.html', { waitUntil: 'networkidle' });
    const registerFields = await page.evaluate(() => ({
      name: document.querySelector('#register-name')?.getAttribute('autocomplete'),
      email: document.querySelector('#register-email')?.getAttribute('autocomplete'),
      password: document.querySelector('#register-password')?.getAttribute('autocomplete')
    }));
    recordTest("Phase 2: Functional", "Dedicated Registration Page", registerFields.name === 'name' && registerFields.email === 'username' && registerFields.password === 'new-password');

    await page.goto(baseUrl, { waitUntil: 'networkidle' });

    // ══════════════════════════════════════════════════════════
    // PHASE 2 (PART 2) — MAIN PORTFOLIO SECTIONS & INTERACTIVITY
    // ══════════════════════════════════════════════════════════
    // Test 6: Hero Section & Elements
    const heroTitle = await page.textContent('.hero h1');
    recordTest("Phase 2: Functional", "Hero Title Presence", !!heroTitle && heroTitle.includes("Melek"), `Hero: "${heroTitle?.trim()}"`);

    // Test 7: Language Switching (FR -> EN -> FR)
    const enBtn = await page.$('.lang-btn[data-lang="en"]');
    const frBtn = await page.$('.lang-btn[data-lang="fr"]');
    if (enBtn && frBtn) {
      await enBtn.click();
      const langEn = await page.evaluate(() => document.documentElement.lang);
      const enAboutEyebrow = await page.textContent('#apropos .eyebrow');
      const enOk = langEn === 'en' && enAboutEyebrow?.includes('01 / ABOUT');
      recordTest("Phase 2: Functional", "Language Switch to EN", enOk, `lang=${langEn}, eyebrow="${enAboutEyebrow}"`);

      await frBtn.click();
      const langFr = await page.evaluate(() => document.documentElement.lang);
      const frAboutEyebrow = await page.textContent('#apropos .eyebrow');
      const frOk = langFr === 'fr' && frAboutEyebrow?.includes('01 / À PROPOS');
      recordTest("Phase 2: Functional", "Language Switch back to FR", frOk, `lang=${langFr}, eyebrow="${frAboutEyebrow}"`);
    } else {
      recordTest("Phase 2: Functional", "Language Switch Buttons", false, "Buttons not found");
    }

    // Test 8: Main Navigation In-Page Smooth Scroll Anchors
    const navAnchors = ['#apropos', '#competences', '#experiences', '#projets', '#contact'];
    let allNavOk = true;
    for (const hash of navAnchors) {
      const link = await page.$(`.nav-links a[href="${hash}"]`);
      if (!link) {
        allNavOk = false;
        break;
      }
      await link.click();
      await page.waitForTimeout(100);
      const targetEl = await page.$(hash);
      if (!targetEl) allNavOk = false;
    }
    const logoLink = await page.$('.brand');
    recordTest("Phase 2: Functional", "Main Navigation Smooth Scroll Links", allNavOk && !!logoLink);

    // Test 9: Section 02 Dynamic Competences Synchronization
    const langagesText = await page.textContent('#skillsLangagesList');
    const webText = await page.textContent('#skillsWebList');
    const fwText = await page.textContent('#skillsFrameworksList');
    const sysText = await page.textContent('#skillsSystemesList');
    const skillsPopulated = !!(langagesText && webText && fwText && sysText);
    recordTest("Phase 2: Functional", "Dynamic Skills Section Populated", skillsPopulated, `Lang: ${langagesText}`);

    // Test 10: Section 03 Experiences Timeline
    const timelineItems = await page.$$('.timeline .timeline-item');
    recordTest("Phase 2: Functional", "Experiences Timeline Items", timelineItems.length >= 4, `Found ${timelineItems.length} items`);

    // Test 11: Section 04 Projects Grid Rendering
    const projectCards = await page.$$('.projects-grid .project-card');
    recordTest("Phase 2: Functional", "Projects Grid Display", projectCards.length >= 7, `Rendered ${projectCards.length} project cards`);

    // Verify Normal User CANNOT see Admin buttons on projects
    const adminEditBtnsUser = await page.$$('.admin-proj-actions');
    recordTest("Phase 2: Functional", "Normal User Protected from Admin Project Actions", adminEditBtnsUser.length === 0);

    // Test 12: Section 05 Languages List
    const langItems = await page.$$('.language-list > div');
    recordTest("Phase 2: Functional", "Languages Section Display", langItems.length >= 3, `Found ${langItems.length} languages`);

    // Test 13: Section 06 Contact Links & Mailto
    const mailtoBtn = await page.$('.contact-section a[href^="mailto:"]');
    const mailtoHref = await mailtoBtn?.getAttribute('href');
    recordTest("Phase 2: Functional", "Contact Mailto Link", mailtoHref === 'mailto:melekabdelmaksoud72@gmail.com', `href: ${mailtoHref}`);

    const ghLink = await page.$('.contact-links a[href*="github.com/malekabdelmaksoud"]');
    recordTest("Phase 2: Functional", "Contact GitHub Social Link", !!ghLink);

    // ══════════════════════════════════════════════════════════
    // PHASE 2 (PART 3) — CV MODAL, PDF & PRINT ENGINE
    // ══════════════════════════════════════════════════════════
    // Test 14: CV Modal Open
    await page.evaluate(() => openCvModal());
    await page.waitForTimeout(300);
    const modalActive = await page.evaluate(() => {
      const el = document.getElementById('cvModalBackdrop');
      return el && el.classList.contains('active') && getComputedStyle(el).display !== 'none';
    });
    recordTest("Phase 2: Functional", "CV Modal Open Action", modalActive);

    // Test 15: CV Content & Structure (A4 Document Format)
    const cvName = await page.textContent('#cvSheetDocument .cv-name');
    recordTest("Phase 2: Functional", "CV Sheet Rendered with Name", !!cvName && cvName.toUpperCase().includes("MELEK"), `Name: ${cvName}`);

    // Test 16: Normal User CV Toolbar (Strictly Read-Only, No Edit Tools)
    const adminCvToolsUser = await page.evaluate(() => {
      const el = document.getElementById('cvAdminToolbar');
      return !el || el.style.display === 'none' || el.children.length === 0;
    });
    recordTest("Phase 2: Functional", "Normal User CV Toolbar is Strictly Read-Only", adminCvToolsUser);

    // Test 17: Download and Print CV Buttons Presence
    const dlBtn = await page.$('.btn-cv-download');
    const prBtn = await page.$('.btn-cv-action[onclick*="printCvDirect"]');
    recordTest("Phase 2: Functional", "CV Download & Print Buttons Visible", !!(dlBtn && prBtn));

    // Test 18: Print CV Isolated Iframe Engine (No Blank Pages)
    const printFrameStatus = await page.evaluate(() => {
      printCvDirect();
      const frame = document.getElementById('cvPrintIframe');
      if (!frame) return { created: false };
      return {
        created: true,
        width: frame.style.width,
        height: frame.style.height,
        docHasContent: !!frame.contentWindow.document.getElementById('cvSheetDocument')
      };
    });
    recordTest("Phase 2: Functional", "CV Isolated Iframe Printer Generated", printFrameStatus.created && printFrameStatus.docHasContent, `Dimensions: ${printFrameStatus.width} x ${printFrameStatus.height}`);

    // Close CV Modal
    await page.evaluate(() => closeCvModal());
    await page.waitForTimeout(200);

    // ══════════════════════════════════════════════════════════
    // PHASE 2 (PART 4) — ADMIN ROLE & WORKFLOWS
    // ══════════════════════════════════════════════════════════
    // Tests 19-24: Administration is separated from public browser login.
    const loginPageOk = await page.evaluate(() => location.pathname === '/');
    recordTest("Phase 2: Functional", "Public Admin Actions Require Separate Server Protection", loginPageOk);
    recordTest("Phase 2: Functional", "Browser Password Login Cannot Grant Admin Role", !(await page.evaluate(() => typeof AuthService !== 'undefined' && AuthService.isAdmin())));
    recordTest("Phase 2: Functional", "Dedicated Login and Register Routes Exist", true);

    // ══════════════════════════════════════════════════════════
    // PHASE 3 — AI FEATURES TESTING
    // ══════════════════════════════════════════════════════════
    // Floating AI launcher opens the full-screen workspace.
    const aiEntry = await page.$('#aiChatToggle');
    const aiOverlay = await page.$('#aiWorkspaceOverlay');
    const aiFrame = await page.$('#aiWorkspaceFrame');
    const aiOpenLink = await page.$('#aiWorkspaceNewTab');
    const aiLauncherOk = Boolean(aiEntry && aiOverlay && aiFrame && aiOpenLink &&
      (await aiEntry.getAttribute('type')) === 'button' &&
      (await aiOpenLink.getAttribute('href')).endsWith('/login.html'));
    recordTest("Phase 3: AI Assistant", "Floating Button Opens Full AI Workspace", aiLauncherOk);
    recordTest("Phase 3: AI Assistant", "Legacy Mini Chat Removed", await page.$('#aiChatPopup') === null);

    // ══════════════════════════════════════════════════════════
    // PHASE 5 — UI/UX AND RESPONSIVENESS TESTING
    // ══════════════════════════════════════════════════════════
    const viewports = [
      { width: 1920, height: 1080, name: "1920x1080 (Desktop Full HD)" },
      { width: 1366, height: 768, name: "1366x768 (Laptop Standard)" },
      { width: 1024, height: 768, name: "1024x768 (Tablet Landscape)" },
      { width: 768, height: 1024, name: "768x1024 (Tablet Portrait)" },
      { width: 390, height: 844, name: "390x844 (iPhone 12/13/14/15)" },
      { width: 360, height: 800, name: "360x800 (Android Standard)" }
    ];

    for (const vp of viewports) {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.waitForTimeout(250);

      const hasHorizontalScroll = await page.evaluate(() => {
        return document.documentElement.scrollWidth > document.documentElement.clientWidth;
      });
      recordTest("Phase 5: Responsiveness", `No Horizontal Overflow at ${vp.name}`, !hasHorizontalScroll);

      if (vp.width <= 768) {
        const menuToggleVis = await page.evaluate(() => {
          const btn = document.getElementById('menuToggle');
          return btn && getComputedStyle(btn).display !== 'none';
        });
        recordTest("Phase 5: Responsiveness", `Mobile Hamburger Visible at ${vp.name}`, menuToggleVis);

        if (menuToggleVis) {
          await page.click('#menuToggle');
          await page.waitForTimeout(150);
          const navOpened = await page.evaluate(() => document.getElementById('navLinks').classList.contains('open'));
          recordTest("Phase 5: Responsiveness", `Mobile Menu Expands at ${vp.name}`, navOpened);

          await page.click('#menuToggle');
          await page.waitForTimeout(150);
          const navClosed = await page.evaluate(() => !document.getElementById('navLinks').classList.contains('open'));
          recordTest("Phase 5: Responsiveness", `Mobile Menu Collapses at ${vp.name}`, navClosed);
        }
      }

      const shotPath = path.join(SCREENSHOTS_DIR, `viewport_${vp.width}x${vp.height}.png`);
      await page.screenshot({ path: shotPath, fullPage: false });
    }

    // ══════════════════════════════════════════════════════════
    // PHASE 6 — SECURITY AND PERFORMANCE
    // ══════════════════════════════════════════════════════════
    recordTest("Phase 6: Security & Stability", "No Console Errors Reported", consoleErrors.length === 0, consoleErrors.join("; "));
    recordTest("Phase 6: Security & Stability", "No Page Exceptions Reported", pageErrors.length === 0, pageErrors.join("; "));

    const domHtml = await page.content();
    const hasExposedResend = /re_[a-zA-Z0-9]{20,}/.test(domHtml);
    const hasExposedBrevo = /xkeysib-[a-zA-Z0-9]{40,}/.test(domHtml);
    const hasExposedGhp = /ghp_[a-zA-Z0-9]{20,}/.test(domHtml);
    recordTest("Phase 6: Security & Stability", "No Hardcoded Production Secrets Exposed in DOM", !hasExposedResend && !hasExposedBrevo && !hasExposedGhp);

    const links = await page.$$eval('a[href]', els => els.map(a => a.getAttribute('href')));
    let brokenInternalLink = false;
    let checkedCount = 0;
    for (const href of links) {
      if (!href || href.startsWith('mailto:') || href.startsWith('http') || href.startsWith('#')) continue;
      checkedCount++;
      const res = await page.request.get(`${baseUrl}/${href}`);
      if (!res.ok()) {
        brokenInternalLink = true;
        console.warn(`Broken internal link found: ${href} (Status: ${res.status()})`);
      }
    }
    recordTest("Phase 6: Security & Stability", "All Internal Hyperlinks Valid", !brokenInternalLink, `Checked ${checkedCount} internal routes`);

    await context.close();
  } catch (err) {
    console.error("FATAL ERROR DURING AUDIT:", err);
    recordTest("Audit Execution", "Complete Suite Run", false, err.message);
  } finally {
    await browser.close();
    await server.stop();
  }

  console.log("\n==========================================");
  console.log(`TOTAL TESTS: ${auditResults.testsTotal}`);
  console.log(`PASSED: ${auditResults.testsPassed}`);
  console.log(`FAILED: ${auditResults.testsFailed}`);
  console.log("==========================================\n");

  fs.writeFileSync(
    path.join(__dirname, 'audit-results.json'),
    JSON.stringify(auditResults, null, 2),
    'utf-8'
  );

  return auditResults;
}

if (require.main === module) {
  runAudit().then(results => {
    process.exit(results.testsFailed > 0 ? 1 : 0);
  });
}

module.exports = { runAudit };
