# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: simulation.test.ts >> Simulation Controls >> [P1] cancelling clear canvas preserves canvas
- Location: e2e\simulation.test.ts:173:3

# Error details

```
Test timeout of 30000ms exceeded.
```

```
Error: locator.click: Test timeout of 30000ms exceeded.
Call log:
  - waiting for locator('.modal-btn-cancel')

```

# Page snapshot

```yaml
- generic [ref=e2]:
  - generic:
    - generic [ref=e5]:
      - generic [ref=e6]:
        - generic [ref=e7]: 构件面板
        - button "固定面板" [ref=e8] [cursor=pointer]: 📌
      - generic [ref=e9]:
        - option "源" [ref=e10]:
          - generic [ref=e12]: 源
        - option "存量" [ref=e13]:
          - generic [ref=e15]: 存量
        - option "汇" [ref=e16]:
          - generic [ref=e18]: 汇
      - generic [ref=e20]:
        - generic [ref=e22]: 组合
        - paragraph [ref=e24]: 选中三个模块后命名此逻辑堆栈
    - generic "展开模块面板":
      - generic: ▶
  - generic:
    - generic:
      - generic [ref=e25]:
        - generic [ref=e26]: 数据面板
        - button "固定面板" [ref=e27] [cursor=pointer]: 📌
      - generic [ref=e28]:
        - generic [ref=e29]: 速率编辑器
        - generic [ref=e30]:
          - generic [ref=e31]: 🔗
          - generic [ref=e32]: 点击连线编辑速率
      - generic [ref=e33]:
        - generic [ref=e34]: 存量分析
        - generic [ref=e35]:
          - generic [ref=e36]: 👆
          - generic [ref=e37]: 点击画布上的存量模块查看详情
      - generic [ref=e38]:
        - generic [ref=e39]: 倒计时
        - generic [ref=e40]:
          - generic [ref=e41]: ⏱️
          - generic [ref=e42]: 画布上暂无存量模块
    - generic "展开数据面板":
      - generic: ◀
  - generic [ref=e43]:
    - button "▶ Run" [ref=e44]
    - generic [ref=e45]: IDLE
    - button "↺ Reset" [ref=e46]
    - button "🗑 Clear" [active] [ref=e47] [cursor=pointer]
    - button "💾 保存检查点" [disabled] [ref=e48]
    - button "⏪ 回到检查点" [disabled] [ref=e49]
    - button "↺ Fit All" [ref=e50]
```

# Test source

```ts
  318 | /**
  319 |  * Press a key combination. Defaults to no modifiers.
  320 |  */
  321 | export async function pressKey(page: Page, key: string, ctrlKey = false, shiftKey = false): Promise<void> {
  322 |   const modifiers: string[] = [];
  323 |   if (ctrlKey) modifiers.push('Control');
  324 |   if (shiftKey) modifiers.push('Shift');
  325 |   const combo = [...modifiers, key].join('+');
  326 |   await page.keyboard.press(combo);
  327 | }
  328 | 
  329 | /**
  330 |  * Press Space (run/pause toggle).
  331 |  */
  332 | export async function pressSpace(page: Page): Promise<void> {
  333 |   await page.keyboard.press('Space');
  334 | }
  335 | 
  336 | /**
  337 |  * Press Delete key.
  338 |  */
  339 | export async function pressDelete(page: Page): Promise<void> {
  340 |   await page.keyboard.press('Delete');
  341 | }
  342 | 
  343 | /**
  344 |  * Press Tab key.
  345 |  */
  346 | export async function pressTab(page: Page): Promise<void> {
  347 |   await page.keyboard.press('Tab');
  348 | }
  349 | 
  350 | /**
  351 |  * Press Enter key.
  352 |  */
  353 | export async function pressEnter(page: Page): Promise<void> {
  354 |   await page.keyboard.press('Enter');
  355 | }
  356 | 
  357 | // ── Arrow key nudge ───────────────────────────────────────────────────────
  358 | 
  359 | /**
  360 |  * Press an arrow key (for nudging selected module).
  361 |  */
  362 | export async function nudgeArrow(page: Page, direction: 'Up' | 'Down' | 'Left' | 'Right'): Promise<void> {
  363 |   await page.keyboard.press(`Arrow${direction}`);
  364 | }
  365 | 
  366 | // ── Simulation Helpers ────────────────────────────────────────────────────
  367 | 
  368 | /**
  369 |  * Click the Run button in the control bar.
  370 |  */
  371 | export async function clickRun(page: Page): Promise<void> {
  372 |   await page.locator(SELECTORS.btnRun).click();
  373 | }
  374 | 
  375 | /**
  376 |  * Click the Reset button in the control bar.
  377 |  */
  378 | export async function clickReset(page: Page): Promise<void> {
  379 |   await page.locator(SELECTORS.btnReset).click();
  380 | }
  381 | 
  382 | /**
  383 |  * Click the Clear Canvas button.
  384 |  */
  385 | export async function clickClearCanvas(page: Page): Promise<void> {
  386 |   await page.locator(SELECTORS.btnClearCanvas).click();
  387 | }
  388 | 
  389 | /**
  390 |  * Click save checkpoint button.
  391 |  */
  392 | export async function clickSaveCheckpoint(page: Page): Promise<void> {
  393 |   await page.locator(SELECTORS.btnSaveCheckpoint).click();
  394 | }
  395 | 
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
> 418 |   await page.locator(SELECTORS.modalCancelBtn).click();
      |                                                ^ Error: locator.click: Test timeout of 30000ms exceeded.
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
  496 |   await expect(page.locator(SELECTORS.modalBackdrop)).toBeVisible({ timeout: 2000 });
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