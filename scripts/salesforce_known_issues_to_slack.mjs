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
    const body = document.body.innerText;

    const links = [...document.querySelectorAll('a[href*="issue"]')].slice(0, 5).map(a => ({
      text: a.innerText ? a.innerText.trim() : '',
      href: a.href,
      parentClass: a.parentElement ? a.parentElement.className.slice(0, 100) : '',
      parentHTML: a.parentElement ? a.parentElement.outerHTML.slice(0, 300) : '',
    }));

    const statusEls = [...document.querySelectorAll('*')].filter(el =>
      el.children.length === 0 &&
      ['Known', 'Fixed', 'In Progress', 'No Fix'].includes(el.innerText ? el.innerText.trim() : '')
    ).slice(0, 5).map(el => ({
      text: el.innerText ? el.innerText.trim() : '',
      tag: el.tagName,
      className: el.className ? el.className.slice(0, 100) : '',
      parentHTML: el.parentElement ? el.parentElement.outerHTML.slice(0, 300) : '',
    }));

    return {
      bodyPreview: body.slice(0, 1000),
      links: links,
      statusEls: statusEls
    };
  });

  console.log('=== BODY TEXT ===');
  console.log(result.bodyPreview);
  console.log('=== LINKS WITH ISSUE ===');
  console.log(JSON.stringify(result.links, null, 2));
  console.log('=== STATUS ELEMENTS ===');
  console.log(JSON.stringify(result.statusEls, null, 2));

  await browser.close();
}

main().catch(function(e) { console.error(e); process.exit(1); });
