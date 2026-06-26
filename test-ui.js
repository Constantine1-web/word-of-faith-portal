const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  
  page.on('console', msg => console.log('BROWSER CONSOLE:', msg.text()));
  page.on('pageerror', error => console.log('BROWSER ERROR:', error.message));

  try {
    console.log('Navigating to portal...');
    await page.goto('http://localhost:3000/portal/login', { waitUntil: 'networkidle2' });
    
    // The Faithbot button is floating at the bottom
    console.log('Clicking Faithbot button...');
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const faithbotBtn = btns.find(b => b.style.position === 'fixed');
      if (faithbotBtn) faithbotBtn.click();
    });

    await new Promise(r => setTimeout(r, 1000));
    
    console.log('Typing message...');
    await page.evaluate(() => {
      const input = document.querySelector('input[placeholder="Ask Faithbot..."]');
      if (input) {
        const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
        nativeInputValueSetter.call(input, 'Search Wikipedia for Abraham Lincoln');
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }
    });

    console.log('Clicking send...');
    await page.evaluate(() => {
      // Find the button with the specific SVG for the send icon, or the one next to the input
      const input = document.querySelector('input[placeholder="Ask Faithbot..."]');
      if (input && input.parentElement) {
        const btn = input.parentElement.querySelector('button[type="submit"]');
        if (btn) btn.click();
      }
    });

    console.log('Waiting for response...');
    await new Promise(r => setTimeout(r, 15000));
    
    const messages = await page.evaluate(() => {
      const msgs = Array.from(document.querySelectorAll('p'));
      return msgs.map(m => m.innerText);
    });
    console.log('CHAT MESSAGES:', messages);
    
  } catch (err) {
    console.error('TEST SCRIPT ERROR:', err);
  } finally {
    await browser.close();
  }
})();
