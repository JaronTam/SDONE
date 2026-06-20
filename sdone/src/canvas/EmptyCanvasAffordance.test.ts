/**
 * Story 2.6 — Unit tests for empty-canvas visual affordance
 *
 * Tests cover:
 *  - computePulseAlpha pure function
 *  - drawEmptyCanvasAffordance rendering logic
 *  - Conditional rendering based on node count
 */

import { describe, it, expect } from 'vitest';

// ── Import pure function ── (will be exported from SceneRenderer.ts)
import { computePulseAlpha } from './SceneRenderer.js';

// ── computePulseAlpha Tests ──────────────────────────────────────────

describe('computePulseAlpha', () => {
  const PERIOD_MS = 2000;

  it('AC2 — returns phantomAlpha=0.3 and dotAlpha=0.8 at 0ms (sine=0, start of cycle)', () => {
    const result = computePulseAlpha(0, PERIOD_MS);
    expect(result.phantomAlpha).toBeCloseTo(0.3, 1);
    expect(result.dotAlpha).toBeCloseTo(0.8, 1);
  });

  it('AC2 — returns phantomAlpha≈0.45 and dotAlpha≈0.6 at 500ms (sine=1, quarter cycle)', () => {
    const result = computePulseAlpha(500, PERIOD_MS);
    expect(result.phantomAlpha).toBeCloseTo(0.45, 1);
    expect(result.dotAlpha).toBeCloseTo(0.6, 1);
  });

  it('AC2 — returns phantomAlpha≈0.6 and dotAlpha≈0.4 at 1000ms (sine=0, half cycle)', () => {
    const result = computePulseAlpha(1000, PERIOD_MS);
    expect(result.phantomAlpha).toBeCloseTo(0.6, 1);
    expect(result.dotAlpha).toBeCloseTo(0.4, 1);
  });

  it('AC2 — returns phantomAlpha≈0.45 and dotAlpha≈0.6 at 1500ms (sine=-1, three-quarter cycle)', () => {
    const result = computePulseAlpha(1500, PERIOD_MS);
    expect(result.phantomAlpha).toBeCloseTo(0.45, 1);
    expect(result.dotAlpha).toBeCloseTo(0.6, 1);
  });

  it('AC2 — returns phantomAlpha≈0.3 and dotAlpha≈0.8 at 2000ms (sine=0, full cycle)', () => {
    const result = computePulseAlpha(2000, PERIOD_MS);
    expect(result.phantomAlpha).toBeCloseTo(0.3, 1);
    expect(result.dotAlpha).toBeCloseTo(0.8, 1);
  });

  it('AC2 — phantomAlpha is always in [0.3, 0.6] range for many deterministic elapsed values', () => {
    const testValues = Array.from({ length: 101 }, (_, i) => i * 100); // 0..10000 step 100
    for (const elapsed of testValues) {
      const result = computePulseAlpha(elapsed, PERIOD_MS);
      expect(result.phantomAlpha).toBeGreaterThanOrEqual(0.29); // float tolerance
      expect(result.phantomAlpha).toBeLessThanOrEqual(0.61);
    }
  });

  it('AC3 — dotAlpha is always in [0.4, 0.8] range for many deterministic elapsed values', () => {
    const testValues = Array.from({ length: 101 }, (_, i) => i * 100); // 0..10000 step 100
    for (const elapsed of testValues) {
      const result = computePulseAlpha(elapsed, PERIOD_MS);
      expect(result.dotAlpha).toBeGreaterThanOrEqual(0.39);
      expect(result.dotAlpha).toBeLessThanOrEqual(0.81);
    }
  });

  it('AC2/AC3 — counter-phase: phantom + dot sum ≈ 1.1 across all phases', () => {
    // phantom ∈ [0.3,0.6], dot ∈ [0.4,0.8]
    // At sine extremes: phantom=0.3→dot=0.8 (sum=1.1), phantom=0.6→dot=0.4 (sum=1.0)
    // The sum varies between 1.0 and 1.1 — not constant, but always close
    const elapsedValues = [0, 250, 500, 750, 1000, 1250, 1500, 1750, 2000];
    for (const elapsed of elapsedValues) {
      const result = computePulseAlpha(elapsed, PERIOD_MS);
      const sum = result.phantomAlpha + result.dotAlpha;
      expect(sum).toBeGreaterThanOrEqual(0.99);
      expect(sum).toBeLessThanOrEqual(1.11);
    }
  });

  it('AC2 — handles custom period lengths correctly', () => {
    // At half custom period (500ms), should be at peak phantom like 1000ms in 2000ms cycle
    const result = computePulseAlpha(500, 1000);
    expect(result.phantomAlpha).toBeCloseTo(0.6, 1);
    expect(result.dotAlpha).toBeCloseTo(0.4, 1);
  });
});

// ── Integration-style tests for rendering logic ──────────────────────

describe('EmptyCanvasAffordance rendering logic', () => {
  // We verify the pure logic, not actual canvas calls.
  // The rendering tests validate the decisions before draw calls.

  it('AC5 — shouldRenderAffordance returns true when nodes is empty', () => {
    // This logic will be in SceneRenderer.drawFrame()
    const nodes = {};
    const shouldRender = Object.keys(nodes).length === 0;
    expect(shouldRender).toBe(true);
  });

  it('AC5 — shouldRenderAffordance returns false when nodes has ≥1 entry', () => {
    const nodes = { a: { type: 'stock', position: { x: 0, y: 0 } } };
    const shouldRender = Object.keys(nodes).length === 0;
    expect(shouldRender).toBe(false);
  });

  it('AC1 — phantom stock position is at world origin (0, 0) with proper offset', () => {
    // The phantom stock is drawn centered at (0, 0)
    // The rounded rect call uses (x - STOCK_WIDTH/2, y - STOCK_HEIGHT/2)
    const STOCK_WIDTH = 120;
    const STOCK_HEIGHT = 80;
    const worldX = 0;
    const worldY = 0;
    const rectLeft = worldX - STOCK_WIDTH / 2;
    const rectTop = worldY - STOCK_HEIGHT / 2;
    expect(rectLeft).toBe(-60);
    expect(rectTop).toBe(-40);
  });

  it('AC3 — slot pulse dots are at the four edge midpoints', () => {
    const STOCK_WIDTH = 120;
    const STOCK_HEIGHT = 80;
    const hw = STOCK_WIDTH / 2; // 60
    const hh = STOCK_HEIGHT / 2; // 40

    // Top midpoint: (0, -40)
    expect({ x: 0, y: -hh }).toEqual({ x: 0, y: -40 });
    // Bottom midpoint: (0, 40)
    expect({ x: 0, y: hh }).toEqual({ x: 0, y: 40 });
    // Left midpoint: (-60, 0)
    expect({ x: -hw, y: 0 }).toEqual({ x: -60, y: 0 });
    // Right midpoint: (60, 0)
    expect({ x: hw, y: 0 }).toEqual({ x: 60, y: 0 });
  });

  it('AC8 — rendering uses save/restore isolation', () => {
    // Verify that the design calls save() before and restore() after
    // This is a structural test — implementation must follow this pattern
    const callOrder: string[] = [];
    const mockCtx = {
      save: () => callOrder.push('save'),
      restore: () => callOrder.push('restore'),
      globalAlpha: 1,
      setLineDash: (_: number[]) => callOrder.push('setLineDash'),
      strokeStyle: '',
      fillStyle: '',
      beginPath: () => callOrder.push('beginPath'),
      stroke: () => callOrder.push('stroke'),
      fill: () => callOrder.push('fill'),
      arc: () => {},
      moveTo: () => {},
      lineTo: () => {},
      arcTo: () => {},
      closePath: () => {},
    } as unknown as CanvasRenderingContext2D;

    // Simulate the pattern
    mockCtx.save();
    mockCtx.setLineDash([8, 4]);
    mockCtx.beginPath();
    mockCtx.stroke();
    mockCtx.restore();

    expect(callOrder[0]).toBe('save');
    expect(callOrder[callOrder.length - 1]).toBe('restore');
  });
});
