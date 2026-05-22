import { describe, it, expect } from 'vitest';
import { ViewportManager, MIN_ZOOM, MAX_ZOOM } from './Viewport.js';
import { vec2, type Vec2 } from '../shared/Vec2.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Tolerance for floating-point comparisons of coordinate transforms. */
const EPSILON = 1e-10;
function closeTo(a: number, b: number, epsilon = EPSILON): boolean {
  return Math.abs(a - b) < epsilon;
}

function vecCloseTo(a: Vec2, b: Vec2, epsilon = EPSILON): boolean {
  return closeTo(a.x, b.x, epsilon) && closeTo(a.y, b.y, epsilon);
}

// ---------------------------------------------------------------------------
// ViewportManager — Unit Tests (Story 2.2 review follow-up)
// ---------------------------------------------------------------------------

describe('ViewportManager', () => {
  // ── Construction ──────────────────────────────────────────────────

  describe('construction', () => {
    it('defaults to origin at zoom 1×', () => {
      const vm = new ViewportManager();
      expect(vm.viewport.offset.x).toBe(0);
      expect(vm.viewport.offset.y).toBe(0);
      expect(vm.viewport.zoom).toBe(1.0);
    });

    it('accepts partial initial viewport', () => {
      const vm = new ViewportManager({ offset: vec2(100, 200), zoom: 2.5 });
      expect(vm.viewport.offset.x).toBe(100);
      expect(vm.viewport.offset.y).toBe(200);
      expect(vm.viewport.zoom).toBe(2.5);
    });

    it('accepts only offset', () => {
      const vm = new ViewportManager({ offset: vec2(50, -30) });
      expect(vm.viewport.offset.x).toBe(50);
      expect(vm.viewport.offset.y).toBe(-30);
      expect(vm.viewport.zoom).toBe(1.0);
    });

    it('accepts only zoom', () => {
      const vm = new ViewportManager({ zoom: 3.0 });
      expect(vm.viewport.offset.x).toBe(0);
      expect(vm.viewport.offset.y).toBe(0);
      expect(vm.viewport.zoom).toBe(3.0);
    });
  });

  // ── screenToWorld / worldToScreen — Round-trip ────────────────────

  describe('coordinate transformations', () => {
    it('screenToWorld of canvas-center = offset (origin case)', () => {
      const vm = new ViewportManager({ offset: vec2(10, 20), zoom: 1 });
      const center = vec2(400, 300);
      const result = vm.screenToWorld(center, center);
      expect(vecCloseTo(result, vm.viewport.offset)).toBe(true);
    });

    it('worldToScreen of offset = canvas-center', () => {
      const vm = new ViewportManager({ offset: vec2(0, 0), zoom: 2 });
      const center = vec2(500, 400);
      const result = vm.worldToScreen(vec2(0, 0), center);
      expect(vecCloseTo(result, center)).toBe(true);
    });

    it('round-trip: screen → world → screen with zoom 1×', () => {
      const vm = new ViewportManager({ zoom: 1 });
      const center = vec2(640, 360);
      const pos = vec2(200, 150);

      const world = vm.screenToWorld(pos, center);
      const roundTripped = vm.worldToScreen(world, center);

      expect(vecCloseTo(roundTripped, pos)).toBe(true);
    });

    it('round-trip: screen → world → screen with zoom 3×', () => {
      const vm = new ViewportManager({ zoom: 3, offset: vec2(-40, 60) });
      const center = vec2(800, 600);
      const pos = vec2(350, 240);

      const world = vm.screenToWorld(pos, center);
      const roundTripped = vm.worldToScreen(world, center);

      expect(vecCloseTo(roundTripped, pos)).toBe(true);
    });

    it('round-trip: screen → world → screen at min zoom', () => {
      const vm = new ViewportManager({ zoom: MIN_ZOOM, offset: vec2(500, -200) });
      const center = vec2(960, 540);
      const pos = vec2(100, 100);

      const world = vm.screenToWorld(pos, center);
      const roundTripped = vm.worldToScreen(world, center);

      expect(vecCloseTo(roundTripped, pos)).toBe(true);
    });

    it('round-trip: screen → world → screen at max zoom', () => {
      const vm = new ViewportManager({ zoom: MAX_ZOOM, offset: vec2(-1000, 1000) });
      const center = vec2(1024, 768);
      const pos = vec2(512, 384);

      const world = vm.screenToWorld(pos, center);
      const roundTripped = vm.worldToScreen(world, center);

      expect(vecCloseTo(roundTripped, pos)).toBe(true);
    });

    it('screenToWorld accounts for offset', () => {
      const vm = new ViewportManager({ offset: vec2(100, -50), zoom: 1 });
      const center = vec2(400, 300);
      // Center pixel should map to offset
      expect(vecCloseTo(vm.screenToWorld(center, center), vec2(100, -50))).toBe(true);
      // Pixel 50px right of center should map to offset.x + 50
      const right = vm.screenToWorld(vec2(450, 300), center);
      expect(closeTo(right.x, 150)).toBe(true);
      expect(closeTo(right.y, -50)).toBe(true);
    });

    it('screenToWorld accounts for zoom', () => {
      const vm = new ViewportManager({ offset: vec2(0, 0), zoom: 2 });
      const center = vec2(400, 300);
      // 40 px right = 20 world units (because zoom 2×)
      const result = vm.screenToWorld(vec2(440, 300), center);
      expect(closeTo(result.x, 20)).toBe(true);
      expect(closeTo(result.y, 0)).toBe(true);
    });
  });

  // ── Pan ───────────────────────────────────────────────────────────

  describe('panByScreenDelta', () => {
    it('moves offset by inverted world delta at zoom 1×', () => {
      const vm = new ViewportManager({ offset: vec2(0, 0), zoom: 1 });
      vm.panByScreenDelta(vec2(50, -30));
      expect(closeTo(vm.viewport.offset.x, -50)).toBe(true);
      expect(closeTo(vm.viewport.offset.y, 30)).toBe(true);
    });

    it('scales screen delta by zoom', () => {
      const vm = new ViewportManager({ offset: vec2(100, 100), zoom: 2 });
      vm.panByScreenDelta(vec2(80, 40));
      // world delta = (80/2, 40/2) = (40, 20), subtracted from offset
      expect(closeTo(vm.viewport.offset.x, 60)).toBe(true);
      expect(closeTo(vm.viewport.offset.y, 80)).toBe(true);
    });

    it('accumulates multiple pans', () => {
      const vm = new ViewportManager({ offset: vec2(0, 0), zoom: 1 });
      vm.panByScreenDelta(vec2(10, 0));
      vm.panByScreenDelta(vec2(10, 0));
      vm.panByScreenDelta(vec2(-5, 5));
      expect(closeTo(vm.viewport.offset.x, -15)).toBe(true);
      expect(closeTo(vm.viewport.offset.y, -5)).toBe(true);
    });

    it('zero delta is a no-op for offset', () => {
      const vm = new ViewportManager({ offset: vec2(42, 17), zoom: 2 });
      vm.panByScreenDelta(vec2(0, 0));
      expect(vm.viewport.offset.x).toBe(42);
      expect(vm.viewport.offset.y).toBe(17);
    });
  });

  // ── Zoom ──────────────────────────────────────────────────────────

  describe('zoomAtScreenPoint', () => {
    it('zooms in while keeping the screen-origin world-point fixed', () => {
      const vm = new ViewportManager({ zoom: 1, offset: vec2(0, 0) });
      const center = vec2(400, 300);

      // Put mouse at (420, 300) — 20px right of center → world (20, 0)
      const worldBefore = vm.screenToWorld(vec2(420, 300), center);
      vm.zoomAtScreenPoint(2, vec2(420, 300), center);
      // After zoom, the same world point should still be under mouse
      const worldAfter = vm.screenToWorld(vec2(420, 300), center);
      expect(vecCloseTo(worldAfter, worldBefore)).toBe(true);
    });

    it('zooms out (factor < 1)', () => {
      const vm = new ViewportManager({ zoom: 2, offset: vec2(100, 50) });
      const center = vec2(500, 400);

      const mousePos = vec2(300, 250);
      const worldBefore = vm.screenToWorld(mousePos, center);
      vm.zoomAtScreenPoint(0.5, mousePos, center);
      expect(vm.viewport.zoom).toBe(1.0);
      const worldAfter = vm.screenToWorld(mousePos, center);
      expect(vecCloseTo(worldAfter, worldBefore)).toBe(true);
    });

    it('clamps to MIN_ZOOM', () => {
      const vm = new ViewportManager({ zoom: 1 });
      vm.zoomAtScreenPoint(0.05, vec2(400, 300), vec2(400, 300));
      expect(vm.viewport.zoom).toBe(MIN_ZOOM);
    });

    it('clamps to MAX_ZOOM', () => {
      const vm = new ViewportManager({ zoom: 1 });
      vm.zoomAtScreenPoint(10, vec2(400, 300), vec2(400, 300));
      expect(vm.viewport.zoom).toBe(MAX_ZOOM);
    });

    it('is a no-op when clamped at boundary', () => {
      const vm = new ViewportManager({ zoom: MAX_ZOOM, offset: vec2(10, 20) });
      const originalOffset = { ...vm.viewport.offset };
      vm.zoomAtScreenPoint(2, vec2(100, 100), vec2(400, 300));
      expect(vm.viewport.zoom).toBe(MAX_ZOOM);
      expect(vm.viewport.offset.x).toBe(originalOffset.x);
      expect(vm.viewport.offset.y).toBe(originalOffset.y);
    });
  });

  // ── Reset ─────────────────────────────────────────────────────────

  describe('reset', () => {
    it('restores default offset and zoom', () => {
      const vm = new ViewportManager({ offset: vec2(500, -300), zoom: 4 });
      vm.reset();
      expect(vm.viewport.offset.x).toBe(0);
      expect(vm.viewport.offset.y).toBe(0);
      expect(vm.viewport.zoom).toBe(1.0);
    });

    it('is idempotent', () => {
      const vm = new ViewportManager();
      vm.reset();
      expect(vm.viewport.offset.x).toBe(0);
      expect(vm.viewport.offset.y).toBe(0);
      expect(vm.viewport.zoom).toBe(1.0);
      vm.reset();
      expect(vm.viewport.offset.x).toBe(0);
      expect(vm.viewport.zoom).toBe(1.0);
    });
  });

  // ── applyTransform ───────────────────────────────────────────────

  describe('applyTransform', () => {
    function mockContext(): CanvasRenderingContext2D {
      // Minimal mock — just capture setTransform args
      let captured: { a: number; b: number; c: number; d: number; e: number; f: number } | null = null;
      const ctx = {
        _captured: null as typeof captured,
        setTransform(a: number, b: number, c: number, d: number, e: number, f: number) {
          captured = { a, b, c, d, e, f };
          (ctx as any)._captured = captured;
        },
      };
      return ctx as unknown as CanvasRenderingContext2D;
    }

    it('sets uniform scale from zoom', () => {
      const vm = new ViewportManager({ zoom: 2.5 });
      const ctx = mockContext();
      vm.applyTransform(ctx, vec2(400, 300));
      const t = (ctx as any)._captured;
      expect(t.a).toBe(2.5);
      expect(t.d).toBe(2.5);
      expect(t.b).toBe(0);
      expect(t.c).toBe(0);
    });

    it('translates to canvas center at zoom 1×, offset 0', () => {
      const vm = new ViewportManager({ zoom: 1 });
      const ctx = mockContext();
      vm.applyTransform(ctx, vec2(400, 300));
      const t = (ctx as any)._captured;
      expect(t.e).toBe(400);
      expect(t.f).toBe(300);
    });

    it('accounts for offset in translation', () => {
      const vm = new ViewportManager({ zoom: 1, offset: vec2(50, -30) });
      const ctx = mockContext();
      vm.applyTransform(ctx, vec2(400, 300));
      const t = (ctx as any)._captured;
      expect(closeTo(t.e, 400 - 50)).toBe(true);
      expect(closeTo(t.f, 300 + 30)).toBe(true);
    });

    it('accounts for both zoom and offset', () => {
      const vm = new ViewportManager({ zoom: 2, offset: vec2(100, 200) });
      const ctx = mockContext();
      vm.applyTransform(ctx, vec2(640, 480));
      const t = (ctx as any)._captured;
      // e = canvasCenter.x - offset.x × zoom = 640 - 200 = 440
      // f = canvasCenter.y - offset.y × zoom = 480 - 400 = 80
      expect(closeTo(t.e, 440)).toBe(true);
      expect(closeTo(t.f, 80)).toBe(true);
    });
  });

  // ── Edge Cases ────────────────────────────────────────────────────

  describe('edge cases', () => {
    it('handles negative canvasCenter gracefully', () => {
      const vm = new ViewportManager();
      // Should not throw — just exercises math with unusual input
      expect(() => vm.screenToWorld(vec2(0, 0), vec2(-100, -100))).not.toThrow();
    });

    it('handles very large pan offsets', () => {
      const vm = new ViewportManager({ offset: vec2(1e6, -1e6), zoom: 1 });
      const center = vec2(400, 300);
      const world = vm.screenToWorld(center, center);
      expect(closeTo(world.x, 1e6, 1e-4)).toBe(true);
      expect(closeTo(world.y, -1e6, 1e-4)).toBe(true);
    });

    it('zoom factor of exactly 1 is a no-op for zoom but may adjust offset', () => {
      const vm = new ViewportManager({ offset: vec2(50, 50), zoom: 2 });
      vm.zoomAtScreenPoint(1.0, vec2(400, 300), vec2(400, 300));
      // zoom stays same, but offset recomputed — should be equivalent
      expect(vm.viewport.zoom).toBe(2);
      // World under mouse unchanged
      const world = vm.screenToWorld(vec2(400, 300), vec2(400, 300));
      expect(vecCloseTo(world, vec2(50, 50))).toBe(true);
    });

    it('viewport object reference is stable across operations', () => {
      const vm = new ViewportManager();
      const ref = vm.viewport;
      vm.panByScreenDelta(vec2(10, 10));
      expect(vm.viewport).toBe(ref);
      vm.zoomAtScreenPoint(1.5, vec2(100, 100), vec2(400, 300));
      expect(vm.viewport).toBe(ref);
      vm.reset();
      expect(vm.viewport).toBe(ref);
    });
  });
});