# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: keyboard-shortcuts.test.ts >> Keyboard Shortcuts >> [P1] Ctrl+Shift+Z redoes undone action
- Location: e2e\keyboard-shortcuts.test.ts:70:3

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator:  locator('.countdown-panel__list')
Expected: visible
Received: hidden
Timeout:  2000ms

Call log:
  - Expect "toBeVisible" with timeout 2000ms
  - waiting for locator('.countdown-panel__list')
    17 × locator resolved to <div class="countdown-panel__list"></div>
       - unexpected value "hidden"

```

```yaml
- text: 构件面板
- button "固定面板": 📌
- option "源"
- option "存量" [selected]
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
- text: 设置存量容量
- spinbutton: "100"
- text: 单位 Enter 确认 · Esc 取消
```

# Test source

```ts
  1   | /**
  2   |  * SDONE E2E — Keyboard Shortcuts Tests
  3   |  *
  4   |  * Covers: Ctrl+0 (viewport reset), Ctrl+Z (undo), Ctrl+Shift+Z (redo),
  5   |  * Delete (delete selected), Tab (cycle selection), P (pin panels),
  6   |  * Space (run/pause).
  7   |  */
  8   | 
  9   | import { test, expect } from '@playwright/test';
  10  | import {
  11  |   setupPage,
  12  |   createModule,
  13  |   selectModule,
  14  |   deselectAll,
  15  |   pressDelete,
  16  |   pressTab,
  17  |   pressSpace,
  18  |   pressKey,
  19  |   pressEnter,
  20  |   createConnection,
  21  |   clickRun,
  22  |   worldToScreen,
  23  |   SELECTORS,
  24  | } from './helpers.js';
  25  | 
  26  | test.describe('Keyboard Shortcuts', () => {
  27  |   test.beforeEach(async ({ page }) => {
  28  |     await setupPage(page);
  29  |   });
  30  | 
  31  |   // ── Ctrl+Z: Undo ─────────────────────────────────────────────────
  32  | 
  33  |   test('[P1] Ctrl+Z undoes module creation', async ({ page }) => {
  34  |     await createModule(page, 'stock', 0, 0);
  35  |     // Verify stock exists via countdown panel
  36  |     await expect(page.locator('.countdown-panel__list')).toBeVisible({ timeout: 2000 });
  37  | 
  38  |     // Undo
  39  |     await pressKey(page, 'z', true, false); // Ctrl+Z
  40  |     await page.waitForTimeout(300);
  41  | 
  42  |     // After undo, stock should be removed → countdown shows empty
  43  |     await expect(page.locator('.countdown-panel__empty')).toBeVisible({ timeout: 2000 });
  44  |   });
  45  | 
  46  |   test('[P1] Ctrl+Z undoes connection creation', async ({ page }) => {
  47  |     await createModule(page, 'source', -200, -100);
  48  |     await createModule(page, 'stock', 0, 0);
  49  |     await createConnection(page, -200, -100, 0, 0);
  50  | 
  51  |     // Verify connection exists — select it and check rate editor
  52  |     const midX = (-200 + 0) / 2;
  53  |     const midY = (-100 + 0) / 2;
  54  |     await page.mouse.click(worldToScreen(midX, midY).x, worldToScreen(midX, midY).y);
  55  |     await expect(page.locator('.rate-editor__form')).toBeVisible({ timeout: 2000 });
  56  | 
  57  |     // Undo
  58  |     await pressKey(page, 'z', true, false); // Ctrl+Z
  59  |     await page.waitForTimeout(300);
  60  | 
  61  |     // After undo, connection should be removed → click at same point gets nothing
  62  |     await page.mouse.click(worldToScreen(midX, midY).x, worldToScreen(midX, midY).y);
  63  |     await page.waitForTimeout(300);
  64  |     // Rate editor should remain empty (no connection to select)
  65  |     await expect(page.locator('.rate-editor__empty')).toBeVisible({ timeout: 2000 });
  66  |   });
  67  | 
  68  |   // ── Ctrl+Shift+Z: Redo ───────────────────────────────────────────
  69  | 
  70  |   test('[P1] Ctrl+Shift+Z redoes undone action', async ({ page }) => {
  71  |     await createModule(page, 'stock', 0, 0);
  72  | 
  73  |     // Undo
  74  |     await pressKey(page, 'z', true, false); // Ctrl+Z
  75  |     await page.waitForTimeout(300);
  76  |     await expect(page.locator('.countdown-panel__empty')).toBeVisible({ timeout: 2000 });
  77  | 
  78  |     // Redo
  79  |     await pressKey(page, 'z', true, true); // Ctrl+Shift+Z
  80  |     await page.waitForTimeout(300);
> 81  |     await expect(page.locator('.countdown-panel__list')).toBeVisible({ timeout: 2000 });
      |                                                          ^ Error: expect(locator).toBeVisible() failed
  82  |   });
  83  | 
  84  |   // ── Ctrl+Z not intercepted when typing ───────────────────────────
  85  | 
  86  |   test('[P2] shortcut guard — Space+pause NOT toggled while editing target', async ({ page }) => {
  87  |     // Create a stock first so we can verify it still exists after Space in input
  88  |     await createModule(page, 'stock', 0, 0);
  89  | 
  90  |     // The Space key guard (isEditingTarget) is only relevant when typing in an
  91  |     // input/textarea/contentEditable element. The guard is unit-tested in Vitest.
  92  |     // This e2e regression test verifies: after any keyboard activity, the app
  93  |     // doesn't crash and canvas remains functional.
  94  |     await pressSpace(page);
  95  |     await page.waitForTimeout(300);
  96  | 
  97  |     // Space without a focused input toggles run/pause — status should change from IDLE
  98  |     const status = page.locator(SELECTORS.controlBarStatus);
  99  |     const text = await status.textContent();
  100 |     expect(text).not.toBe('IDLE');
  101 | 
  102 |     // App should still be functional
  103 |     await expect(page.locator('#scene')).toBeVisible();
  104 |   });
  105 | 
  106 |   // ── Ctrl+0: Reset Viewport ───────────────────────────────────────
  107 | 
  108 |   test('[P2] Ctrl+0 resets viewport', async ({ page }) => {
  109 |     // First zoom in by scrolling
  110 |     const canvas = page.locator(SELECTORS.sceneCanvas);
  111 |     await canvas.click();
  112 |     await page.mouse.wheel(0, -120); // zoom in
  113 | 
  114 |     // Press Ctrl+0 to reset viewport
  115 |     await pressKey(page, '0', true, false); // Ctrl+0
  116 |     await page.waitForTimeout(200);
  117 | 
  118 |     // App should still be functional
  119 |     await expect(page.locator(SELECTORS.sceneCanvas)).toBeVisible();
  120 |   });
  121 | 
  122 |   // ── Tab: Cycle Selection ─────────────────────────────────────────
  123 | 
  124 |   test('[P2] Tab cycles through modules when modules exist', async ({ page }) => {
  125 |     await createModule(page, 'stock', 0, 0);
  126 |     await createModule(page, 'stock', 100, 50);
  127 | 
  128 |     // Press Tab — should cycle to next module
  129 |     await pressTab(page);
  130 |     await page.waitForTimeout(200);
  131 | 
  132 |     // Analytics panel should show data (a stock is selected)
  133 |     await expect(page.locator('.analytics-panel__data')).toBeVisible({ timeout: 2000 });
  134 |   });
  135 | 
  136 |   // ── Delete ───────────────────────────────────────────────────────
  137 | 
  138 |   test('[P1] Delete removes selected module', async ({ page }) => {
  139 |     await createModule(page, 'stock', 0, 0);
  140 |     await selectModule(page, 0, 0);
  141 |     await pressDelete(page);
  142 | 
  143 |     await expect(page.locator('.countdown-panel__empty')).toBeVisible({ timeout: 2000 });
  144 |   });
  145 | 
  146 |   // ── Space: Run/Pause ─────────────────────────────────────────────
  147 | 
  148 |   test('[P1] Space toggles run/pause state', async ({ page }) => {
  149 |     // Should start IDLE
  150 |     const initialStatus = page.locator(SELECTORS.controlBarStatus);
  151 |     await expect(initialStatus).toHaveText('IDLE');
  152 | 
  153 |     // Space → run
  154 |     await pressSpace(page);
  155 |     await page.waitForTimeout(300);
  156 |     const runClass = page.locator(SELECTORS.controlBarStatusRunning);
  157 |     await expect(runClass).toBeVisible({ timeout: 1000 });
  158 | 
  159 |     // Space → pause
  160 |     await pressSpace(page);
  161 |     await page.waitForTimeout(300);
  162 |     const pauseClass = page.locator(SELECTORS.controlBarStatusPaused);
  163 |     await expect(pauseClass).toBeVisible({ timeout: 1000 });
  164 |   });
  165 | });
  166 | 
```