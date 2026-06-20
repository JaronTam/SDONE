import { describe, it, expect } from 'vitest';
import { OverlaySyncManager } from './OverlaySyncManager.js';
import { ViewportManager, MIN_ZOOM, MAX_ZOOM } from './Viewport.js';
import { vec2, type Vec2 } from '../shared/Vec2.js';

// ---------------------------------------------------------------------------
// Helpers (same pattern as Viewport.test.ts)
// ---------------------------------------------------------------------------

/** Tolerance for floating-point comparisons. */
const EPSILON = 1e-10;
function closeTo(a: number, b: number, epsilon = EPSILON): boolean {
  return Math.abs(a - b) < epsilon;
}

function vecCloseTo(a: Vec2, b: Vec2, epsilon = EPSILON): boolean {
  return closeTo(a.x, b.x, epsilon) && closeTo(a.y, b.y, epsilon);
}

/** Default canvas center for a 800×600 viewport. */
const DEFAULT_CANVAS_CENTER = vec2(400, 300);

// ---------------------------------------------------------------------------
// OverlaySyncManager — Red-Phase Unit Tests (Story 8.3)
// ---------------------------------------------------------------------------

describe('OverlaySyncManager', () => {
  // ── AC1: Construction ───────────────────────────────────────────────

  describe('construction', () => {
    it('T1: creates instance with ViewportManager dependency', () => {
      const vm = new ViewportManager();
      const manager = new OverlaySyncManager(vm);
      expect(manager).toBeInstanceOf(OverlaySyncManager);
    });
  });

  // ── getToolbarScreenPosition ────────────────────────────────────────

  describe('getToolbarScreenPosition', () => {
    // ── AC2: Basic Calculation (zoom 1×, origin offset) ───────────────

    it('T2: basic position at zoom 1×, origin offset, default height 80', () => {
      const vm = new ViewportManager({ zoom: 1, offset: vec2(0, 0) });
      const manager = new OverlaySyncManager(vm);

      const result = manager.getToolbarScreenPosition(
        vec2(100, 100), // module world center
        80, // default module height
        DEFAULT_CANVAS_CENTER,
      );

      // screenX = canvasCenter.x + worldCenter.x = 400 + 100 = 500
      expect(result.x).toBe(500);
      // screenY = canvasCenter.y + (worldCenter.y - height/2) - 8
      //         = 300 + (100 - 40) - 8 = 352
      expect(result.y).toBe(352);
    });

    // ── AC3: Zoom Applied ─────────────────────────────────────────────

    it('T3: zoom 2× — screen coords scale, 8px offset does NOT scale', () => {
      const vm = new ViewportManager({ zoom: 2, offset: vec2(0, 0) });
      const manager = new OverlaySyncManager(vm);

      const result = manager.getToolbarScreenPosition(vec2(50, 50), 80, DEFAULT_CANVAS_CENTER);

      // screenX = 400 + 50×2 = 500
      expect(result.x).toBe(500);
      // screenY = 300 + (50 - 40)×2 - 8 = 300 + 20 - 8 = 312
      // NOT 300 + 10×2 - 8×2 = 304 (8px is screen pixels, NOT scaled)
      expect(result.y).toBe(312);
    });

    it('T4: zoom 0.5× — screen coords shrink proportionally', () => {
      const vm = new ViewportManager({ zoom: 0.5, offset: vec2(0, 0) });
      const manager = new OverlaySyncManager(vm);

      const result = manager.getToolbarScreenPosition(vec2(100, 100), 80, DEFAULT_CANVAS_CENTER);

      // screenX = 400 + 100×0.5 = 450
      expect(result.x).toBe(450);
      // screenY = 300 + (100 - 40)×0.5 - 8 = 300 + 30 - 8 = 322
      expect(result.y).toBe(322);
    });

    // ── AC4: Panned Viewport ──────────────────────────────────────────

    it('T5: panned viewport with offset ≠ origin', () => {
      const vm = new ViewportManager({ zoom: 1, offset: vec2(200, -100) });
      const manager = new OverlaySyncManager(vm);

      // Module at (200, -100) — the viewport center point
      const result = manager.getToolbarScreenPosition(vec2(200, -100), 80, DEFAULT_CANVAS_CENTER);

      // screenX = 400 + (200 - 200)×1 = 400
      expect(result.x).toBe(400);
      // topCenterWorld = (200, -100 - 40) = (200, -140)
      // worldToScreen with offset (200, -100), zoom 1:
      // screenX = (200 - 200) × 1 + 400 = 400
      // screenY = (-140 - (-100)) × 1 + 300 = 260; minus 8 = 252
      expect(vecCloseTo(result, vec2(400, 252))).toBe(true);
    });

    // ── Edge: Negative World Coordinates ───────────────────────────────

    it('T6: module at negative world coordinates', () => {
      const vm = new ViewportManager({ zoom: 1, offset: vec2(0, 0) });
      const manager = new OverlaySyncManager(vm);

      const result = manager.getToolbarScreenPosition(vec2(-50, -50), 80, DEFAULT_CANVAS_CENTER);

      // screenX = 400 + (-50) = 350
      expect(result.x).toBe(350);
      // screenY = 300 + (-50 - 40) - 8 = 300 - 90 - 8 = 202
      expect(result.y).toBe(202);
    });

    // ── AC5: Non-Default Module Height ─────────────────────────────────

    it('T7: non-default height 120 — toolbar 8px above actual top edge', () => {
      const vm = new ViewportManager({ zoom: 1, offset: vec2(0, 0) });
      const manager = new OverlaySyncManager(vm);

      const result = manager.getToolbarScreenPosition(vec2(100, 100), 120, DEFAULT_CANVAS_CENTER);

      // screenX = 400 + 100 = 500
      expect(result.x).toBe(500);
      // screenY = 300 + (100 - 60) - 8 = 300 + 40 - 8 = 332
      expect(result.y).toBe(332);
    });

    // ── Edge: Degenerate Height = 0 ────────────────────────────────────

    it('T8: degenerate height=0 — no crash, toolbar 8px above center', () => {
      const vm = new ViewportManager({ zoom: 1, offset: vec2(0, 0) });
      const manager = new OverlaySyncManager(vm);

      // Must not throw — pure math on valid numbers
      const result = manager.getToolbarScreenPosition(vec2(100, 100), 0, DEFAULT_CANVAS_CENTER);

      // screenX = 400 + 100 = 500
      expect(result.x).toBe(500);
      // screenY = 300 + (100 - 0) - 8 = 392
      expect(result.y).toBe(392);
    });

    // ── Edge: Non-Default canvasCenter ─────────────────────────────────

    it('T9: non-default canvasCenter (1024×768 → 512, 384)', () => {
      const vm = new ViewportManager({ zoom: 1, offset: vec2(0, 0) });
      const manager = new OverlaySyncManager(vm);

      const canvasCenter = vec2(512, 384);
      const result = manager.getToolbarScreenPosition(vec2(100, 100), 80, canvasCenter);

      // screenX = 512 + 100 = 612
      expect(result.x).toBe(612);
      // screenY = 384 + (100 - 40) - 8 = 384 + 60 - 8 = 436
      expect(result.y).toBe(436);
    });

    // ── Edge: Zoom Boundaries ──────────────────────────────────────────

    it('T10: MIN_ZOOM (0.1) — no precision issues, no crash', () => {
      const vm = new ViewportManager({ zoom: MIN_ZOOM, offset: vec2(0, 0) });
      const manager = new OverlaySyncManager(vm);

      const result = manager.getToolbarScreenPosition(vec2(100, 100), 80, DEFAULT_CANVAS_CENTER);

      // screenX = 400 + 100×0.1 = 410
      expect(closeTo(result.x, 410)).toBe(true);
      // screenY = 300 + (100 - 40)×0.1 - 8 = 300 + 6 - 8 = 298
      expect(closeTo(result.y, 298)).toBe(true);
    });

    it('T11: MAX_ZOOM (5.0) — no precision issues, no crash', () => {
      const vm = new ViewportManager({ zoom: MAX_ZOOM, offset: vec2(0, 0) });
      const manager = new OverlaySyncManager(vm);

      const result = manager.getToolbarScreenPosition(vec2(100, 100), 80, DEFAULT_CANVAS_CENTER);

      // screenX = 400 + 100×5 = 900
      expect(closeTo(result.x, 900)).toBe(true);
      // screenY = 300 + (100 - 40)×5 - 8 = 300 + 300 - 8 = 592
      expect(closeTo(result.y, 592)).toBe(true);
    });

    // ── AC2: Return Type ──────────────────────────────────────────────

    it('T12: return type is Vec2 with x and y number properties', () => {
      const vm = new ViewportManager();
      const manager = new OverlaySyncManager(vm);

      const result = manager.getToolbarScreenPosition(vec2(0, 0), 80, DEFAULT_CANVAS_CENTER);

      expect(typeof result.x).toBe('number');
      expect(typeof result.y).toBe('number');
      expect(Number.isFinite(result.x)).toBe(true);
      expect(Number.isFinite(result.y)).toBe(true);
    });

    // ── AC6: canvasCenter as Parameter ─────────────────────────────────

    it('T14: canvasCenter is consumed as a parameter — NOT stored state', () => {
      const vm = new ViewportManager();
      const manager = new OverlaySyncManager(vm);

      // Call with two different canvasCenters — both produce correct results
      const r1 = manager.getToolbarScreenPosition(vec2(100, 100), 80, vec2(400, 300));
      const r2 = manager.getToolbarScreenPosition(vec2(100, 100), 80, vec2(512, 384));

      // Different canvasCenters → different outputs → NOT cached state
      expect(r1.x).not.toBe(r2.x);
      expect(r1.y).not.toBe(r2.y);
    });
  });

  // ── AC7: No DOM Dependency ──────────────────────────────────────────

  describe('DOM isolation (AC7)', () => {
    it('T13: OverlaySyncManager can be instantiated in test environment (DOM audit is manual per AC7)', () => {
      // Static analysis: this test verifies the module can be imported
      // in a jsdom/vitest environment without DOM-specific imports.
      // The actual enforcement is via manual audit (grep for HTMLElement,
      // document, window, CSS imports). This test ensures the module
      // loads cleanly in a test environment that may not have full DOM.
      const vm = new ViewportManager();
      const manager = new OverlaySyncManager(vm);
      expect(manager).toBeDefined();
    });
  });

  // ── AC8: Barrel Export ──────────────────────────────────────────────

  describe('barrel export (AC8)', () => {
    it('T15: OverlaySyncManager is exported from canvas/index.ts', async () => {
      // Dynamic import to verify barrel export chain
      const barrel = await import('./index.js');
      expect(barrel.OverlaySyncManager).toBe(OverlaySyncManager);
      expect(typeof barrel.OverlaySyncManager).toBe('function');
    });
  });
});
