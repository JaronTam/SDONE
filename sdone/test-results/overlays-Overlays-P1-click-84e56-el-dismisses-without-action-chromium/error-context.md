# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: overlays.test.ts >> Overlays >> [P1] clicking cancel dismisses without action
- Location: e2e\overlays.test.ts:120:3

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
    16 × locator resolved to <div class="countdown-panel__list"></div>
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
  27  | 
  28  |   // ── Achievement Toasts ────────────────────────────────────────────
  29  | 
  30  |   test('[P1] first connection triggers "Great! 🎉" toast', async ({ page }) => {
  31  |     await createModule(page, 'source', -200, -100);
  32  |     await createModule(page, 'stock', 0, 0);
  33  |     await createConnection(page, -200, -100, 0, 0);
  34  | 
  35  |     // Toast should appear
  36  |     const toast = page.locator(SELECTORS.achievementToast).first();
  37  |     await expect(toast).toBeVisible({ timeout: 3000 });
  38  |     await expect(toast).toContainText('Great!');
  39  |   });
  40  | 
  41  |   test('[P2] toast auto-dismisses after ~3 seconds', async ({ page }) => {
  42  |     await createModule(page, 'source', -200, -100);
  43  |     await createModule(page, 'stock', 0, 0);
  44  |     await createConnection(page, -200, -100, 0, 0);
  45  | 
  46  |     // Verify toast appears
  47  |     const toast = page.locator(SELECTORS.achievementToast).first();
  48  |     await expect(toast).toBeVisible({ timeout: 3000 });
  49  | 
  50  |     // Wait for auto-dismiss
  51  |     await page.waitForTimeout(4000);
  52  | 
  53  |     // Toast should be gone
  54  |     await expect(toast).toBeHidden({ timeout: 2000 }).catch(() => {
  55  |       // If still visible, check it's in exiting state
  56  |     });
  57  |   });
  58  | 
  59  |   // ── Color Picker Popover ──────────────────────────────────────────
  60  | 
  61  |   test('[P2] double-click source module opens color picker', async ({ page }) => {
  62  |     await createModule(page, 'source', -200, -100);
  63  | 
  64  |     // Double-click at the source module position
  65  |     const screen = worldToScreen(-200, -100);
  66  |     await page.mouse.click(screen.x, screen.y, { clickCount: 2 });
  67  | 
  68  |     // Color picker popover should appear
  69  |     const popover = page.locator(SELECTORS.colorPickerPopover);
  70  |     await expect(popover).toBeVisible({ timeout: 2000 });
  71  |   });
  72  | 
  73  |   test('[P2] clicking a swatch closes the popover', async ({ page }) => {
  74  |     await createModule(page, 'source', -200, -100);
  75  | 
  76  |     // Open color picker
  77  |     const screen = worldToScreen(-200, -100);
  78  |     await page.mouse.click(screen.x, screen.y, { clickCount: 2 });
  79  |     await expect(page.locator(SELECTORS.colorPickerPopover)).toBeVisible({ timeout: 2000 });
  80  | 
  81  |     // Click first swatch
  82  |     const firstSwatch = page.locator(SELECTORS.colorPickerSwatch).first();
  83  |     await firstSwatch.click();
  84  | 
  85  |     // Popover should close
  86  |     await expect(page.locator(SELECTORS.colorPickerPopover)).toBeHidden({ timeout: 2000 });
  87  |   });
  88  | 
  89  |   test('[P2] double-click stock does not open color picker', async ({ page }) => {
  90  |     await createModule(page, 'stock', 0, 0);
  91  | 
  92  |     // Double-click at the stock position
  93  |     const screen = worldToScreen(0, 0);
  94  |     await page.mouse.click(screen.x, screen.y, { clickCount: 2 });
  95  | 
  96  |     // Color picker should NOT appear (stock has fixed white color)
  97  |     await expect(page.locator(SELECTORS.colorPickerPopover)).toBeHidden({ timeout: 1000 });
  98  |   });
  99  | 
  100 |   // ── Modal Dialog ──────────────────────────────────────────────────
  101 | 
  102 |   test('[P1] Reset modal shows confirm and cancel buttons', async ({ page }) => {
  103 |     await createModule(page, 'stock', 0, 0);
  104 |     await clickReset(page);
  105 | 
  106 |     await expectModalVisible(page);
  107 |     await expect(page.locator(SELECTORS.modalConfirmBtn)).toBeVisible();
  108 |     await expect(page.locator(SELECTORS.modalCancelBtn)).toBeVisible();
  109 |   });
  110 | 
  111 |   test('[P1] clicking confirm executes the action', async ({ page }) => {
  112 |     await createModule(page, 'stock', 0, 0);
  113 |     await clickReset(page);
  114 |     await confirmModal(page);
  115 | 
  116 |     // Modal should close
  117 |     await expect(page.locator(SELECTORS.modalBackdrop)).toBeHidden({ timeout: 2000 });
  118 |   });
  119 | 
  120 |   test('[P1] clicking cancel dismisses without action', async ({ page }) => {
  121 |     await createModule(page, 'stock', 0, 0);
  122 |     await clickReset(page);
  123 |     await cancelModal(page);
  124 | 
  125 |     // Modal should close, stock should still exist
  126 |     await expect(page.locator(SELECTORS.modalBackdrop)).toBeHidden({ timeout: 2000 });
> 127 |     await expect(page.locator('.countdown-panel__list')).toBeVisible({ timeout: 2000 });
      |                                                          ^ Error: expect(locator).toBeVisible() failed
  128 |   });
  129 | 
  130 |   test('[P2] keyboard shortcuts suppressed while modal is open', async ({ page }) => {
  131 |     await createModule(page, 'stock', 0, 0);
  132 |     await clickReset(page);
  133 |     await expectModalVisible(page);
  134 | 
  135 |     // Press Space — should NOT toggle run/pause (suppressed by modal)
  136 |     await page.keyboard.press('Space');
  137 |     await page.waitForTimeout(300);
  138 | 
  139 |     // Modal should still be visible (Space was suppressed)
  140 |     await expect(page.locator(SELECTORS.modalBackdrop)).toBeVisible();
  141 | 
  142 |     // Press Delete — should NOT delete module (suppressed by modal)
  143 |     await page.keyboard.press('Delete');
  144 |     await page.waitForTimeout(300);
  145 | 
  146 |     // Cancel modal and verify stock still exists
  147 |     await cancelModal(page);
  148 |     await expect(page.locator('.countdown-panel__list')).toBeVisible({ timeout: 2000 });
  149 |   });
  150 | });
  151 | 
```