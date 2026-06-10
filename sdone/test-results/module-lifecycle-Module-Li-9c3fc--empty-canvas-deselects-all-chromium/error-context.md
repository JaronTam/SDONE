# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: module-lifecycle.test.ts >> Module Lifecycle >> [P1] clicking empty canvas deselects all
- Location: e2e\module-lifecycle.test.ts:147:3

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
    18 × locator resolved to <div class="analytics-panel__data">…</div>
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
  52  |   });
  53  | 
  54  |   test('[P1] clicking stock icon highlights it', async ({ page }) => {
  55  |     await page.mouse.click(SIDEBAR_LEFT_X, ICON_Y.stock);
  56  |     const highlighted = page.locator(SELECTORS.moduleIconHighlighted);
  57  |     await expect(highlighted).toBeVisible({ timeout: 1000 });
  58  |   });
  59  | 
  60  |   test('[P1] clicking sink icon highlights it', async ({ page }) => {
  61  |     await page.mouse.click(SIDEBAR_LEFT_X, ICON_Y.sink);
  62  |     const highlighted = page.locator(SELECTORS.moduleIconHighlighted);
  63  |     await expect(highlighted).toBeVisible({ timeout: 1000 });
  64  |   });
  65  | 
  66  |   test('[P1] clicking a different icon switches highlight to that type', async ({ page }) => {
  67  |     // Click source icon to highlight
  68  |     await page.mouse.click(SIDEBAR_LEFT_X, ICON_Y.source);
  69  |     const sourceHighlighted = page.locator('.module-panel__icon-list .module-icon[data-module-type="source"][data-highlighted="true"]');
  70  |     await expect(sourceHighlighted).toBeVisible({ timeout: 1000 });
  71  | 
  72  |     // Click stock icon — should switch highlight from source to stock
  73  |     await page.mouse.click(SIDEBAR_LEFT_X, ICON_Y.stock);
  74  |     const stockHighlighted = page.locator('.module-panel__icon-list .module-icon[data-module-type="stock"][data-highlighted="true"]');
  75  |     await expect(stockHighlighted).toBeVisible({ timeout: 1000 });
  76  |     // Source should no longer be highlighted
  77  |     await expect(sourceHighlighted).toBeHidden({ timeout: 1000 });
  78  |   });
  79  | 
  80  |   // ── AC2: Click-to-Place ────────────────────────────────────────
  81  | 
  82  |   test('[P1] click-to-place creates a source module on canvas', async ({ page }) => {
  83  |     await createModule(page, 'source', SRC_POS.x, SRC_POS.y);
  84  | 
  85  |     // Icon highlight should be cleared after placement (clearSelection in onCanvasClickEmpty)
  86  |     await expect(page.locator(SELECTORS.moduleIconHighlighted)).toBeHidden({ timeout: 1000 });
  87  | 
  88  |     // No console errors
  89  |   });
  90  | 
  91  |   test('[P1] click-to-place creates a stock module on canvas', async ({ page }) => {
  92  |     await createModule(page, 'stock', STK_POS.x, STK_POS.y);
  93  | 
  94  |     // Stock module should appear in the countdown panel
  95  |     // The countdown panel shows empty state when no stocks exist, list when stocks exist
  96  |     const countdownEmpty = page.locator('.countdown-panel__empty');
  97  |     await expect(countdownEmpty).toBeHidden({ timeout: 2000 });
  98  | 
  99  |     const countdownList = page.locator('.countdown-panel__list');
  100 |     await expect(countdownList).toBeVisible({ timeout: 2000 });
  101 |   });
  102 | 
  103 |   test('[P1] click-to-place creates a sink module on canvas', async ({ page }) => {
  104 |     await createModule(page, 'sink', SNK_POS.x, SNK_POS.y);
  105 | 
  106 |     // Icon highlight should be cleared after placement
  107 |     await expect(page.locator(SELECTORS.moduleIconHighlighted)).toBeHidden({ timeout: 1000 });
  108 |   });
  109 | 
  110 |   // ── AC3: Enter-to-Place at center ──────────────────────────────
  111 | 
  112 |   test('[P1] Enter key places module at viewport center when type is highlighted', async ({ page }) => {
  113 |     await highlightModuleType(page, 'stock');
  114 |     await pressEnter(page);
  115 | 
  116 |     // Module was placed at viewport center (world 0,0) — canvas is still visible
  117 |     await expect(page.locator(SELECTORS.sceneCanvas)).toBeVisible();
  118 | 
  119 |     // Verify by selecting the module at center and checking analytics
  120 |     await selectModule(page, 0, 0);
  121 |     const analyticsData = page.locator('.analytics-panel__data');
  122 |     await expect(analyticsData).toBeVisible({ timeout: 2000 });
  123 |   });
  124 | 
  125 |   test('[P2] Enter key with no type highlighted is a no-op', async ({ page }) => {
  126 |     // No highlight → Enter should do nothing
  127 |     await pressEnter(page);
  128 | 
  129 |     // Countdown panel should remain in empty state
  130 |     const countdownEmpty = page.locator('.countdown-panel__empty');
  131 |     await expect(countdownEmpty).toBeVisible({ timeout: 1000 });
  132 |   });
  133 | 
  134 |   // ── AC4: Module Selection & Deselection ────────────────────────
  135 | 
  136 |   test('[P1] clicking a stock module shows analytics panel data', async ({ page }) => {
  137 |     await createModule(page, 'stock', STK_POS.x, STK_POS.y);
  138 | 
  139 |     // Click on the stock to select it
  140 |     await selectModule(page, STK_POS.x, STK_POS.y);
  141 | 
  142 |     // Analytics panel should show data (not empty state)
  143 |     const analyticsData = page.locator('.analytics-panel__data');
  144 |     await expect(analyticsData).toBeVisible({ timeout: 2000 });
  145 |   });
  146 | 
  147 |   test('[P1] clicking empty canvas deselects all', async ({ page }) => {
  148 |     await createModule(page, 'stock', STK_POS.x, STK_POS.y);
  149 |     await selectModule(page, STK_POS.x, STK_POS.y);
  150 | 
  151 |     // Verify selected — analytics shows data
> 152 |     await expect(page.locator('.analytics-panel__data')).toBeVisible({ timeout: 2000 });
      |                                                          ^ Error: expect(locator).toBeVisible() failed
  153 | 
  154 |     // Click empty canvas far from any module
  155 |     await deselectAll(page);
  156 | 
  157 |     // Analytics panel should return to empty state
  158 |     await expect(page.locator('.analytics-panel__empty')).toBeVisible({ timeout: 2000 });
  159 |   });
  160 | 
  161 |   // ── AC5: Module Move (drag) ────────────────────────────────────
  162 | 
  163 |   test('[P1] module can be dragged to a new position', async ({ page }) => {
  164 |     await createModule(page, 'stock', STK_POS.x, STK_POS.y);
  165 | 
  166 |     // Drag the stock to a new position (still visible)
  167 |     await moveModule(page, STK_POS.x, STK_POS.y, 100, 50);
  168 | 
  169 |     // After drag, countdown panel should still show the stock
  170 |     const countdownList = page.locator('.countdown-panel__list');
  171 |     await expect(countdownList).toBeVisible({ timeout: 1000 });
  172 |   });
  173 | 
  174 |   // ── AC6: Arrow Key Nudge ──────────────────────────────────────
  175 | 
  176 |   test('[P1] arrow keys nudge selected module', async ({ page }) => {
  177 |     await createModule(page, 'stock', STK_POS.x, STK_POS.y);
  178 |     await selectModule(page, STK_POS.x, STK_POS.y);
  179 | 
  180 |     // Nudge right 3 times
  181 |     await nudgeArrow(page, 'Right');
  182 |     await nudgeArrow(page, 'Right');
  183 |     await nudgeArrow(page, 'Right');
  184 | 
  185 |     // Module should still be on canvas (and selected)
  186 |     const analyticsData = page.locator('.analytics-panel__data');
  187 |     await expect(analyticsData).toBeVisible({ timeout: 1000 });
  188 |   });
  189 | 
  190 |   test('[P2] nudge is a no-op when no module is selected', async ({ page }) => {
  191 |     // No module selected → nudge should do nothing
  192 |     await nudgeArrow(page, 'Right');
  193 |     // No error, app still functional
  194 |     await expect(page.locator(SELECTORS.sceneCanvas)).toBeVisible();
  195 |   });
  196 | 
  197 |   // ── AC7: Tab Cycle Selection ──────────────────────────────────
  198 | 
  199 |   test('[P1] Tab cycles through modules on the canvas', async ({ page }) => {
  200 |     // Create multiple modules
  201 |     await createModule(page, 'source', SRC_POS.x, SRC_POS.y);
  202 |     await createModule(page, 'stock', STK_POS.x, STK_POS.y);
  203 |     await createModule(page, 'sink', SNK_POS.x, SNK_POS.y);
  204 | 
  205 |     // First Tab: should select the first module (alphabetically/numerically)
  206 |     await pressTab(page);
  207 | 
  208 |     // After a few tabs we should eventually land on the stock, showing analytics
  209 |     // Tab through until we hit the stock (max 3 tabs)
  210 |     for (let i = 0; i < 3; i++) {
  211 |       const analyticsVisible = await page.locator('.analytics-panel__data').isVisible({ timeout: 500 }).catch(() => false);
  212 |       if (analyticsVisible) break;
  213 |       await pressTab(page);
  214 |       await page.waitForTimeout(200);
  215 |     }
  216 | 
  217 |     // Eventually the stock should be selected and analytics visible
  218 |     await expect(page.locator('.analytics-panel__data')).toBeVisible({ timeout: 2000 });
  219 |   });
  220 | 
  221 |   test('[P2] Tab with no modules is a no-op', async ({ page }) => {
  222 |     // No modules on canvas → Tab should not throw
  223 |     await pressTab(page);
  224 |     await expect(page.locator(SELECTORS.sceneCanvas)).toBeVisible();
  225 |   });
  226 | 
  227 |   // ── AC8: Module Deletion ──────────────────────────────────────
  228 | 
  229 |   test('[P1] Delete key removes selected module', async ({ page }) => {
  230 |     await createModule(page, 'stock', STK_POS.x, STK_POS.y);
  231 | 
  232 |     // Verify stock exists via countdown panel
  233 |     await expect(page.locator('.countdown-panel__list')).toBeVisible({ timeout: 2000 });
  234 | 
  235 |     // Select and delete the stock
  236 |     await selectModule(page, STK_POS.x, STK_POS.y);
  237 |     await pressDelete(page);
  238 | 
  239 |     // After deletion, countdown panel returns to empty state
  240 |     await expect(page.locator('.countdown-panel__empty')).toBeVisible({ timeout: 2000 });
  241 |   });
  242 | 
  243 |   test('[P2] Delete key with nothing selected is a no-op', async ({ page }) => {
  244 |     // No module selected → Delete should not throw
  245 |     await pressDelete(page);
  246 |     await expect(page.locator(SELECTORS.sceneCanvas)).toBeVisible();
  247 |   });
  248 | 
  249 |   // ── AC9: Colour Palette ────────────────────────────────────────
  250 | 
  251 |   test('[P2] first source module gets a colour from the palette', async ({ page }) => {
  252 |     // Create a source — it should work without errors
```