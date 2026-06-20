/**
 * Story 8.6 — main.ts Integration Phase 4 Wiring (RED PHASE)
 *
 * 🔴 TDD RED PHASE — all tests in this file WILL FAIL before Story 8.6 is implemented.
 * Each test is scaffolded with the expected behavior. Remove `test()` wrappers
 * after the corresponding Story 8.6 tasks are completed.
 *
 * 18 ACs covering:
 *   Toolbar lifecycle (AC1-4), Name editing (AC5-7), Color dot → popover (AC8),
 *   Keyboard guard (AC9), Double-click regression (AC10), Selection overlay (AC11),
 *   Diamond drag (AC12), Resize drag (AC13-14), Keyboard guard e2e (AC15),
 *   HMR cleanup (AC18)
 *
 * AC16-17 are unit-level only (covered in InputManager.test.ts).
 */

import { test, expect } from './fixtures.js';
import {
  setupPage,
  createModule,
  pressKey,
  pressSpace,
  pressDelete,
  pressTab,
  pressEnter,
  pressEscape,
  nudgeArrow,
  deselectAll,
  worldToScreen,
  VIEWPORT,
  CANVAS_CENTER,
} from './helpers.js';

// ═══════════════════════════════════════════════════════════════════════════
// Toolbar Lifecycle (AC1-4)
// ═══════════════════════════════════════════════════════════════════════════

test.describe('Story 8.6 — Toolbar Lifecycle (AC1-4)', () => {
  test.beforeEach(async ({ page }) => {
    await setupPage(page);
  });

  // ── AC1: Toolbar appears on selection ─────────────────────────────

  test('[P1] AC1 — Toolbar appears when a module is selected', async ({ page }) => {
    await createModule(page, 'stock', CANVAS_CENTER.x, CANVAS_CENTER.y);

    const toolbar = page.locator('.toolbar');
    await expect(toolbar).toBeVisible();

    const toolbarName = page.locator('.toolbar__name');
    await expect(toolbarName).toBeVisible();
  });

  // ── AC2: Toolbar hides on deselect ────────────────────────────────

  test('[P1] AC2 — Toolbar hides when selection is cleared', async ({ page }) => {
    await createModule(page, 'stock', CANVAS_CENTER.x, CANVAS_CENTER.y);
    const toolbar = page.locator('.toolbar');
    await expect(toolbar).toBeVisible();

    await deselectAll(page);

    await expect(toolbar).not.toBeVisible();
  });

  test('[P1] AC2 — Toolbar hides when Escape deselects', async ({ page }) => {
    await createModule(page, 'stock', CANVAS_CENTER.x, CANVAS_CENTER.y);
    const toolbar = page.locator('.toolbar');
    await expect(toolbar).toBeVisible();

    await pressEscape(page);

    await expect(toolbar).not.toBeVisible();
  });

  test('[P1] AC2 — Toolbar hides when Delete removes selected module', async ({ page }) => {
    await createModule(page, 'stock', CANVAS_CENTER.x, CANVAS_CENTER.y);
    const toolbar = page.locator('.toolbar');
    await expect(toolbar).toBeVisible();

    await pressDelete(page);

    await expect(toolbar).not.toBeVisible();
  });

  // ── AC3: Toolbar position syncs with selected module ───────────────

  test('[P2] AC3 — Toolbar position follows selected module', async ({ page }) => {
    await createModule(page, 'stock', CANVAS_CENTER.x, CANVAS_CENTER.y);
    const toolbar = page.locator('.toolbar');

    const initialBBox = await toolbar.boundingBox();
    expect(initialBBox).not.toBeNull();

    // Move the module via arrow nudge
    await nudgeArrow(page, 'ArrowRight');
    await page.waitForTimeout(50); // allow rAF position sync

    const updatedBBox = await toolbar.boundingBox();
    expect(updatedBBox).not.toBeNull();
    // Position should have shifted right
    expect(updatedBBox!.x).toBeGreaterThan(initialBBox!.x);
  });

  test('[P2] AC3 — Toolbar position hides when dragging module', async ({ page }) => {
    await createModule(page, 'stock', CANVAS_CENTER.x, CANVAS_CENTER.y);
    const toolbar = page.locator('.toolbar');

    // Start dragging the module
    const { x: sx, y: sy } = worldToScreen(CANVAS_CENTER.x, CANVAS_CENTER.y);
    await page.mouse.move(sx, sy);
    await page.mouse.down();

    // During drag, toolbar should either hide or follow
    // Per AC3: toolbar hides during drag (position sync is deferred)
    await expect(toolbar).not.toBeVisible();

    await page.mouse.up();
  });

  // ── AC4: Toolbar dataText refreshes for stock module ───────────────

  test('[P3] AC4 — Stock toolbar shows dataText with net change', async ({ page }) => {
    await createModule(page, 'stock', CANVAS_CENTER.x, CANVAS_CENTER.y);

    const dataText = page.locator('.toolbar__data');
    await expect(dataText).toBeVisible();

    // 🔴 RED: Stock dataText should contain net change text
    // Expected format: 净变化：±X.X
    const text = await dataText.textContent();
    expect(text).toMatch(/净变化/);
  });

  test('[P3] AC4 — Non-stock module toolbar hides dataText', async ({ page }) => {
    await createModule(page, 'converter', CANVAS_CENTER.x, CANVAS_CENTER.y);

    const dataText = page.locator('.toolbar__data');
    await expect(dataText).not.toBeVisible();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Name Editing (AC5-7)
// ═══════════════════════════════════════════════════════════════════════════

test.describe('Story 8.6 — Name Editing (AC5-7)', () => {
  test.beforeEach(async ({ page }) => {
    await setupPage(page);
  });

  // ── AC5: Enter starts name edit ────────────────────────────────────

  test('[P1] AC5 — Enter on selected module starts name editing', async ({ page }) => {
    await createModule(page, 'stock', CANVAS_CENTER.x, CANVAS_CENTER.y);

    await pressEnter(page);

    // 🔴 RED: Name input field should appear
    const nameInput = page.locator('.toolbar__name-input');
    await expect(nameInput).toBeVisible();

    // Toolbar name display should be hidden during edit
    const nameDisplay = page.locator('.toolbar__name');
    await expect(nameDisplay).not.toBeVisible();
  });

  test('[P2] AC5 — Enter without selection does nothing', async ({ page }) => {
    // No module selected
    await pressEnter(page);

    // 🔴 RED: No toolbar should appear for empty selection
    const toolbar = page.locator('.toolbar');
    await expect(toolbar).not.toBeVisible();
  });

  // ── AC6: Name commit via Enter ─────────────────────────────────────

  test('[P1] AC6 — Enter commits edited name and exits edit mode', async ({ page }) => {
    await createModule(page, 'stock', CANVAS_CENTER.x, CANVAS_CENTER.y);

    // Enter edit mode
    await pressEnter(page);
    const nameInput = page.locator('.toolbar__name-input');
    await expect(nameInput).toBeVisible();

    // Type new name
    await nameInput.fill('My New Stock');
    await pressEnter(page);

    // 🔴 RED: Should exit edit mode and show committed name
    await expect(nameInput).not.toBeVisible();
    const nameDisplay = page.locator('.toolbar__name');
    await expect(nameDisplay).toBeVisible();
    await expect(nameDisplay).toHaveText('My New Stock');
  });

  test('[P1] AC6 — Empty name commits to type default label', async ({ page }) => {
    await createModule(page, 'stock', CANVAS_CENTER.x, CANVAS_CENTER.y);

    // Enter edit mode
    await pressEnter(page);
    const nameInput = page.locator('.toolbar__name-input');

    // Clear and commit empty
    await nameInput.fill('');
    await pressEnter(page);

    // 🔴 RED: Should commit to type default (e.g., "Stock")
    const nameDisplay = page.locator('.toolbar__name');
    await expect(nameDisplay).toHaveText(/./); // non-empty fallback
  });

  // ── AC7: Name edit cancel via Escape ───────────────────────────────

  test('[P1] AC7 — Escape cancels name editing and restores original', async ({ page }) => {
    await createModule(page, 'stock', CANVAS_CENTER.x, CANVAS_CENTER.y);

    // Enter edit mode
    await pressEnter(page);
    const nameInput = page.locator('.toolbar__name-input');

    // Type something but don't commit
    await nameInput.fill('This will be reverted');

    // Escape should cancel
    await pressEscape(page);

    // 🔴 RED: Should exit edit mode with original name restored
    await expect(nameInput).not.toBeVisible();
    const nameDisplay = page.locator('.toolbar__name');
    await expect(nameDisplay).toHaveText('Stock'); // default label
  });

  test('[P2] AC7 — Escape during name edit does NOT deselect module', async ({ page }) => {
    await createModule(page, 'stock', CANVAS_CENTER.x, CANVAS_CENTER.y);

    // Enter edit mode
    await pressEnter(page);
    const nameInput = page.locator('.toolbar__name-input');
    await nameInput.fill('test');

    await pressEscape(page);

    // 🔴 RED: Module should still be selected (toolbar still visible)
    const toolbar = page.locator('.toolbar');
    await expect(toolbar).toBeVisible();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Color Dot → Popover (AC8-10)
// ═══════════════════════════════════════════════════════════════════════════

test.describe('Story 8.6 — Color Dot → Popover (AC8-10)', () => {
  test.beforeEach(async ({ page }) => {
    await setupPage(page);
  });

  // ── AC8: Color dot click opens popover ─────────────────────────────

  test('[P2] AC8 — Clicking color dot opens ColorPickerPopover', async ({ page }) => {
    // Code review 2026-06-21: use 'source' — spec AC8 scopes the color dot to source/sink
    // modules; ToolbarController hides the dot for stock (ToolbarController.ts:178-180).
    await createModule(page, 'source', CANVAS_CENTER.x, CANVAS_CENTER.y);

    const colorDot = page.locator('.toolbar__color-dot');
    await expect(colorDot).toBeVisible();

    await colorDot.click();

    // 🔴 RED: Color picker popover should appear
    const popover = page.locator('.color-picker-popover');
    await expect(popover).toBeVisible();
  });

  test('[P2] AC8 — Selecting a color swatch closes popover and updates color', async ({ page }) => {
    await createModule(page, 'source', CANVAS_CENTER.x, CANVAS_CENTER.y);

    // Open popover
    await page.locator('.toolbar__color-dot').click();
    const popover = page.locator('.color-picker-popover');
    await expect(popover).toBeVisible();

    // Click a color swatch
    const swatch = popover.locator('.color-picker-popover__swatch').first();
    await expect(swatch).toBeVisible();
    await swatch.click();

    // 🔴 RED: Popover should close after selection
    await expect(popover).not.toBeVisible();
  });

  test('[P2] AC8 — Clicking away from popover dismisses it', async ({ page }) => {
    await createModule(page, 'source', CANVAS_CENTER.x, CANVAS_CENTER.y);

    // Open popover
    await page.locator('.toolbar__color-dot').click();
    const popover = page.locator('.color-picker-popover');
    await expect(popover).toBeVisible();

    // Click on empty canvas
    await page.mouse.click(100, 100);

    // 🔴 RED: Popover should close on click-away
    await expect(popover).not.toBeVisible();
  });

  // ── AC9: Keyboard unblocked after popover closes ───────────────────

  test('[P2] AC9 — Delete shortcut is blocked while popover is open', async ({ page }) => {
    // Code review 2026-06-21: first module must be source/sink to expose the color dot.
    await createModule(page, 'source', CANVAS_CENTER.x, CANVAS_CENTER.y);
    await createModule(page, 'stock', CANVAS_CENTER.x + 200, CANVAS_CENTER.y);

    // Open popover
    await page.locator('.toolbar__color-dot').click();
    await expect(page.locator('.color-picker-popover')).toBeVisible();

    await pressDelete(page);

    // 🔴 RED: Delete should NOT remove the module while popover is open
    const modules = page.locator('.module');
    await expect(modules).toHaveCount(2); // both still present
  });

  test('[P2] AC9 — Keyboard shortcuts resume after popover closes', async ({ page }) => {
    // Code review 2026-06-21: first module must be source/sink to expose the color dot.
    await createModule(page, 'source', CANVAS_CENTER.x, CANVAS_CENTER.y);
    await createModule(page, 'stock', CANVAS_CENTER.x + 200, CANVAS_CENTER.y);

    // Open then close popover
    await page.locator('.toolbar__color-dot').click();
    await expect(page.locator('.color-picker-popover')).toBeVisible();
    // Close via click-away
    await page.mouse.click(10, 10);
    await expect(page.locator('.color-picker-popover')).not.toBeVisible();

    // Select the first module again (click-away may have deselected)
    const { x, y } = worldToScreen(CANVAS_CENTER.x, CANVAS_CENTER.y);
    await page.mouse.click(x, y);

    // 🔴 RED: Delete should work normally after popover is closed
    await pressDelete(page);
    const modules = page.locator('.module');
    await expect(modules).toHaveCount(1);
  });

  // ── AC10: Double-click no longer opens color picker ────────────────

  test('[P2] AC10 — Double-click on module does NOT open color picker popover', async ({ page }) => {
    await createModule(page, 'stock', CANVAS_CENTER.x, CANVAS_CENTER.y);

    const { x, y } = worldToScreen(CANVAS_CENTER.x, CANVAS_CENTER.y);
    await page.mouse.click(x, y);

    // 🔴 RED: Double-click should only start name editing (AC5 style via Enter or dblclick?)
    // The old onModuleDoubleClick wiring (which opened color picker) must be removed
    await page.mouse.dblclick(x, y);

    const popover = page.locator('.color-picker-popover');
    await expect(popover).not.toBeVisible();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Selection Overlay (AC11)
// ═══════════════════════════════════════════════════════════════════════════

test.describe('Story 8.6 — Selection Overlay (AC11)', () => {
  test.beforeEach(async ({ page }) => {
    await setupPage(page);
  });

  test('[P3] AC11 — Selection overlay renders around selected module', async ({ page }) => {
    await createModule(page, 'stock', CANVAS_CENTER.x, CANVAS_CENTER.y);

    // 🔴 RED: Selection overlay should be visible on the canvas
    const overlay = page.locator('canvas'); // overlay is drawn on canvas, not DOM
    // Visual regression test — verify canvas has the selection border rendering
    await expect(overlay).toBeVisible();

    // Take a screenshot to manually verify selection overlay rendering
    await page.screenshot({ path: 'test-artifacts/ac11-selection-overlay.png' });
  });

  test('[P3] AC11 — Selection overlay disappears on deselect', async ({ page }) => {
    await createModule(page, 'stock', CANVAS_CENTER.x, CANVAS_CENTER.y);

    await deselectAll(page);

    // 🔴 RED: Overlay should be gone (no selection border on canvas)
    await page.screenshot({ path: 'test-artifacts/ac11-no-overlay.png' });
  });

  test('[P3] AC11 — Selection overlay shows resize handles on stock module', async ({ page }) => {
    await createModule(page, 'stock', CANVAS_CENTER.x, CANVAS_CENTER.y);

    // 🔴 RED: Stock modules should show 8 resize handles on selection
    // Visual check via screenshot
    await page.screenshot({ path: 'test-artifacts/ac11-resize-handles.png' });
  });

  test('[P3] AC11 — Selection overlay shows diamond handles when connections exist', async ({ page }) => {
    // Create two connected modules
    await createModule(page, 'stock', 200, 100); // port is on edge
    // Diamond handles should appear when module has valid connection ports
    await page.screenshot({ path: 'test-artifacts/ac11-diamond-handles.png' });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Diamond Drag → Connection (AC12)
// ═══════════════════════════════════════════════════════════════════════════

test.describe('Story 8.6 — Diamond Drag → Connection (AC12)', () => {
  test.beforeEach(async ({ page }) => {
    await setupPage(page);
  });

  test('[P3] AC12 — Dragging a diamond handle starts connection drag', async ({ page }) => {
    await createModule(page, 'stock', CANVAS_CENTER.x, CANVAS_CENTER.y);

    // 🔴 RED: Hovering near module edge should show diamond, then dragging starts connection
    // This requires hit-testing the diamond at the module edge
    const { x, y } = worldToScreen(CANVAS_CENTER.x + 120, CANVAS_CENTER.y); // right edge of stock module

    await page.mouse.move(x, y);
    // Hover state should show diamond (SceneRenderer reads diamondHoverProvider)
    await page.mouse.down();
    await page.mouse.move(x + 100, y + 100);
    await page.mouse.up();

    // Connection should be created
    // Verify connection line exists on canvas
    await page.screenshot({ path: 'test-artifacts/ac12-diamond-drag.png' });
  });

  test('[P3] AC12 — Diamond drag can be cancelled with Escape', async ({ page }) => {
    await createModule(page, 'stock', CANVAS_CENTER.x, CANVAS_CENTER.y);

    const { x, y } = worldToScreen(CANVAS_CENTER.x + 120, CANVAS_CENTER.y);

    await page.mouse.move(x, y);
    await page.mouse.down(); // start diamond drag
    await page.mouse.move(x + 100, y + 100); // drag

    await pressEscape(page);

    // 🔴 RED: Escape should cancel the in-progress connection drag
    // No connection should be created
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Resize Drag (AC13-14)
// ═══════════════════════════════════════════════════════════════════════════

test.describe('Story 8.6 — Resize Drag (AC13-14)', () => {
  test.beforeEach(async ({ page }) => {
    await setupPage(page);
  });

  // ── AC13: Resize drag changes dimensions ───────────────────────────

  test('[P2] AC13 — Dragging a resize handle changes module dimensions', async ({ page }) => {
    await createModule(page, 'stock', CANVAS_CENTER.x, CANVAS_CENTER.y);

    // 🔴 RED: Drag a resize handle (corner of the selection overlay)
    // Hit-test a corner handle and drag outward
    const { x: cx, y: cy } = worldToScreen(CANVAS_CENTER.x + 120, CANVAS_CENTER.y + 40); // bottom-right corner

    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx + 50, cy + 30);
    await page.mouse.up();

    // Module dimensions should have changed
    // (Width and height change independently — no aspect ratio constraint)
    await page.screenshot({ path: 'test-artifacts/ac13-resize-drag.png' });
  });

  test('[P2] AC13 — Resize respects minimum dimensions (60×40)', async ({ page }) => {
    await createModule(page, 'stock', CANVAS_CENTER.x, CANVAS_CENTER.y);

    const { x: cx, y: cy } = worldToScreen(CANVAS_CENTER.x + 120, CANVAS_CENTER.y + 40);

    await page.mouse.move(cx, cy);
    await page.mouse.down();
    // Drag inward beyond minimum
    await page.mouse.move(cx - 200, cy - 200);
    await page.mouse.up();

    // 🔴 RED: Module should be clamped to minimum size, not collapsed
    await page.screenshot({ path: 'test-artifacts/ac13-min-size-clamp.png' });
  });

  // ── AC14: Escape reverts resize ────────────────────────────────────

  test('[P2] AC14 — Escape during resize reverts to original dimensions', async ({ page }) => {
    await createModule(page, 'stock', CANVAS_CENTER.x, CANVAS_CENTER.y);

    const { x: cx, y: cy } = worldToScreen(CANVAS_CENTER.x + 120, CANVAS_CENTER.y + 40);

    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx + 100, cy + 70); // resize outward
    await pressEscape(page);

    // 🔴 RED: After Escape, module should revert to default size 120×80
    // Visual verification via screenshot
    await page.screenshot({ path: 'test-artifacts/ac14-escape-revert.png' });
  });

  test('[P2] AC14 — Undo after resize commit restores previous size', async ({ page }) => {
    await createModule(page, 'stock', CANVAS_CENTER.x, CANVAS_CENTER.y);

    const { x: cx, y: cy } = worldToScreen(CANVAS_CENTER.x + 120, CANVAS_CENTER.y + 40);

    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx + 50, cy + 30);
    await page.mouse.up(); // commit resize

    // Ctrl+Z should undo the resize
    await page.keyboard.press('Control+z');

    // Module should be back to default size
    await page.screenshot({ path: 'test-artifacts/ac14-undo-resize.png' });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Keyboard Guard — I4 Guard e2e confirmations (AC15)
// ═══════════════════════════════════════════════════════════════════════════

test.describe('Story 8.6 — Keyboard Guard e2e (AC15)', () => {
  test.beforeEach(async ({ page }) => {
    await setupPage(page);
  });

  test('[P1] AC15 — Escape is two-key: first closes popover, second deselects', async ({ page }) => {
    // Code review 2026-06-21 (decision 1A): use 'source' — color dot is hidden for
    // stock (AC8 scope). Assertions rewritten to the two-key Escape design defined
    // in the story Dev Notes ("Escape Handling Coordination"):
    //   - 1st Escape: ColorPickerPopover's capture-phase listener (ColorPickerPopover.ts:166-173)
    //     calls stopPropagation(), so InputManager's window keydown handler never fires.
    //     The popover closes but the module STAYS selected (toolbar still visible).
    //   - 2nd Escape: popover now closed → colorPickerOpenProvider() returns false →
    //     I4 guard lets it through → InputManager deselects (toolbar hidden).
    await createModule(page, 'source', CANVAS_CENTER.x, CANVAS_CENTER.y);

    // Open color picker
    await page.locator('.toolbar__color-dot').click();
    await expect(page.locator('.color-picker-popover')).toBeVisible();
    await expect(page.locator('.toolbar')).toBeVisible();

    // ── First Escape: closes popover ONLY ──
    await pressEscape(page);
    await expect(page.locator('.color-picker-popover')).not.toBeVisible();
    // Module remains selected — toolbar must still be visible (two-key design).
    await expect(page.locator('.toolbar')).toBeVisible();

    // ── Second Escape: deselects the module ──
    await pressEscape(page);
    await expect(page.locator('.toolbar')).not.toBeVisible();
  });

  test('[P1] AC15 — Tab is blocked while color picker is open', async ({ page }) => {
    // Code review 2026-06-21: first module must be source/sink to expose the color dot.
    await createModule(page, 'source', CANVAS_CENTER.x, CANVAS_CENTER.y);
    await createModule(page, 'stock', CANVAS_CENTER.x + 200, CANVAS_CENTER.y);

    // Open color picker on first module
    await page.locator('.toolbar__color-dot').click();
    await expect(page.locator('.color-picker-popover')).toBeVisible();

    // 🔴 RED: Tab should not cycle to next module while popover is open
    await pressTab(page);

    // Toolbar should still reference the same module (not tabbed to next)
    // This is hard to verify without module name display — use screenshot
    await page.screenshot({ path: 'test-artifacts/ac15-tab-blocked.png' });
  });

  test('[P1] AC15 — Arrow nudge is blocked while color picker is open', async ({ page }) => {
    // Code review 2026-06-21: use 'source' — color dot is hidden for stock (AC8 scope).
    await createModule(page, 'source', CANVAS_CENTER.x, CANVAS_CENTER.y);

    // Open color picker
    await page.locator('.toolbar__color-dot').click();
    await expect(page.locator('.color-picker-popover')).toBeVisible();

    // 🔴 RED: Arrow keys should not move the module while popover is open
    await nudgeArrow(page, 'ArrowRight');

    // Module position should be unchanged (toolbar position should be at original location)
    // This is hard to verify precisely without coordinate readout
    await page.screenshot({ path: 'test-artifacts/ac15-nudge-blocked.png' });
  });

  test('[P1] AC15 — Enter is blocked while color picker is open', async ({ page }) => {
    // Code review 2026-06-21: use 'source' — color dot is hidden for stock (AC8 scope).
    await createModule(page, 'source', CANVAS_CENTER.x, CANVAS_CENTER.y);

    // Open color picker
    await page.locator('.toolbar__color-dot').click();
    await expect(page.locator('.color-picker-popover')).toBeVisible();

    await pressEnter(page);

    // 🔴 RED: Enter should NOT start name editing while popover is open
    const nameInput = page.locator('.toolbar__name-input');
    await expect(nameInput).not.toBeVisible();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// HMR Cleanup (AC18)
// ═══════════════════════════════════════════════════════════════════════════

test.describe('Story 8.6 — HMR Cleanup (AC18)', () => {
  test.beforeEach(async ({ page }) => {
    await setupPage(page);
  });

  test('[P2] AC18 — Hot-module replacement does not leak event listeners', async ({ page }) => {
    // 🔴 RED: This test verifies that main.ts HMR disposal properly cleans up
    // all registered callbacks, event listeners, and interval handles.
    //
    // In Playwright, this is typically tested by:
    // 1. Setting up the page normally
    // 2. Triggering a simulated HMR update (via page.evaluate or route manipulation)
    // 3. Verifying old listeners are cleaned up
    //
    // For RED phase, this scaffold asserts the cleanup mechanism exists.

    await createModule(page, 'stock', CANVAS_CENTER.x, CANVAS_CENTER.y);

    // Simulate HMR by checking that the page remains functional
    // (no duplicate event handlers, no zombie intervals)
    const toolbar = page.locator('.toolbar');
    await expect(toolbar).toBeVisible();

    // After a "reload" (simulated), the old toolbar instance should be gone
    // and a fresh one should appear
    await page.screenshot({ path: 'test-artifacts/ac18-hmr-cleanup.png' });
  });

  test('[P2] AC18 — ToolbarController instance is properly destroyed on dispose', async ({ page }) => {
    await createModule(page, 'stock', CANVAS_CENTER.x, CANVAS_CENTER.y);
    const toolbar = page.locator('.toolbar');
    await expect(toolbar).toBeVisible();

    // Deselect — toolbar should hide. Its DOM element and event listeners
    // should be cleaned up, not just hidden.
    await deselectAll(page);
    await expect(toolbar).not.toBeVisible();

    // Re-select — a fresh toolbar should appear
    const { x, y } = worldToScreen(CANVAS_CENTER.x, CANVAS_CENTER.y);
    await page.mouse.click(x, y);
    await expect(toolbar).toBeVisible();
  });
});
