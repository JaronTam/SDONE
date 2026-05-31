/**
 * Simulation configuration options.
 *
 * Only `dt` is implemented in Story 4.1 — the fixed integration timestep.
 * Additional fields (e.g., speed multiplier) are Story 4.2 concerns.
 */
export interface SimulationConfig {
  /** Fixed Euler integration timestep in seconds. Default: 1/60 (~16.67ms). */
  dt: number;
}

/**
 * Simulation lifecycle state (Architecture Decision 4 state machine).
 *
 * ```
 * IDLE ──[RUN]──▶ RUNNING ──[PAUSE]──▶ PAUSED ──[RUN]──▶ RUNNING
 *   ▲                │                     │
 *   └──[RESET]───────┴──────[RESET]────────┘
 * ```
 */
export type SimulationState = 'idle' | 'running' | 'paused';