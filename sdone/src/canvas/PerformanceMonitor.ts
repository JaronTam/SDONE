/**
 * Runtime performance monitor that tracks frame rate (P95 over 10s window),
 * monitors module count, and exposes particle degradation mode.
 *
 * Per Architecture Decision 6, uses DI pattern: constructor receives
 * `moduleCountSignal: () => number` — wired at composition root (main.ts).
 *
 * NFR-P1: ≥30fps P95 at ≤15 modules
 * NFR-P7: Auto-degrade particles at 16+ / 31+ module thresholds
 *
 * ## Degradation mode state machine
 *
 * ```
 * full ──[count ≥ 16]──▶ sparse ──[count ≥ 31]──▶ off
 *   ◀──[count < 16 2s]──        ◀──[count < 31]──
 * ```
 *
 * - Entering degradation (full→sparse, sparse→off) is immediate
 * - Exiting degradation to full requires 2s hysteresis (AC5)
 * - Exiting off→sparse is immediate (partial recovery)
 */
export class PerformanceMonitor {
  /** Frame timestamps (ms) in rolling 10-second window. */
  private frameTimestamps: number[] = [];

  /** Current degradation mode, computed every ~2 seconds. */
  private degradationMode: 'full' | 'sparse' | 'off' = 'full';

  /** Timestamp of the last P95 computation. */
  private lastP95Time = 0;

  /** Interval between P95 computations (ms). */
  private static readonly P95_INTERVAL_MS = 2000;

  /** Rolling window duration (ms). */
  private static readonly WINDOW_MS = 10_000;

  /** Module count threshold for sparse mode. */
  static readonly SPARSE_THRESHOLD = 16;

  /** Module count threshold for off mode. */
  static readonly OFF_THRESHOLD = 31;

  /** FPS threshold for console warning at ≤15 modules. */
  static readonly FPS_WARNING_THRESHOLD = 30;

  /**
   * Hysteresis: degradation exits to full only after count stays
   * below SPARSE_THRESHOLD for this many milliseconds (AC5).
   */
  private static readonly RECOVERY_DELAY_MS = 2000;

  /**
   * Timestamp when count first dropped below SPARSE_THRESHOLD.
   * Zero = count is at or above threshold (clock not running).
   * Non-zero = count dropped below threshold at this time; used for 2s hysteresis.
   * This is a falling-edge detector — the clock starts at the first recompute
   * where count < 16 and resets if count rises back to ≥ 16.
   */
  private lastBelowSparseTime = 0;

  constructor(private moduleCountSignal: () => number) {}

  /**
   * Called every rAF frame by SceneRenderer.tick().
   * Records the frame timestamp and periodically recomputes P95.
   *
   * Per-frame overhead: one array push + conditional check (AC6 constraint).
   */
  recordFrame(now: number): void {
    // Hidden-tab guard: when the tab is not visible, the browser throttles rAF
    // to ~1Hz instead of stopping it. Those throttled callbacks are not real
    // render frames — pushing them into the buffer would pollute the P95 window
    // with ~1000ms intervals and trigger spurious NFR-P1 warnings every ~2s.
    // Pause both sampling and recompute while hidden.
    if (document.hidden) return;
    // Resume-gap guard: the hidden-tab guard above blocks hidden frames from
    // being pushed, but the *delta* between the last pre-hide frame and the
    // first post-hide frame still spans the full hide duration. When the hide
    // is < 10s, cutoff pruning does NOT remove the pre-hidden frames, so that
    // gap delta survives in the window; for a small surviving buffer it lands
    // at/below the P95 index and fires the very warning the guard meant to kill
    // (deferred from "刷屏 while hidden" to "一次性误报 on resume"). Drop the
    // stale window on any visible-frame gap > 1s. The 1000ms threshold sits
    // above the 16–35ms frame intervals and below the 2s recompute interval, so
    // no legitimate render sequence trips it; it also covers debugger pauses,
    // GC stalls, and lid-close gaps as defense in depth.
    const last = this.frameTimestamps[this.frameTimestamps.length - 1];
    if (last !== undefined && now - last > 1000) {
      this.frameTimestamps = [];
    }
    this.frameTimestamps.push(now);

    // Prune timestamps older than 10s
    const cutoff = now - PerformanceMonitor.WINDOW_MS;
    while (this.frameTimestamps.length > 0 && this.frameTimestamps[0] < cutoff) {
      // Perf note (Story 7.7 D1): shift() is O(n) but the buffer is small
      // (~600 entries for 10s at 60fps). V8's shift on arrays < ~1000 elements
      // completes in <1μs. No measurable impact on frame budget.
      // If future profiling shows this in hot path, switch to ring buffer.
      this.frameTimestamps.shift();
    }

    // Periodically recompute degradation mode (every ~2s, not every frame)
    if (now - this.lastP95Time >= PerformanceMonitor.P95_INTERVAL_MS) {
      this.lastP95Time = now;
      this.recomputeDegradation();
    }
  }

  /** Current degradation mode for ParticleEngine/SceneRenderer to read. */
  getDegradationMode(): 'full' | 'sparse' | 'off' {
    return this.degradationMode;
  }

  /**
   * Recompute degradation mode based on module count and P95 FPS.
   * Called every ~2s from recordFrame().
   */
  private recomputeDegradation(): void {
    let count = 0;
    try {
      count = this.moduleCountSignal();
    } catch (e) {
      console.warn('PerformanceMonitor: moduleCountSignal() threw — defaulting to 0', e);
      count = 0;
    }
    const now = performance.now();

    // ── Hysteresis clock: falling-edge detector ──
    // Start the 2s clock when count first drops below sparse threshold.
    // Reset the clock if count rises back above threshold.
    if (count < PerformanceMonitor.SPARSE_THRESHOLD) {
      if (this.lastBelowSparseTime === 0) {
        this.lastBelowSparseTime = now; // Falling edge: start the 2s clock
      }
    } else {
      this.lastBelowSparseTime = 0; // Back above threshold: reset clock
    }

    // Compute P95 frame time from rolling window
    const p95Fps = this.computeP95Fps();

    // AC2: Console warning when P95 < 30fps at ≤15 modules (NFR-P1)
    if (count <= 15 && p95Fps < PerformanceMonitor.FPS_WARNING_THRESHOLD) {
      console.warn(`⚠️ P95 FPS below 30 — check render pipeline (P95: ${p95Fps.toFixed(1)} fps)`);
    }

    // Determine target degradation mode
    let targetMode: 'full' | 'sparse' | 'off';
    if (count >= PerformanceMonitor.OFF_THRESHOLD) {
      targetMode = 'off'; // AC4: 31+ modules → particles disabled
    } else if (count >= PerformanceMonitor.SPARSE_THRESHOLD) {
      targetMode = 'sparse'; // AC3: 16-30 modules → every other particle skipped
    } else {
      targetMode = 'full'; // ≤15 modules → full rendering
    }

    // Apply hysteresis: only exit degraded mode to full after count stays
    // below SPARSE_THRESHOLD for RECOVERY_DELAY_MS (AC5).
    // Note: off→sparse transition is immediate (hysteresis only gates →full).
    if (targetMode === 'full' && this.degradationMode !== 'full') {
      if (this.lastBelowSparseTime === 0) return; // Safety: shouldn't happen
      const timeBelow = now - this.lastBelowSparseTime;
      if (timeBelow < PerformanceMonitor.RECOVERY_DELAY_MS) {
        return; // Still in recovery period — keep current degradation
      }
    }

    this.degradationMode = targetMode;
  }

  /**
   * Compute P95 FPS from the rolling frame timestamp buffer.
   *
   * Algorithm:
   * 1. Compute inter-frame deltas (ms) from consecutive timestamps
   * 2. Sort deltas ascending
   * 3. Take P95 index = floor(n * 0.95)
   * 4. P95 frame time (ms) → FPS = 1000 / frameTimeMs
   *
   * Returns 60 fps as default when buffer has < 2 samples.
   */
  private computeP95Fps(): number {
    if (this.frameTimestamps.length < 2) return 60;

    const deltas: number[] = [];
    for (let i = 1; i < this.frameTimestamps.length; i++) {
      deltas.push(this.frameTimestamps[i] - this.frameTimestamps[i - 1]);
    }

    deltas.sort((a, b) => a - b);

    const p95Index = Math.floor(deltas.length * 0.95);
    const p95FrameTimeMs = deltas[Math.min(p95Index, deltas.length - 1)];

    return 1000 / p95FrameTimeMs;
  }
}
