import { chromium } from 'playwright';

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  await page.goto('https://help.salesforce.com/s/issues', {
    waitUntil: 'networkidle',
    timeout: 60000
  });
  await page.waitForTimeout(10000);

  const result = await page.evaluate(() => {
    // On cherche via le texte visible du body
    const bodyText = document.body.innerText;

    // Dump les 200 premiers éléments avec leur tag, classe et texte court
    const allEls = [...document.querySelectorAll('*')];
    const interesting = allEls
      .filter(el => {
        const t = el.innerText?.trim();
        return t && t.length > 10 && t.length < 200 && el.children.length < 3;
      })
      .slice(0, 30)
      .map(el => ({
        tag: el.tagName,
        class: el.className?.toString().slice(0, 80),
        text: el.innerText?.trim().slice(0, 100),
        outerHTML: el.outerHTML?.slice(0, 200),
      }));

    return { bodyPreview: bodyText.slice(500, 1500), interesting };
  });

  console.log('=== BODY (milieu) ===');
  console.log(result.bodyPreview);
  console.log('\n=== ELEMENTS INTERESSANTS ===');
  console.log(JSON.stringify(result.interesting, null, 2));

  await browser.close();
}

main().catch(e => { console.error(e); process.exit(1); });
