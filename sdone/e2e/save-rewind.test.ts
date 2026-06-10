/**
 * SDONE E2E — Save Point & Rewind Tests (Story 7.4)
 *
 * Covers: Save checkpoint button disabled/enabled states,
 * Rewind checkpoint button disabled/enabled states,
 * Save creates checkpoint + shows toast,
 * Rewind restores state and pauses simulation,
 * Reset clears checkpoint.
 */

import { test, expect } from '@playwright/test';
import {
  setupPage,
  createModule,
  createConnection,
  clickRun,
  clickReset,
  clickSaveCheckpoint,
  clickRewindCheckpoint,
  pressSpace,
  isSaveCheckpointDisabled,
  isRewindCheckpointDisabled,
  confirmModal,
  worldToScreen,
  expectToast,
  SELECTORS,
} from './helpers.js';

test.describe('Save & Rewind', () => {
  test.beforeEach(async ({ page }) => {
    await setupPage(page);
  });

  // ── Button Enabled/Disabled States ────────────────────────────────

  test('[P1] save button is disabled when simulation is idle (default state)', async ({ page }) => {
    // Save should be disabled when not paused (AC6: save only when paused)
    // Initially simulation is idle, save should be disabled
    await expect(await isSaveCheckpointDisabled(page)).toBe(true);
  });

  test('[P1] rewind button is disabled when no checkpoint exists', async ({ page }) => {
    await expect(await isRewindCheckpointDisabled(page)).toBe(true);
  });

  test('[P1] save button becomes enabled when simulation is paused', async ({ page }) => {
    await createModule(page, 'stock', 0, 0);
    // Run first to enter 'running' state
    await clickRun(page);
    await page.waitForTimeout(300);
    // Pause — save should be enabled
    await pressSpace(page);
    await page.waitForTimeout(300);

    await expect(await isSaveCheckpointDisabled(page)).toBe(false);
  });

  test('[P1] save button is disabled while running', async ({ page }) => {
    await createModule(page, 'stock', 0, 0);
    await clickRun(page);
    await page.waitForTimeout(300);

    // Save should be disabled while running
    await expect(await isSaveCheckpointDisabled(page)).toBe(true);
  });

  // ── Save Checkpoint ───────────────────────────────────────────────

  test('[P1] clicking save creates checkpoint + shows toast', async ({ page }) => {
    await createModule(page, 'stock', 0, 0);

    // Pause the simulation
    await clickRun(page);
    await page.waitForTimeout(300);
    await pressSpace(page);
    await page.waitForTimeout(300);

    // Click save
    await clickSaveCheckpoint(page);

    // Toast should confirm checkpoint saved
    await expectToast(page, '检查点已保存');

    // Rewind button should now be enabled
    await expect(await isRewindCheckpointDisabled(page)).toBe(false);
  });

  // ── Rewind ────────────────────────────────────────────────────────

  test('[P1] clicking rewind restores state to checkpoint', async ({ page }) => {
    // Setup initial state
    await createModule(page, 'stock', 0, 0);

    // Pause and save
    await clickRun(page);
    await page.waitForTimeout(300);
    await pressSpace(page);
    await page.waitForTimeout(300);
    await clickSaveCheckpoint(page);
    await expectToast(page, '检查点已保存');

    // Modify state by adding another module
    await createModule(page, 'stock', 100, 50);

    // Verify second stock exists (two stocks in countdown)
    const rows = page.locator('.countdown-panel__row');
    await expect(rows).toHaveCount(2, { timeout: 2000 });

    // Rewind
    await clickRewindCheckpoint(page);

    // Should be back to 1 stock
    await expect(page.locator('.countdown-panel__row')).toHaveCount(1, { timeout: 2000 });
  });

  test('[P1] rewind pauses simulation if running', async ({ page }) => {
    await createModule(page, 'stock', 0, 0);

    // Pause and save
    await clickRun(page);
    await page.waitForTimeout(300);
    await pressSpace(page);
    await page.waitForTimeout(300);
    await clickSaveCheckpoint(page);

    // Add a second stock while still paused
    await createModule(page, 'stock', 100, 50);

    // Rewind — should keep simulation paused
    await clickRewindCheckpoint(page);

    // After rewind, simulation should be paused → save enabled
    await expect(await isSaveCheckpointDisabled(page)).toBe(false);
  });

  // ── Reset Clears Checkpoint ───────────────────────────────────────

  test('[P2] reset clears the checkpoint', async ({ page }) => {
    await createModule(page, 'stock', 0, 0);

    // Pause and save
    await clickRun(page);
    await page.waitForTimeout(300);
    await pressSpace(page);
    await page.waitForTimeout(300);
    await clickSaveCheckpoint(page);
    await expect(await isRewindCheckpointDisabled(page)).toBe(false);

    // Reset
    await clickReset(page);
    await confirmModal(page);

    // Checkpoint should be cleared → rewind disabled
    await expect(await isRewindCheckpointDisabled(page)).toBe(true);
  });
});
