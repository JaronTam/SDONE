# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: history.test.ts >> History (Undo/Redo) >> [P2] undo stack survives multiple operations
- Location: e2e\history.test.ts:100:3

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator:  locator('.analytics-panel__data')
Expected: visible
Received: hidden
Timeout:  2000ms

Call log:
  - Expect "toBeVisible" with timeout 2000ms
  - waiting for locator('.analytics-panel__data')
    17 × locator resolved to <div class="analytics-panel__data">…</div>
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
  9   | import {
  10  |   setupPage,
  11  |   createModule,
  12  |   createConnection,
  13  |   selectModule,
  14  |   pressKey,
  15  |   pressDelete,
  16  |   worldToScreen,
  17  | } from './helpers.js';
  18  | 
  19  | test.describe('History (Undo/Redo)', () => {
  20  |   test.beforeEach(async ({ page }) => {
  21  |     await setupPage(page);
  22  |   });
  23  | 
  24  |   test('[P1] create module → undo removes it → redo restores it', async ({ page }) => {
  25  |     // Create
  26  |     await createModule(page, 'stock', 0, 0);
  27  |     await expect(page.locator('.countdown-panel__list')).toBeVisible({ timeout: 2000 });
  28  | 
  29  |     // Undo → stock removed
  30  |     await pressKey(page, 'z', true, false);
  31  |     await page.waitForTimeout(300);
  32  |     await expect(page.locator('.countdown-panel__empty')).toBeVisible({ timeout: 2000 });
  33  | 
  34  |     // Redo → stock restored
  35  |     await pressKey(page, 'z', true, true);
  36  |     await page.waitForTimeout(300);
  37  |     await expect(page.locator('.countdown-panel__list')).toBeVisible({ timeout: 2000 });
  38  |   });
  39  | 
  40  |   test('[P1] create connection → undo removes it → redo restores it', async ({ page }) => {
  41  |     await createModule(page, 'source', -200, -100);
  42  |     await createModule(page, 'stock', 0, 0);
  43  |     await createConnection(page, -200, -100, 0, 0);
  44  | 
  45  |     // Verify connection exists
  46  |     const midX = (-200 + 0) / 2;
  47  |     const midY = (-100 + 0) / 2;
  48  |     await page.mouse.click(worldToScreen(midX, midY).x, worldToScreen(midX, midY).y);
  49  |     await expect(page.locator('.rate-editor__form')).toBeVisible({ timeout: 2000 });
  50  | 
  51  |     // Undo → connection removed
  52  |     await pressKey(page, 'z', true, false);
  53  |     await page.waitForTimeout(300);
  54  | 
  55  |     // Click at midpoint again — rate editor should stay empty
  56  |     await page.mouse.click(worldToScreen(midX, midY).x, worldToScreen(midX, midY).y);
  57  |     await page.waitForTimeout(300);
  58  |     await expect(page.locator('.rate-editor__empty')).toBeVisible({ timeout: 2000 });
  59  | 
  60  |     // Redo → connection restored
  61  |     await pressKey(page, 'z', true, true);
  62  |     await page.waitForTimeout(300);
  63  |     await page.mouse.click(worldToScreen(midX, midY).x, worldToScreen(midX, midY).y);
  64  |     await page.waitForTimeout(300);
  65  |     await expect(page.locator('.rate-editor__form')).toBeVisible({ timeout: 2000 });
  66  |   });
  67  | 
  68  |   test('[P2] delete module → Ctrl+Z restores it', async ({ page }) => {
  69  |     await createModule(page, 'stock', 0, 0);
  70  |     await selectModule(page, 0, 0);
  71  |     await expect(page.locator('.analytics-panel__data')).toBeVisible({ timeout: 2000 });
  72  | 
  73  |     // Delete
  74  |     await pressDelete(page);
  75  |     await expect(page.locator('.analytics-panel__empty')).toBeVisible({ timeout: 2000 });
  76  | 
  77  |     // Undo → stock restored
  78  |     await pressKey(page, 'z', true, false);
  79  |     await page.waitForTimeout(300);
  80  | 
  81  |     // Stock should be back on canvas
  82  |     await expect(page.locator('.countdown-panel__list')).toBeVisible({ timeout: 2000 });
  83  |   });
  84  | 
  85  |   test('[P2] multiple undos revert operations in reverse order', async ({ page }) => {
  86  |     // Create 2 modules (2 operations)
  87  |     await createModule(page, 'stock', 0, 0);
  88  |     await createModule(page, 'stock', 100, 50);
  89  | 
  90  |     // Undo twice → both removed
  91  |     await pressKey(page, 'z', true, false);
  92  |     await page.waitForTimeout(300);
  93  |     await pressKey(page, 'z', true, false);
  94  |     await page.waitForTimeout(300);
  95  | 
  96  |     // No stocks should remain
  97  |     await expect(page.locator('.countdown-panel__empty')).toBeVisible({ timeout: 2000 });
  98  |   });
  99  | 
  100 |   test('[P2] undo stack survives multiple operations', async ({ page }) => {
  101 |     // Complex sequence: create stock, create stock, create source, connect
  102 |     await createModule(page, 'stock', 0, 0);
  103 |     await createModule(page, 'stock', 100, 50);
  104 |     await createModule(page, 'source', -200, -100);
  105 |     await createConnection(page, -200, -100, 0, 0);
  106 | 
  107 |     // Verify everything exists
  108 |     await selectModule(page, 0, 0);
> 109 |     await expect(page.locator('.analytics-panel__data')).toBeVisible({ timeout: 2000 });
      |                                                          ^ Error: expect(locator).toBeVisible() failed
  110 | 
  111 |     // Undo 4 times → should go back to empty canvas
  112 |     for (let i = 0; i < 4; i++) {
  113 |       await pressKey(page, 'z', true, false);
  114 |       await page.waitForTimeout(150);
  115 |     }
  116 | 
  117 |     // Canvas should be empty
  118 |     await expect(page.locator('.countdown-panel__empty')).toBeVisible({ timeout: 2000 });
  119 |   });
  120 | });
  121 | 
```