const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ headless: "new" });
  const page = await browser.newPage();
  
  page.on('console', msg => console.log('BROWSER LOG:', msg.text()));
  page.on('pageerror', error => console.log('BROWSER ERROR:', error.message));

  console.log("Navigating to page...");
  await page.goto('http://localhost:3000');
  
  console.log("Waiting for Faithbot button...");
  await page.waitForSelector('button:has-text("💬"), button:has-text("✕")');
  
  console.log("Clicking Faithbot button...");
  await page.click('button:has-text("💬"), button:has-text("✕")');
  
  console.log("Waiting a bit...");
  await new Promise(r => setTimeout(r, 3000));
  
  console.log("Done.");
  await browser.close();
})();
