import { chromium } from 'playwright';

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  await page.goto('https://help.salesforce.com/s/issues', { 
    waitUntil: 'networkidle', 
    timeout: 60000 
  });
  
  // Attendre plus longtemps que la SPA charge
  await page.waitForTimeout(10000);

  const result = await page.evaluate(() => {
    // Dump tout le texte visible de la page pour voir ce qui est chargé
    const body = document.body.innerText;
    
    // Cherche tous les liens qui ressemblent à des issues
    const links = [...document.querySelectorAll('a[href*="issue"]')].slice(0, 5).map(a => ({
      text: a.innerText?.trim(),
      href: a.href,
      parentClass: a.parentElement?.className?.slice(0, 100),
      parentHTML: a.parentElement?.outerHTML?.slice(0, 300),
    }));

    // Cherche les éléments avec du texte comme "Known" ou "Fixed"
    const statusEls = [...document.querySelectorAll('*')].filter(el => 
      el.children.length === 0 && 
      ['Known', 'Fixed', 'In Progress', 'No Fix'].includes(el.innerText?.trim())
    ).slice(0, 5).map(el => ({
      text: el.innerText?.trim(),
      tag: el.tagName,
      className: el.className?.slice(0, 100),
      parentHTML: el.parentElement?.outerHTML?.slice(0, 300),
    }));

    return { 
      bodyPreview: body.slice(0, 1000),
      links,
      statusEls
    };
  });

  console.log('=== BODY TEXT ===');
  console.log(result.bodyPreview);
  console.log('=== LINKS WITH ISSUE
