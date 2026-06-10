# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: simulation.test.ts >> Simulation Controls >> [P1] Clear Canvas button shows modal
- Location: e2e\simulation.test.ts:155:3

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: locator('.modal-backdrop')
Expected: visible
Timeout: 2000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 2000ms
  - waiting for locator('.modal-backdrop')

```

```yaml
- text: 构件面板
- button "固定面板": 📌
- option "源"
- option "存量"
- option "汇"
- text: 组合
- paragraph: 选中三个模块后命名此逻辑堆栈
- text: ▶ 数据面板
- button "固定面板": 📌
- text: 速率编辑器 🔗 点击连线编辑速率 存量分析 👆 点击画布上的存量模块查看详情 倒计时 ⏱️ 画布上暂无存量模块 ◀
- button "▶ Run"
- text: IDLE
- button "↺ Reset"
- button "🗑 Clear"
- button "💾 保存检查点" [disabled]
- button "⏪ 回到检查点" [disabled]
- button "↺ Fit All"
```

# Test source

```ts
  396 | /**
  397 |  * Click rewind checkpoint button.
  398 |  */
  399 | export async function clickRewindCheckpoint(page: Page): Promise<void> {
  400 |   await page.locator(SELECTORS.btnRewindCheckpoint).click();
  401 | }
  402 | 
  403 | // ── Modal Helpers ─────────────────────────────────────────────────────────
  404 | 
  405 | /**
  406 |  * Click the confirm button in an open modal.
  407 |  */
  408 | export async function confirmModal(page: Page): Promise<void> {
  409 |   await page.locator(SELECTORS.modalConfirmBtn).click();
  410 |   // Wait for modal to close
  411 |   await page.waitForSelector(SELECTORS.modalBackdrop, { state: 'detached', timeout: 3000 }).catch(() => {});
  412 | }
  413 | 
  414 | /**
  415 |  * Click the cancel button in an open modal.
  416 |  */
  417 | export async function cancelModal(page: Page): Promise<void> {
  418 |   await page.locator(SELECTORS.modalCancelBtn).click();
  419 |   await page.waitForSelector(SELECTORS.modalBackdrop, { state: 'detached', timeout: 3000 }).catch(() => {});
  420 | }
  421 | 
  422 | // ── Panel & UI Helpers ────────────────────────────────────────────────────
  423 | 
  424 | /**
  425 |  * Get the control bar status text.
  426 |  */
  427 | export async function getControlBarStatus(page: Page): Promise<string> {
  428 |   const statusEl = page.locator(SELECTORS.controlBarStatus);
  429 |   const text = await statusEl.textContent();
  430 |   return text ?? '';
  431 | }
  432 | 
  433 | /**
  434 |  * Check if the module panel is visible (not hidden off-screen).
  435 |  */
  436 | export async function isModulePanelVisible(page: Page): Promise<boolean> {
  437 |   const panel = page.locator(SELECTORS.modulePanel);
  438 |   const isHidden = await panel.evaluate((el) => el.classList.contains('module-panel--hidden'));
  439 |   return !isHidden;
  440 | }
  441 | 
  442 | /**
  443 |  * Check if the save checkpoint button is disabled.
  444 |  */
  445 | export async function isSaveCheckpointDisabled(page: Page): Promise<boolean> {
  446 |   return await page.locator(SELECTORS.btnSaveCheckpoint).isDisabled();
  447 | }
  448 | 
  449 | /**
  450 |  * Check if the rewind checkpoint button is disabled.
  451 |  */
  452 | export async function isRewindCheckpointDisabled(page: Page): Promise<boolean> {
  453 |   return await page.locator(SELECTORS.btnRewindCheckpoint).isDisabled();
  454 | }
  455 | 
  456 | /**
  457 |  * Look for an achievement toast with the given text.
  458 |  */
  459 | export async function getToastText(page: Page): Promise<string> {
  460 |   const toast = page.locator(SELECTORS.achievementToast).first();
  461 |   await toast.waitFor({ state: 'visible', timeout: 2000 }).catch(() => {});
  462 |   const text = await toast.textContent();
  463 |   return text ?? '';
  464 | }
  465 | 
  466 | /**
  467 |  * Wait for simulation to advance by a given number of ticks.
  468 |  * Simulation runs at ~10Hz (100ms per tick).
  469 |  */
  470 | export async function waitForSimTicks(page: Page, ticks = 5): Promise<void> {
  471 |   await page.waitForTimeout(ticks * 100 + 50);
  472 | }
  473 | 
  474 | // ── Assertions ────────────────────────────────────────────────────────────
  475 | 
  476 | /**
  477 |  * Assert that a toast message is visible and contains the expected text.
  478 |  */
  479 | export async function expectToast(page: Page, expectedText: string): Promise<void> {
  480 |   const toast = page.locator(SELECTORS.achievementToast).first();
  481 |   await expect(toast).toBeVisible({ timeout: 2000 });
  482 |   await expect(toast).toContainText(expectedText);
  483 | }
  484 | 
  485 | /**
  486 |  * Assert the run button shows the expected text.
  487 |  */
  488 | export async function expectRunButton(page: Page, text: string): Promise<void> {
  489 |   await expect(page.locator(SELECTORS.btnRun)).toHaveText(text);
  490 | }
  491 | 
  492 | /**
  493 |  * Assert that a modal dialog is visible.
  494 |  */
  495 | export async function expectModalVisible(page: Page): Promise<void> {
> 496 |   await expect(page.locator(SELECTORS.modalBackdrop)).toBeVisible({ timeout: 2000 });
      |                                                       ^ Error: expect(locator).toBeVisible() failed
  497 | }
  498 | 
  499 | /**
  500 |  * Assert that the color picker popover is visible.
  501 |  */
  502 | export async function expectColorPickerVisible(page: Page): Promise<void> {
  503 |   await expect(page.locator(SELECTORS.colorPickerPopover)).toBeVisible({ timeout: 2000 });
  504 | }
  505 | 
```