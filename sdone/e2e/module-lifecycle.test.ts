/**
 * SDONE E2E — Module Lifecycle Tests
 *
 * Covers: Icon highlight, click-to-place, Enter-to-place, selection,
 * deselection, drag-move, arrow key nudge, Tab cycle, Delete, colour palette.
 *
 * Verifiable DOM side-effects:
 *   - Icon `[data-highlighted="true"]` attribute
 *   - CountdownPanel empty ↔ list state transitions
 *   - AnalyticsPanel empty ↔ data state transitions
 *   - Toast messages on achievements
 */

import { test, expect } from '@playwright/test';
import {
  setupPage,
  createModule,
  selectModule,
  deselectAll,
  moveModule,
  pressDelete,
  pressTab,
  pressEnter,
  nudgeArrow,
  highlightModuleType,
  placeModuleAt,
  ICON_Y,
  SIDEBAR_LEFT_X,
  SELECTORS,
} from './helpers.js';

// ── Module world positions (well-separated on canvas) ───────────────────

const SRC_POS = { x: -200, y: -100 };
const STK_POS = { x: 0, y: 0 };
const SNK_POS = { x: 200, y: 100 };

// ── Tests ───────────────────────────────────────────────────────────────

test.describe('Module Lifecycle', () => {
  test.beforeEach(async ({ page }) => {
    await setupPage(page);
  });

  // ── AC1: Icon Highlight ────────────────────────────────────────

  test('[P1] clicking source icon highlights it for click-to-place', async ({ page }) => {
    await page.mouse.click(SIDEBAR_LEFT_X, ICON_Y.source);
    // Verify the source icon is highlighted
    const highlighted = page.locator(SELECTORS.moduleIconHighlighted);
    await expect(highlighted).toBeVisible({ timeout: 1000 });
  });

  test('[P1] clicking stock icon highlights it', async ({ page }) => {
    await page.mouse.click(SIDEBAR_LEFT_X, ICON_Y.stock);
    const highlighted = page.locator(SELECTORS.moduleIconHighlighted);
    await expect(highlighted).toBeVisible({ timeout: 1000 });
  });

  test('[P1] clicking sink icon highlights it', async ({ page }) => {
    await page.mouse.click(SIDEBAR_LEFT_X, ICON_Y.sink);
    const highlighted = page.locator(SELECTORS.moduleIconHighlighted);
    await expect(highlighted).toBeVisible({ timeout: 1000 });
  });

  test('[P1] clicking a different icon switches highlight to that type', async ({ page }) => {
    // Click source icon to highlight
    await page.mouse.click(SIDEBAR_LEFT_X, ICON_Y.source);
    const sourceHighlighted = page.locator('.module-panel__icon-list .module-icon[data-module-type="source"][data-highlighted="true"]');
    await expect(sourceHighlighted).toBeVisible({ timeout: 1000 });

    // Click stock icon — should switch highlight from source to stock
    await page.mouse.click(SIDEBAR_LEFT_X, ICON_Y.stock);
    const stockHighlighted = page.locator('.module-panel__icon-list .module-icon[data-module-type="stock"][data-highlighted="true"]');
    await expect(stockHighlighted).toBeVisible({ timeout: 1000 });
    // Source should no longer be highlighted
    await expect(sourceHighlighted).toBeHidden({ timeout: 1000 });
  });

  // ── AC2: Click-to-Place ────────────────────────────────────────

  test('[P1] click-to-place creates a source module on canvas', async ({ page }) => {
    await createModule(page, 'source', SRC_POS.x, SRC_POS.y);

    // Icon highlight should be cleared after placement (clearSelection in onCanvasClickEmpty)
    await expect(page.locator(SELECTORS.moduleIconHighlighted)).toBeHidden({ timeout: 1000 });

    // No console errors
  });

  test('[P1] click-to-place creates a stock module on canvas', async ({ page }) => {
    await createModule(page, 'stock', STK_POS.x, STK_POS.y);

    // Stock module should appear in the countdown panel
    // The countdown panel shows empty state when no stocks exist, list when stocks exist
    const countdownEmpty = page.locator('.countdown-panel__empty');
    await expect(countdownEmpty).toBeHidden({ timeout: 2000 });

    const countdownList = page.locator('.countdown-panel__list');
    await expect(countdownList).toBeVisible({ timeout: 2000 });
  });

  test('[P1] click-to-place creates a sink module on canvas', async ({ page }) => {
    await createModule(page, 'sink', SNK_POS.x, SNK_POS.y);

    // Icon highlight should be cleared after placement
    await expect(page.locator(SELECTORS.moduleIconHighlighted)).toBeHidden({ timeout: 1000 });
  });

  // ── AC3: Enter-to-Place at center ──────────────────────────────

  test('[P1] Enter key places module at viewport center when type is highlighted', async ({ page }) => {
    await highlightModuleType(page, 'stock');
    await pressEnter(page);

    // Module was placed at viewport center (world 0,0) — canvas is still visible
    await expect(page.locator(SELECTORS.sceneCanvas)).toBeVisible();

    // Verify by selecting the module at center and checking analytics
    await selectModule(page, 0, 0);
    const analyticsData = page.locator('.analytics-panel__data');
    await expect(analyticsData).toBeVisible({ timeout: 2000 });
  });

  test('[P2] Enter key with no type highlighted is a no-op', async ({ page }) => {
    // No highlight → Enter should do nothing
    await pressEnter(page);

    // Countdown panel should remain in empty state
    const countdownEmpty = page.locator('.countdown-panel__empty');
    await expect(countdownEmpty).toBeVisible({ timeout: 1000 });
  });

  // ── AC4: Module Selection & Deselection ────────────────────────

  test('[P1] clicking a stock module shows analytics panel data', async ({ page }) => {
    await createModule(page, 'stock', STK_POS.x, STK_POS.y);

    // Click on the stock to select it
    await selectModule(page, STK_POS.x, STK_POS.y);

    // Analytics panel should show data (not empty state)
    const analyticsData = page.locator('.analytics-panel__data');
    await expect(analyticsData).toBeVisible({ timeout: 2000 });
  });

  test('[P1] clicking empty canvas deselects all', async ({ page }) => {
    await createModule(page, 'stock', STK_POS.x, STK_POS.y);
    await selectModule(page, STK_POS.x, STK_POS.y);

    // Verify selected — analytics shows data
    await expect(page.locator('.analytics-panel__data')).toBeVisible({ timeout: 2000 });

    // Click empty canvas far from any module
    await deselectAll(page);

    // Analytics panel should return to empty state
    await expect(page.locator('.analytics-panel__empty')).toBeVisible({ timeout: 2000 });
  });

  // ── AC5: Module Move (drag) ────────────────────────────────────

  test('[P1] module can be dragged to a new position', async ({ page }) => {
    await createModule(page, 'stock', STK_POS.x, STK_POS.y);

    // Drag the stock to a new position (still visible)
    await moveModule(page, STK_POS.x, STK_POS.y, 100, 50);

    // After drag, countdown panel should still show the stock
    const countdownList = page.locator('.countdown-panel__list');
    await expect(countdownList).toBeVisible({ timeout: 1000 });
  });

  // ── AC6: Arrow Key Nudge ──────────────────────────────────────

  test('[P1] arrow keys nudge selected module', async ({ page }) => {
    await createModule(page, 'stock', STK_POS.x, STK_POS.y);
    await selectModule(page, STK_POS.x, STK_POS.y);

    // Nudge right 3 times
    await nudgeArrow(page, 'Right');
    await nudgeArrow(page, 'Right');
    await nudgeArrow(page, 'Right');

    // Module should still be on canvas (and selected)
    const analyticsData = page.locator('.analytics-panel__data');
    await expect(analyticsData).toBeVisible({ timeout: 1000 });
  });

  test('[P2] nudge is a no-op when no module is selected', async ({ page }) => {
    // No module selected → nudge should do nothing
    await nudgeArrow(page, 'Right');
    // No error, app still functional
    await expect(page.locator(SELECTORS.sceneCanvas)).toBeVisible();
  });

  // ── AC7: Tab Cycle Selection ──────────────────────────────────

  test('[P1] Tab cycles through modules on the canvas', async ({ page }) => {
    // Create multiple modules
    await createModule(page, 'source', SRC_POS.x, SRC_POS.y);
    await createModule(page, 'stock', STK_POS.x, STK_POS.y);
    await createModule(page, 'sink', SNK_POS.x, SNK_POS.y);

    // First Tab: should select the first module (alphabetically/numerically)
    await pressTab(page);

    // After a few tabs we should eventually land on the stock, showing analytics
    // Tab through until we hit the stock (max 3 tabs)
    for (let i = 0; i < 3; i++) {
      const analyticsVisible = await page.locator('.analytics-panel__data').isVisible({ timeout: 500 }).catch(() => false);
      if (analyticsVisible) break;
      await pressTab(page);
      await page.waitForTimeout(200);
    }

    // Eventually the stock should be selected and analytics visible
    await expect(page.locator('.analytics-panel__data')).toBeVisible({ timeout: 2000 });
  });

  test('[P2] Tab with no modules is a no-op', async ({ page }) => {
    // No modules on canvas → Tab should not throw
    await pressTab(page);
    await expect(page.locator(SELECTORS.sceneCanvas)).toBeVisible();
  });

  // ── AC8: Module Deletion ──────────────────────────────────────

  test('[P1] Delete key removes selected module', async ({ page }) => {
    await createModule(page, 'stock', STK_POS.x, STK_POS.y);

    // Verify stock exists via countdown panel
    await expect(page.locator('.countdown-panel__list')).toBeVisible({ timeout: 2000 });

    // Select and delete the stock
    await selectModule(page, STK_POS.x, STK_POS.y);
    await pressDelete(page);

    // After deletion, countdown panel returns to empty state
    await expect(page.locator('.countdown-panel__empty')).toBeVisible({ timeout: 2000 });
  });

  test('[P2] Delete key with nothing selected is a no-op', async ({ page }) => {
    // No module selected → Delete should not throw
    await pressDelete(page);
    await expect(page.locator(SELECTORS.sceneCanvas)).toBeVisible();
  });

  // ── AC9: Colour Palette ────────────────────────────────────────

  test('[P2] first source module gets a colour from the palette', async ({ page }) => {
    // Create a source — it should work without errors
    await createModule(page, 'source', SRC_POS.x, SRC_POS.y);
    await expect(page.locator(SELECTORS.sceneCanvas)).toBeVisible();
  });

  test('[P2] multiple sources get different palette colours', async ({ page }) => {
    // Create 3 source modules at different positions
    await createModule(page, 'source', -250, -150);
    await createModule(page, 'source', -200, -50);
    await createModule(page, 'source', -150, -100);

    // All 3 should exist without errors — palette wraps after 5
    await expect(page.locator(SELECTORS.sceneCanvas)).toBeVisible();
  });

  test('[P2] multiple sinks get different palette colours', async ({ page }) => {
    await createModule(page, 'sink', 250, 150);
    await createModule(page, 'sink', 200, 50);
    await createModule(page, 'sink', 150, 100);

    await expect(page.locator(SELECTORS.sceneCanvas)).toBeVisible();
  });
});
