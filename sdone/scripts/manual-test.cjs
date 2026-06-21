const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });
  await page.goto('http://localhost:5173', { waitUntil: 'networkidle0' });

  // Screenshot 1: Initial state
  await page.screenshot({ path: 'test-manual-1-initial.png' });
  console.log('✅ Screenshot 1: Initial state');

  // Find and click the stock module button
  const stockBtnSelector = '.module-panel__btn--stock';
  const stockBtn = await page.$(stockBtnSelector);
  if (stockBtn) {
    await stockBtn.click();
    await page.waitForTimeout(500);

    // Click on canvas to place stock
    const canvas = await page.$('canvas');
    if (canvas) {
      const box = await canvas.boundingBox();
      if (box) {
        await page.mouse.click(box.x + 400, box.y + 300);
        await page.waitForTimeout(1000);
      }
    }
  }

  // Screenshot 2: After placing stock (should show capacity popover or stock on canvas)
  await page.screenshot({ path: 'test-manual-2-stock-placed.png' });
  console.log('✅ Screenshot 2: Stock placed');

  // Check if capacity input popover appeared
  const popover = await page.$('.capacity-input-popover');
  if (popover) {
    const input = await page.$('.capacity-input-popover__input');
    if (input) {
      // Type a valid capacity value
      await input.click({ clickCount: 3 });
      await input.type('200');
      await page.keyboard.press('Enter');
      await page.waitForTimeout(500);
    }
  }

  // Screenshot 3: After capacity input
  await page.screenshot({ path: 'test-manual-3-capacity-set.png' });
  console.log('✅ Screenshot 3: Capacity set');

  // Click on the stock to select it and show analytics panel
  const canvas2 = await page.$('canvas');
  if (canvas2) {
    const box = await canvas2.boundingBox();
    if (box) {
      await page.mouse.click(box.x + 400, box.y + 300);
      await page.waitForTimeout(500);
    }
  }

  // Screenshot 4: Stock selected with analytics panel
  await page.screenshot({ path: 'test-manual-4-selected.png' });
  console.log('✅ Screenshot 4: Stock selected');

  // Check analytics panel for capacity display
  const capDisplay = await page.evaluate(() => {
    const capEl = document.querySelector('.analytics-panel__field-value--capacity');
    return capEl ? capEl.value || capEl.textContent : null;
  });
  console.log('📊 Capacity display value:', capDisplay);

  // Test: Try to set capacity to 0 in analytics panel (should be rejected by mutation)
  const capInput = await page.$('.analytics-panel__field-value--capacity');
  if (capInput) {
    await capInput.click({ clickCount: 3 });
    await capInput.type('0');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(300);

    const afterZero = await page.evaluate(() => {
      const el = document.querySelector('.analytics-panel__field-value--capacity');
      return el ? el.value : null;
    });
    console.log('📊 After entering 0 (should revert):', afterZero);
  }

  // Screenshot 5: After zero input test
  await page.screenshot({ path: 'test-manual-5-zero-revert.png' });
  console.log('✅ Screenshot 5: Zero revert test');

  await browser.close();
  console.log('\n✅ Manual test complete!');
})().catch((e) => console.error('❌ Error:', e));
