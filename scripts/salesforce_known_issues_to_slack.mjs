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

function slugify(text) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 80);
}

async function scrapeIssues(page) {
  await page.goto('https://help.salesforce.com/s/issues', {
    waitUntil: 'networkidle',
    timeout: 60000
  });
  await page.waitForTimeout(10000);

  const bodyText = await page.evaluate(() => document.body.innerText);

  const STATUSES = ['Solution Deployed', 'In Review', 'Known Issue', 'Fix in Progress', 'No Fix', 'Fixed'];
  const STATUS_PATTERN = STATUSES.map(s => s.replace(/\s/g, '\\s+')).join('|');
  
  // Split le texte en blocs par statut
  const blockRegex = new RegExp(
    `(${STATUS_PATTERN})\\n([^\\n]+)\\n([^\\n]+(?:\\n[^\\n]+)?)\\nFound in Release[^\\n]*\\n[\\s\\S]*?Updated\\n([A-Z][a-z]{2}\\s+\\d{1,2},\\s+\\d{4})`,
    'g'
  );

  const issues = [];
  let match;

  while ((match = blockRegex.exec(bodyText)) !== null) {
    const status = match[1];
    const product = match[2].trim();
    const title = match[3].trim();
    const lastUpdated = match[4];
    const id = slugify(title);
    const url = `https://help.salesforce.com/s/issues?q=${encodeURIComponent(title.slice(0, 50))}`;

    if (!issues.find(i => i.id === id)) {
      issues.push({ id, title, product, status, lastUpdated, url });
    }
  }

  return issues;
}

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  try {
    const state = loadState();
    const issues = await scrapeIssues(page);
    console.log(`Found ${issues.length} issues`);
    if (issues.length > 0) console.log('Sample:', JSON.stringify(issues[0], null, 2));

    if (MODE === 'LIST_PRODUCTS') {
      const products = [...new Set(issues.map(i => i.product))];
      console.log('Products:', JSON.stringify(products, null, 2));
      return;
    }

    const newState = {};
    const messages = [];

    for (const issue of issues) {
      const prev = state[issue.id];
      newState[issue.id] = { status: issue.status, title: issue.title };

      if (!prev) {
        messages.push(
          `🆕 *Nouvelle issue*\n*${issue.title}*\nProduit: ${issue.product}\nStatut: ${issue.status} | Mis à jour: ${issue.lastUpdated}\n${issue.url}`
        );
      } else if (prev.status !== issue.status) {
        const emoji = ['Solution Deployed', 'Fixed'].includes(issue.status) ? '✅' : '🔄';
        messages.push(
          `${emoji} *Changement de statut*\n*${issue.title}*\nProduit: ${issue.product}\n${prev.status} → ${issue.status} | Mis à jour: ${issue.lastUpdated}\n${issue.url}`
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
