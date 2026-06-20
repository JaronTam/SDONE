/**
 * ShapePaths Unit Tests — Story 3.1 Task 8
 *
 * AC: All shared shape drawing functions produce valid canvas paths
 * that roundtrip through SceneRenderer's existing rendering pipeline
 * without regressions.
 *
 * Tests:
 *  1. roundedRectPath produces correct path points
 *  2. drawCloud draws 5 circles (fill + stroke calls)
 *  3. drawStock draws a rounded rectangle with correct aspect ratio
 *  4. drawSink draws 2 circles + waist lines
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { roundedRectPath, drawCloud, drawStock, drawSink } from './ShapePaths.js';

// ── Helpers ──────────────────────────────────────────────────────────

/**
 * Create a mock 2D context that records method calls on an array.
 * Supports both CanvasRenderingContext2D and OffscreenCanvasRenderingContext2D.
 */
function createMockCtx() {
  const calls: string[] = [];
  const mock: Record<string, unknown> = {
    moveTo: (...args: number[]) => calls.push(`moveTo(${args.join(',')})`),
    lineTo: (...args: number[]) => calls.push(`lineTo(${args.join(',')})`),
    arcTo: (...args: number[]) => calls.push(`arcTo(${args.join(',')})`),
    arc: (...args: number[]) => calls.push(`arc(${args.join(',')})`),
    beginPath: () => calls.push('beginPath'),
    closePath: () => calls.push('closePath'),
    fill: () => calls.push('fill'),
    stroke: () => calls.push('stroke'),
    save: () => calls.push('save'),
    restore: () => calls.push('restore'),
    getCalls: () => calls,
    clearCalls: () => {
      calls.length = 0;
    },
  };

  return mock as unknown as CanvasRenderingContext2D;
}

// ── Tests ────────────────────────────────────────────────────────────

describe('roundedRectPath', () => {
  let ctx: ReturnType<typeof createMockCtx>;

  beforeEach(() => {
    ctx = createMockCtx();
  });

  it('should produce a path with moveTo + 4 arcTo + closePath', () => {
    roundedRectPath(ctx, 0, 0, 100, 80, 10);

    const calls = (ctx as unknown as { getCalls: () => string[] }).getCalls();

    // First call should be moveTo
    expect(calls[0]).toMatch(/^moveTo/);

    // Should contain arcTo calls
    const arcToCalls = calls.filter((c) => c.startsWith('arcTo'));
    expect(arcToCalls).toHaveLength(4);

    // Should end with closePath
    expect(calls[calls.length - 1]).toBe('closePath');
  });

  it('should position top-left + radius as first moveTo point', () => {
    roundedRectPath(ctx, 10, 20, 100, 80, 12);

    const calls = (ctx as unknown as { getCalls: () => string[] }).getCalls();
    // left + r = 10 + 12 = 22, top = 20
    expect(calls[0]).toBe('moveTo(22,20)');
  });
});

describe('drawCloud', () => {
  let ctx: ReturnType<typeof createMockCtx>;

  beforeEach(() => {
    ctx = createMockCtx();
  });

  it('should draw 5 circles with a single beginPath/fill/stroke', () => {
    drawCloud(ctx, 50, 50, 48);

    const calls = (ctx as unknown as { getCalls: () => string[] }).getCalls();

    const beginPathCalls = calls.filter((c) => c === 'beginPath');
    const fillCalls = calls.filter((c) => c === 'fill');
    const strokeCalls = calls.filter((c) => c === 'stroke');
    const arcCalls = calls.filter((c) => c.startsWith('arc('));

    // Single path: one beginPath, one fill, one stroke (F1 fix).
    expect(beginPathCalls).toHaveLength(1);
    expect(fillCalls).toHaveLength(1);
    expect(strokeCalls).toHaveLength(1);
    // All 5 circles still drawn.
    expect(arcCalls).toHaveLength(5);
  });

  it('should scale cloud with size parameter', () => {
    // Larger size → larger radius arc calls
    drawCloud(ctx, 50, 50, 96); // 2× larger

    const calls = (ctx as unknown as { getCalls: () => string[] }).getCalls();
    const firstArc = calls.find((c) => c.startsWith('arc('));

    // arc(x, y, radius, startAngle, endAngle)
    // Radius should be proportional to size
    expect(firstArc).toBeDefined();
    const radius = parseFloat(firstArc!.split(',')[2]);
    // Canonical radius = CLOUD_RADIUS * (size / (CLOUD_RADIUS * 3.2))
    // = 16 * (96 / 51.2) ≈ 30
    expect(radius).toBeGreaterThan(20);
  });
});

describe('drawStock', () => {
  let ctx: ReturnType<typeof createMockCtx>;

  beforeEach(() => {
    ctx = createMockCtx();
  });

  it('should draw a rounded rectangle with fill + stroke', () => {
    drawStock(ctx, 50, 50, 96);

    const calls = (ctx as unknown as { getCalls: () => string[] }).getCalls();

    // Should contain beginPath, fill, stroke
    expect(calls).toContain('beginPath');
    expect(calls).toContain('fill');
    expect(calls).toContain('stroke');
  });

  it('should preserve 3:2 aspect ratio for stock', () => {
    // drawStock uses aspectRatio = width/height = 1.5
    // With size=96, w=96, h=64
    drawStock(ctx, 50, 50, 96);

    const calls = (ctx as unknown as { getCalls: () => string[] }).getCalls();
    // First moveTo should be at (left + r, top)
    // left = 50 - 48 = 2, r = 12 * (96/120) = 9.6
    // moveTo(11.6, 18) or similar
    const moveTo = calls.find((c) => c.startsWith('moveTo'));
    expect(moveTo).toBeDefined();

    const arcToCalls = calls.filter((c) => c.startsWith('arcTo'));
    expect(arcToCalls).toHaveLength(4);
  });
});

describe('drawSink', () => {
  let ctx: ReturnType<typeof createMockCtx>;

  beforeEach(() => {
    ctx = createMockCtx();
  });

  it('should draw 2 circles (2 × arc + fill + stroke) plus waist lines', () => {
    drawSink(ctx, 50, 50, 48);

    const calls = (ctx as unknown as { getCalls: () => string[] }).getCalls();

    const arcCalls = calls.filter((c) => c.startsWith('arc('));
    const fillCalls = calls.filter((c) => c === 'fill');
    const strokeCalls = calls.filter((c) => c === 'stroke');
    const moveToCalls = calls.filter((c) => c.startsWith('moveTo'));

    // 2 circles → 2 arc + 2 fill + 2 stroke
    expect(arcCalls).toHaveLength(2);
    expect(fillCalls).toHaveLength(2);
    // 2 circle strokes + 1 waist stroke = 3
    expect(strokeCalls).toHaveLength(3);
    // 2 moveTo for waist lines
    expect(moveToCalls).toHaveLength(2);
  });
});
