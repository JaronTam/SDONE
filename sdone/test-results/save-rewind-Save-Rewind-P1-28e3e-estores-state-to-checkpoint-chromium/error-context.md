# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: save-rewind.test.ts >> Save & Rewind >> [P1] clicking rewind restores state to checkpoint
- Location: e2e\save-rewind.test.ts:90:3

# Error details

```
Error: expect(locator).toHaveCount(expected) failed

Locator:  locator('.countdown-panel__row')
Expected: 2
Received: 0
Timeout:  2000ms

Call log:
  - Expect "toHaveCount" with timeout 2000ms
  - waiting for locator('.countdown-panel__row')
    14 × locator resolved to 0 elements
       - unexpected value "0"

```

# Page snapshot

```yaml
- generic [ref=e1]:
    - generic [ref=e2]:
        - generic:
            - generic [ref=e5]:
                - generic [ref=e6]:
                    - generic [ref=e7]: 构件面板
                    - button "固定面板" [ref=e8] [cursor=pointer]: 📌
                - generic [ref=e9]:
                    - option "源" [ref=e10]:
                        - generic [ref=e12]: 源
                    - option "存量" [selected] [ref=e13]:
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
            - generic [ref=e45]: PAUSED
            - button "↺ Reset" [ref=e46]
            - button "🗑 Clear" [ref=e47] [cursor=pointer]
            - button "💾 保存检查点" [ref=e48]
            - button "⏪ 回到检查点" [ref=e49]
            - button "↺ Fit All" [ref=e50]
    - generic: 检查点已保存
    - generic [ref=e53]:
        - generic [ref=e54]: 设置存量容量
        - generic [ref=e55]:
            - spinbutton [active] [ref=e56]: '100'
            - generic [ref=e57]: 单位
        - generic [ref=e58]: Enter 确认 · Esc 取消
```

# Test source

```ts
  7   |  * Rewind restores state and pauses simulation,
  8   |  * Reset clears checkpoint.
  9   |  */
  10  |
  11  | import { test, expect } from '@playwright/test';
  12  | import {
  13  |   setupPage,
  14  |   createModule,
  15  |   createConnection,
  16  |   clickRun,
  17  |   clickReset,
  18  |   clickSaveCheckpoint,
  19  |   clickRewindCheckpoint,
  20  |   pressSpace,
  21  |   isSaveCheckpointDisabled,
  22  |   isRewindCheckpointDisabled,
  23  |   confirmModal,
  24  |   worldToScreen,
  25  |   expectToast,
  26  |   SELECTORS,
  27  | } from './helpers.js';
  28  |
  29  | test.describe('Save & Rewind', () => {
  30  |   test.beforeEach(async ({ page }) => {
  31  |     await setupPage(page);
  32  |   });
  33  |
  34  |   // ── Button Enabled/Disabled States ────────────────────────────────
  35  |
  36  |   test('[P1] save button is disabled when simulation is idle (default state)', async ({ page }) => {
  37  |     // Save should be disabled when not paused (AC6: save only when paused)
  38  |     // Initially simulation is idle, save should be disabled
  39  |     await expect(await isSaveCheckpointDisabled(page)).toBe(true);
  40  |   });
  41  |
  42  |   test('[P1] rewind button is disabled when no checkpoint exists', async ({ page }) => {
  43  |     await expect(await isRewindCheckpointDisabled(page)).toBe(true);
  44  |   });
  45  |
  46  |   test('[P1] save button becomes enabled when simulation is paused', async ({ page }) => {
  47  |     await createModule(page, 'stock', 0, 0);
  48  |     // Run first to enter 'running' state
  49  |     await clickRun(page);
  50  |     await page.waitForTimeout(300);
  51  |     // Pause — save should be enabled
  52  |     await pressSpace(page);
  53  |     await page.waitForTimeout(300);
  54  |
  55  |     await expect(await isSaveCheckpointDisabled(page)).toBe(false);
  56  |   });
  57  |
  58  |   test('[P1] save button is disabled while running', async ({ page }) => {
  59  |     await createModule(page, 'stock', 0, 0);
  60  |     await clickRun(page);
  61  |     await page.waitForTimeout(300);
  62  |
  63  |     // Save should be disabled while running
  64  |     await expect(await isSaveCheckpointDisabled(page)).toBe(true);
  65  |   });
  66  |
  67  |   // ── Save Checkpoint ───────────────────────────────────────────────
  68  |
  69  |   test('[P1] clicking save creates checkpoint + shows toast', async ({ page }) => {
  70  |     await createModule(page, 'stock', 0, 0);
  71  |
  72  |     // Pause the simulation
  73  |     await clickRun(page);
  74  |     await page.waitForTimeout(300);
  75  |     await pressSpace(page);
  76  |     await page.waitForTimeout(300);
  77  |
  78  |     // Click save
  79  |     await clickSaveCheckpoint(page);
  80  |
  81  |     // Toast should confirm checkpoint saved
  82  |     await expectToast(page, '检查点已保存');
  83  |
  84  |     // Rewind button should now be enabled
  85  |     await expect(await isRewindCheckpointDisabled(page)).toBe(false);
  86  |   });
  87  |
  88  |   // ── Rewind ────────────────────────────────────────────────────────
  89  |
  90  |   test('[P1] clicking rewind restores state to checkpoint', async ({ page }) => {
  91  |     // Setup initial state
  92  |     await createModule(page, 'stock', 0, 0);
  93  |
  94  |     // Pause and save
  95  |     await clickRun(page);
  96  |     await page.waitForTimeout(300);
  97  |     await pressSpace(page);
  98  |     await page.waitForTimeout(300);
  99  |     await clickSaveCheckpoint(page);
  100 |     await expectToast(page, '检查点已保存');
  101 |
  102 |     // Modify state by adding another module
  103 |     await createModule(page, 'stock', 100, 50);
  104 |
  105 |     // Verify second stock exists (two stocks in countdown)
  106 |     const rows = page.locator('.countdown-panel__row');
> 107 |     await expect(rows).toHaveCount(2, { timeout: 2000 });
      |                        ^ Error: expect(locator).toHaveCount(expected) failed
  108 |
  109 |     // Rewind
  110 |     await clickRewindCheckpoint(page);
  111 |
  112 |     // Should be back to 1 stock
  113 |     await expect(page.locator('.countdown-panel__row')).toHaveCount(1, { timeout: 2000 });
  114 |   });
  115 |
  116 |   test('[P1] rewind pauses simulation if running', async ({ page }) => {
  117 |     await createModule(page, 'stock', 0, 0);
  118 |
  119 |     // Pause and save
  120 |     await clickRun(page);
  121 |     await page.waitForTimeout(300);
  122 |     await pressSpace(page);
  123 |     await page.waitForTimeout(300);
  124 |     await clickSaveCheckpoint(page);
  125 |
  126 |     // Add a second stock while still paused
  127 |     await createModule(page, 'stock', 100, 50);
  128 |
  129 |     // Rewind — should keep simulation paused
  130 |     await clickRewindCheckpoint(page);
  131 |
  132 |     // After rewind, simulation should be paused → save enabled
  133 |     await expect(await isSaveCheckpointDisabled(page)).toBe(false);
  134 |   });
  135 |
  136 |   // ── Reset Clears Checkpoint ───────────────────────────────────────
  137 |
  138 |   test('[P2] reset clears the checkpoint', async ({ page }) => {
  139 |     await createModule(page, 'stock', 0, 0);
  140 |
  141 |     // Pause and save
  142 |     await clickRun(page);
  143 |     await page.waitForTimeout(300);
  144 |     await pressSpace(page);
  145 |     await page.waitForTimeout(300);
  146 |     await clickSaveCheckpoint(page);
  147 |     await expect(await isRewindCheckpointDisabled(page)).toBe(false);
  148 |
  149 |     // Reset
  150 |     await clickReset(page);
  151 |     await confirmModal(page);
  152 |
  153 |     // Checkpoint should be cleared → rewind disabled
  154 |     await expect(await isRewindCheckpointDisabled(page)).toBe(true);
  155 |   });
  156 | });
  157 |
```
