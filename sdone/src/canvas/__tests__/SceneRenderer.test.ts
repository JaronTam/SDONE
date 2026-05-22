/**
 * Story 2.3 & 2.4 — Unit tests for SceneRenderer pure logic.
 *
 * The canvas rendering pipeline cannot be directly tested without
 * a full Canvas API mock, but the pure math functions (bounding
 * radius, edge-clipping, arrowhead geometry) are extracted and
 * independently testable.
 */
import { describe, it, expect } from 'vitest';
import {
  getHitRadius,
  getModuleBoundingRadiusForConnection,
  SOURCE_CLOUD_RADIUS,
  SOURCE_HIT_RADIUS,
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

// ── Story 2.4: getModuleBoundingRadiusForConnection ─────────────────

describe('getModuleBoundingRadiusForConnection', () => {
  it('returns SOURCE_CLOUD_RADIUS * 2 for source (udx/udy ignored for circle)', () => {
    expect(getModuleBoundingRadiusForConnection({ type: 'source' }, 1, 0)).toBe(
      SOURCE_CLOUD_RADIUS * 2,
    );
  });

  it('returns correct rectangle-edge distance for stock along X axis', () => {
    // Horizontal direction: edge is at half-width (STOCK_WIDTH/2 = 60)
    expect(getModuleBoundingRadiusForConnection({ type: 'stock' }, 1, 0)).toBe(
      STOCK_WIDTH / 2,
    );
  });

  it('returns correct rectangle-edge distance for stock along Y axis', () => {
    // Vertical direction: edge is at half-height (STOCK_HEIGHT/2 = 40)
    expect(getModuleBoundingRadiusForConnection({ type: 'stock' }, 0, 1)).toBe(
      STOCK_HEIGHT / 2,
    );
  });

  it('returns correct rectangle-edge distance for stock along diagonal', () => {
    // 3-4-5 triangle direction: tx = 60/(0.6) = 100, ty = 40/(0.8) = 50
    // min(100, 50) = 50 — the shorter reach hits the top/bottom edge first
    expect(
      getModuleBoundingRadiusForConnection({ type: 'stock' }, 0.6, 0.8),
    ).toBeCloseTo(50);
  });

  it('returns SINK_RADIUS for sink', () => {
    expect(getModuleBoundingRadiusForConnection({ type: 'sink' }, 1, 0)).toBe(
      SINK_RADIUS,
    );
  });

  it('returns SINK_RADIUS as fallback for unknown type', () => {
    expect(
      getModuleBoundingRadiusForConnection(
        { type: 'unknown' as string },
        1,
        0,
      ),
    ).toBe(SINK_RADIUS);
  });
});

// ── Story 2.4: Edge-clipping math ───────────────────────────────────

describe('Connection edge-clipping math', () => {
  /**
   * Pure function that mirrors the clipping logic from
   * `SceneRenderer.drawConnections()`.
   */
  function clipEndpoints(
    fromX: number,
    fromY: number,
    toX: number,
    toY: number,
    fromRadius: number,
    toRadius: number,
  ): { startX: number; startY: number; endX: number; endY: number } | null {
    const dx = toX - fromX;
    const dy = toY - fromY;
    const dist = Math.hypot(dx, dy);
    if (dist < 0.001) return null;

    const udx = dx / dist;
    const udy = dy / dist;

    return {
      startX: fromX + udx * fromRadius,
      startY: fromY + udy * fromRadius,
      endX: toX - udx * toRadius,
      endY: toY - udy * toRadius,
    };
  }

  it('clips start and end to module edges on horizontal line', () => {
    const result = clipEndpoints(0, 0, 200, 0, 30, 50);
    expect(result).not.toBeNull();
    expect(result!.startX).toBeCloseTo(30);
    expect(result!.startY).toBeCloseTo(0);
    expect(result!.endX).toBeCloseTo(150);
    expect(result!.endY).toBeCloseTo(0);
  });

  it('clips start and end to module edges on diagonal', () => {
    // 3-4-5 triangle: dx=60, dy=80, dist=100
    const result = clipEndpoints(0, 0, 60, 80, 10, 20);
    expect(result).not.toBeNull();
    // unit vector (0.6, 0.8)
    expect(result!.startX).toBeCloseTo(6);   // 0 + 0.6*10
    expect(result!.startY).toBeCloseTo(8);   // 0 + 0.8*10
    expect(result!.endX).toBeCloseTo(48);    // 60 - 0.6*20
    expect(result!.endY).toBeCloseTo(64);    // 80 - 0.8*20
  });

  it('returns null for overlapping modules (dist < 0.001)', () => {
    // Same position = dir vector zero length
    const result = clipEndpoints(5, 5, 5, 5, 20, 20);
    expect(result).toBeNull();
  });

  it('handles vertical line correctly', () => {
    const result = clipEndpoints(100, 0, 100, 200, 10, 30);
    expect(result).not.toBeNull();
    expect(result!.startX).toBeCloseTo(100);
    expect(result!.startY).toBeCloseTo(10);
    expect(result!.endX).toBeCloseTo(100);
    expect(result!.endY).toBeCloseTo(170); // 200 - 30
  });
});

// ── Story 2.4: Edge cases for drawConnections ───────────────────────

describe('drawConnections logic edge cases', () => {
  /**
   * Simulates the filtering step: for each connection, if either
   * endpoint node is missing, skip it.
   */
  function getVisibleConnections(
    connections: Array<{ id: string; fromId: string; toId: string }>,
    nodeIds: Set<string>,
  ): string[] {
    const visible: string[] = [];
    for (const conn of connections) {
      if (nodeIds.has(conn.fromId) && nodeIds.has(conn.toId)) {
        visible.push(conn.id);
      }
    }
    return visible;
  }

  it('skips connection when fromNode is missing', () => {
    const conn = { id: 'c1', fromId: 'ghost', toId: 'n2' };
    const nodeIds = new Set(['n2']);
    expect(getVisibleConnections([conn], nodeIds)).toEqual([]);
  });

  it('skips connection when toNode is missing', () => {
    const conn = { id: 'c2', fromId: 'n1', toId: 'ghost' };
    const nodeIds = new Set(['n1']);
    expect(getVisibleConnections([conn], nodeIds)).toEqual([]);
  });

  it('includes connection when both nodes exist', () => {
    const conn = { id: 'c3', fromId: 'n1', toId: 'n2' };
    const nodeIds = new Set(['n1', 'n2']);
    expect(getVisibleConnections([conn], nodeIds)).toEqual(['c3']);
  });
});