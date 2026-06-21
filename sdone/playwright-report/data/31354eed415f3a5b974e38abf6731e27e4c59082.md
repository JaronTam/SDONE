# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: panels.test.ts >> Panels >> [P1] countdown panel shows empty state when no stocks exist
- Location: e2e\panels.test.ts:127:3

# Error details

```
Error: page.goto: Target page, context or browser has been closed
Call log:
  - navigating to "http://localhost:5173/", waiting until "load"

```

# Test source

```ts
  1   | /**
  2   |  * SDONE E2E Test Helpers
  3   |  *
  4   |  * Shared utilities for Playwright tests. Provides composable primitives
  5   |  * for common workflows: page setup, module creation, connection creation.
  6   |  *
  7   |  * Coordinate System (Viewport 1280×720):
  8   |  *   - Default viewport: offset (0,0), zoom 1.0
  9   |  *   - screen = (world − offset) × zoom + canvasCenter
  10  |  *   - canvasCenter = (640, 360) for fullscreen canvas at 1280×720
  11  |  *   - world = (screen − canvasCenter) / zoom + offset
  12  |  *   - With defaults: world = screen − (640, 360)
  13  |  *
  14  |  * Canvas Layout:
  15  |  *   - Left panel: 240px wide, below 40px control bar
  16  |  *   - Right panel: 280px wide
  17  |  *   - Top control bar: 40px height
  18  |  *   - Minimap: bottom-right, 200×150px
  19  |  *
  20  |  * Module Sizes (world coords):
  21  |  *   - Source (cloud):   radius 16px, hit-radius 32px
  22  |  *   - Stock (rounded-rect): 120×80px
  23  |  *   - Sink (funnel):    radius 24px, hit-radius 24px
  24  |  */
  25  |
  26  | import { expect, type Page, type Locator } from '@playwright/test';
  27  |
  28  | // ── Layout Constants ──────────────────────────────────────────────────────
  29  |
  30  | /** Fixed viewport size matching playwright.config.ts. */
  31  | export const VIEWPORT = { width: 1280, height: 720 } as const;
  32  | export const CANVAS_CENTER = { x: VIEWPORT.width / 2, y: VIEWPORT.height / 2 }; // (640, 360)
  33  |
  34  | /** Left sidebar: 240px wide; icon canvases are centered horizontally (~x=120). */
  35  | export const SIDEBAR_LEFT_X = 120;
  36  | /**
  37  |  * Icon vertical positions (canvas centers) relative to viewport.
  38  |  *
  39  |  * Layout from top of viewport:
  40  |  *   Control bar: 0–40px
  41  |  *   .layer-panel-left: top=40px (below control bar)
  42  |  *   .module-panel__header: height 40px → 40–80px from viewport top
  43  |  *   .module-panel__icon-list: padding-top 16px → first icon starts at ~96px
  44  |  *   Each .module-icon: padding 10px 8px, canvas 64px, gap 6px, label ~12px
  45  |  *     → icon item height ≈ 102px, inter-icon gap 12px
  46  |  */
  47  | export const ICON_Y = {
  48  |   source: 138,   // 40(ctrl bar) + 40(header) + 16(pad) + 10(icon pad) + 32(half canvas)
  49  |   stock: 252,    // 138 + 102(icon height) + 12(gap)
  50  |   sink: 366,     // 252 + 102 + 12
  51  | } as const;
  52  |
  53  | // ── CSS Selectors ─────────────────────────────────────────────────────────
  54  |
  55  | export const SELECTORS = {
  56  |   sceneCanvas: 'canvas#scene',
  57  |   minimapCanvas: 'canvas#minimap',
  58  |   btnRun: '.btn-run',
  59  |   btnReset: '.btn-reset-sim',
  60  |   btnClearCanvas: '.btn-clear-canvas',
  61  |   btnSaveCheckpoint: '.btn-save-checkpoint',
  62  |   btnRewindCheckpoint: '.btn-rewind-checkpoint',
  63  |   btnResetViewport: '.btn-reset-viewport',
  64  |   modulePanel: '.module-panel',
  65  |   modulePanelHidden: '.module-panel--hidden',
  66  |   moduleIcon: '.module-icon',
  67  |   moduleIconHighlighted: '.module-panel__icon-list .module-icon[data-highlighted="true"]',
  68  |   rateEditor: '.rate-editor',
  69  |   controlBarStatus: '.control-bar-status',
  70  |   controlBarStatusRunning: '.control-bar-status--running',
  71  |   controlBarStatusPaused: '.control-bar-status--paused',
  72  |   modalBackdrop: '.modal-backdrop',
  73  |   modalConfirmBtn: '.modal-btn-confirm',
  74  |   modalCancelBtn: '.modal-btn-cancel',
  75  |   colorPickerPopover: '.color-picker-popover',
  76  |   colorPickerSwatch: '.color-picker-popover__swatch',
  77  |   achievementToast: '.achievement-toast',
  78  | } as const;
  79  |
  80  | // ── Page Setup ────────────────────────────────────────────────────────────
  81  |
  82  | /**
  83  |  * Navigate to the app and wait for both canvases to be visible.
  84  |  * Returns after the app has fully initialized.
  85  |  */
  86  | export async function setupPage(page: Page): Promise<void> {
> 87  |   await page.goto('/');
      |              ^ Error: page.goto: Target page, context or browser has been closed
  88  |   await page.waitForSelector(SELECTORS.sceneCanvas, { state: 'visible' });
  89  |   await page.waitForSelector(SELECTORS.minimapCanvas, { state: 'visible' });
  90  |   await page.waitForSelector(SELECTORS.modulePanel, { state: 'visible' });
  91  |   // Allow a frame for the render loop to start
  92  |   await page.waitForTimeout(300);
  93  | }
  94  |
  95  | /**
  96  |  * Get the scene canvas locator.
  97  |  */
  98  | export function getSceneCanvas(page: Page): Locator {
  99  |   return page.locator(SELECTORS.sceneCanvas);
  100 | }
  101 |
  102 | /**
  103 |  * Convert world coordinates to screen coordinates for canvas interaction.
  104 |  * With default viewport (offset=0,0 zoom=1): screen = world + canvasCenter.
  105 |  */
  106 | export function worldToScreen(worldX: number, worldY: number): { x: number; y: number } {
  107 |   return {
  108 |     x: worldX + CANVAS_CENTER.x,
  109 |     y: worldY + CANVAS_CENTER.y,
  110 |   };
  111 | }
  112 |
  113 | /**
  114 |  * Convert screen coordinates to world coordinates.
  115 |  * With default viewport: world = screen - canvasCenter.
  116 |  */
  117 | export function screenToWorld(screenX: number, screenY: number): { x: number; y: number } {
  118 |   return {
  119 |     x: screenX - CANVAS_CENTER.x,
  120 |     y: screenY - CANVAS_CENTER.y,
  121 |   };
  122 | }
  123 |
  124 | // ── Module Creation ───────────────────────────────────────────────────────
  125 |
  126 | /**
  127 |  * Click an icon in the module panel to highlight it for click-to-place.
  128 |  * @param type - 'source', 'stock', or 'sink'
  129 |  */
  130 | export async function highlightModuleType(page: Page, type: 'source' | 'stock' | 'sink'): Promise<void> {
  131 |   const y = ICON_Y[type];
  132 |   await page.mouse.click(SIDEBAR_LEFT_X, y);
  133 |
  134 |   // Verify the icon got highlighted — use data-module-type selector
  135 |   const iconSelector = `.module-panel__icon-list .module-icon[data-module-type="${type}"][data-highlighted="true"]`;
  136 |   await page.waitForSelector(iconSelector, { timeout: 2000 });
  137 | }
  138 |
  139 | /** 1-based index of each icon in the icon list. */
  140 | const ICON_ROW = { source: 1, stock: 2, sink: 3 } as const;
  141 |
  142 | /**
  143 |  * Click an empty area of the canvas to place a module of the currently
  144 |  * highlighted type at the given world position.
  145 |  *
  146 |  * @param worldX, worldY - world-space position for the new module.
  147 |  *   These will be converted to screen coordinates for the click.
  148 |  */
  149 | export async function placeModuleAt(page: Page, worldX: number, worldY: number): Promise<void> {
  150 |   const screen = worldToScreen(worldX, worldY);
  151 |   await page.mouse.click(screen.x, screen.y);
  152 | }
  153 |
  154 | /**
  155 |  * Combined: highlight a module type, then place it on the canvas.
  156 |  * This is the primary module creation flow (click-to-place via AC2, Story 6.5).
  157 |  */
  158 | export async function createModule(
  159 |   page: Page,
  160 |   type: 'source' | 'stock' | 'sink',
  161 |   worldX: number,
  162 |   worldY: number,
  163 | ): Promise<void> {
  164 |   await highlightModuleType(page, type);
  165 |   await placeModuleAt(page, worldX, worldY);
  166 | }
  167 |
  168 | // ── Module Selection ──────────────────────────────────────────────────────
  169 |
  170 | /**
  171 |  * Click on a module at its world position (inner zone — selects, doesn't start connection drag).
  172 |  *
  173 |  * Module hit radii: source 32px, stock ~72px, sink 24px.
  174 |  * Clicking at the exact center works for all types.
  175 |  */
  176 | export async function selectModule(page: Page, worldX: number, worldY: number): Promise<void> {
  177 |   const screen = worldToScreen(worldX, worldY);
  178 |   await page.mouse.click(screen.x, screen.y);
  179 | }
  180 |
  181 | /**
  182 |  * Click on empty canvas to deselect all.
  183 |  */
  184 | export async function deselectAll(page: Page): Promise<void> {
  185 |   // Click far from any modules — use a corner of the canvas
  186 |   await page.mouse.click(100, 500);
  187 | }
```
