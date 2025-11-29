// server.js
const express = require('express');
const bodyParser = require('body-parser');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');
const path = require('path');

puppeteer.use(StealthPlugin());

const app = express();
app.use(bodyParser.json({ limit: '5mb' }));

const COOKIE_PATH = path.resolve(__dirname, 'session_info/cookies.json');
const OUT_HTML = path.resolve(__dirname, 'session_info/page_dump.html');
const SCREENSHOT = path.resolve(__dirname, 'session_info/page_debug.png');

// check if subfolders exist or create it 
const dataFolder = path.resolve(__dirname, 'data');
const sessionFolder = path.resolve(__dirname, 'session_info');

if (!fs.existsSync(dataFolder)) {
  fs.mkdirSync(dataFolder, { recursive: true });
  console.log('Dossier data créé');
}

if (!fs.existsSync(sessionFolder)) {
  fs.mkdirSync(sessionFolder, { recursive: true });
  console.log('Dossier session_info créé');
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function scrapeUrl(URL, options = {}) {
  const { force = false, saveName } = options;

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox','--disable-setuid-sandbox','--disable-dev-shm-usage']
  });

  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');
  await page.setViewport({ width: 1366, height: 768 });

  // Charger cookies si existants
  if (fs.existsSync(COOKIE_PATH)) {
    try {
      const cookies = JSON.parse(fs.readFileSync(COOKIE_PATH, 'utf8'));
      if (Array.isArray(cookies) && cookies.length) {
        await page.setCookie(...cookies);
        console.log(`✅ ${cookies.length} cookie(s) chargés`);
      }
    } catch (e) {
      console.warn('⚠️ Impossible de lire cookies.json :', e.message);
    }
  }

  const result = {
    success: false,
    text: '',
    warnings: [],
    cookiesPath: COOKIE_PATH,
    screenshot: null,
    htmlDump: null
  };

  try {
    console.log(`⏳ Navigation vers ${URL}`);
    await page.goto(URL, { waitUntil: 'networkidle2', timeout: 60000 });

    // comportements "humains" simples
    try { await page.mouse.move(100,100); } catch(e) {}
    await page.evaluate(() => window.scrollTo(0, 200));
    await sleep(2000);

    // détection CAPTCHA/turnstile/recaptcha
    const captchaInfo = await page.evaluate(() => {
      const infos = { found: false, matches: [] };

      function isVisible(el) {
        if (!el) return false;
        const style = window.getComputedStyle(el);
        if (!style) return false;
        if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return false;
        return true;
      }

      const iframes = Array.from(document.querySelectorAll('iframe'));
      for (const fr of iframes) {
        const src = fr.getAttribute('src') || '';
        if (/recaptcha|google.com\/recaptcha|hcaptcha|turnstile|cloudflare/i.test(src) && isVisible(fr)) {
          infos.found = true;
          infos.matches.push({ type: 'iframe', src: src.slice(0,200) });
        }
      }

      const selectors = [
        '[class*="captcha"]',
        '[id*="captcha"]',
        '[class*="g-recaptcha"]',
        '.h-captcha',
        '.cf-turnstile',
        '[data-sitekey]'
      ];
      const nodes = new Set();
      selectors.forEach(sel => {
        document.querySelectorAll(sel).forEach(n => nodes.add(n));
      });
      nodes.forEach(n => {
        if (isVisible(n)) {
          infos.found = true;
          infos.matches.push({ type: 'element', outer: n.outerHTML.slice(0,300) });
        }
      });

      const hiddenInputs = Array.from(document.querySelectorAll('input[name="g-recaptcha-response"], textarea[name="h-captcha-response"]'));
      for (const hi of hiddenInputs) {
        if (isVisible(hi) || hi.value) {
          infos.found = true;
          infos.matches.push({ type: 'input', name: hi.getAttribute('name') });
        }
      }

      if (document.querySelector('#cf-content, .cf-browser-verification')) {
        infos.found = true;
        infos.matches.push({ type: 'cloudflare-uam' });
      }

      return infos;
    });

    if (captchaInfo.found) {
      result.warnings.push('CAPTCHA/turnstile détecté');
      result.htmlDump = OUT_HTML;
      result.screenshot = SCREENSHOT;
      // snapshot & dump HTML for debug
      await page.screenshot({ path: SCREENSHOT, fullPage: true }).catch(()=>{});
      const rawHtml = await page.content();
      fs.writeFileSync(OUT_HTML, rawHtml, 'utf8');

      if (!force) {
        // close browser and return with error info (no text)
        await browser.close();
        result.success = false;
        result.captcha = captchaInfo.matches;
        return result;
      } else {
        result.warnings.push('--force spécifié : on continue malgré la détection (résultats possibles incomplets).');
      }
    }

    await sleep(3000);

    // Récupérer le texte visible
    const visibleText = await page.evaluate(() => {
      const toRemove = Array.from(document.querySelectorAll('script, style, noscript, template'));
      toRemove.forEach(el => el.remove());
      function getVisibleText(root = document.body) {
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
          acceptNode(node) {
            if (!node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
            const parent = node.parentElement;
            if (!parent) return NodeFilter.FILTER_REJECT;
            const style = window.getComputedStyle(parent);
            if (style && (style.visibility === 'hidden' || style.display === 'none' || style.opacity === '0')) {
              return NodeFilter.FILTER_REJECT;
            }
            return NodeFilter.FILTER_ACCEPT;
          }
        });
        let text = '';
        let cur;
        while (cur = walker.nextNode()) {
          text += cur.nodeValue.trim() + '\n';
        }
        return text.trim();
      }
      return getVisibleText();
    });

    // write optional saveName into data folder (but not required)
    if (saveName && typeof saveName === 'string' && saveName.trim()) {
      const OUT_TXT = path.resolve(__dirname, 'data', saveName);
      try {
        fs.writeFileSync(OUT_TXT, visibleText || '', 'utf8');
        result.savedTextPath = OUT_TXT;
      } catch (e) {
        result.warnings.push('Erreur écriture copie locale: ' + (e.message || e));
      }
    }

    // Always attempt to save cookies after navigation
    const newCookies = await page.cookies();
    try {
      fs.writeFileSync(COOKIE_PATH, JSON.stringify(newCookies, null, 2));
      result.cookiesPath = COOKIE_PATH;
    } catch (e) {
      result.warnings.push('Erreur sauvegarde cookies: ' + (e && e.message ? e.message : e));
    }

    result.success = true;
    result.text = visibleText || '';
    return result;

  } catch (err) {
    return { success: false, error: err && err.message ? err.message : err };
  } finally {
    try { await browser.close(); } catch(e) {}
  }
}

// Endpoint POST /scrape
// Body JSON: { url: string, force?: boolean, saveName?: string }
app.post('/scrape', async (req, res) => {
  const { url, force = false, saveName } = req.body || {};
  if (!url || typeof url !== 'string') {
    return res.status(400).json({ success: false, error: 'Champ "url" requis (string).' });
  }

  try {
    const result = await scrapeUrl(url, { force: !!force, saveName: saveName ? String(saveName) : undefined });

    if (!result.success) {
      // If captcha detected and not forced => custom status 428 (Precondition Required) or 403
      if (result.captcha) {
        return res.status(428).json(result);
      }
      return res.status(500).json(result);
    }

    return res.status(200).json(result);
  } catch (err) {
    return res.status(500).json({ success: false, error: err && err.message ? err.message : err });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Scraper API démarrée sur http://localhost:${PORT}`);
  console.log('POST /scrape  { "url": "...", "force": true, "saveName": "optional.txt" }');
});
