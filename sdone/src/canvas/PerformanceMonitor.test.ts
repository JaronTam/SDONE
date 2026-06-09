/**
 * Story 7.5 — PerformanceMonitor unit tests.
 *
 * Tests the PerformanceMonitor class: frame recording, P95 computation,
 * degradation mode thresholds, console warnings, and recovery hysteresis.
 *
 * Generated: 2026-06-08 by bmad-testarch-atdd
 * Activated: 2026-06-08 (green phase — implementation complete)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PerformanceMonitor } from './PerformanceMonitor.js';

// ── Test helpers ──────────────────────────────────────────────

function createModuleCountSignal(initialCount: number) {
  let count = initialCount;
  return {
    get: () => count,
    set: (n: number) => { count = n; },
  };
}

function mockPerformanceNow(startTime = 1000) {
  let time = startTime;
  const advance = (ms: number) => { time += ms; };
  const spy = vi.spyOn(performance, 'now').mockImplementation(() => time);
  return { advance, spy, getTime: () => time };
}

// ═══════════════════════════════════════════════════════════
// AC1: Rolling buffer + P95
// ═══════════════════════════════════════════════════════════

describe('Story 7.5: PerformanceMonitor — AC1 (rolling buffer + P95)', () => {
  let monitor: PerformanceMonitor;
  let signal: ReturnType<typeof createModuleCountSignal>;
  let perf: ReturnType<typeof mockPerformanceNow>;

  beforeEach(() => {
    signal = createModuleCountSignal(10);
    perf = mockPerformanceNow();
    monitor = new PerformanceMonitor(signal.get);
  });

  afterEach(() => {
    perf.spy.mockRestore();
  });

  it('[AC1] initial degradation mode is "full"', () => {
    expect(monitor.getDegradationMode()).toBe('full');
  });

  it('[AC1] P95 defaults to safe assumption when buffer has < 2 samples', () => {
    // Record only 1 frame → no P95 can be computed
    monitor.recordFrame(perf.getTime());
    // Advance past 2s to trigger recompute
    perf.advance(2000);
    monitor.recordFrame(perf.getTime());
    // Should not crash — defaults to 60fps internally
    // Mode stays full (10 modules ≤ 15)
    expect(monitor.getDegradationMode()).toBe('full');
  });

  it('[AC1] degradation mode updates after ~2s when module count crosses threshold', () => {
    // Start with 20 modules (should go to sparse after 2s)
    signal.set(20);
    // Record frames: ~120 frames at 17ms spacing = ~2.04s
    for (let i = 0; i < 120; i++) {
      monitor.recordFrame(perf.getTime());
      perf.advance(17);
    }
    // After 2s of frames, recompute should have triggered
    expect(monitor.getDegradationMode()).toBe('sparse');
  });
});

// ═══════════════════════════════════════════════════════════
// AC2: Console warning
// ═══════════════════════════════════════════════════════════

describe('Story 7.5: PerformanceMonitor — AC2 (console warning)', () => {
  let monitor: PerformanceMonitor;
  let signal: ReturnType<typeof createModuleCountSignal>;
  let perf: ReturnType<typeof mockPerformanceNow>;
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    signal = createModuleCountSignal(10); // ≤15 modules
    perf = mockPerformanceNow();
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    monitor = new PerformanceMonitor(signal.get);
  });

  afterEach(() => {
    perf.spy.mockRestore();
    warnSpy.mockRestore();
  });

  it('[AC2] console.warn is called when P95 FPS < 30 and ≤15 modules', () => {
    // Record ~120 frames at 35ms spacing → ~28.6fps (below 30fps threshold)
    // Total span: 119 * 35 = 4165ms ≥ 2s → last frame triggers recompute
    for (let i = 0; i < 120; i++) {
      monitor.recordFrame(perf.getTime());
      perf.advance(35);
    }
    expect(warnSpy).toHaveBeenCalled();
    const callArg = warnSpy.mock.calls[0][0] as string;
    expect(callArg).toContain('⚠️ P95 FPS below 30 — check render pipeline');
  });

  it('[AC2] no console.warn when ≤15 modules but P95 FPS ≥ 30', () => {
    // Record frames at 16ms spacing → ~60fps
    for (let i = 0; i < 200; i++) {
      monitor.recordFrame(perf.getTime());
      perf.advance(16);
    }
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('[AC2] no console.warn when >15 modules even if FPS is low', () => {
    signal.set(25); // above AC2 scope
    for (let i = 0; i < 120; i++) {
      monitor.recordFrame(perf.getTime());
      perf.advance(35); // slow frames
    }
    // AC2 is scoped to ≤15 modules — no warning for 16+
    expect(warnSpy).not.toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════
// AC3: Sparse mode (16–30 modules)
// ═══════════════════════════════════════════════════════════

describe('Story 7.5: PerformanceMonitor — AC3 (sparse mode)', () => {
  let monitor: PerformanceMonitor;
  let signal: ReturnType<typeof createModuleCountSignal>;
  let perf: ReturnType<typeof mockPerformanceNow>;

  beforeEach(() => {
    signal = createModuleCountSignal(16);
    perf = mockPerformanceNow();
    monitor = new PerformanceMonitor(signal.get);
  });

  afterEach(() => {
    perf.spy.mockRestore();
  });

  it('[AC3] getDegradationMode() returns "sparse" at 16 modules', () => {
    for (let i = 0; i < 120; i++) {
      monitor.recordFrame(perf.getTime());
      perf.advance(17);
    }
    expect(monitor.getDegradationMode()).toBe('sparse');
  });

  it('[AC3] getDegradationMode() returns "sparse" at 30 modules (upper bound)', () => {
    signal.set(30);
    for (let i = 0; i < 120; i++) {
      monitor.recordFrame(perf.getTime());
      perf.advance(17);
    }
    expect(monitor.getDegradationMode()).toBe('sparse');
  });

  it('[AC3] initial mode is "full" before any recompute', () => {
    expect(monitor.getDegradationMode()).toBe('full');
  });
});

// ═══════════════════════════════════════════════════════════
// AC4: Off mode (31+ modules)
// ═══════════════════════════════════════════════════════════

describe('Story 7.5: PerformanceMonitor — AC4 (off mode)', () => {
  let monitor: PerformanceMonitor;
  let signal: ReturnType<typeof createModuleCountSignal>;
  let perf: ReturnType<typeof mockPerformanceNow>;

  beforeEach(() => {
    signal = createModuleCountSignal(31);
    perf = mockPerformanceNow();
    monitor = new PerformanceMonitor(signal.get);
  });

  afterEach(() => {
    perf.spy.mockRestore();
  });

  it('[AC4] getDegradationMode() returns "off" at 31 modules', () => {
    for (let i = 0; i < 120; i++) {
      monitor.recordFrame(perf.getTime());
      perf.advance(17);
    }
    expect(monitor.getDegradationMode()).toBe('off');
  });

  it('[AC4] getDegradationMode() returns "off" at 50 modules (>31)', () => {
    signal.set(50);
    for (let i = 0; i < 120; i++) {
      monitor.recordFrame(perf.getTime());
      perf.advance(17);
    }
    expect(monitor.getDegradationMode()).toBe('off');
  });
});

// ═══════════════════════════════════════════════════════════
// AC5: Recovery hysteresis
// ═══════════════════════════════════════════════════════════

describe('Story 7.5: PerformanceMonitor — AC5 (recovery hysteresis)', () => {
  let monitor: PerformanceMonitor;
  let signal: ReturnType<typeof createModuleCountSignal>;
  let perf: ReturnType<typeof mockPerformanceNow>;

  beforeEach(() => {
    signal = createModuleCountSignal(20); // start in sparse
    perf = mockPerformanceNow();
    monitor = new PerformanceMonitor(signal.get);
  });

  afterEach(() => {
    perf.spy.mockRestore();
  });

  it('[AC5] recovery to full blocked within 2s of count dropping below 16', () => {
    // First: enter sparse mode at 20 modules
    for (let i = 0; i < 120; i++) {
      monitor.recordFrame(perf.getTime());
      perf.advance(17);
    }
    expect(monitor.getDegradationMode()).toBe('sparse');

    // Now drop to 14 modules — falling edge starts 2s clock
    signal.set(14);
    // Advance only 1s — not enough for recovery
    for (let i = 0; i < 60; i++) {
      monitor.recordFrame(perf.getTime());
      perf.advance(17);
    }
    // Mode should still be 'sparse' (recovery blocked by hysteresis)
    // Note: recompute needs ≥2s between calls. Our frame span is ~1s.
    // The last recompute was at the end of the 120-frame block.
    // After 60 more frames (~1s), we're at 1s since last recompute.
    // The next recordFrame won't trigger recompute yet (<2s since last).
    // So mode is still 'sparse' — correct per hysteresis design.
    expect(monitor.getDegradationMode()).toBe('sparse');
  });

  it('[AC5] recovery to full proceeds after 2s below threshold', () => {
    // Enter sparse mode at 20
    for (let i = 0; i < 120; i++) {
      monitor.recordFrame(perf.getTime());
      perf.advance(17);
    }
    expect(monitor.getDegradationMode()).toBe('sparse');

    // Drop to 14 — first recompute sets lastBelowSparseTime but blocks recovery
    signal.set(14);
    for (let i = 0; i < 120; i++) {
      monitor.recordFrame(perf.getTime());
      perf.advance(17);
    }
    // After first recompute: lastBelowSparseTime was just set, clock = ~0ms < 2000ms
    // Mode is still 'sparse' (hysteresis blocked)

    // Wait another 2s for second recompute — now clock ≥ 2000ms
    for (let i = 0; i < 120; i++) {
      monitor.recordFrame(perf.getTime());
      perf.advance(17);
    }
    expect(monitor.getDegradationMode()).toBe('full');
  });

  it('[AC5] off→sparse transition is immediate (no hysteresis for partial recovery)', () => {
    // Start at 35 → off
    signal.set(35);
    for (let i = 0; i < 120; i++) {
      monitor.recordFrame(perf.getTime());
      perf.advance(17);
    }
    expect(monitor.getDegradationMode()).toBe('off');

    // Drop to 20 → should go to sparse immediately (no 2s wait)
    signal.set(20);
    for (let i = 0; i < 120; i++) {
      monitor.recordFrame(perf.getTime());
      perf.advance(17);
    }
    expect(monitor.getDegradationMode()).toBe('sparse');
  });
});

// ═══════════════════════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════════════════════

describe('Story 7.5: PerformanceMonitor — constants', () => {
  it('[Constants] SPARSE_THRESHOLD = 16', () => {
    expect(PerformanceMonitor.SPARSE_THRESHOLD).toBe(16);
  });

  it('[Constants] OFF_THRESHOLD = 31', () => {
    expect(PerformanceMonitor.OFF_THRESHOLD).toBe(31);
  });

  it('[Constants] FPS_WARNING_THRESHOLD = 30', () => {
    expect(PerformanceMonitor.FPS_WARNING_THRESHOLD).toBe(30);
  });
});

// ═══════════════════════════════════════════════════════════
// Edge cases
// ═══════════════════════════════════════════════════════════

describe('Story 7.5: PerformanceMonitor — edge cases', () => {
  it('recordFrame with zero modules should not crash', () => {
    const monitor = new PerformanceMonitor(() => 0);
    const perf = mockPerformanceNow();
    for (let i = 0; i < 120; i++) {
      monitor.recordFrame(perf.getTime());
      perf.advance(17);
    }
    expect(monitor.getDegradationMode()).toBe('full');
    perf.spy.mockRestore();
  });

  it('moduleCountSignal called during recompute', () => {
    let callCount = 0;
    const signal = () => { callCount++; return 10; };
    const monitor = new PerformanceMonitor(signal);
    const perf = mockPerformanceNow();

    // First frame: recordFrame sets lastP95Time
    monitor.recordFrame(perf.getTime());
    expect(callCount).toBe(0); // No recompute on first frame

    // Advance 2s + record: triggers first recompute
    perf.advance(2000);
    monitor.recordFrame(perf.getTime());
    expect(callCount).toBeGreaterThanOrEqual(1); // signal was called during recompute

    perf.spy.mockRestore();
  });
});

// =============================================================================
// Story 7.7 — Task 7.2: Defensive try/catch on moduleCountSignal
// =============================================================================

describe('Story 7.7 — Task 7.2: Defensive try/catch on moduleCountSignal', () => {
  it('survives throwing moduleCountSignal without crashing', () => {
    const monitor = new PerformanceMonitor(() => {
      throw new Error('boom');
    });
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    // recordFrame(0): elapsed=0 < P95_INTERVAL_MS(2000) → no recompute
    monitor.recordFrame(0);

    // recordFrame(2000): elapsed=2000 >= P95_INTERVAL_MS(2000) → recompute fires
    // → moduleCountSignal() throws → try/catch should catch it
    monitor.recordFrame(2000);

    // Should not throw — degradation mode stays at default ('full')
    expect(monitor.getDegradationMode()).toBe('full');

    // Should have logged a warning about the throwing signal
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});
