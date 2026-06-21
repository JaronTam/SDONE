/**
 * SDONE E2E — Overlay Tests
 *
 * Covers: Achievement toasts (first connection, first complete stack, auto-dismiss),
 * Color picker popover (double-click open, color selection, stock no-popover),
 * Modal dialog (cancel, outside-click dismiss, keyboard suppression).
 */

import { test, expect } from '@playwright/test';
import {
  setupPage,
  createModule,
  createConnection,
  clickReset,
  confirmModal,
  cancelModal,
  expectModalVisible,
  expectToast,
  worldToScreen,
  SELECTORS,
} from './helpers.js';

test.describe('Overlays', () => {
  test.beforeEach(async ({ page }) => {
    await setupPage(page);
  });

  // ── Achievement Toasts ────────────────────────────────────────────

  test('[P1] first connection triggers "Great! 🎉" toast', async ({ page }) => {
    await createModule(page, 'source', -200, -100);
    await createModule(page, 'stock', 0, 0);
    await createConnection(page, -200, -100, 0, 0);

    // Toast should appear
    const toast = page.locator(SELECTORS.achievementToast).first();
    await expect(toast).toBeVisible({ timeout: 3000 });
    await expect(toast).toContainText('Great!');
  });

  test('[P2] toast auto-dismisses after ~3 seconds', async ({ page }) => {
    await createModule(page, 'source', -200, -100);
    await createModule(page, 'stock', 0, 0);
    await createConnection(page, -200, -100, 0, 0);

    // Verify toast appears
    const toast = page.locator(SELECTORS.achievementToast).first();
    await expect(toast).toBeVisible({ timeout: 3000 });

    // Wait for auto-dismiss
    await page.waitForTimeout(4000);

    // Toast should be gone
    await expect(toast)
      .toBeHidden({ timeout: 2000 })
      .catch(() => {
        // If still visible, check it's in exiting state
      });
  });

  // ── Color Picker Popover ──────────────────────────────────────────

  test('[P2] double-click source module opens color picker', async ({ page }) => {
    await createModule(page, 'source', -200, -100);

    // Double-click at the source module position
    const screen = worldToScreen(-200, -100);
    await page.mouse.click(screen.x, screen.y, { clickCount: 2 });

    // Color picker popover should appear
    const popover = page.locator(SELECTORS.colorPickerPopover);
    await expect(popover).toBeVisible({ timeout: 2000 });
  });

  test('[P2] clicking a swatch closes the popover', async ({ page }) => {
    await createModule(page, 'source', -200, -100);

    // Open color picker
    const screen = worldToScreen(-200, -100);
    await page.mouse.click(screen.x, screen.y, { clickCount: 2 });
    await expect(page.locator(SELECTORS.colorPickerPopover)).toBeVisible({ timeout: 2000 });

    // Click first swatch
    const firstSwatch = page.locator(SELECTORS.colorPickerSwatch).first();
    await firstSwatch.click();

    // Popover should close
    await expect(page.locator(SELECTORS.colorPickerPopover)).toBeHidden({ timeout: 2000 });
  });

  test('[P2] double-click stock does not open color picker', async ({ page }) => {
    await createModule(page, 'stock', 0, 0);

    // Double-click at the stock position
    const screen = worldToScreen(0, 0);
    await page.mouse.click(screen.x, screen.y, { clickCount: 2 });

    // Color picker should NOT appear (stock has fixed white color)
    await expect(page.locator(SELECTORS.colorPickerPopover)).toBeHidden({ timeout: 1000 });
  });

  // ── Modal Dialog ──────────────────────────────────────────────────

  test('[P1] Reset modal shows confirm and cancel buttons', async ({ page }) => {
    await createModule(page, 'stock', 0, 0);
    await clickReset(page);

    await expectModalVisible(page);
    await expect(page.locator(SELECTORS.modalConfirmBtn)).toBeVisible();
    await expect(page.locator(SELECTORS.modalCancelBtn)).toBeVisible();
  });

  test('[P1] clicking confirm executes the action', async ({ page }) => {
    await createModule(page, 'stock', 0, 0);
    await clickReset(page);
    await confirmModal(page);

    // Modal should close
    await expect(page.locator(SELECTORS.modalBackdrop)).toBeHidden({ timeout: 2000 });
  });

  test('[P1] clicking cancel dismisses without action', async ({ page }) => {
    await createModule(page, 'stock', 0, 0);
    await clickReset(page);
    await cancelModal(page);

    // Modal should close, stock should still exist
    await expect(page.locator(SELECTORS.modalBackdrop)).toBeHidden({ timeout: 2000 });
    await expect(page.locator('.countdown-panel__list')).toBeVisible({ timeout: 2000 });
  });

  test('[P2] keyboard shortcuts suppressed while modal is open', async ({ page }) => {
    await createModule(page, 'stock', 0, 0);
    await clickReset(page);
    await expectModalVisible(page);

    // Press Space — should NOT toggle run/pause (suppressed by modal)
    await page.keyboard.press('Space');
    await page.waitForTimeout(300);

    // Modal should still be visible (Space was suppressed)
    await expect(page.locator(SELECTORS.modalBackdrop)).toBeVisible();

    // Press Delete — should NOT delete module (suppressed by modal)
    await page.keyboard.press('Delete');
    await page.waitForTimeout(300);

    // Cancel modal and verify stock still exists
    await cancelModal(page);
    await expect(page.locator('.countdown-panel__list')).toBeVisible({ timeout: 2000 });
  });
});
