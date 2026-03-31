import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STATE_PATH = path.join(__dirname, '../state/state.json');
const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL;
const MODE = process.env.MODE || 'RUN';

function loadState() {
  try { return JSON.parse(fs.readFileSync(STATE_PATH, 'utf8')); }
  catch { return {}; }
}

function saveState(state) {
  fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
}

async function postToSlack(message) {
  const res = await fetch(SLACK_WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: message }),
  });
  if (!res.ok) console.error('Slack error:', await res.text());
}

async function scrapeIssues(page) {
  await page.goto('https://help.salesforce.com/s/issues', { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(3000);

  return await page.evaluate(() => {
    const rows = document.querySelectorAll('table tbody tr, [class*="issue"] [class*="row"], [class*="issues"] li');
    const issues = [];
    rows.forEach(row => {
      const links = row.querySelectorAll('a');
      const cells = row.querySelectorAll('td');
      if (links.length === 0 && cells.length === 0) return;

      const titleEl = row.querySelector('a');
      const title = titleEl?.innerText?.trim();
      const href = titleEl?.href;
      if (!title || !href) return;

      const allText = [...cells].map(c => c.innerText?.trim()).filter(Boolean);
      issues.push({
        id: href,
        title,
        url: href,
        status: allText[1] || '',
        severity: allText[2] || '',
        lastUpdated: allText[3] || '',
      });
    });
    return issues;
  });
}

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  try {
    if (MODE === 'LIST_PRODUCTS') {
      await page.goto('https://help.salesforce.com/s/issues', { waitUntil: 'networkidle', timeout: 60000 });
      await page.waitForTimeout(3000);
      const products = await page.evaluate(() => {
        const options = document.querySelectorAll('select option, [class*="filter"] [class*="option"]');
        return [...options].map(o => o.innerText?.trim()).filter(Boolean);
      });
      console.log('Products found:', JSON.stringify(products, null, 2));
      return;
    }

    // RUN mode
    const state = loadState();
    const issues = await scrapeIssues(page);
    console.log(`Found ${issues.length} issues`);

    const newState = {};
    const messages = [];

    for (const issue of issues) {
      const prev = state[issue.id];
      newState[issue.id] = { status: issue.status, title: issue.title };

      if (!prev) {
        messages.push(
          `🆕 *Nouvelle issue*\n*${issue.title}*\nStatut: ${issue.status} | Sévérité: ${issue.severity} | Mis à jour: ${issue.lastUpdated}\n${issue.url}`
        );
      } else if (prev.status !== issue.status) {
        const emoji = issue.status.toLowerCase().includes('fix') ? '✅' : '🔄';
        messages.push(
          `${emoji} *Changement de statut*\n*${issue.title}*\nAncien statut: ${prev.status} → Nouveau: ${issue.status} | Mis à jour: ${issue.lastUpdated}\n${issue.url}`
        );
      }
    }

    console.log(`${messages.length} message(s) à envoyer`);
    for (const msg of messages) {
      await postToSlack(msg);
      await new Promise(r => setTimeout(r, 500));
    }

    saveState(newState);
    console.log('État sauvegardé.');

  } finally {
    await browser.close();
  }
}

main().catch(e => { console.error(e); process.exit(1); });
