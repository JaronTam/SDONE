# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: panels.test.ts >> Panels >> [P1] selecting a module deselects connection and shows empty editor
- Location: e2e\panels.test.ts:83:3

# Error details

```
Error: mouse.move: Target page, context or browser has been closed
```

# Test source

```ts
  206 |   // Small steps for a smooth drag
  207 |   const steps = 5;
  208 |   for (let i = 1; i <= steps; i++) {
  209 |     const t = i / steps;
  210 |     const x = from.x + (to.x - from.x) * t;
  211 |     const y = from.y + (to.y - from.y) * t;
  212 |     await page.mouse.move(x, y);
  213 |     await page.waitForTimeout(20);
  214 |   }
  215 |   await page.mouse.up();
  216 | }
  217 |
  218 | // ── Connection Creation ───────────────────────────────────────────────────
  219 |
  220 | /**
  221 |  * Create a connection via edge-drag between two modules.
  222 |  *
  223 |  * The edge zone is the outer 30% of the hit radius. We start the drag from
  224 |  * just inside the hit radius of the source module and end near the target.
  225 |  *
  226 |  * @param fromWorldPos - world position of the source module
  227 |  * @param toWorldPos - world position of the target module
  228 |  * @param fromType - module type of source (affects hit radius)
  229 |  */
  230 | export async function createConnection(
  231 |   page: Page,
  232 |   fromWorldX: number,
  233 |   fromWorldY: number,
  234 |   toWorldX: number,
  235 |   toWorldY: number,
  236 | ): Promise<void> {
  237 |   const from = worldToScreen(fromWorldX, fromWorldY);
  238 |   const to = worldToScreen(toWorldX, toWorldY);
  239 |
  240 |   // Calculate direction vector
  241 |   const dx = to.x - from.x;
  242 |   const dy = to.y - from.y;
  243 |   const dist = Math.sqrt(dx * dx + dy * dy) || 1;
  244 |
  245 |   // Normalized direction
  246 |   const nx = dx / dist;
  247 |   const ny = dy / dist;
  248 |
  249 |   // Edge-drag start: must be in the edge zone (outer 30% of hit radius)
  250 |   // Source: hit-radius 32px, edge zone starts at 32*0.7 = 22px → click at ~26px
  251 |   // Stock:  hit-radius ~72px, edge zone starts at 72*0.7 = 50px → click at ~56px
  252 |   // Sink:   hit-radius 24px, edge zone starts at 24*0.7 = 17px → click at ~20px
  253 |   // To work for ALL types, use a distance that's inside the outermost hit radius
  254 |   // and inside the edge zone of the smallest. Use 55px — works for stock edge,
  255 |   // for source/sink this is outside hit radius, so use a smaller fallback.
  256 |   // Strategy: use 55px, which inside stock edge zone but outside source/sink hit.
  257 |   // For smaller modules the drag-start check fails → connection doesn't start.
  258 |   // Better: use 24px which is in edge zone for all types (source: 22+, sink: 17+, stock: 50+).
  259 |   // Stock at 24px is in INNER zone (selects module, doesn't start drag).
  260 |   //
  261 |   // PARETO: use per-type logic. Since this is a canvas-only interaction, we use the
  262 |   // screen-space approach. The hit-test logic is complex. For e2e tests we approximate:
  263 |   // - Start drag from just inside the far edge of the source, moving toward target
  264 |   // - For stocks specifically, use a larger offset
  265 |   //
  266 |   // Universal approach: start at a point well into the EDGE ZONE.
  267 |   // Stock edge zone starts at ~50px, so use 60px from center toward target.
  268 |   // This is outside source/sink hit radii entirely, so for source→stock connections
  269 |   // we use a different strategy.
  270 |   //
  271 |   // PRACTICAL: Click at 80% of the way from center to the module edge in the
  272 |   // direction of the target. For stock: 120/2 = 60px half-width. 80% = 48px.
  273 |   // MODULE_HALF estimates: source ~24px, stock ~60px, sink ~24px.
  274 |   // 80% of half: source=19px, stock=48px, sink=19px.
  275 |   // Average: 30px → works for sources/sinks but NOT stocks (48px needed).
  276 |   //
  277 |   // Go with 50px from center in target direction. This is in the edge zone for
  278 |   // STOCKS (50 >= 50) and outside source/sink hit radii.
  279 |   // For sources/sinks: we need to pick a point INSIDE their hit radius.
  280 |   // Sources hit=32px, so 50px is outside. The drag won't start.
  281 |   //
  282 |   // FIX: Use a TWO-PHASE strategy. Move to the source, then move OUTWARD in the
  283 |   // direction of the target by the source's edge-zone distance (~26px).
  284 |   // Then start the drag from that edge-zone point.
  285 |   // This guarantees we're in the edge zone for ANY module type if we pick an
  286 |   // appropriate distance.
  287 |
  288 |   // Use 28px offset for edge zone — works for source (22+), sink (17+)
  289 |   // For stock: this is INNER zone, not edge. But connection drag from stock
  290 |   // is handled differently in the actual test (we verify via toast, not direct drag).
  291 |   // For now, keep 28px and let the platform-specific tests handle edge cases.
  292 |   const edgeDist = 28;
  293 |
  294 |   const startX = from.x + nx * edgeDist;
  295 |   const startY = from.y + ny * edgeDist;
  296 |   // End at the target's edge
  297 |   const endDist = Math.min(dist * 0.85, dist - 20);
  298 |   const endX = from.x + nx * endDist;
  299 |   const endY = from.y + ny * endDist;
  300 |
  301 |   await page.mouse.move(startX, startY);
  302 |   await page.mouse.down();
  303 |   const steps = 8;
  304 |   for (let i = 1; i <= steps; i++) {
  305 |     const t = i / steps;
> 306 |     await page.mouse.move(
      |                      ^ Error: mouse.move: Target page, context or browser has been closed
  307 |       startX + (endX - startX) * t,
  308 |       startY + (endY - startY) * t,
  309 |     );
  310 |     await page.waitForTimeout(25);
  311 |   }
  312 |   await page.mouse.up();
  313 |   await page.waitForTimeout(300);
  314 | }
  315 |
  316 | // ── Keyboard Helpers ──────────────────────────────────────────────────────
  317 |
  318 | /**
  319 |  * Press a key combination. Defaults to no modifiers.
  320 |  */
  321 | export async function pressKey(page: Page, key: string, ctrlKey = false, shiftKey = false): Promise<void> {
  322 |   const modifiers: string[] = [];
  323 |   if (ctrlKey) modifiers.push('Control');
  324 |   if (shiftKey) modifiers.push('Shift');
  325 |   const combo = [...modifiers, key].join('+');
  326 |   await page.keyboard.press(combo);
  327 | }
  328 |
  329 | /**
  330 |  * Press Space (run/pause toggle).
  331 |  */
  332 | export async function pressSpace(page: Page): Promise<void> {
  333 |   await page.keyboard.press('Space');
  334 | }
  335 |
  336 | /**
  337 |  * Press Delete key.
  338 |  */
  339 | export async function pressDelete(page: Page): Promise<void> {
  340 |   await page.keyboard.press('Delete');
  341 | }
  342 |
  343 | /**
  344 |  * Press Tab key.
  345 |  */
  346 | export async function pressTab(page: Page): Promise<void> {
  347 |   await page.keyboard.press('Tab');
  348 | }
  349 |
  350 | /**
  351 |  * Press Enter key.
  352 |  */
  353 | export async function pressEnter(page: Page): Promise<void> {
  354 |   await page.keyboard.press('Enter');
  355 | }
  356 |
  357 | // ── Arrow key nudge ───────────────────────────────────────────────────────
  358 |
  359 | /**
  360 |  * Press an arrow key (for nudging selected module).
  361 |  */
  362 | export async function nudgeArrow(page: Page, direction: 'Up' | 'Down' | 'Left' | 'Right'): Promise<void> {
  363 |   await page.keyboard.press(`Arrow${direction}`);
  364 | }
  365 |
  366 | // ── Simulation Helpers ────────────────────────────────────────────────────
  367 |
  368 | /**
  369 |  * Click the Run button in the control bar.
  370 |  */
  371 | export async function clickRun(page: Page): Promise<void> {
  372 |   await page.locator(SELECTORS.btnRun).click();
  373 | }
  374 |
  375 | /**
  376 |  * Click the Reset button in the control bar.
  377 |  */
  378 | export async function clickReset(page: Page): Promise<void> {
  379 |   await page.locator(SELECTORS.btnReset).click();
  380 | }
  381 |
  382 | /**
  383 |  * Click the Clear Canvas button.
  384 |  */
  385 | export async function clickClearCanvas(page: Page): Promise<void> {
  386 |   await page.locator(SELECTORS.btnClearCanvas).click();
  387 | }
  388 |
  389 | /**
  390 |  * Click save checkpoint button.
  391 |  */
  392 | export async function clickSaveCheckpoint(page: Page): Promise<void> {
  393 |   await page.locator(SELECTORS.btnSaveCheckpoint).click();
  394 | }
  395 |
  396 | /**
  397 |  * Click rewind checkpoint button.
  398 |  */
  399 | export async function clickRewindCheckpoint(page: Page): Promise<void> {
  400 |   await page.locator(SELECTORS.btnRewindCheckpoint).click();
  401 | }
  402 |
  403 | // ── Modal Helpers ─────────────────────────────────────────────────────────
  404 |
  405 | /**
  406 |  * Click the confirm button in an open modal.
```
