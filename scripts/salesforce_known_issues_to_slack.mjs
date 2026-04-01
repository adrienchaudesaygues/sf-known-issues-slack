import { chromium } from 'playwright';

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  await page.goto('https://help.salesforce.com/s/issues', { 
    waitUntil: 'networkidle', 
    timeout: 60000 
  });
  await page.waitForTimeout(5000);

  const html = await page.evaluate(() => {
    // Cherche les éléments qui contiennent des issues
    const candidates = [
      ...document.querySelectorAll('table'),
      ...document.querySelectorAll('[class*="issue"]'),
      ...document.querySelectorAll('[class*="Issue"]'),
      ...document.querySelectorAll('[class*="known"]'),
      ...document.querySelectorAll('[class*="Known"]'),
    ];
    
    return candidates.slice(0, 3).map(el => ({
      tag: el.tagName,
      className: el.className?.slice(0, 100),
      innerHTML: el.innerHTML?.slice(0, 500),
    }));
  });

  console.log('=== STRUCTURE HTML ===');
  console.log(JSON.stringify(html, null, 2));

  await browser.close();
}

main().catch(e => { console.error(e); process.exit(1); });
