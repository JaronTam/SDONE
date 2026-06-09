/**
 * Story 7.7 — AC6: Playwright Smoke Test (ATDD GREEN PHASE)
 *
 * Verifies the Playwright E2E infrastructure works: app loads, canvases
 * are present, and key UI elements are visible. All tests are active
 * and passing (Playwright installed + config created + app running).
 *
 * Generated: 2026-06-09 by bmad-testarch-atdd (Step 4B)
 * TDD Phase: GREEN (all tests active — infrastructure complete)
 */

import { test, expect } from '@playwright/test';

test.describe('Story 7.7 — AC6: App Load Smoke Test (ATDD GREEN PHASE)', () => {
  // ═══════════════════════════════════════════════════════════════
  // GREEN PHASE — all tests active and passing (Task 5 complete)
  // ═══════════════════════════════════════════════════════════════

  test('[P0] app loads and main canvas is present', async ({ page }) => {
    await page.goto('/');

    // Main scene canvas must be visible
    const sceneCanvas = page.locator('canvas#scene');
    await expect(sceneCanvas).toBeVisible();

    // Minimap canvas must be visible
    const minimapCanvas = page.locator('canvas#minimap');
    await expect(minimapCanvas).toBeVisible();

    // Page title should contain SDONE
    await expect(page).toHaveTitle(/SDONE/);
  });

  test('[P0] Run button is visible in top control bar', async ({ page }) => {
    await page.goto('/');

    // The Run button must be present (core simulation control)
    await expect(page.locator('text=Run')).toBeVisible();
  });

  test('[P1] app loads without console errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });

    await page.goto('/');

    // Wait for network to settle before checking for deferred errors
    await page.waitForLoadState('networkidle');

    // No uncaught console errors on initial load
    expect(errors.filter((e) => !e.includes('favicon'))).toHaveLength(0);
  });

  test('[P1] canvas has non-zero dimensions', async ({ page }) => {
    await page.goto('/');

    const sceneCanvas = page.locator('canvas#scene');
    const box = await sceneCanvas.boundingBox();

    expect(box).not.toBeNull();
    expect(box!.width).toBeGreaterThan(0);
    expect(box!.height).toBeGreaterThan(0);
  });
});
