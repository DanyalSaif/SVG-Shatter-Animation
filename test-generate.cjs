const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  page.on('console', msg => console.log('BROWSER CONSOLE:', msg.text()));
  page.on('pageerror', err => console.log('BROWSER ERROR:', err));
  
  await page.goto('http://localhost:5175');
  console.log('Page loaded');
  
  // Wait for the file input to be available
  const fileInput = await page.waitForSelector('input[type="file"]', { timeout: 5000 }).catch(() => null);
  if (!fileInput) {
    console.log('No file input found');
    await browser.close();
    return;
  }
  
  // Create a dummy SVG
  const fs = require('fs');
  fs.writeFileSync('dummy.svg', '<svg width="100" height="100" xmlns="http://www.w3.org/2000/svg"><rect width="100" height="100" fill="red"/></svg>');
  
  await fileInput.setInputFiles('dummy.svg');
  console.log('SVG uploaded');
  
  // Wait for generate button
  const generateBtn = await page.waitForSelector('button:has-text("Generate Shatter")', { timeout: 5000 }).catch(() => null);
  if (!generateBtn) {
    console.log('Generate button not found');
    await browser.close();
    return;
  }
  
  await generateBtn.click();
  console.log('Generate button clicked');
  
  // Wait a bit to see if there are errors or if it finishes
  await page.waitForTimeout(3000);
  console.log('Done waiting');
  
  await browser.close();
})();
