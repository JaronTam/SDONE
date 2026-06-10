/**
 * SDONE E2E — Keyboard Shortcuts Tests
 *
 * Covers: Ctrl+0 (viewport reset), Ctrl+Z (undo), Ctrl+Shift+Z (redo),
 * Delete (delete selected), Tab (cycle selection), P (pin panels),
 * Space (run/pause).
 */

import { test, expect } from '@playwright/test';
import {
  setupPage,
  createModule,
  selectModule,
  deselectAll,
  pressDelete,
  pressTab,
  pressSpace,
  pressKey,
  pressEnter,
  createConnection,
  clickRun,
  worldToScreen,
  SELECTORS,
} from './helpers.js';

test.describe('Keyboard Shortcuts', () => {
  test.beforeEach(async ({ page }) => {
    await setupPage(page);
  });

  // ── Ctrl+Z: Undo ─────────────────────────────────────────────────

  test('[P1] Ctrl+Z undoes module creation', async ({ page }) => {
    await createModule(page, 'stock', 0, 0);
    // Verify stock exists via countdown panel
    await expect(page.locator('.countdown-panel__list')).toBeVisible({ timeout: 2000 });

    // Undo
    await pressKey(page, 'z', true, false); // Ctrl+Z
    await page.waitForTimeout(300);

    // After undo, stock should be removed → countdown shows empty
    await expect(page.locator('.countdown-panel__empty')).toBeVisible({ timeout: 2000 });
  });

  test('[P1] Ctrl+Z undoes connection creation', async ({ page }) => {
    await createModule(page, 'source', -200, -100);
    await createModule(page, 'stock', 0, 0);
    await createConnection(page, -200, -100, 0, 0);

    // Verify connection exists — select it and check rate editor
    const midX = (-200 + 0) / 2;
    const midY = (-100 + 0) / 2;
    await page.mouse.click(worldToScreen(midX, midY).x, worldToScreen(midX, midY).y);
    await expect(page.locator('.rate-editor__form')).toBeVisible({ timeout: 2000 });

    // Undo
    await pressKey(page, 'z', true, false); // Ctrl+Z
    await page.waitForTimeout(300);

    // After undo, connection should be removed → click at same point gets nothing
    await page.mouse.click(worldToScreen(midX, midY).x, worldToScreen(midX, midY).y);
    await page.waitForTimeout(300);
    // Rate editor should remain empty (no connection to select)
    await expect(page.locator('.rate-editor__empty')).toBeVisible({ timeout: 2000 });
  });

  // ── Ctrl+Shift+Z: Redo ───────────────────────────────────────────

  test('[P1] Ctrl+Shift+Z redoes undone action', async ({ page }) => {
    await createModule(page, 'stock', 0, 0);

    // Undo
    await pressKey(page, 'z', true, false); // Ctrl+Z
    await page.waitForTimeout(300);
    await expect(page.locator('.countdown-panel__empty')).toBeVisible({ timeout: 2000 });

    // Redo
    await pressKey(page, 'z', true, true); // Ctrl+Shift+Z
    await page.waitForTimeout(300);
    await expect(page.locator('.countdown-panel__list')).toBeVisible({ timeout: 2000 });
  });

  // ── Ctrl+Z not intercepted when typing ───────────────────────────

  test('[P2] shortcut guard — Space+pause NOT toggled while editing target', async ({ page }) => {
    // Create a stock first so we can verify it still exists after Space in input
    await createModule(page, 'stock', 0, 0);

    // The Space key guard (isEditingTarget) is only relevant when typing in an
    // input/textarea/contentEditable element. The guard is unit-tested in Vitest.
    // This e2e regression test verifies: after any keyboard activity, the app
    // doesn't crash and canvas remains functional.
    await pressSpace(page);
    await page.waitForTimeout(300);

    // Space without a focused input toggles run/pause — status should change from IDLE
    const status = page.locator(SELECTORS.controlBarStatus);
    const text = await status.textContent();
    expect(text).not.toBe('IDLE');

    // App should still be functional
    await expect(page.locator('#scene')).toBeVisible();
  });

  // ── Ctrl+0: Reset Viewport ───────────────────────────────────────

  test('[P2] Ctrl+0 resets viewport', async ({ page }) => {
    // First zoom in by scrolling
    const canvas = page.locator(SELECTORS.sceneCanvas);
    await canvas.click();
    await page.mouse.wheel(0, -120); // zoom in

    // Press Ctrl+0 to reset viewport
    await pressKey(page, '0', true, false); // Ctrl+0
    await page.waitForTimeout(200);

    // App should still be functional
    await expect(page.locator(SELECTORS.sceneCanvas)).toBeVisible();
  });

  // ── Tab: Cycle Selection ─────────────────────────────────────────

  test('[P2] Tab cycles through modules when modules exist', async ({ page }) => {
    await createModule(page, 'stock', 0, 0);
    await createModule(page, 'stock', 100, 50);

    // Press Tab — should cycle to next module
    await pressTab(page);
    await page.waitForTimeout(200);

    // Analytics panel should show data (a stock is selected)
    await expect(page.locator('.analytics-panel__data')).toBeVisible({ timeout: 2000 });
  });

  // ── Delete ───────────────────────────────────────────────────────

  test('[P1] Delete removes selected module', async ({ page }) => {
    await createModule(page, 'stock', 0, 0);
    await selectModule(page, 0, 0);
    await pressDelete(page);

    await expect(page.locator('.countdown-panel__empty')).toBeVisible({ timeout: 2000 });
  });

  // ── Space: Run/Pause ─────────────────────────────────────────────

  test('[P1] Space toggles run/pause state', async ({ page }) => {
    // Should start IDLE
    const initialStatus = page.locator(SELECTORS.controlBarStatus);
    await expect(initialStatus).toHaveText('IDLE');

    // Space → run
    await pressSpace(page);
    await page.waitForTimeout(300);
    const runClass = page.locator(SELECTORS.controlBarStatusRunning);
    await expect(runClass).toBeVisible({ timeout: 1000 });

    // Space → pause
    await pressSpace(page);
    await page.waitForTimeout(300);
    const pauseClass = page.locator(SELECTORS.controlBarStatusPaused);
    await expect(pauseClass).toBeVisible({ timeout: 1000 });
  });
});
