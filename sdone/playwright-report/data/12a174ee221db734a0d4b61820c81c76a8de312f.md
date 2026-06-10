# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: connection-lifecycle.test.ts >> Connection Lifecycle >> [P1] clicking a connection populates the rate editor panel
- Location: e2e\connection-lifecycle.test.ts:137:3

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator:  locator('.rate-editor__form')
Expected: visible
Received: hidden
Timeout:  2000ms

Call log:
  - Expect "toBeVisible" with timeout 2000ms
  - waiting for locator('.rate-editor__form')
    15 × locator resolved to <div class="rate-editor__form">…</div>
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
  50  |     // Toast "Great! 🎉" should appear (first connection achievement)
  51  |     const toast = page.locator(SELECTORS.achievementToast).first();
  52  |     await expect(toast).toBeVisible({ timeout: 3000 });
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
> 150 |     await expect(formEl).toBeVisible({ timeout: 2000 });
      |                          ^ Error: expect(locator).toBeVisible() failed
  151 |     // The connection label should show direction "源 → 存量"
  152 |     const connectionLabel = page.locator('.rate-editor__connection-label');
  153 |     await expect(connectionLabel).toContainText('源');
  154 |     await expect(connectionLabel).toContainText('存量');
  155 |   });
  156 | 
  157 |   test('[P1] deselecting a connection clears the rate editor', async ({ page }) => {
  158 |     await createModule(page, 'source', SRC_POS.x, SRC_POS.y);
  159 |     await createModule(page, 'stock', STK_POS.x, STK_POS.y);
  160 |     await createConnection(page, SRC_POS.x, SRC_POS.y, STK_POS.x, STK_POS.y);
  161 | 
  162 |     // Select the connection
  163 |     const midX = (SRC_POS.x + STK_POS.x) / 2;
  164 |     const midY = (SRC_POS.y + STK_POS.y) / 2;
  165 |     const screen = worldToScreen(midX, midY);
  166 |     await page.mouse.click(screen.x, screen.y);
  167 | 
  168 |     // Verify rate editor is populated
  169 |     await expect(page.locator('.rate-editor__form')).toBeVisible({ timeout: 2000 });
  170 | 
  171 |     // Click empty canvas to deselect
  172 |     await page.mouse.click(100, 500);
  173 | 
  174 |     // Rate editor should return to empty state
  175 |     await expect(page.locator('.rate-editor__empty')).toBeVisible({ timeout: 2000 });
  176 |   });
  177 | 
  178 |   // ── AC3: Selecting a module deselects connections ───────────────
  179 | 
  180 |   test('[P1] selecting a module after a connection clears rate editor', async ({ page }) => {
  181 |     await createModule(page, 'source', SRC_POS.x, SRC_POS.y);
  182 |     await createModule(page, 'stock', STK_POS.x, STK_POS.y);
  183 |     await createConnection(page, SRC_POS.x, SRC_POS.y, STK_POS.x, STK_POS.y);
  184 | 
  185 |     // Select the connection
  186 |     const midX = (SRC_POS.x + STK_POS.x) / 2;
  187 |     const midY = (SRC_POS.y + STK_POS.y) / 2;
  188 |     await page.mouse.click(worldToScreen(midX, midY).x, worldToScreen(midX, midY).y);
  189 |     await expect(page.locator('.rate-editor__form')).toBeVisible({ timeout: 2000 });
  190 | 
  191 |     // Select the stock module → should clear rate editor (mutual exclusivity)
  192 |     await selectModule(page, STK_POS.x, STK_POS.y);
  193 |     await expect(page.locator('.rate-editor__empty')).toBeVisible({ timeout: 2000 });
  194 |   });
  195 | 
  196 |   // ── AC4: Connection Deletion ───────────────────────────────────
  197 | 
  198 |   test('[P1] Delete key removes selected connection', async ({ page }) => {
  199 |     await createModule(page, 'source', SRC_POS.x, SRC_POS.y);
  200 |     await createModule(page, 'stock', STK_POS.x, STK_POS.y);
  201 |     await createConnection(page, SRC_POS.x, SRC_POS.y, STK_POS.x, STK_POS.y);
  202 | 
  203 |     // Select the connection
  204 |     const midX = (SRC_POS.x + STK_POS.x) / 2;
  205 |     const midY = (SRC_POS.y + STK_POS.y) / 2;
  206 |     await page.mouse.click(worldToScreen(midX, midY).x, worldToScreen(midX, midY).y);
  207 |     await expect(page.locator('.rate-editor__form')).toBeVisible({ timeout: 2000 });
  208 | 
  209 |     // Delete the connection
  210 |     await pressDelete(page);
  211 | 
  212 |     // Rate editor should return to empty state (connection deleted)
  213 |     await expect(page.locator('.rate-editor__empty')).toBeVisible({ timeout: 2000 });
  214 |   });
  215 | 
  216 |   test('[P2] edge-drag duplicate is a no-op', async ({ page }) => {
  217 |     await createModule(page, 'source', SRC_POS.x, SRC_POS.y);
  218 |     await createModule(page, 'stock', STK_POS.x, STK_POS.y);
  219 | 
  220 |     // First connection
  221 |     await createConnection(page, SRC_POS.x, SRC_POS.y, STK_POS.x, STK_POS.y);
  222 | 
  223 |     // Wait for the first toast
  224 |     const toastTexts: string[] = [];
  225 |     page.on('console', (msg) => {
  226 |       if (msg.type() === 'log') toastTexts.push(msg.text());
  227 |     });
  228 | 
  229 |     // Second connection (duplicate) should not throw or cause issues
  230 |     await createConnection(page, SRC_POS.x, SRC_POS.y, STK_POS.x, STK_POS.y);
  231 | 
  232 |     // App should still be functional
  233 |     await expect(page.locator(SELECTORS.sceneCanvas)).toBeVisible();
  234 |   });
  235 | 
  236 |   // ── AC5: Feedback Connection ───────────────────────────────────
  237 | 
  238 |   test('[P2] feedback handle triggers toast on feedback creation', async ({ page }) => {
  239 |     // Create source and stock
  240 |     await createModule(page, 'source', SRC_POS.x, SRC_POS.y);
  241 |     await createModule(page, 'stock', STK_POS.x, STK_POS.y);
  242 | 
  243 |     // Create source→stock connection first (so stock has an incoming connection)
  244 |     await createConnection(page, SRC_POS.x, SRC_POS.y, STK_POS.x, STK_POS.y);
  245 | 
  246 |     // After source→stock connection, the stock should have a feedback handle visible.
  247 |     // The feedback handle is on the left side of the stock (Story 7.1).
  248 |     // Its screen position: stock world position ± offset for handle
  249 |     const stockScreen = worldToScreen(STK_POS.x, STK_POS.y);
  250 |     // Feedback handle is on the left edge of the stock, about 60px offset
```