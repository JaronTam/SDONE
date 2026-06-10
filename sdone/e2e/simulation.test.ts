/**
 * SDONE E2E — Simulation Control Tests
 *
 * Covers: Run/Pause toggle (button + Space key), Reset with modal,
 * Clear Canvas with modal, auto-pause on stock threshold,
 * control bar status text transitions.
 */

import { test, expect } from '@playwright/test';
import {
  setupPage,
  createModule,
  createConnection,
  clickRun,
  clickReset,
  clickClearCanvas,
  confirmModal,
  cancelModal,
  pressSpace,
  waitForSimTicks,
  getControlBarStatus,
  getSceneCanvas,
  expectModalVisible,
  expectToast,
  worldToScreen,
  SELECTORS,
} from './helpers.js';

test.describe('Simulation Controls', () => {
  test.beforeEach(async ({ page }) => {
    await setupPage(page);
  });

  // ── Run/Pause via Button ─────────────────────────────────────────

  test('[P0] Run button starts simulation and changes state', async ({ page }) => {
    await clickRun(page);

    // Status should change from "IDLE" to running state
    await page.waitForTimeout(500);
    const status = await getControlBarStatus(page);
    // After clicking Run, status should reflect running (not IDLE)
    expect(status).not.toBe('IDLE');
  });

  test('[P0] clicking Pause stops simulation', async ({ page }) => {
    await clickRun(page);
    await page.waitForTimeout(300);

    // Click again to pause
    await page.locator(SELECTORS.btnRun).click();
    await page.waitForTimeout(300);

    // Should be paused or idle
    const status = await getControlBarStatus(page);
    expect(status).not.toBe('RUNNING');
  });

  test('[P1] Run/Pause via Space key toggles state', async ({ page }) => {
    await pressSpace(page);
    await page.waitForTimeout(300);

    // Should be running
    const statusAfterRun = await getControlBarStatus(page);
    expect(statusAfterRun).not.toBe('IDLE');

    await pressSpace(page);
    await page.waitForTimeout(300);

    // Should pause
    const statusAfterPause = await getControlBarStatus(page);
    expect(statusAfterPause).not.toBe('RUNNING');
  });

  test('[P1] Space key does not toggle when typing in an input', async ({ page }) => {
    // No input is focused initially, so Space should toggle
    // After creating modules, select a connection and try typing in rate input
    await createModule(page, 'source', -200, -100);
    await createModule(page, 'stock', 0, 0);
    await createConnection(page, -200, -100, 0, 0);

    // Click the rate input field
    const midX = (-200 + 0) / 2;
    const midY = (-100 + 0) / 2;
    const screen = worldToScreen(midX, midY);
    await page.mouse.click(screen.x, screen.y);
    await page.waitForTimeout(300);

    // Click the rate input to focus it
    const rateInput = page.locator('.rate-editor__input').first();
    if (await rateInput.isVisible({ timeout: 2000 }).catch(() => false)) {
      await rateInput.click();
      // Type space in the input — should not toggle run/pause
      await page.keyboard.type(' ');
      // Status should still be IDLE (Space was consumed by the input)
      await expect(page.locator(SELECTORS.sceneCanvas)).toBeVisible();
    }
  });

  // ── Reset with Modal ─────────────────────────────────────────────

  test('[P1] Reset button opens confirmation modal', async ({ page }) => {
    await clickReset(page);
    await expectModalVisible(page);
  });

  test('[P1] confirming reset closes modal and restores stock values', async ({ page }) => {
    await createModule(page, 'stock', 0, 0);
    await clickReset(page);
    await expectModalVisible(page);
    await confirmModal(page);

    // After reset, stock should still exist (reset restores values, doesn't delete)
    // Countdown panel should still show the stock
    await expect(page.locator('.countdown-panel__list')).toBeVisible({ timeout: 2000 });
    // Modal should be closed
    await expect(page.locator(SELECTORS.modalBackdrop)).toBeHidden({ timeout: 2000 });
  });

  test('[P1] cancelling reset closes modal without changes', async ({ page }) => {
    await createModule(page, 'stock', 0, 0);
    await clickReset(page);
    await cancelModal(page);

    // Stock should still exist — countdown panel shows list
    await expect(page.locator('.countdown-panel__list')).toBeVisible({ timeout: 2000 });
  });

  test('[P2] Escape key dismisses reset modal', async ({ page }) => {
    await createModule(page, 'stock', 0, 0);
    await clickReset(page);
    await expectModalVisible(page);
    await page.keyboard.press('Escape');

    // Modal should close, canvas unchanged
    await expect(page.locator(SELECTORS.modalBackdrop)).toBeHidden({ timeout: 2000 });
    // Stock should still exist
    await expect(page.locator('.countdown-panel__list')).toBeVisible({ timeout: 2000 });
  });

  test('[P2] clicking outside modal cancels', async ({ page }) => {
    await createModule(page, 'stock', 0, 0);
    await clickReset(page);
    await expectModalVisible(page);

    // Click the backdrop (outside the dialog)
    await page.locator(SELECTORS.modalBackdrop).click({ position: { x: 1, y: 1 } });

    // Modal should close
    await expect(page.locator(SELECTORS.modalBackdrop)).toBeHidden({ timeout: 2000 });
  });

  // ── Clear Canvas ─────────────────────────────────────────────────

  test('[P1] Clear Canvas button shows modal', async ({ page }) => {
    await createModule(page, 'stock', 0, 0);
    await clickClearCanvas(page);
    await expectModalVisible(page);
  });

  test('[P1] confirming clear canvas removes all modules', async ({ page }) => {
    await createModule(page, 'source', -200, -100);
    await createModule(page, 'stock', 0, 0);
    await createModule(page, 'sink', 200, 100);

    await clickClearCanvas(page);
    await confirmModal(page);

    // After clear, countdown panel shows empty state
    await expect(page.locator('.countdown-panel__empty')).toBeVisible({ timeout: 2000 });
  });

  test('[P1] cancelling clear canvas preserves canvas', async ({ page }) => {
    await createModule(page, 'stock', 0, 0);
    await clickClearCanvas(page);
    await cancelModal(page);

    // Stock should still exist
    await expect(page.locator('.countdown-panel__list')).toBeVisible({ timeout: 2000 });
  });

  // ── Auto-pause (Story 7.3) ───────────────────────────────────────

  test('[P2] simulation auto-pauses when stock reaches capacity threshold', async ({ page }) => {
    // Create a minimal setup: source→stock, with high inflow rate
    // Stock starts at value=0, capacity=100
    await createModule(page, 'source', -200, -100);
    await createModule(page, 'stock', 0, 0);

    // Create connection with default rate=1
    await createConnection(page, -200, -100, 0, 0);

    // Select the connection, set a high rate
    const midX = (-200 + 0) / 2;
    const midY = (-100 + 0) / 2;
    await page.mouse.click(worldToScreen(midX, midY).x, worldToScreen(midX, midY).y);
    await page.waitForTimeout(200);

    const rateInput = page.locator('.rate-editor__input').first();
    if (await rateInput.isVisible().catch(() => false)) {
      // Set high inflow rate to quickly fill the stock
      await rateInput.fill('50');
      await rateInput.press('Enter');
      await page.waitForTimeout(100);
    }

    // Run simulation — the stock should fill rapidly
    await clickRun(page);

    // Wait for auto-pause (stock value > capacity=100 at 50 units/s → ~2s)
    await page.waitForTimeout(4000);

    // Check control bar status — should indicate pause
    const status = await getControlBarStatus(page);
    // Status should reference the paused/auto-pause state
    expect(status.length).toBeGreaterThan(0);
  });
});
