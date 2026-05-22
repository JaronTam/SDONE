import { describe, it, expect, beforeEach } from 'vitest';
import { HistoryManager } from './HistoryManager.js';
import type { GraphState, StockNode, SourceNode, Connection } from './GraphState.js';

/**
 * Factory helper to create a minimal valid GraphState for testing.
 * Each call creates a fresh object with no shared references.
 */
function makeGraphState(overrides: Partial<GraphState> = {}): GraphState {
  const stock: StockNode = {
    id: 'stock-1',
    type: 'stock',
    position: { x: 0, y: 0 },
    value: 100,
    capacity: 200,
    initialValue: 100,
    label: 'Test Stock',
  };

  const source: SourceNode = {
    id: 'source-1',
    type: 'source',
    position: { x: -100, y: 0 },
    color: '#90EE90',
    label: 'Test Source',
  };

  const connection: Connection = {
    id: 'conn-1',
    fromId: 'source-1',
    toId: 'stock-1',
    rate: 5,
    formulaStr: '5',
  };

  return {
    nodes: {
      'stock-1': { ...stock },
      'source-1': { ...source },
    },
    connections: {
      'conn-1': { ...connection },
    },
    version: 1,
    selectedModuleIds: [],
    ...overrides,
  };
}

describe('HistoryManager', () => {
  let hm: HistoryManager;

  beforeEach(() => {
    hm = new HistoryManager();
  });

  // =========================================================================
  // AC1: Push snapshot onto undo stack
  // =========================================================================
  describe('push()', () => {
    it('pushes a deep clone onto the undo stack and increases undoDepth', () => {
      const state = makeGraphState();
      hm.push(state);

      expect(hm.undoDepth).toBe(1);
      // canUndo is false with only 1 entry (need current + previous for undo)
      expect(hm.canUndo()).toBe(false);
    });

    it('canUndo becomes true after 2 pushes (current + previous)', () => {
      hm.push(makeGraphState({ version: 1 }));
      expect(hm.canUndo()).toBe(false);
      hm.push(makeGraphState({ version: 2 }));
      expect(hm.canUndo()).toBe(true);
    });

    it('clears the redo stack when pushing a new state', () => {
      const state1 = makeGraphState({ version: 1 });
      const state2 = makeGraphState({ version: 2 });
      const state3 = makeGraphState({ version: 3 });

      hm.push(state1);
      hm.push(state2);
      const undone = hm.undo(); // undo v2 → returns v1, redoStack: [v2]
      expect(undone).not.toBeNull();
      expect(hm.redoDepth).toBe(1);

      // Push a new state — redo stack must be cleared
      hm.push(state3);
      expect(hm.redoDepth).toBe(0);
      expect(hm.canRedo()).toBe(false);
    });

    it('does not mutate the stored snapshot when the original is mutated', () => {
      const state = makeGraphState({ version: 1 });
      hm.push(state);
      hm.push(makeGraphState({ version: 2 })); // need 2 for undo

      // Mutate the original v1
      state.version = 999;
      (state.nodes['stock-1'] as StockNode).value = 9999;

      // Undo to get previous state — should be v1 untouched
      const restored = hm.undo();
      expect(restored).not.toBeNull();
      expect(restored!.version).toBe(1);
      expect((restored!.nodes['stock-1'] as StockNode).value).toBe(100);
    });
  });

  // =========================================================================
  // AC2: Undo restores previous state
  // =========================================================================
  describe('undo()', () => {
    it('returns the previous state (deep clone) and moves current to redo stack', () => {
      const state1 = makeGraphState({ version: 1 });
      const state2 = makeGraphState({ version: 2 });

      hm.push(state1);
      hm.push(state2);

      expect(hm.undoDepth).toBe(2);
      expect(hm.canUndo()).toBe(true);

      const undone = hm.undo();
      expect(undone).not.toBeNull();
      // undo returns the PREVIOUS state (v1), not the current (v2)
      expect(undone!.version).toBe(1);

      // Verify v2 moved to redo stack
      expect(hm.redoDepth).toBe(1);
      expect(hm.undoDepth).toBe(1);
    });

    it('returns a deep clone — mutating the returned value does NOT affect history', () => {
      hm.push(makeGraphState({ version: 1 }));
      hm.push(makeGraphState({ version: 2 }));
      const undone = hm.undo(); // returns v1
      expect(undone).not.toBeNull();

      // Mutate the returned clone
      undone!.version = 999;
      (undone!.nodes['stock-1'] as StockNode).value = 9999;

      // Redo to get the current state back — should be v2, not mutated
      const redone = hm.redo();
      expect(redone).not.toBeNull();
      expect(redone!.version).toBe(2);
      expect((redone!.nodes['stock-1'] as StockNode).value).toBe(100);
    });

    it('maintains canUndo/canRedo correctly through lifecycle', () => {
      expect(hm.canUndo()).toBe(false);
      expect(hm.canRedo()).toBe(false);

      // 1 push: not enough for undo
      hm.push(makeGraphState({ version: 1 }));
      expect(hm.canUndo()).toBe(false);
      expect(hm.canRedo()).toBe(false);

      // 2 pushes: can undo now
      hm.push(makeGraphState({ version: 2 }));
      expect(hm.canUndo()).toBe(true);
      expect(hm.canRedo()).toBe(false);

      // Undo: pops v2 → redo, returns v1
      hm.undo();
      expect(hm.canUndo()).toBe(false); // only 1 left (v1)
      expect(hm.canRedo()).toBe(true);

      hm.redo();
      expect(hm.canUndo()).toBe(true); // v1 + v2 back
      expect(hm.canRedo()).toBe(false);
    });
  });

  // =========================================================================
  // AC3: Redo restores undone state
  // =========================================================================
  describe('redo()', () => {
    it('returns the redone state (deep clone) and moves it back to undo stack', () => {
      const state1 = makeGraphState({ version: 1 });
      const state2 = makeGraphState({ version: 2 });

      hm.push(state1);
      hm.push(state2);
      hm.undo(); // undo v2 → returns v1, redoStack: [v2]

      expect(hm.redoDepth).toBe(1);

      const redone = hm.redo();
      expect(redone).not.toBeNull();
      // redo returns v2 (the current state that was undone)
      expect(redone!.version).toBe(2);

      expect(hm.redoDepth).toBe(0);
      expect(hm.undoDepth).toBe(2);
    });
  });

  // =========================================================================
  // AC4: Undo on empty stack is no-op
  // =========================================================================
  describe('undo on empty stack', () => {
    it('returns null when undo stack is empty', () => {
      expect(hm.undo()).toBeNull();
      expect(hm.canUndo()).toBe(false);
    });

    it('returns null when only 1 entry (no previous state to return)', () => {
      hm.push(makeGraphState({ version: 1 }));
      expect(hm.undoDepth).toBe(1);
      // Only 1 entry — no previous state to undo to
      expect(hm.undo()).toBeNull();
      expect(hm.canUndo()).toBe(false);
    });

    it('returns null after all history is undone', () => {
      hm.push(makeGraphState({ version: 1 }));
      hm.push(makeGraphState({ version: 2 }));
      hm.undo(); // first undo succeeds, returns v1
      const secondUndo = hm.undo(); // only v1 left — no previous
      expect(secondUndo).toBeNull();
    });
  });

  // =========================================================================
  // AC5: Redo on empty stack is no-op
  // =========================================================================
  describe('redo on empty stack', () => {
    it('returns null when redo stack is empty', () => {
      expect(hm.redo()).toBeNull();
      expect(hm.canRedo()).toBe(false);
    });

    it('returns null after all redos are consumed', () => {
      hm.push(makeGraphState({ version: 1 }));
      hm.push(makeGraphState({ version: 2 }));
      hm.undo(); // undo v2 → redo: [v2]
      hm.redo(); // consumes the only redo entry
      const secondRedo = hm.redo();
      expect(secondRedo).toBeNull();
    });
  });

  // =========================================================================
  // AC6: Push after undo clears redo stack (new branch)
  // =========================================================================
  describe('push after undo clears redo stack', () => {
    it('clears redo stack entirely on new push', () => {
      hm.push(makeGraphState({ version: 1 }));
      hm.push(makeGraphState({ version: 2 }));
      hm.push(makeGraphState({ version: 3 }));

      // Undo twice: undo v3→returns v2, undo v2→returns v1, redo: [v3, v2]
      hm.undo();
      hm.undo();
      expect(hm.redoDepth).toBe(2);
      expect(hm.undoDepth).toBe(1);

      // Push new state — redo must be cleared
      hm.push(makeGraphState({ version: 4 }));
      expect(hm.redoDepth).toBe(0);
      expect(hm.canRedo()).toBe(false);
      expect(hm.undoDepth).toBe(2);
    });
  });

  // =========================================================================
  // AC7: Clear resets all history
  // =========================================================================
  describe('clear()', () => {
    it('empties both undo and redo stacks', () => {
      hm.push(makeGraphState({ version: 1 }));
      hm.push(makeGraphState({ version: 2 }));
      hm.undo(); // redo now has one entry

      expect(hm.undoDepth).toBe(1);
      expect(hm.redoDepth).toBe(1);

      hm.clear();

      expect(hm.undoDepth).toBe(0);
      expect(hm.redoDepth).toBe(0);
      expect(hm.canUndo()).toBe(false);
      expect(hm.canRedo()).toBe(false);
    });

    it('is safe to call clear on empty history', () => {
      expect(() => hm.clear()).not.toThrow();
      expect(hm.undoDepth).toBe(0);
      expect(hm.redoDepth).toBe(0);
    });
  });

  // =========================================================================
  // AC8: Undo depth limit (configurable, default 100)
  // =========================================================================
  describe('maxDepth', () => {
    it('defaults to 100', () => {
      // Push 100 states — should all be stored
      for (let i = 0; i < 100; i++) {
        hm.push(makeGraphState({ version: i }));
      }
      expect(hm.undoDepth).toBe(100);
    });

    it('discards oldest entry when exceeding maxDepth', () => {
      for (let i = 0; i < 101; i++) {
        hm.push(makeGraphState({ version: i }));
      }
      // Depth should be capped at 100
      expect(hm.undoDepth).toBe(100);

      // The oldest entry (version 0) should be discarded.
      // Undo all the way back — each undo pops current and returns previous.
      // With 100 entries [v1...v100], can undo 99 times (need 2 for each undo).
      for (let i = 0; i < 99; i++) {
        const state = hm.undo();
        expect(state).not.toBeNull();
      }
      // 100th undo should be null (only 1 entry left)
      expect(hm.undo()).toBeNull();
    });

    it('accepts a custom maxDepth', () => {
      const smallHm = new HistoryManager(5);
      for (let i = 0; i < 10; i++) {
        smallHm.push(makeGraphState({ version: i }));
      }
      expect(smallHm.undoDepth).toBe(5);
    });
  });

  // =========================================================================
  // AC9: Snapshots are deep clones — mutations don't affect history
  // (in addition to the specific tests in push/undo sections)
  // =========================================================================
  describe('deep clone safety', () => {
    it('stores independent copies — structuredClone is used', () => {
      const state = makeGraphState({ version: 1 });
      hm.push(state);
      hm.push(makeGraphState({ version: 2 })); // need 2 for undo

      // Mutate original state deeply
      state.version = 42;
      state.nodes = {};
      state.connections = {};
      state.selectedModuleIds = ['hacked'];

      const restored = hm.undo();
      expect(restored).not.toBeNull();
      expect(restored!.version).toBe(1);
      expect(Object.keys(restored!.nodes)).toHaveLength(2);
      expect(Object.keys(restored!.connections)).toHaveLength(1);
      expect(restored!.selectedModuleIds).toEqual([]);
    });

    it('undo returns a clone that can be mutated without side effects', () => {
      hm.push(makeGraphState({ version: 1 }));
      hm.push(makeGraphState({ version: 2 }));

      const undone = hm.undo()!; // returns v1
      // Mutate the returned clone
      undone.version = 999;
      (undone.nodes['stock-1'] as StockNode).value = 0;

      // Redo should return the current state v2, unmodified
      const redone = hm.redo()!;
      expect(redone.version).toBe(2);
      expect((redone.nodes['stock-1'] as StockNode).value).toBe(100);
    });
  });

  // =========================================================================
  // Edge cases
  // =========================================================================
  describe('edge cases', () => {
    it('undoDepth and redoDepth are readonly accessors', () => {
      expect(hm.undoDepth).toBe(0);
      expect(hm.redoDepth).toBe(0);

      // TypeScript would prevent assignment at compile time,
      // but verify at runtime that they behave as getters.
      const descUndo = Object.getOwnPropertyDescriptor(
        Object.getPrototypeOf(hm),
        'undoDepth',
      );
      const descRedo = Object.getOwnPropertyDescriptor(
        Object.getPrototypeOf(hm),
        'redoDepth',
      );
      expect(descUndo?.get).toBeDefined();
      expect(descUndo?.set).toBeUndefined();
      expect(descRedo?.get).toBeDefined();
      expect(descRedo?.set).toBeUndefined();
    });

    it('multiple push/undo/redo cycles maintain consistency', () => {
      for (let i = 0; i < 50; i++) {
        hm.push(makeGraphState({ version: i }));
      }

      expect(hm.undoDepth).toBe(50);
      // Undo 25 times — each pops current to redo, returns previous
      for (let i = 0; i < 25; i++) {
        const state = hm.undo();
        expect(state).not.toBeNull();
      }

      expect(hm.undoDepth).toBe(25);
      expect(hm.redoDepth).toBe(25);

      // Redo 10 times
      for (let i = 0; i < 10; i++) {
        const state = hm.redo();
        expect(state).not.toBeNull();
      }

      expect(hm.undoDepth).toBe(35);
      expect(hm.redoDepth).toBe(15);

      // Push new — redo cleared
      hm.push(makeGraphState({ version: 100 }));
      expect(hm.redoDepth).toBe(0);
      expect(hm.undoDepth).toBe(36); // 35 + 1 new
    });

    it('handles empty GraphState (zero nodes, zero connections)', () => {
      const empty: GraphState = {
        nodes: {},
        connections: {},
        version: 0,
        selectedModuleIds: [],
      };

      hm.push(empty);
      hm.push({ ...empty, version: 1 }); // need 2 for undo
      expect(hm.undoDepth).toBe(2);

      const restored = hm.undo();
      expect(restored).toEqual(empty);
      expect(restored).not.toBe(empty); // different reference
    });
  });
});