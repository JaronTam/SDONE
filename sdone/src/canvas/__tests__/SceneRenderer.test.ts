/**
 * Unit tests for SceneRenderer pure logic and fill animation.
 *
 * Tests for getHitRadius, getModuleBoundingRadius, computeFillRatio,
 * getEdgePoint, and Story 5.2 fill animation (resetAnimatedFills).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getHitRadius,
  getModuleBoundingRadius,
  computeFillRatio,
  getEdgePoint,
  SOURCE_CLOUD_RADIUS,
  SOURCE_HIT_RADIUS,
  SELECTION_RING_OFFSET,
  STOCK_WIDTH,
  STOCK_HEIGHT,
  STOCK_HIT_RADIUS,
  SINK_RADIUS,
  SINK_HIT_RADIUS,
} from '../SceneRenderer.js';
import { SceneRenderer } from '../SceneRenderer.js';
import type { ViewportManager } from '../Viewport.js';

// ── Story 2.3: getHitRadius ─────────────────────────────────────────

describe('getHitRadius', () => {
  it('returns SOURCE_HIT_RADIUS for source type', () => {
    expect(getHitRadius('source')).toBe(SOURCE_HIT_RADIUS);
  });

  it('returns STOCK_HIT_RADIUS for stock type', () => {
    expect(getHitRadius('stock')).toBe(STOCK_HIT_RADIUS);
  });

  it('returns SINK_HIT_RADIUS for sink type', () => {
    expect(getHitRadius('sink')).toBe(SINK_HIT_RADIUS);
  });

  it('returns SINK_HIT_RADIUS as fallback for unknown type', () => {
    expect(getHitRadius('bogus' as string)).toBe(SINK_HIT_RADIUS);
  });
});

// ── Story 2.3: getModuleBoundingRadius ──────────────────────────────

describe('getModuleBoundingRadius', () => {
  it('returns SOURCE_CLOUD_RADIUS * 2 + SELECTION_RING_OFFSET for source', () => {
    expect(getModuleBoundingRadius({ type: 'source' })).toBe(
      SOURCE_CLOUD_RADIUS * 2 + SELECTION_RING_OFFSET,
    );
  });

  it('returns half-diagonal + SELECTION_RING_OFFSET for stock', () => {
    const halfDiagonal = Math.sqrt(STOCK_WIDTH ** 2 + STOCK_HEIGHT ** 2) / 2;
    expect(getModuleBoundingRadius({ type: 'stock' })).toBe(
      halfDiagonal + SELECTION_RING_OFFSET,
    );
  });

  it('returns SINK_RADIUS + SELECTION_RING_OFFSET for sink', () => {
    expect(getModuleBoundingRadius({ type: 'sink' })).toBe(
      SINK_RADIUS + SELECTION_RING_OFFSET,
    );
  });

  it('returns SINK_RADIUS + SELECTION_RING_OFFSET as fallback for unknown type', () => {
    expect(getModuleBoundingRadius({ type: 'bogus' as string })).toBe(
      SINK_RADIUS + SELECTION_RING_OFFSET,
    );
  });
});

// ── Story 2.3: computeFillRatio ─────────────────────────────────────

describe('computeFillRatio', () => {
  it('returns 0 when capacity is 0', () => {
    expect(computeFillRatio(50, 0)).toBe(0);
  });

  it('returns 0 when capacity is negative', () => {
    expect(computeFillRatio(10, -5)).toBe(0);
  });

  it('returns 0 when value is 0', () => {
    expect(computeFillRatio(0, 100)).toBe(0);
  });

  it('returns 1 when value equals capacity', () => {
    expect(computeFillRatio(100, 100)).toBe(1);
  });

  it('returns ratio > 1 when value exceeds capacity (overflow for red tint)', () => {
    expect(computeFillRatio(150, 100)).toBeGreaterThan(1);
  });

  it('returns correct ratio for partial fill', () => {
    expect(computeFillRatio(25, 100)).toBeCloseTo(0.25);
    expect(computeFillRatio(75, 100)).toBeCloseTo(0.75);
  });

  it('returns correct ratio with float values', () => {
    expect(computeFillRatio(33.3, 100)).toBeCloseTo(0.333);
  });

  it('returns 0 when value is NaN', () => {
    expect(computeFillRatio(NaN, 100)).toBe(0);
  });

  it('returns 0 when value is Infinity', () => {
    expect(computeFillRatio(Infinity, 100)).toBe(0);
  });
});

// ── Story 3.6: getEdgePoint ─────────────────────────────────────────

describe('getEdgePoint', () => {
  const node = (type: string, x = 100, y = 100) => ({
    type,
    position: { x, y },
  });

  // ── Source ────────────────────────────────────────────────────
  describe('source', () => {
    const expectedR = SOURCE_CLOUD_RADIUS * 1.6; // cloud cluster bounding radius

    it('returns point on bounding circle toward the right', () => {
      const p = getEdgePoint(node('source'), { x: 200, y: 100 });
      expect(p.x).toBeCloseTo(100 + expectedR, 5);
      expect(p.y).toBeCloseTo(100, 5);
    });

    it('returns point on bounding circle toward the left', () => {
      const p = getEdgePoint(node('source'), { x: 0, y: 100 });
      expect(p.x).toBeCloseTo(100 - expectedR, 5);
      expect(p.y).toBeCloseTo(100, 5);
    });

    it('returns point on bounding circle toward the top', () => {
      const p = getEdgePoint(node('source'), { x: 100, y: 0 });
      expect(p.x).toBeCloseTo(100, 5);
      expect(p.y).toBeCloseTo(100 - expectedR, 5);
    });

    it('returns point on bounding circle toward the bottom', () => {
      const p = getEdgePoint(node('source'), { x: 100, y: 200 });
      expect(p.x).toBeCloseTo(100, 5);
      expect(p.y).toBeCloseTo(100 + expectedR, 5);
    });

    it('returns point on bounding circle for diagonal approach', () => {
      const p = getEdgePoint(node('source'), { x: 200, y: 200 });
      const dx = p.x - 100;
      const dy = p.y - 100;
      const dist = Math.sqrt(dx * dx + dy * dy);
      expect(dist).toBeCloseTo(expectedR, 5);
    });
  });

  // ── Stock ─────────────────────────────────────────────────────
  describe('stock', () => {
    const hw = STOCK_WIDTH / 2; // 60
    const hh = STOCK_HEIGHT / 2; // 40

    it('returns point on right edge toward the right', () => {
      const p = getEdgePoint(node('stock'), { x: 200, y: 100 });
      expect(p.x).toBeCloseTo(100 + hw, 5);
      expect(p.y).toBeCloseTo(100, 5);
    });

    it('returns point on left edge toward the left', () => {
      const p = getEdgePoint(node('stock'), { x: 0, y: 100 });
      expect(p.x).toBeCloseTo(100 - hw, 5);
      expect(p.y).toBeCloseTo(100, 5);
    });

    it('returns point on top edge toward the top', () => {
      const p = getEdgePoint(node('stock'), { x: 100, y: 0 });
      expect(p.x).toBeCloseTo(100, 5);
      expect(p.y).toBeCloseTo(100 - hh, 5);
    });

    it('returns point on bottom edge toward the bottom', () => {
      const p = getEdgePoint(node('stock'), { x: 100, y: 200 });
      expect(p.x).toBeCloseTo(100, 5);
      expect(p.y).toBeCloseTo(100 + hh, 5);
    });

    it('returns point on corner for diagonal approach', () => {
      const p = getEdgePoint(node('stock'), { x: 200, y: 200 });
      expect(p.x).toBeCloseTo(140, 5);
      expect(p.y).toBeCloseTo(140, 5);
    });

    it('returns point for near-horizontal approach (nx ≈ 1, ny ≈ 0)', () => {
      const p = getEdgePoint(node('stock'), { x: 200, y: 100.01 });
      expect(p.x).toBeCloseTo(100 + hw, 4);
      expect(p.y).toBeCloseTo(100, 1); // ~0.006 off
    });

    it('returns point for near-vertical approach (nx ≈ 0, ny ≈ 1)', () => {
      const p = getEdgePoint(node('stock'), { x: 100.01, y: 200 });
      expect(p.x).toBeCloseTo(100, 2);
      expect(p.y).toBeCloseTo(100 + hh, 4);
    });
  });

  // ── Sink ──────────────────────────────────────────────────────
  describe('sink', () => {
    it('returns point on sink radius toward the right', () => {
      const p = getEdgePoint(node('sink'), { x: 200, y: 100 });
      expect(p.x).toBeCloseTo(100 + SINK_RADIUS, 5);
      expect(p.y).toBeCloseTo(100, 5);
    });

    it('returns point on sink radius toward the left', () => {
      const p = getEdgePoint(node('sink'), { x: 0, y: 100 });
      expect(p.x).toBeCloseTo(100 - SINK_RADIUS, 5);
      expect(p.y).toBeCloseTo(100, 5);
    });
  });

  // ── Edge cases ────────────────────────────────────────────────
  describe('edge cases', () => {
    it('returns default top-edge point when dist === 0 (same position)', () => {
      const p = getEdgePoint(node('source'), { x: 100, y: 100 });
      expect(p.x).toBe(100);
      expect(p.y).toBe(80); // cy - 20
    });

    it('returns sink-radius fallback for unknown module type', () => {
      const p = getEdgePoint(node('bogus' as string), { x: 200, y: 100 });
      expect(p.x).toBeCloseTo(100 + SINK_RADIUS, 5);
      expect(p.y).toBeCloseTo(100, 5);
    });
  });
});

// ── Story 5.2: Fill Animation ──────────────────────────────────────

function createMockCanvas(width = 800, height = 600): {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
} {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const ctx = {
    canvas,
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 0,
    globalAlpha: 1,
    fillRect: vi.fn(),
    strokeRect: vi.fn(),
    clearRect: vi.fn(),
    beginPath: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
    stroke: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    closePath: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    scale: vi.fn(),
    translate: vi.fn(),
    rotate: vi.fn(),
    clip: vi.fn(),
    resetTransform: vi.fn(),
    setLineDash: vi.fn(),
    shadowBlur: 0,
    shadowColor: '',
    measureText: vi.fn().mockReturnValue({ width: 0 }),
    fillText: vi.fn(),
    strokeText: vi.fn(),
  } as unknown as CanvasRenderingContext2D;

  vi.spyOn(canvas, 'getContext').mockReturnValue(ctx as never);

  return { canvas, ctx };
}

describe('SceneRenderer fill animation (Story 5.2)', () => {
  let renderer: SceneRenderer;
  let viewport: ViewportManager;

  beforeEach(() => {
    const { canvas } = createMockCanvas();
    viewport = {
      applyTransform: vi.fn(),
      viewport: { zoom: 1, offset: { x: 0, y: 0 } },
    } as unknown as ViewportManager;
    renderer = new SceneRenderer(canvas, viewport);
  });

  it('creates SceneRenderer without error', () => {
    expect(renderer).toBeDefined();
  });

  it('resetAnimatedFills clears the internal fill ratio map', () => {
    // Populate the map to simulate active animation state
    (renderer as any).animatedFillRatios.set('stock-1', 0.5);
    (renderer as any).animatedFillRatios.set('stock-2', 0.75);
    expect((renderer as any).animatedFillRatios.size).toBe(2);

    renderer.resetAnimatedFills();

    expect((renderer as any).animatedFillRatios.size).toBe(0);
  });

  it('resetAnimatedFills is idempotent (safe to call on empty map)', () => {
    renderer.resetAnimatedFills();
    renderer.resetAnimatedFills();
    // No throw on empty map
    expect((renderer as any).animatedFillRatios.size).toBe(0);
  });

  it('stop and resetAnimatedFills sequence clears state correctly', () => {
    // Populate some animation state
    (renderer as any).animatedFillRatios.set('s1', 0.3);
    renderer.stop();
    renderer.resetAnimatedFills();
    expect((renderer as any).animatedFillRatios.size).toBe(0);
  });

  // Story 5.2 AC5: fill animation resets on RESET event
  it('AC5: after reset, next tickAnimatedFillRatios snaps to target (no stale lerp)', () => {
    // Simulate a stale animated value far from the correct target
    (renderer as any).animatedFillRatios.set('s1', 0.1);
    const nodes = {
      s1: { type: 'stock', value: 100, capacity: 100 },
    };

    renderer.resetAnimatedFills();

    // After reset, calling tickAnimatedFillRatios should snap to target = 1.0
    // because the map was cleared, so `?? target` gives target directly
    (renderer as any).tickAnimatedFillRatios(nodes);
    expect((renderer as any).animatedFillRatios.get('s1')).toBe(1);
  });
});
