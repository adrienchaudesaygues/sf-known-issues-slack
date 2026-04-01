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
  await page.goto('https://help.salesforce.com/s/issues', {
    waitUntil: 'networkidle',
    timeout: 60000
  });
  await page.waitForTimeout(10000);

  return await page.evaluate(() => {
    const STATUSES = ['Solution Deployed', 'In Review', 'Known Issue', 'Fix in Progress', 'No Fix', 'Fixed'];
    const issues = [];

    // Cherche tous les éléments qui contiennent un statut connu
    const allEls = [...document.querySelectorAll('*')];

    for (const el of allEls) {
      if (el.children.length > 0) continue;
      const text = el.innerText?.trim();
      if (!STATUSES.includes(text)) continue;

      // Remonte au conteneur parent de l'issue
      let container = el;
      for (let i = 0; i < 6; i++) {
        container = container.parentElement;
        if (!container) break;
      }
      if (!container) continue;

      const containerText = container.innerText || '';
      const containerHTML = container.innerHTML || '';

      // Titre : premier lien dans le conteneur
      const titleEl = container.querySelector('a');
      const title = titleEl?.innerText?.trim();
      const url = titleEl?.href;
      if (!title || !url) continue;

      // Évite les doublons
      if (issues.find(i => i.url === url)) continue;

      // Updated date
      const updatedMatch = containerText.match(/Updated\s*\n?\s*([A-Z][a-z]{2}\s+\d{1,2},\s+\d{4})/);
      const createdMatch = containerText.match(/Created\s*\n?\s*([A-Z][a-z]{2}\s+\d{1,2},\s+\d{4})/);

      issues.push({
        id: url,
        title,
        url,
        status: text,
        lastUpdated: updatedMatch?.[1] || createdMatch?.[1] || '',
      });
    }

    return issues;
  });
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
      console.log('Issues sample:', JSON.stringify(issues.slice(0, 3), null, 2));
      return;
    }

    const newState = {};
    const messages = [];

    for (const issue of issues) {
      const prev = state[issue.id];
      newState[issue.id] = { status: issue.status, title: issue.title };

      if (!prev) {
        messages.push(
          `🆕 *Nouvelle issue*\n*${issue.title}*\nStatut: ${issue.status} | Mis à jour: ${issue.lastUpdated}\n${issue.url}`
        );
      } else if (prev.status !== issue.status) {
        const emoji = issue.status.toLowerCase().includes('deploy') || issue.status.toLowerCase().includes('fix') ? '✅' : '🔄';
        messages.push(
          `${emoji} *Changement de statut*\n*${issue.title}*\n${prev.status} → ${issue.status} | Mis à jour: ${issue.lastUpdated}\n${issue.url}`
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
