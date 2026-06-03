import type { Vec2 } from '../shared/Vec2.js';
import type { ModuleType, GraphState } from '../state/GraphState.js';

/**
 * Typed event contract for SDONE.
 *
 * Every event name is a key, and its value is the payload type passed to handlers.
 * Use `EventBus` to emit/listen with full compile-time type safety.
 */
export interface EventMap {
  // ── UI → Canvas: User Interaction ──────────────────────────
  MODULE_PLACED: { type: ModuleType; position: Vec2 };
  DRAG_START: { moduleId: string; position: Vec2 };
  DRAG_END: { moduleId: string; fromPosition: Vec2; toPosition: Vec2 };
  CONNECTION_DELETED: { connectionId: string };

  // ── UI → Canvas: Control Commands ──────────────────────────
  RUN: undefined;
  PAUSE: undefined;
  RESET: undefined;
  SPEED_CHANGE: { multiplier: number };

  // ── Canvas → UI: Simulation Updates ────────────────────────
  SNAPSHOT_EMITTED: { state: GraphState };
  COUNTDOWN_TICK: { stockId: string; remainingSeconds: number };
  COUNTDOWN_ZERO: { stockId: string; direction: 'to-capacity' | 'to-zero' };

  // ── Canvas → UI: Selection State ───────────────────────────
  MODULE_SELECTED: { moduleId: string | null };
  MODULE_DELETED: { moduleId: string };
  HOVER_CHANGED: { moduleId: string | null; connectionId: string | null; screenPos: { x: number; y: number } | null };

  // ── Canvas → UI: Achievements ──────────────────────────────
  ACHIEVEMENT_UNLOCKED: { achievementId: string; message: string };

  // ── Canvas: Module Drag-Move ────────────────────────────────
  MODULE_MOVED: { type: string; moduleId: string; from: Vec2; to: Vec2 };

  // ── Canvas: Connections ────────────────────────────────────
  CONNECTION_CREATED: { connectionId: string; fromId: string; toId: string; rate: number };

  // ── Canvas: Undo/Redo ───────────────────────────────────────
  UNDO: { fromState: GraphState; toState: GraphState };
  REDO: { fromState: GraphState; toState: GraphState };
}
