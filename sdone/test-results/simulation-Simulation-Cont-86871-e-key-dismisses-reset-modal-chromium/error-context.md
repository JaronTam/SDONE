# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: simulation.test.ts >> Simulation Controls >> [P2] Escape key dismisses reset modal
- Location: e2e\simulation.test.ts:129:3

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
    18 × locator resolved to <div class="countdown-panel__list"></div>
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
  38  |
  39  |     // Status should change from "IDLE" to running state
  40  |     await page.waitForTimeout(500);
  41  |     const status = await getControlBarStatus(page);
  42  |     // After clicking Run, status should reflect running (not IDLE)
  43  |     expect(status).not.toBe('IDLE');
  44  |   });
  45  |
  46  |   test('[P0] clicking Pause stops simulation', async ({ page }) => {
  47  |     await clickRun(page);
  48  |     await page.waitForTimeout(300);
  49  |
  50  |     // Click again to pause
  51  |     await page.locator(SELECTORS.btnRun).click();
  52  |     await page.waitForTimeout(300);
  53  |
  54  |     // Should be paused or idle
  55  |     const status = await getControlBarStatus(page);
  56  |     expect(status).not.toBe('RUNNING');
  57  |   });
  58  |
  59  |   test('[P1] Run/Pause via Space key toggles state', async ({ page }) => {
  60  |     await pressSpace(page);
  61  |     await page.waitForTimeout(300);
  62  |
  63  |     // Should be running
  64  |     const statusAfterRun = await getControlBarStatus(page);
  65  |     expect(statusAfterRun).not.toBe('IDLE');
  66  |
  67  |     await pressSpace(page);
  68  |     await page.waitForTimeout(300);
  69  |
  70  |     // Should pause
  71  |     const statusAfterPause = await getControlBarStatus(page);
  72  |     expect(statusAfterPause).not.toBe('RUNNING');
  73  |   });
  74  |
  75  |   test('[P1] Space key does not toggle when typing in an input', async ({ page }) => {
  76  |     // No input is focused initially, so Space should toggle
  77  |     // After creating modules, select a connection and try typing in rate input
  78  |     await createModule(page, 'source', -200, -100);
  79  |     await createModule(page, 'stock', 0, 0);
  80  |     await createConnection(page, -200, -100, 0, 0);
  81  |
  82  |     // Click the rate input field
  83  |     const midX = (-200 + 0) / 2;
  84  |     const midY = (-100 + 0) / 2;
  85  |     const screen = worldToScreen(midX, midY);
  86  |     await page.mouse.click(screen.x, screen.y);
  87  |     await page.waitForTimeout(300);
  88  |
  89  |     // Click the rate input to focus it
  90  |     const rateInput = page.locator('.rate-editor__input').first();
  91  |     if (await rateInput.isVisible({ timeout: 2000 }).catch(() => false)) {
  92  |       await rateInput.click();
  93  |       // Type space in the input — should not toggle run/pause
  94  |       await page.keyboard.type(' ');
  95  |       // Status should still be IDLE (Space was consumed by the input)
  96  |       await expect(page.locator(SELECTORS.sceneCanvas)).toBeVisible();
  97  |     }
  98  |   });
  99  |
  100 |   // ── Reset with Modal ─────────────────────────────────────────────
  101 |
  102 |   test('[P1] Reset button opens confirmation modal', async ({ page }) => {
  103 |     await clickReset(page);
  104 |     await expectModalVisible(page);
  105 |   });
  106 |
  107 |   test('[P1] confirming reset closes modal and restores stock values', async ({ page }) => {
  108 |     await createModule(page, 'stock', 0, 0);
  109 |     await clickReset(page);
  110 |     await expectModalVisible(page);
  111 |     await confirmModal(page);
  112 |
  113 |     // After reset, stock should still exist (reset restores values, doesn't delete)
  114 |     // Countdown panel should still show the stock
  115 |     await expect(page.locator('.countdown-panel__list')).toBeVisible({ timeout: 2000 });
  116 |     // Modal should be closed
  117 |     await expect(page.locator(SELECTORS.modalBackdrop)).toBeHidden({ timeout: 2000 });
  118 |   });
  119 |
  120 |   test('[P1] cancelling reset closes modal without changes', async ({ page }) => {
  121 |     await createModule(page, 'stock', 0, 0);
  122 |     await clickReset(page);
  123 |     await cancelModal(page);
  124 |
  125 |     // Stock should still exist — countdown panel shows list
  126 |     await expect(page.locator('.countdown-panel__list')).toBeVisible({ timeout: 2000 });
  127 |   });
  128 |
  129 |   test('[P2] Escape key dismisses reset modal', async ({ page }) => {
  130 |     await createModule(page, 'stock', 0, 0);
  131 |     await clickReset(page);
  132 |     await expectModalVisible(page);
  133 |     await page.keyboard.press('Escape');
  134 |
  135 |     // Modal should close, canvas unchanged
  136 |     await expect(page.locator(SELECTORS.modalBackdrop)).toBeHidden({ timeout: 2000 });
  137 |     // Stock should still exist
> 138 |     await expect(page.locator('.countdown-panel__list')).toBeVisible({ timeout: 2000 });
      |                                                          ^ Error: expect(locator).toBeVisible() failed
  139 |   });
  140 |
  141 |   test('[P2] clicking outside modal cancels', async ({ page }) => {
  142 |     await createModule(page, 'stock', 0, 0);
  143 |     await clickReset(page);
  144 |     await expectModalVisible(page);
  145 |
  146 |     // Click the backdrop (outside the dialog)
  147 |     await page.locator(SELECTORS.modalBackdrop).click({ position: { x: 1, y: 1 } });
  148 |
  149 |     // Modal should close
  150 |     await expect(page.locator(SELECTORS.modalBackdrop)).toBeHidden({ timeout: 2000 });
  151 |   });
  152 |
  153 |   // ── Clear Canvas ─────────────────────────────────────────────────
  154 |
  155 |   test('[P1] Clear Canvas button shows modal', async ({ page }) => {
  156 |     await createModule(page, 'stock', 0, 0);
  157 |     await clickClearCanvas(page);
  158 |     await expectModalVisible(page);
  159 |   });
  160 |
  161 |   test('[P1] confirming clear canvas removes all modules', async ({ page }) => {
  162 |     await createModule(page, 'source', -200, -100);
  163 |     await createModule(page, 'stock', 0, 0);
  164 |     await createModule(page, 'sink', 200, 100);
  165 |
  166 |     await clickClearCanvas(page);
  167 |     await confirmModal(page);
  168 |
  169 |     // After clear, countdown panel shows empty state
  170 |     await expect(page.locator('.countdown-panel__empty')).toBeVisible({ timeout: 2000 });
  171 |   });
  172 |
  173 |   test('[P1] cancelling clear canvas preserves canvas', async ({ page }) => {
  174 |     await createModule(page, 'stock', 0, 0);
  175 |     await clickClearCanvas(page);
  176 |     await cancelModal(page);
  177 |
  178 |     // Stock should still exist
  179 |     await expect(page.locator('.countdown-panel__list')).toBeVisible({ timeout: 2000 });
  180 |   });
  181 |
  182 |   // ── Auto-pause (Story 7.3) ───────────────────────────────────────
  183 |
  184 |   test('[P2] simulation auto-pauses when stock reaches capacity threshold', async ({ page }) => {
  185 |     // Create a minimal setup: source→stock, with high inflow rate
  186 |     // Stock starts at value=0, capacity=100
  187 |     await createModule(page, 'source', -200, -100);
  188 |     await createModule(page, 'stock', 0, 0);
  189 |
  190 |     // Create connection with default rate=1
  191 |     await createConnection(page, -200, -100, 0, 0);
  192 |
  193 |     // Select the connection, set a high rate
  194 |     const midX = (-200 + 0) / 2;
  195 |     const midY = (-100 + 0) / 2;
  196 |     await page.mouse.click(worldToScreen(midX, midY).x, worldToScreen(midX, midY).y);
  197 |     await page.waitForTimeout(200);
  198 |
  199 |     const rateInput = page.locator('.rate-editor__input').first();
  200 |     if (await rateInput.isVisible().catch(() => false)) {
  201 |       // Set high inflow rate to quickly fill the stock
  202 |       await rateInput.fill('50');
  203 |       await rateInput.press('Enter');
  204 |       await page.waitForTimeout(100);
  205 |     }
  206 |
  207 |     // Run simulation — the stock should fill rapidly
  208 |     await clickRun(page);
  209 |
  210 |     // Wait for auto-pause (stock value > capacity=100 at 50 units/s → ~2s)
  211 |     await page.waitForTimeout(4000);
  212 |
  213 |     // Check control bar status — should indicate pause
  214 |     const status = await getControlBarStatus(page);
  215 |     // Status should reference the paused/auto-pause state
  216 |     expect(status.length).toBeGreaterThan(0);
  217 |   });
  218 | });
  219 |
```
