import { chromium } from 'playwright';

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  await page.goto('https://help.salesforce.com/s/issues', {
    waitUntil: 'networkidle',
    timeout: 60000
  });
  await page.waitForTimeout(10000);

  const links = await page.evaluate(() => {
    return [...document.querySelectorAll('a')]
      .map(a => ({ text: a.innerText?.trim().slice(0, 80), href: a.href }))
      .filter(l => l.text && l.text.length > 5)
      .slice(0, 40);
  });

  console.log('=== TOUS LES LIENS ===');
  console.log(JSON.stringify(links, null, 2));

  await browser.close();
}

main().catch(e => { console.error(e); process.exit(1); });
