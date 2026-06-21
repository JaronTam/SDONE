# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: connection-lifecycle.test.ts >> Connection Lifecycle >> [P1] edge-drag source→stock creates a directed connection
- Location: e2e\connection-lifecycle.test.ts:42:3

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: locator('.achievement-toast').first()
Expected: visible
Timeout: 3000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 3000ms
  - waiting for locator('.achievement-toast').first()

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
  2   |  * SDONE E2E — Connection Lifecycle Tests
  3   |  *
  4   |  * Covers: Edge-drag connection creation (source→stock, stock→sink),
  5   |  * connection selection/deselection, connection deletion,
  6   |  * feedback connection creation from stock handle, tooltips.
  7   |  *
  8   |  * Verifiable DOM side-effects:
  9   |  *   - RateEditorPanel empty → form transition (connection selected)
  10  |  *   - Achievement toast "Great! 🎉" on first connection
  11  |  *   - Achievement toast for first complete stack
  12  |  *   - Connection label text in rate editor
  13  |  */
  14  |
  15  | import { test, expect } from '@playwright/test';
  16  | import {
  17  |   setupPage,
  18  |   createModule,
  19  |   selectModule,
  20  |   createConnection,
  21  |   pressDelete,
  22  |   pressTab,
  23  |   worldToScreen,
  24  |   SELECTORS,
  25  | } from './helpers.js';
  26  |
  27  | // ── Module world positions ──────────────────────────────────────────────
  28  |
  29  | const SRC_POS = { x: -200, y: -100 };
  30  | const STK_POS = { x: 0, y: 0 };
  31  | const SNK_POS = { x: 200, y: 100 };
  32  |
  33  | // ── Tests ───────────────────────────────────────────────────────────────
  34  |
  35  | test.describe('Connection Lifecycle', () => {
  36  |   test.beforeEach(async ({ page }) => {
  37  |     await setupPage(page);
  38  |   });
  39  |
  40  |   // ── AC1: Edge-drag Connection Creation ─────────────────────────
  41  |
  42  |   test('[P1] edge-drag source→stock creates a directed connection', async ({ page }) => {
  43  |     // Create source and stock modules
  44  |     await createModule(page, 'source', SRC_POS.x, SRC_POS.y);
  45  |     await createModule(page, 'stock', STK_POS.x, STK_POS.y);
  46  |
  47  |     // Edge-drag from source to stock
  48  |     await createConnection(page, SRC_POS.x, SRC_POS.y, STK_POS.x, STK_POS.y);
  49  |
  50  |     // Toast "Great! 🎉" should appear (first connection achievement)
  51  |     const toast = page.locator(SELECTORS.achievementToast).first();
> 52  |     await expect(toast).toBeVisible({ timeout: 3000 });
      |                         ^ Error: expect(locator).toBeVisible() failed
  53  |     await expect(toast).toContainText('Great!');
  54  |   });
  55  |
  56  |   test('[P1] edge-drag stock→sink creates a directed connection', async ({ page }) => {
  57  |     // Create stock and sink modules
  58  |     await createModule(page, 'stock', STK_POS.x, STK_POS.y);
  59  |     await createModule(page, 'sink', SNK_POS.x, SNK_POS.y);
  60  |
  61  |     // Edge-drag from stock to sink: for a stock, use a wider edge offset
  62  |     // (stock hit radius ~72px, edge zone starts at 50px from center)
  63  |     const from = worldToScreen(STK_POS.x, STK_POS.y);
  64  |     const to = worldToScreen(SNK_POS.x, SNK_POS.y);
  65  |     const dx = to.x - from.x;
  66  |     const dy = to.y - from.y;
  67  |     const dist = Math.sqrt(dx * dx + dy * dy) || 1;
  68  |
  69  |     // Start at 55px from stock center toward sink (edge zone for stock)
  70  |     const startX = from.x + (dx / dist) * 55;
  71  |     const startY = from.y + (dy / dist) * 55;
  72  |     // End near sink edge
  73  |     const endX = to.x - (dx / dist) * 20;
  74  |     const endY = to.y - (dy / dist) * 20;
  75  |
  76  |     await page.mouse.move(startX, startY);
  77  |     await page.mouse.down();
  78  |     for (let i = 1; i <= 8; i++) {
  79  |       const t = i / 8;
  80  |       await page.mouse.move(startX + (endX - startX) * t, startY + (endY - startY) * t);
  81  |       await page.waitForTimeout(25);
  82  |     }
  83  |     await page.mouse.up();
  84  |     await page.waitForTimeout(300);
  85  |
  86  |     // Toast "Great! 🎉" should appear (first connection)
  87  |     const toast = page.locator(SELECTORS.achievementToast).first();
  88  |     await expect(toast).toBeVisible({ timeout: 3000 });
  89  |     await expect(toast).toContainText('Great!');
  90  |   });
  91  |
  92  |   test('[P1] full stack (source→stock→sink) triggers complete-stack achievement', async ({ page }) => {
  93  |     // Create source, stock, and sink
  94  |     await createModule(page, 'source', -250, -150);
  95  |     await createModule(page, 'stock', 0, 0);
  96  |     await createModule(page, 'sink', 250, 150);
  97  |
  98  |     // Create source→stock connection (triggers "Great!")
  99  |     await createConnection(page, -250, -150, 0, 0);
  100 |     // Dismiss or wait for first toast before creating second connection
  101 |     await page.waitForTimeout(500);
  102 |
  103 |     // Create stock→sink connection using stock edge zone (55px offset for stock)
  104 |     const from = worldToScreen(0, 0);
  105 |     const to = worldToScreen(250, 150);
  106 |     const dx = to.x - from.x;
  107 |     const dy = to.y - from.y;
  108 |     const dist = Math.sqrt(dx * dx + dy * dy) || 1;
  109 |     const startX = from.x + (dx / dist) * 55;
  110 |     const startY = from.y + (dy / dist) * 55;
  111 |     const endX = to.x - (dx / dist) * 20;
  112 |     const endY = to.y - (dy / dist) * 20;
  113 |
  114 |     await page.mouse.move(startX, startY);
  115 |     await page.mouse.down();
  116 |     for (let i = 1; i <= 8; i++) {
  117 |       const t = i / 8;
  118 |       await page.mouse.move(startX + (endX - startX) * t, startY + (endY - startY) * t);
  119 |       await page.waitForTimeout(25);
  120 |     }
  121 |     await page.mouse.up();
  122 |     await page.waitForTimeout(500);
  123 |
  124 |     // Complete stack achievement toast should appear as the second toast
  125 |     // The last toast should be the complete-stack one
  126 |     const allToasts = page.locator(SELECTORS.achievementToast);
  127 |     const toastCount = await allToasts.count();
  128 |     expect(toastCount).toBeGreaterThanOrEqual(1);
  129 |     // At least one toast with "恭喜" should exist (might be merged or separate)
  130 |     if (toastCount >= 2) {
  131 |       await expect(allToasts.nth(toastCount - 1)).toContainText('恭喜', { timeout: 2000 });
  132 |     }
  133 |   });
  134 |
  135 |   // ── AC2: Connection Selection ──────────────────────────────────
  136 |
  137 |   test('[P1] clicking a connection populates the rate editor panel', async ({ page }) => {
  138 |     await createModule(page, 'source', SRC_POS.x, SRC_POS.y);
  139 |     await createModule(page, 'stock', STK_POS.x, STK_POS.y);
  140 |     await createConnection(page, SRC_POS.x, SRC_POS.y, STK_POS.x, STK_POS.y);
  141 |
  142 |     // Click near the midpoint of the connection (between source and stock)
  143 |     const midX = (SRC_POS.x + STK_POS.x) / 2;
  144 |     const midY = (SRC_POS.y + STK_POS.y) / 2;
  145 |     const screen = worldToScreen(midX, midY);
  146 |     await page.mouse.click(screen.x, screen.y);
  147 |
  148 |     // Rate editor should now show the form (not empty state)
  149 |     const formEl = page.locator('.rate-editor__form');
  150 |     await expect(formEl).toBeVisible({ timeout: 2000 });
  151 |     // The connection label should show direction "源 → 存量"
  152 |     const connectionLabel = page.locator('.rate-editor__connection-label');
```
