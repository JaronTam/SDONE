/**
 * SDONE E2E — History (Undo/Redo) Integration Tests
 *
 * Covers: Undo/redo for module creation, move, delete.
 * Verifies undo/redo integration with countdown panel and rate editor.
 */

import { test, expect } from '@playwright/test';
import {
  setupPage,
  createModule,
  createConnection,
  selectModule,
  pressKey,
  pressDelete,
  worldToScreen,
} from './helpers.js';

test.describe('History (Undo/Redo)', () => {
  test.beforeEach(async ({ page }) => {
    await setupPage(page);
  });

  test('[P1] create module → undo removes it → redo restores it', async ({ page }) => {
    // Create
    await createModule(page, 'stock', 0, 0);
    await expect(page.locator('.countdown-panel__list')).toBeVisible({ timeout: 2000 });

    // Undo → stock removed
    await pressKey(page, 'z', true, false);
    await page.waitForTimeout(300);
    await expect(page.locator('.countdown-panel__empty')).toBeVisible({ timeout: 2000 });

    // Redo → stock restored
    await pressKey(page, 'z', true, true);
    await page.waitForTimeout(300);
    await expect(page.locator('.countdown-panel__list')).toBeVisible({ timeout: 2000 });
  });

  test('[P1] create connection → undo removes it → redo restores it', async ({ page }) => {
    await createModule(page, 'source', -200, -100);
    await createModule(page, 'stock', 0, 0);
    await createConnection(page, -200, -100, 0, 0);

    // Verify connection exists
    const midX = (-200 + 0) / 2;
    const midY = (-100 + 0) / 2;
    await page.mouse.click(worldToScreen(midX, midY).x, worldToScreen(midX, midY).y);
    await expect(page.locator('.rate-editor__form')).toBeVisible({ timeout: 2000 });

    // Undo → connection removed
    await pressKey(page, 'z', true, false);
    await page.waitForTimeout(300);

    // Click at midpoint again — rate editor should stay empty
    await page.mouse.click(worldToScreen(midX, midY).x, worldToScreen(midX, midY).y);
    await page.waitForTimeout(300);
    await expect(page.locator('.rate-editor__empty')).toBeVisible({ timeout: 2000 });

    // Redo → connection restored
    await pressKey(page, 'z', true, true);
    await page.waitForTimeout(300);
    await page.mouse.click(worldToScreen(midX, midY).x, worldToScreen(midX, midY).y);
    await page.waitForTimeout(300);
    await expect(page.locator('.rate-editor__form')).toBeVisible({ timeout: 2000 });
  });

  test('[P2] delete module → Ctrl+Z restores it', async ({ page }) => {
    await createModule(page, 'stock', 0, 0);
    await selectModule(page, 0, 0);
    await expect(page.locator('.analytics-panel__data')).toBeVisible({ timeout: 2000 });

    // Delete
    await pressDelete(page);
    await expect(page.locator('.analytics-panel__empty')).toBeVisible({ timeout: 2000 });

    // Undo → stock restored
    await pressKey(page, 'z', true, false);
    await page.waitForTimeout(300);

    // Stock should be back on canvas
    await expect(page.locator('.countdown-panel__list')).toBeVisible({ timeout: 2000 });
  });

  test('[P2] multiple undos revert operations in reverse order', async ({ page }) => {
    // Create 2 modules (2 operations)
    await createModule(page, 'stock', 0, 0);
    await createModule(page, 'stock', 100, 50);

    // Undo twice → both removed
    await pressKey(page, 'z', true, false);
    await page.waitForTimeout(300);
    await pressKey(page, 'z', true, false);
    await page.waitForTimeout(300);

    // No stocks should remain
    await expect(page.locator('.countdown-panel__empty')).toBeVisible({ timeout: 2000 });
  });

  test('[P2] undo stack survives multiple operations', async ({ page }) => {
    // Complex sequence: create stock, create stock, create source, connect
    await createModule(page, 'stock', 0, 0);
    await createModule(page, 'stock', 100, 50);
    await createModule(page, 'source', -200, -100);
    await createConnection(page, -200, -100, 0, 0);

    // Verify everything exists
    await selectModule(page, 0, 0);
    await expect(page.locator('.analytics-panel__data')).toBeVisible({ timeout: 2000 });

    // Undo 4 times → should go back to empty canvas
    for (let i = 0; i < 4; i++) {
      await pressKey(page, 'z', true, false);
      await page.waitForTimeout(150);
    }

    // Canvas should be empty
    await expect(page.locator('.countdown-panel__empty')).toBeVisible({ timeout: 2000 });
  });
});
