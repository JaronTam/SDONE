/**
 * SDONE E2E — Panels Tests
 *
 * Covers: Rate Editor panel (populate, edit, empty state),
 * Analytics panel (populate, empty state, overflow),
 * Countdown panel (rows, row click), panel pin behavior,
 * panel auto-hide/show during run/pause.
 */

import { test, expect } from '@playwright/test';
import {
  setupPage,
  createModule,
  createConnection,
  selectModule,
  deselectAll,
  clickRun,
  pressSpace,
  pressKey,
  isModulePanelVisible,
  worldToScreen,
  SELECTORS,
} from './helpers.js';

test.describe('Panels', () => {
  test.beforeEach(async ({ page }) => {
    await setupPage(page);
  });

  // ── Rate Editor Panel ─────────────────────────────────────────────

  test('[P1] rate editor shows empty state when no connection selected', async ({ page }) => {
    const emptyEl = page.locator('.rate-editor__empty');
    await expect(emptyEl).toBeVisible();
    await expect(emptyEl).toContainText('点击连线编辑速率');
  });

  test('[P1] selecting a connection shows rate value in editor', async ({ page }) => {
    await createModule(page, 'source', -200, -100);
    await createModule(page, 'stock', 0, 0);
    await createConnection(page, -200, -100, 0, 0);

    // Select the connection by clicking near midpoint
    const midX = (-200 + 0) / 2;
    const midY = (-100 + 0) / 2;
    await page.mouse.click(worldToScreen(midX, midY).x, worldToScreen(midX, midY).y);

    // Rate editor form should be visible
    const formEl = page.locator('.rate-editor__form');
    await expect(formEl).toBeVisible({ timeout: 2000 });

    // Rate input should show the default rate value (1)
    const rateInput = page.locator('.rate-editor__input').first();
    await expect(rateInput).toHaveValue('1');
  });

  test('[P1] editing rate updates the value', async ({ page }) => {
    await createModule(page, 'source', -200, -100);
    await createModule(page, 'stock', 0, 0);
    await createConnection(page, -200, -100, 0, 0);

    // Select the connection
    const midX = (-200 + 0) / 2;
    const midY = (-100 + 0) / 2;
    await page.mouse.click(worldToScreen(midX, midY).x, worldToScreen(midX, midY).y);
    await page.waitForTimeout(200);

    // Edit rate value
    const rateInput = page.locator('.rate-editor__input').first();
    await expect(rateInput).toBeVisible({ timeout: 2000 });
    await rateInput.fill('2.5');
    await rateInput.press('Enter');

    // Re-select to verify the rate persisted
    await deselectAll(page);
    await page.waitForTimeout(200);
    await page.mouse.click(worldToScreen(midX, midY).x, worldToScreen(midX, midY).y);
    await page.waitForTimeout(200);

    await expect(page.locator('.rate-editor__input').first()).toHaveValue('2.5');
  });

  test('[P1] selecting a module deselects connection and shows empty editor', async ({ page }) => {
    await createModule(page, 'source', -200, -100);
    await createModule(page, 'stock', 0, 0);
    await createConnection(page, -200, -100, 0, 0);

    // Select connection first
    const midX = (-200 + 0) / 2;
    const midY = (-100 + 0) / 2;
    await page.mouse.click(worldToScreen(midX, midY).x, worldToScreen(midX, midY).y);
    await expect(page.locator('.rate-editor__form')).toBeVisible({ timeout: 2000 });

    // Select stock module — should clear the rate editor
    await selectModule(page, 0, 0);
    await expect(page.locator('.rate-editor__empty')).toBeVisible({ timeout: 2000 });
  });

  // ── Analytics Panel ───────────────────────────────────────────────

  test('[P1] analytics panel shows empty state when no stock selected', async ({ page }) => {
    const emptyEl = page.locator('.analytics-panel__empty');
    await expect(emptyEl).toBeVisible();
    await expect(emptyEl).toContainText('存量模块');
  });

  test('[P1] selecting a stock shows analytics data', async ({ page }) => {
    await createModule(page, 'stock', 0, 0);
    await selectModule(page, 0, 0);

    // Analytics data section should be visible
    const dataEl = page.locator('.analytics-panel__data');
    await expect(dataEl).toBeVisible({ timeout: 2000 });
  });

  test('[P1] deselecting stock clears analytics', async ({ page }) => {
    await createModule(page, 'stock', 0, 0);
    await selectModule(page, 0, 0);
    await expect(page.locator('.analytics-panel__data')).toBeVisible({ timeout: 2000 });

    await deselectAll(page);
    await expect(page.locator('.analytics-panel__empty')).toBeVisible({ timeout: 2000 });
  });

  // ── Countdown Panel ───────────────────────────────────────────────

  test('[P1] countdown panel shows empty state when no stocks exist', async ({ page }) => {
    const emptyEl = page.locator('.countdown-panel__empty');
    await expect(emptyEl).toBeVisible();
    await expect(emptyEl).toContainText('画布上暂无存量模块');
  });

  test('[P1] creating a stock populates countdown panel', async ({ page }) => {
    await createModule(page, 'stock', 0, 0);

    // Countdown panel should show list
    await expect(page.locator('.countdown-panel__list')).toBeVisible({ timeout: 2000 });
  });

  test('[P2] clicking countdown row selects the stock on canvas', async ({ page }) => {
    await createModule(page, 'stock', 0, 0);

    // Click the countdown row
    const row = page.locator('.countdown-panel__row').first();
    await expect(row).toBeVisible({ timeout: 2000 });
    await row.click();

    // Analytics should now show data for the selected stock
    await expect(page.locator('.analytics-panel__data')).toBeVisible({ timeout: 2000 });
  });

  // ── Panel Pin & Auto-hide ─────────────────────────────────────────

  test('[P2] panels auto-hide during simulation (when not pinned)', async ({ page }) => {
    await clickRun(page);
    await page.waitForTimeout(500);

    // Module panel should hide
    const panelHidden = await isModulePanelVisible(page);
    // When not pinned, panel hides during run
    expect(panelHidden).toBe(false);
  });

  test('[P2] panels re-show on pause', async ({ page }) => {
    await clickRun(page);
    await page.waitForTimeout(500);

    // Pause
    await pressSpace(page);
    await page.waitForTimeout(500);

    // Module panel should be visible again
    const panelVisible = await isModulePanelVisible(page);
    expect(panelVisible).toBe(true);
  });

  test('[P2] P key toggles panel pin state', async ({ page }) => {
    // Press P to toggle pin
    await pressKey(page, 'p');
    await page.waitForTimeout(300);

    // Run simulation — pinned panel should stay visible
    await clickRun(page);
    await page.waitForTimeout(500);

    const panelVisible = await isModulePanelVisible(page);
    // Should be visible because pinned
    expect(panelVisible).toBe(true);
  });
});
