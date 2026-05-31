/**
 * Unit tests for SceneRenderer pure logic.
 *
 * Tests for getHitRadius, getModuleBoundingRadius, computeFillRatio,
 * and getEdgePoint.
 */
import { describe, it, expect } from 'vitest';
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

  it('returns 1 when value exceeds capacity (clamped)', () => {
    expect(computeFillRatio(150, 100)).toBe(1);
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
    const hw = STOCK_WIDTH / 2;  // 60
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
      // Stock is 120×80: aspect ratio means top/bottom edges are closer
      // than left/right for a 45° diagonal ray.
      // t_y = hh / |ny| = 40 / (1/√2) ≈ 56.6
      // t_x = hw / |nx| = 60 / (1/√2) ≈ 84.9
      // t = min(84.9, 56.6) = 56.6 → hits top edge at (140, 140)
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
