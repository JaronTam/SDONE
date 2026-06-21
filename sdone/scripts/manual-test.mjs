import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.goto('http://localhost:5173', { waitUntil: 'networkidle' });

  // Screenshot 1: Initial state
  await page.screenshot({ path: 'test-manual-1-initial.png' });
  console.log('Screenshot 1: Initial state');

  // Find and click the stock module button
  const stockBtn = page.locator('.module-panel__btn--stock');
  if ((await stockBtn.count()) > 0) {
    await stockBtn.click();
    await page.waitForTimeout(500);

    // Click on canvas to place stock
    const canvas = page.locator('canvas').first();
    const box = await canvas.boundingBox();
    if (box) {
      await page.mouse.click(box.x + 400, box.y + 300);
      await page.waitForTimeout(1000);
    }
  }

  // Screenshot 2: After placing stock
  await page.screenshot({ path: 'test-manual-2-stock-placed.png' });
  console.log('Screenshot 2: Stock placed');

  // Check if capacity input popover appeared
  const popover = page.locator('.capacity-input-popover');
  if ((await popover.count()) > 0) {
    const input = popover.locator('input');
    if ((await input.count()) > 0) {
      await input.click({ clickCount: 3 });
      await input.type('200');
      await page.keyboard.press('Enter');
      await page.waitForTimeout(500);
    }
  }

  // Screenshot 3: After capacity input
  await page.screenshot({ path: 'test-manual-3-capacity-set.png' });
  console.log('Screenshot 3: Capacity set');

  // Click on the stock to select it
  const canvas2 = page.locator('canvas').first();
  const box2 = await canvas2.boundingBox();
  if (box2) {
    await page.mouse.click(box2.x + 400, box2.y + 300);
    await page.waitForTimeout(500);
  }

  // Screenshot 4: Stock selected with analytics panel
  await page.screenshot({ path: 'test-manual-4-selected.png' });
  console.log('Screenshot 4: Stock selected');

  // Check analytics panel for capacity display
  const capDisplay = await page.evaluate(() => {
    const capEl = document.querySelector('.analytics-panel__field-value--capacity');
    return capEl ? capEl.value || capEl.textContent : null;
  });
  console.log('Capacity display value:', capDisplay);

  // Test: Try to set capacity to 0 in analytics panel (should be rejected)
  const capInput = page.locator('.analytics-panel__field-value--capacity');
  if ((await capInput.count()) > 0) {
    await capInput.click({ clickCount: 3 });
    await capInput.type('0');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(300);

    const afterZero = await page.evaluate(() => {
      const el = document.querySelector('.analytics-panel__field-value--capacity');
      return el ? el.value : null;
    });
    console.log('After entering 0 (should revert):', afterZero);
  }

  // Screenshot 5: After zero input test
  await page.screenshot({ path: 'test-manual-5-zero-revert.png' });
  console.log('Screenshot 5: Zero revert test');

  await browser.close();
  console.log('Manual test complete!');
})().catch((e) => console.error('Error:', e));
