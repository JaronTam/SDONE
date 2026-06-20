import type { GraphState, StockNode } from '../state/GraphState.js';
import type { SimulationState } from './types.js';
import type { FormulaEngine } from './formula/FormulaEngine.js';
import { FormulaParseError, FormulaEvalError } from './formula/errors.js';

/**
 * Core Euler integration engine with state machine.
 *
 * Mutates `GraphState` in-place per Architecture Decision 1 — the simulation
 * kernel operates on the live state object for performance.  The snapshot
 * bridge (Story 4.3) handles `structuredClone` for UI consumption.
 *
 * ## State machine (Architecture Decision 4)
 *
 * ```
 * IDLE ──[RUN]──▶ RUNNING ──[PAUSE]──▶ PAUSED ──[RUN]──▶ RUNNING
 *   ▲                │                     │
 *   └──[RESET]───────┴──────[RESET]────────┘
 * ```
 *
 * ## Tick scheduling
 *
 * Independent `setInterval` at 100ms (10Hz), decoupled from the rendering
 * rAF loop.  Each interval runs 6 Euler sub-steps at dt=1/60 to achieve
 * 1× real-time speed (6 × 1/60 = 0.1s per 100ms interval).
 */
export class SimulationEngine {
  /** Simulated time in seconds. Advanced by `dt` on each tick. */
  t = 0;

  /** Lifecycle state — drives the RUN/PAUSE/RESET state machine. */
  state: SimulationState = 'idle';

  /**
   * Callback fired after each simulation interval (100ms / 10Hz).
   *
   * Receives the live mutable `GraphState` reference.  Story 4.3 wires this
   * to produce `structuredClone` snapshots for UI consumption.
   */
  onTick: ((state: GraphState) => void) | null = null;

  /**
   * Formula engine for evaluating `Connection.formulaStr` at each tick.
   *
   * When set, every tick evaluates all connection formulas and writes the
   * result into `conn.rate` before `computeNetFlow` runs.  When `null`
   * (backward-compatible), `conn.rate` is used as-is.
   *
   * Set by `main.ts` during initialization (Story 4.4).
   */
  formulaEngine: FormulaEngine | null = null;

  // ---------------------------------------------------------------------------
  // Private interval state
  // ---------------------------------------------------------------------------

  /** `setInterval` handle for the 100ms tick loop. `null` when not running. */
  private _intervalId: ReturnType<typeof setInterval> | null = null;

  /** Reference to the live mutable `GraphState` being driven by the loop. */
  private _stateProvider: (() => GraphState) | null = null;

  /** `visibilitychange` handler reference for cleanup (Story 6.1). */
  private _visibilityHandler: (() => void) | null = null;

  /** Timestamp when tab was last hidden (0 = never hidden yet). */
  private _lastVisibilityChange: number = 0;

  /**
   * Number of Euler sub-steps per 100ms interval.
   *
   * 6 × dt=1/60 = 0.1s simulated time per interval → 1× real-time speed.
   * Story 6.1 (speed multiplier) will make this configurable.
   */
  private static readonly SUB_STEPS_PER_INTERVAL = 6;

  // ---------------------------------------------------------------------------
  // Net flow calculation
  // ---------------------------------------------------------------------------

  /**
   * Sum incoming connection rates minus outgoing connection rates for a stock.
   *
   * - `conn.toId === stockId` → flow INTO this stock (inflow).
   * - `conn.fromId === stockId` → flow OUT of this stock (outflow).
   *
   * Self-loop connections (`fromId === toId`) cancel algebraically:
   * the same rate is added to both inflow and outflow, yielding net = 0.
   *
   * Story 7.1: Feedback connections (`isFeedback === true`) are SKIPPED —
   * they carry multiplier values, not material flow. Without this skip,
   * the feedback multiplier would be erroneously added to the stock's
   * outflow, breaking the asymptotic approach to capacity (AC2).
   *
   * Time complexity: O(C) where C = number of connections.
   */
  private computeNetFlow(state: GraphState, stockId: string): number {
    let inflow = 0;
    let outflow = 0;

    for (const conn of Object.values(state.connections)) {
      // Story 7.1: Skip feedback connections — they are information flow, not material flow
      if (conn.isFeedback) continue;

      if (conn.toId === stockId) {
        inflow += conn.rate;
      }
      if (conn.fromId === stockId) {
        outflow += conn.rate;
      }
    }

    return inflow - outflow;
  }

  // ---------------------------------------------------------------------------
  // Euler tick
  // ---------------------------------------------------------------------------

  /**
   * Perform one Euler integration step.
   *
   * **Story 4.4:** If `formulaEngine` is set, evaluates all connection formulas
   * into `conn.rate` before `computeNetFlow` runs.  Formula evaluation errors
   * are caught and logged — the affected connection falls back to rate = 0.
   *
   * Iterates all nodes; skips non-stock nodes (source, sink have no `value`).
   * For each stock: `value += computeNetFlow(state, stockId) * dt`.
   *
   * `state.version` is incremented ONCE per tick (not per stock).
   * `this.t` advances by `dt`.
   *
   * ## Tick step invariants (Story 7.3 — deferred from 7.1)
   *
   * The tick is divided into four ordered steps. Each step makes a
   * specific contract that downstream code (including UI) relies on:
   *
   *   1. **Non-feedback formula eval** → writes `conn.rate` for every
   *      non-feedback connection (or 0 on parse/eval error).
   *   2. **Feedback formula eval** → writes `conn.rate` for every
   *      feedback connection, with stock state variables (`value`,
   *      `capacity`, `stock_value`) injected from the source-end stock.
   *   3. **Feedback multiplier application** → scales the matching
   *      source→stock inflow `conn.rate` by the feedback multiplier.
   *      MUST come AFTER step 1 (otherwise the base rate would be
   *      overwritten by a fresh formula eval) and AFTER step 2 (so
   *      the multiplier value is up to date).
   *   4. **Euler integration** → consumes finalised `conn.rate` values
   *      via `computeNetFlow` (which itself skips `isFeedback`).
   *
   * Re-ordering these steps will silently break feedback loops:
   * AC2/AC3 of Story 7.1 depend on this exact sequencing.
   *
   * @param state  The live `GraphState` to mutate in-place.
   * @param dt     Integration timestep in seconds. Default: 1/60.
   */
  tick(state: GraphState, dt: number = 1 / 60): void {
    if (this.formulaEngine) {
      // ── Step 1: Evaluate non-feedback formula strings → conn.rate ────
      // Skip feedback connections — they are evaluated separately in step 2
      // with stock state variables injected.
      for (const conn of Object.values(state.connections)) {
        if (conn.isFeedback) continue;
        try {
          conn.rate = this.formulaEngine.evaluate(conn.formulaStr, this.t);
        } catch (e) {
          if (e instanceof FormulaParseError || e instanceof FormulaEvalError) {
            console.warn(`[FormulaEngine] ${e.name} for connection ${conn.id}: ${e.message}`);
            conn.rate = 0; // AC5: graceful fallback
          } else {
            throw e;
          }
        }
      }

      // ── Step 2: Evaluate feedback formulas with stock state variables ──
      // For each feedback connection (fromId=stock, toId=source):
      //   - Use FormulaEngine.evaluateForConnection which injects
      //     { value, capacity, stock_value } from the stock node
      //   - Store the multiplier in feedbackConn.rate
      for (const conn of Object.values(state.connections)) {
        if (!conn.isFeedback) continue;
        try {
          conn.rate = this.formulaEngine.evaluateForConnection(conn, state, this.t);
        } catch (e) {
          if (e instanceof FormulaParseError || e instanceof FormulaEvalError) {
            console.warn(
              `[FormulaEngine] Feedback ${e.name} for connection ${conn.id}: ${e.message}`,
            );
            conn.rate = 0;
          } else {
            throw e;
          }
        }
      }

      // ── Step 3: Apply feedback multipliers to target inflow connections ──
      // For each feedback conn (fromId=stock, toId=source):
      //   Find connections where fromId=source AND toId=stock
      //   Multiply their rate by the feedback multiplier
      for (const feedbackConn of Object.values(state.connections)) {
        if (!feedbackConn.isFeedback) continue;
        const multiplier = feedbackConn.rate;
        // Find the source→stock inflow connection(s) that this feedback modulates
        for (const targetConn of Object.values(state.connections)) {
          if (targetConn.isFeedback) continue;
          if (targetConn.fromId === feedbackConn.toId && targetConn.toId === feedbackConn.fromId) {
            targetConn.rate *= multiplier;
          }
        }
      }
    }

    // ── Step 4: Euler integration (computeNetFlow skips isFeedback) ────
    for (const node of Object.values(state.nodes)) {
      if (node.type !== 'stock') continue;
      const stock = node as StockNode;
      const netFlow = this.computeNetFlow(state, stock.id);
      stock.value += netFlow * dt;
    }
    state.version++;
    this.t += dt;
  }

  // ---------------------------------------------------------------------------
  // State machine — start / pause / reset
  // ---------------------------------------------------------------------------

  /**
   * Start the simulation loop.
   *
   * Transitions IDLE → RUNNING or PAUSED → RUNNING.
   * No-op if already RUNNING (AC4: prevents double-setInterval).
   *
   * Starts a `setInterval` at 100ms.  Each interval:
   * 1. Runs `SUB_STEPS_PER_INTERVAL` Euler sub-steps (dt=1/60)
   * 2. Fires `this.onTick(state)` — snapshot-bridge callback slot
   *
   * @param state  The live mutable `GraphState` to tick.  The engine holds
   *               a reference (no clone) — mutations happen in-place.
   */
  /**
   * Start the simulation loop.
   *
   * Transitions IDLE → RUNNING or PAUSED → RUNNING.
   * No-op if already RUNNING (AC4: prevents double-setInterval).
   *
   * Starts a `setInterval` at 100ms.  Each interval:
   * 1. Resolves the latest state via `stateProvider()` — always ticks the
   *    current application state, even after spread replacements in main.ts
   * 2. Runs `SUB_STEPS_PER_INTERVAL` Euler sub-steps (dt=1/60)
   * 3. Fires `this.onTick(state)` — snapshot-bridge callback slot
   *
   * @param stateProvider  Callback returning the current live `GraphState`.
   *   The engine calls this on every interval (not just once), ensuring it
   *   never ticks a stale object reference when `main.ts` reassigns
   *   `currentState` during user interactions (move/delete/undo/redo).
   */
  start(stateProvider: () => GraphState): void {
    if (this.state === 'running') return; // AC4: double-RUN no-op

    this.state = 'running';
    this._stateProvider = stateProvider;

    this._intervalId = setInterval(() => {
      // Guard: TypeScript can't narrow `_stateProvider` across the async
      // setInterval boundary, but at runtime it is always set here because
      // `start()` set it before spinning up the interval.
      const provider = this._stateProvider!;
      const state = provider();
      for (let i = 0; i < SimulationEngine.SUB_STEPS_PER_INTERVAL; i++) {
        this.tick(state, 1 / 60);
      }
      this.onTick?.(state); // Story 4.3 snapshot slot
    }, 100);

    // Story 6.1: Tab background throttling mitigation
    // When the browser tab is backgrounded, setInterval is throttled to ≤1Hz.
    // On return to foreground, advance simulated time proportionally (capped at 5s).
    this._visibilityHandler = () => {
      if (document.hidden) {
        this._lastVisibilityChange = performance.now();
      } else {
        if (this._lastVisibilityChange === 0) return; // guard: never hidden
        const elapsed = (performance.now() - this._lastVisibilityChange) / 1000;
        // Cap at 5 seconds to prevent extreme jumps
        const cappedElapsed = Math.min(elapsed, 5);
        // Advance simulated time without running Euler steps
        this.t += cappedElapsed;
        this._lastVisibilityChange = 0; // reset for next cycle
      }
    };
    document.addEventListener('visibilitychange', this._visibilityHandler);
  }

  /**
   * Pause the simulation loop.
   *
   * Transitions RUNNING → PAUSED.
   * No-op if not RUNNING (AC5: prevents double-clearInterval).
   *
   * Clears the `setInterval`.  The canvas rAF loop continues rendering the
   * static scene.  `this.t` is preserved — resume via `start()` continues
   * from the same simulated time.
   */
  pause(): void {
    if (this.state !== 'running') return; // AC5: double-PAUSE no-op

    // Story 6.1: Remove visibility handler when pausing
    if (this._visibilityHandler) {
      document.removeEventListener('visibilitychange', this._visibilityHandler);
      this._visibilityHandler = null;
    }

    if (this._intervalId !== null) {
      clearInterval(this._intervalId);
      this._intervalId = null;
    }
    this.state = 'paused';
  }

  /**
   * Reset the simulation to its initial state.
   *
   * Transitions any state → IDLE.
   * Stops the interval (if running), resets the internal clock, and clears
   * the state reference.
   *
   * **Does NOT modify `GraphState`.**  State restoration (stock values →
   * `initialValue`, history clearance) is handled by the `RESET` event
   * handler wired in `main.ts`.
   */
  reset(): void {
    this.pause(); // Stop interval if running (no-op if not running)
    this.t = 0;
    this.state = 'idle';
    this._stateProvider = null;
    this._lastVisibilityChange = 0; // Story 6.1: clear visibility state
    this.formulaEngine?.clearCache(); // Story 4.4 P2: clear AST + poison caches on reset
  }
}
