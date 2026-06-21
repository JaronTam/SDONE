# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: panels.test.ts >> Panels >> [P1] editing rate updates the value
- Location: e2e\panels.test.ts:57:3

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator:  locator('.rate-editor__input').first()
Expected: visible
Received: hidden
Timeout:  2000ms

Call log:
  - Expect "toBeVisible" with timeout 2000ms
  - waiting for locator('.rate-editor__input').first()
    16 × locator resolved to <input step="any" type="number" placeholder="输入速率值..." class="rate-editor__input"/>
       - unexpected value "hidden"

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
  1   | /**
  2   |  * SDONE E2E — Panels Tests
  3   |  *
  4   |  * Covers: Rate Editor panel (populate, edit, empty state),
  5   |  * Analytics panel (populate, empty state, overflow),
  6   |  * Countdown panel (rows, row click), panel pin behavior,
  7   |  * panel auto-hide/show during run/pause.
  8   |  */
  9   |
  10  | import { test, expect } from '@playwright/test';
  11  | import {
  12  |   setupPage,
  13  |   createModule,
  14  |   createConnection,
  15  |   selectModule,
  16  |   deselectAll,
  17  |   clickRun,
  18  |   pressSpace,
  19  |   pressKey,
  20  |   isModulePanelVisible,
  21  |   worldToScreen,
  22  |   SELECTORS,
  23  | } from './helpers.js';
  24  |
  25  | test.describe('Panels', () => {
  26  |   test.beforeEach(async ({ page }) => {
  27  |     await setupPage(page);
  28  |   });
  29  |
  30  |   // ── Rate Editor Panel ─────────────────────────────────────────────
  31  |
  32  |   test('[P1] rate editor shows empty state when no connection selected', async ({ page }) => {
  33  |     const emptyEl = page.locator('.rate-editor__empty');
  34  |     await expect(emptyEl).toBeVisible();
  35  |     await expect(emptyEl).toContainText('点击连线编辑速率');
  36  |   });
  37  |
  38  |   test('[P1] selecting a connection shows rate value in editor', async ({ page }) => {
  39  |     await createModule(page, 'source', -200, -100);
  40  |     await createModule(page, 'stock', 0, 0);
  41  |     await createConnection(page, -200, -100, 0, 0);
  42  |
  43  |     // Select the connection by clicking near midpoint
  44  |     const midX = (-200 + 0) / 2;
  45  |     const midY = (-100 + 0) / 2;
  46  |     await page.mouse.click(worldToScreen(midX, midY).x, worldToScreen(midX, midY).y);
  47  |
  48  |     // Rate editor form should be visible
  49  |     const formEl = page.locator('.rate-editor__form');
  50  |     await expect(formEl).toBeVisible({ timeout: 2000 });
  51  |
  52  |     // Rate input should show the default rate value (1)
  53  |     const rateInput = page.locator('.rate-editor__input').first();
  54  |     await expect(rateInput).toHaveValue('1');
  55  |   });
  56  |
  57  |   test('[P1] editing rate updates the value', async ({ page }) => {
  58  |     await createModule(page, 'source', -200, -100);
  59  |     await createModule(page, 'stock', 0, 0);
  60  |     await createConnection(page, -200, -100, 0, 0);
  61  |
  62  |     // Select the connection
  63  |     const midX = (-200 + 0) / 2;
  64  |     const midY = (-100 + 0) / 2;
  65  |     await page.mouse.click(worldToScreen(midX, midY).x, worldToScreen(midX, midY).y);
  66  |     await page.waitForTimeout(200);
  67  |
  68  |     // Edit rate value
  69  |     const rateInput = page.locator('.rate-editor__input').first();
> 70  |     await expect(rateInput).toBeVisible({ timeout: 2000 });
      |                             ^ Error: expect(locator).toBeVisible() failed
  71  |     await rateInput.fill('2.5');
  72  |     await rateInput.press('Enter');
  73  |
  74  |     // Re-select to verify the rate persisted
  75  |     await deselectAll(page);
  76  |     await page.waitForTimeout(200);
  77  |     await page.mouse.click(worldToScreen(midX, midY).x, worldToScreen(midX, midY).y);
  78  |     await page.waitForTimeout(200);
  79  |
  80  |     await expect(page.locator('.rate-editor__input').first()).toHaveValue('2.5');
  81  |   });
  82  |
  83  |   test('[P1] selecting a module deselects connection and shows empty editor', async ({ page }) => {
  84  |     await createModule(page, 'source', -200, -100);
  85  |     await createModule(page, 'stock', 0, 0);
  86  |     await createConnection(page, -200, -100, 0, 0);
  87  |
  88  |     // Select connection first
  89  |     const midX = (-200 + 0) / 2;
  90  |     const midY = (-100 + 0) / 2;
  91  |     await page.mouse.click(worldToScreen(midX, midY).x, worldToScreen(midX, midY).y);
  92  |     await expect(page.locator('.rate-editor__form')).toBeVisible({ timeout: 2000 });
  93  |
  94  |     // Select stock module — should clear the rate editor
  95  |     await selectModule(page, 0, 0);
  96  |     await expect(page.locator('.rate-editor__empty')).toBeVisible({ timeout: 2000 });
  97  |   });
  98  |
  99  |   // ── Analytics Panel ───────────────────────────────────────────────
  100 |
  101 |   test('[P1] analytics panel shows empty state when no stock selected', async ({ page }) => {
  102 |     const emptyEl = page.locator('.analytics-panel__empty');
  103 |     await expect(emptyEl).toBeVisible();
  104 |     await expect(emptyEl).toContainText('存量模块');
  105 |   });
  106 |
  107 |   test('[P1] selecting a stock shows analytics data', async ({ page }) => {
  108 |     await createModule(page, 'stock', 0, 0);
  109 |     await selectModule(page, 0, 0);
  110 |
  111 |     // Analytics data section should be visible
  112 |     const dataEl = page.locator('.analytics-panel__data');
  113 |     await expect(dataEl).toBeVisible({ timeout: 2000 });
  114 |   });
  115 |
  116 |   test('[P1] deselecting stock clears analytics', async ({ page }) => {
  117 |     await createModule(page, 'stock', 0, 0);
  118 |     await selectModule(page, 0, 0);
  119 |     await expect(page.locator('.analytics-panel__data')).toBeVisible({ timeout: 2000 });
  120 |
  121 |     await deselectAll(page);
  122 |     await expect(page.locator('.analytics-panel__empty')).toBeVisible({ timeout: 2000 });
  123 |   });
  124 |
  125 |   // ── Countdown Panel ───────────────────────────────────────────────
  126 |
  127 |   test('[P1] countdown panel shows empty state when no stocks exist', async ({ page }) => {
  128 |     const emptyEl = page.locator('.countdown-panel__empty');
  129 |     await expect(emptyEl).toBeVisible();
  130 |     await expect(emptyEl).toContainText('画布上暂无存量模块');
  131 |   });
  132 |
  133 |   test('[P1] creating a stock populates countdown panel', async ({ page }) => {
  134 |     await createModule(page, 'stock', 0, 0);
  135 |
  136 |     // Countdown panel should show list
  137 |     await expect(page.locator('.countdown-panel__list')).toBeVisible({ timeout: 2000 });
  138 |   });
  139 |
  140 |   test('[P2] clicking countdown row selects the stock on canvas', async ({ page }) => {
  141 |     await createModule(page, 'stock', 0, 0);
  142 |
  143 |     // Click the countdown row
  144 |     const row = page.locator('.countdown-panel__row').first();
  145 |     await expect(row).toBeVisible({ timeout: 2000 });
  146 |     await row.click();
  147 |
  148 |     // Analytics should now show data for the selected stock
  149 |     await expect(page.locator('.analytics-panel__data')).toBeVisible({ timeout: 2000 });
  150 |   });
  151 |
  152 |   // ── Panel Pin & Auto-hide ─────────────────────────────────────────
  153 |
  154 |   test('[P2] panels auto-hide during simulation (when not pinned)', async ({ page }) => {
  155 |     await clickRun(page);
  156 |     await page.waitForTimeout(500);
  157 |
  158 |     // Module panel should hide
  159 |     const panelHidden = await isModulePanelVisible(page);
  160 |     // When not pinned, panel hides during run
  161 |     expect(panelHidden).toBe(false);
  162 |   });
  163 |
  164 |   test('[P2] panels re-show on pause', async ({ page }) => {
  165 |     await clickRun(page);
  166 |     await page.waitForTimeout(500);
  167 |
  168 |     // Pause
  169 |     await pressSpace(page);
  170 |     await page.waitForTimeout(500);
```
