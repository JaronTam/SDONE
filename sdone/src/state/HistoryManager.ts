import type { GraphState } from './GraphState.js';

/**
 * Public contract for HistoryManager.
 *
 * Consumers in the mutation layer and keyboard-binding layer depend on this
 * interface, NOT on the concrete class. This enables test doubles without
 * mocking `structuredClone`.
 */
export interface IHistoryManager {
  /** Push a new state snapshot onto the undo stack. Clears the redo stack. */
  push(state: GraphState): void;
  /** Pop the most recent state from the undo stack and return it (deep clone). */
  undo(): GraphState | null;
  /** Pop the most recent state from the redo stack and return it (deep clone). */
  redo(): GraphState | null;
  /** Returns true when the undo stack has at least one entry. */
  canUndo(): boolean;
  /** Returns true when the redo stack has at least one entry. */
  canRedo(): boolean;
  /** Discard all history (both stacks). */
  clear(): void;
  /** Number of snapshots on the undo stack. */
  readonly undoDepth: number;
  /** Number of snapshots on the redo stack. */
  readonly redoDepth: number;
}

/**
 * Manages undo/redo via full-state `GraphState` snapshots (Memento pattern).
 *
 * ## Architecture (Decision 5)
 * Every `push()` deep-clones the incoming `GraphState` via `structuredClone`.
 * Both `undo()` and `redo()` return independent deep clones so callers can
 * freely mutate the returned value without corrupting history.
 *
 * ## Stack semantics
 * - `undoStack`: newest entry at the END of the array (`push` → append).
 * - `redoStack`: newest entry at the END of the array.
 * - `push()` clears the redo stack entirely (standard "new branch" behaviour).
 * - `maxDepth` (default 100) limits undo stack size by discarding the OLDEST
 *   entry (shift from front) when the limit is exceeded.
 *
 * ## Error handling
 * No method throws. `undo()` / `redo()` on empty stacks return `null`.
 * TypeScript enforces that `push()` only receives `GraphState`.
 */
export class HistoryManager implements IHistoryManager {
  private undoStack: GraphState[] = [];
  private redoStack: GraphState[] = [];
  private readonly maxDepth: number;

  /**
   * @param maxDepth Maximum number of undo snapshots to retain (default 100).
   */
  constructor(maxDepth = 100) {
    const sanitized = Math.max(1, Math.floor(maxDepth));
    this.maxDepth = Number.isFinite(sanitized) ? sanitized : 100;
  }

  // ---------------------------------------------------------------------------
  // Core mutations
  // ---------------------------------------------------------------------------

  /** @inheritdoc */
  push(state: GraphState): void {
    // 1. Deep-clone the incoming state so the stored snapshot is independent.
    let clone: GraphState;
    try {
      clone = structuredClone(state) as GraphState;
    } catch (err) {
      console.error('[HistoryManager] structuredClone failed during push:', err);
      return; // Graceful degradation: snapshot not saved, redo stack preserved
    }

    // 2. Append clone to undo stack.
    this.undoStack.push(clone);

    // 3. Clear redo stack — standard undo/redo "new branch" semantics.
    this.redoStack.length = 0;

    // 4. Enforce maxDepth: discard oldest entry if exceeded.
    while (this.undoStack.length > this.maxDepth) {
      this.undoStack.shift();
    }
  }

  /** @inheritdoc */
  undo(): GraphState | null {
    // Need at least 2 entries: one "current" and one "previous" to undo to.
    if (this.undoStack.length < 2) {
      return null;
    }

    // Pop the current (newest) state and move it to redo stack.
    const current = this.undoStack.pop()!;
    this.redoStack.push(current);

    // The previous state is now at the top of undoStack (peek, don't pop).
    const previous = this.undoStack[this.undoStack.length - 1];

    // Return an independent deep clone so callers can't corrupt history.
    try {
      return structuredClone(previous) as GraphState;
    } catch (err) {
      console.error('[HistoryManager] structuredClone failed during undo:', err);
      // Roll back: redoStack got a snapshot it shouldn't keep
      this.redoStack.pop();
      this.undoStack.push(current); // restore undo stack
      return null;
    }
  }

  /** @inheritdoc */
  redo(): GraphState | null {
    if (this.redoStack.length === 0) {
      return null;
    }

    // Pop the newest entry from redo stack.
    const snapshot = this.redoStack.pop()!;

    // Push it back onto undo stack.
    this.undoStack.push(snapshot);

    // Return an independent deep clone.
    try {
      return structuredClone(snapshot) as GraphState;
    } catch (err) {
      console.error('[HistoryManager] structuredClone failed during redo:', err);
      // Roll back: undoStack got a snapshot it shouldn't keep
      this.undoStack.pop();
      this.redoStack.push(snapshot); // restore redo stack
      return null;
    }
  }

  // ---------------------------------------------------------------------------
  // Query methods
  // ---------------------------------------------------------------------------

  /** @inheritdoc */
  canUndo(): boolean {
    // Need at least 2 entries for undo: current state + previous state.
    return this.undoStack.length > 1;
  }

  /** @inheritdoc */
  canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  /** @inheritdoc */
  clear(): void {
    this.undoStack.length = 0;
    this.redoStack.length = 0;
  }

  // ---------------------------------------------------------------------------
  // Readonly accessors
  // ---------------------------------------------------------------------------

  /** @inheritdoc */
  get undoDepth(): number {
    return this.undoStack.length;
  }

  /** @inheritdoc */
  get redoDepth(): number {
    return this.redoStack.length;
  }
}