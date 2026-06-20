import type { Vec2 } from '../shared/Vec2.js';
import type {
  Connection,
  GraphState,
  ModuleNode,
  ModuleType,
  SinkNode,
  SourceNode,
  StockNode,
} from './GraphState.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create a new graph state with incremented version. */
function bump(state: GraphState): GraphState {
  return {
    nodes: state.nodes,
    connections: state.connections,
    version: state.version + 1,
    selectedModuleIds: state.selectedModuleIds,
    selectedConnectionIds: state.selectedConnectionIds,
  };
}

/** Create a new graph state without incrementing version (no-op wrapper). */
function unchanged(state: GraphState): GraphState {
  return {
    nodes: state.nodes,
    connections: state.connections,
    version: state.version,
    selectedModuleIds: state.selectedModuleIds,
    selectedConnectionIds: state.selectedConnectionIds,
  };
}

// ---------------------------------------------------------------------------
// addModule
// ---------------------------------------------------------------------------

/**
 * Create a new module on the canvas.
 *
 * @returns A NEW `GraphState` with the module added and `version` incremented.
 *   The original `state` is NOT mutated.
 *
 * **Defaults by type:**
 *   - `stock`: `value: 0`, `capacity: 100` (overridable via `initialCapacity`),
 *     `initialValue: 0`
 *   - `source`: no `color` property — the placement layer assigns color via palette cycling
 *   - `sink`:   no `color` property — same reasoning
 */
export function addModule(
  state: GraphState,
  type: ModuleType,
  position: Vec2,
  initialCapacity?: number,
): GraphState {
  const id = crypto.randomUUID();

  let node: ModuleNode;
  switch (type) {
    case 'stock':
      node = {
        id,
        type: 'stock',
        position,
        value: 0,
        // Defensive: ?? only guards null/undefined; explicit check prevents
        // 0 (division-by-zero), NaN, Infinity, and negative values.
        capacity:
          initialCapacity !== undefined && Number.isFinite(initialCapacity) && initialCapacity > 0
            ? initialCapacity
            : 100,
        initialValue: 0,
      } as StockNode;
      break;
    case 'source':
      node = {
        id,
        type: 'source',
        position,
      } satisfies SourceNode as SourceNode;
      break;
    case 'sink':
      node = {
        id,
        type: 'sink',
        position,
      } satisfies SinkNode as SinkNode;
      break;
  }

  return {
    ...bump(state),
    nodes: { ...state.nodes, [id]: node },
  };
}

// ---------------------------------------------------------------------------
// deleteModule
// ---------------------------------------------------------------------------

/**
 * Remove a module from the canvas.
 *
 * Cascade-removes ALL connections where `fromId === id` OR `toId === id`.
 *
 * @returns A NEW `GraphState` with the module and its connections removed,
 *   `version` incremented. If `id` is not found, returns a new state with
 *   unchanged `version` (no-op).
 */
export function deleteModule(state: GraphState, id: string): GraphState {
  if (!(id in state.nodes)) {
    return unchanged(state);
  }

  const nextNodes = { ...state.nodes };
  delete nextNodes[id];

  const nextConnections: Record<string, Connection> = {};
  for (const [connId, conn] of Object.entries(state.connections)) {
    if (conn.fromId !== id && conn.toId !== id) {
      nextConnections[connId] = conn;
    }
  }

  // Special case: deletion resulted in no actual change (impossible in practice
  // since we confirmed the node exists, but explicit for correctness).
  if (
    Object.keys(nextNodes).length === Object.keys(state.nodes).length &&
    Object.keys(nextConnections).length === Object.keys(state.connections).length
  ) {
    return unchanged(state);
  }

  return {
    ...bump(state),
    nodes: nextNodes,
    connections: nextConnections,
  };
}

// ---------------------------------------------------------------------------
// moveModule
// ---------------------------------------------------------------------------

/**
 * Update the canvas position of a module.
 *
 * @returns A NEW `GraphState` with updated position and `version` incremented.
 *   If the position is unchanged OR the module `id` is not found, returns a
 *   new state with unchanged `version` (no-op).
 */
export function moveModule(state: GraphState, id: string, position: Vec2): GraphState {
  const existing = state.nodes[id];
  if (!existing) {
    return unchanged(state);
  }

  if (existing.position.x === position.x && existing.position.y === position.y) {
    return unchanged(state);
  }

  return {
    ...bump(state),
    nodes: {
      ...state.nodes,
      [id]: { ...existing, position },
    },
  };
}

// ---------------------------------------------------------------------------
// addConnection
// ---------------------------------------------------------------------------

/**
 * Create a directed connection between two existing modules.
 *
 * @returns A NEW `GraphState` with the connection added and `version`
 *   incremented. Returns no-op (unchanged version) if:
 *   - Either `fromId` or `toId` does not exist in `state.nodes`
 *   - A connection with the same `fromId` → `toId` already exists (duplicate)
 *
 * **Defaults:** `rate: 0`, `formulaStr: '0'`
 */
export function addConnection(state: GraphState, fromId: string, toId: string): GraphState {
  // Both endpoints must exist
  if (!(fromId in state.nodes) || !(toId in state.nodes)) {
    return unchanged(state);
  }

  // Duplicate detection
  for (const conn of Object.values(state.connections)) {
    if (conn.fromId === fromId && conn.toId === toId) {
      return unchanged(state);
    }
  }

  const id = crypto.randomUUID();
  const connection: Connection = {
    id,
    fromId,
    toId,
    rate: 0,
    formulaStr: '0',
  };

  return {
    ...bump(state),
    connections: { ...state.connections, [id]: connection },
  };
}

// ---------------------------------------------------------------------------
// deleteConnection
// ---------------------------------------------------------------------------

/**
 * Remove a connection from the model.
 *
 * @returns A NEW `GraphState` with the connection removed and `version`
 *   incremented. If `id` is not found, returns a new state with unchanged
 *   `version` (no-op).
 */
export function deleteConnection(state: GraphState, id: string): GraphState {
  if (!(id in state.connections)) {
    return unchanged(state);
  }

  const deleted = state.connections[id];
  const nextConnections = { ...state.connections };
  delete nextConnections[id];

  // Story 7.1: Cascade-delete orphaned feedback connection.
  // When a source→stock material-flow connection is deleted, its corresponding
  // feedback connection (stock→source) becomes orphaned — invisible (no handle)
  // but still evaluated each tick. Clean it up.
  if (!deleted.isFeedback) {
    const fromNode = state.nodes[deleted.fromId];
    const toNode = state.nodes[deleted.toId];
    if (fromNode?.type === 'source' && toNode?.type === 'stock') {
      for (const [connId, conn] of Object.entries(nextConnections)) {
        if (conn.isFeedback && conn.fromId === deleted.toId && conn.toId === deleted.fromId) {
          delete nextConnections[connId];
        }
      }
    }
  }

  if (Object.keys(nextConnections).length === Object.keys(state.connections).length) {
    return unchanged(state);
  }

  return {
    ...bump(state),
    connections: nextConnections,
  };
}

// ---------------------------------------------------------------------------
// changeModuleColor
// ---------------------------------------------------------------------------

/**
 * Update the `color` of a source or sink module.
 *
 * @returns A NEW `GraphState` with the module's `color` changed and `version`
 *   incremented. Returns no-op (unchanged version) if:
 *   - The module `id` is not found
 *   - The module is a `stock` type (AC8: stock color is fixed white)
 *   - The module already has the target `color` value
 *
 * **Design note:** The color string is NOT validated. Palette enforcement is
 * done at the UI layer (ColorPickerPopover only offers 5 swatches). This keeps
 * the mutation pure and future-proof for free-form color input.
 */
export function changeModuleColor(state: GraphState, moduleId: string, color: string): GraphState {
  const existing = state.nodes[moduleId];
  if (!existing) return unchanged(state);
  // AC8: stock color is fixed white — no-op
  if (existing.type === 'stock') return unchanged(state);
  if (existing.color === color) return unchanged(state);

  return {
    ...bump(state),
    nodes: {
      ...state.nodes,
      [moduleId]: { ...existing, color },
    },
  };
}

// ---------------------------------------------------------------------------
// updateCapacity
// ---------------------------------------------------------------------------

/**
 * Update a stock module's capacity.
 *
 * @returns A NEW `GraphState` with updated capacity and `version` incremented.
 *   Returns unchanged state if:
 *   - stockId is not found or the node is not a stock
 *   - capacity is not a finite positive number (0, negative, NaN, Infinity rejected)
 */
export function updateCapacity(state: GraphState, stockId: string, capacity: number): GraphState {
  const node = state.nodes[stockId];
  if (!node || node.type !== 'stock') return unchanged(state);
  // Defensive validation: capacity must be a finite positive number.
  // Prevents division-by-zero in feedback formula and re-introduction of Infinity.
  if (!Number.isFinite(capacity) || capacity <= 0) return unchanged(state);
  return {
    ...bump(state),
    nodes: { ...state.nodes, [stockId]: { ...node, capacity } as StockNode },
  };
}

// ---------------------------------------------------------------------------
// Story 7.1: Feedback connection constants
// ---------------------------------------------------------------------------

/** Default feedback formula — linear decay: full inflow at value=0, zero at value=capacity. */
const DEFAULT_FEEDBACK_FORMULA = 'max(0, (capacity - value) / capacity)';

/** Default rate for feedback connections — multiplier starts at 1.0 (full inflow). */
const FEEDBACK_DEFAULT_RATE = 1;

// ---------------------------------------------------------------------------
// addFeedbackConnection (Story 7.1)
// ---------------------------------------------------------------------------

/**
 * Create a feedback connection from a stock back to its source.
 *
 * Feedback connections carry a multiplier formula (not a material flow rate).
 * The formula is evaluated each tick with the stock's `value` and `capacity`
 * injected as variables, producing a multiplier m ∈ [0, 1] that modulates
 * the source→stock inflow rate.
 *
 * @returns A NEW `GraphState` with the feedback connection added and `version`
 *   incremented. Returns no-op (unchanged version) if:
 *   - Either `stockId` or `sourceId` does not exist in `state.nodes`
 *   - `stockId` is not a stock node
 *   - `sourceId` is not a source node
 *   - A feedback connection with the same stockId→sourceId already exists
 */
export function addFeedbackConnection(
  state: GraphState,
  stockId: string,
  sourceId: string,
): GraphState {
  // Both endpoints must exist
  if (!(stockId in state.nodes) || !(sourceId in state.nodes)) {
    return unchanged(state);
  }

  // stockId must be a stock, sourceId must be a source
  const stockNode = state.nodes[stockId];
  const sourceNode = state.nodes[sourceId];
  if (stockNode.type !== 'stock' || sourceNode.type !== 'source') {
    return unchanged(state);
  }

  // Duplicate detection: no duplicate feedback stock→source
  for (const conn of Object.values(state.connections)) {
    if (conn.fromId === stockId && conn.toId === sourceId && conn.isFeedback) {
      return unchanged(state);
    }
  }

  const id = crypto.randomUUID();
  const connection: Connection = {
    id,
    fromId: stockId,
    toId: sourceId,
    rate: FEEDBACK_DEFAULT_RATE,
    formulaStr: DEFAULT_FEEDBACK_FORMULA,
    isFeedback: true,
  };

  return {
    ...bump(state),
    connections: { ...state.connections, [id]: connection },
  };
}

// ---------------------------------------------------------------------------
// updateFormula (Story 7.1)
// ---------------------------------------------------------------------------

/**
 * Update the `formulaStr` of a connection WITHOUT changing its `rate`.
 *
 * Unlike `updateRate` (which sets both `rate` and `formulaStr: String(rate)`),
 * this mutation preserves the formula expression string as-is. This is
 * essential for feedback connections whose `formulaStr` is an expression
 * like `"max(0, (capacity - value) / capacity)"` — `updateRate` would
 * clobber it with a numeric string like `"0.7"`.
 *
 * @returns A NEW `GraphState` with updated formulaStr and `version` incremented.
 *   Returns no-op (unchanged version) if:
 *   - The connection `id` is not found
 *   - The `formulaStr` is unchanged from current value
 */
export function updateFormula(
  state: GraphState,
  connectionId: string,
  formulaStr: string,
): GraphState {
  const existing = state.connections[connectionId];
  if (!existing) {
    return unchanged(state);
  }

  if (existing.formulaStr === formulaStr) {
    return unchanged(state);
  }

  return {
    ...bump(state),
    connections: {
      ...state.connections,
      [connectionId]: { ...existing, formulaStr },
    },
  };
}

// ---------------------------------------------------------------------------
// updateRate
// ---------------------------------------------------------------------------

/**
 * Update the `rate` and `formulaStr` of a connection.
 *
 * Sets both `rate` (number) and `formulaStr` (string representation via
 * `String(rate)`) on the target connection.
 *
 * @returns A NEW `GraphState` with updated rate and `version` incremented.
 *   Returns no-op (unchanged version) if:
 *   - The connection `id` is not found
 *   - The `rate` is unchanged from current value
 *
 * **Note:** Negative and zero rates are permitted — the mutation layer does NOT
 * validate rate sign. Semantics of negative rates are handled by the simulation
 * engine.
 */
export function updateRate(state: GraphState, connectionId: string, rate: number): GraphState {
  const existing = state.connections[connectionId];
  if (!existing) {
    return unchanged(state);
  }

  if (existing.rate === rate) {
    return unchanged(state);
  }

  return {
    ...bump(state),
    connections: {
      ...state.connections,
      [connectionId]: { ...existing, rate, formulaStr: String(rate) },
    },
  };
}

// ---------------------------------------------------------------------------
// updateModuleLabel (Story 8.1)
// ---------------------------------------------------------------------------

/** Default label by module type — used when user clears the label. */
const DEFAULT_LABEL: Record<ModuleType, string> = {
  source: 'Source',
  stock: 'Stock',
  sink: 'Sink',
};

/**
 * Update the `label` of a module.
 *
 * Processing order:
 * 1. Truncate to 50 characters
 * 2. If the result is empty or whitespace-only → fall back to the module
 *    type's default name ('Source' / 'Stock' / 'Sink')
 * 3. If the processed label equals the current label → no-op
 *
 * @returns A NEW `GraphState` with updated label and `version` incremented.
 *   Returns no-op (unchanged version) if:
 *   - The module `moduleId` is not found
 *   - The processed label equals the current label
 */
export function updateModuleLabel(
  state: GraphState,
  moduleId: string,
  newLabel: string,
): GraphState {
  const existing = state.nodes[moduleId];
  if (!existing) {
    return unchanged(state);
  }

  // Step 1: Truncate to 50 characters
  let processed = newLabel.slice(0, 50);

  // Step 2: Empty/whitespace-only → type-default fallback
  if (processed.trim() === '') {
    processed = DEFAULT_LABEL[existing.type];
  }

  // Step 3: No-op if unchanged
  if (existing.label === processed) {
    return unchanged(state);
  }

  return {
    ...bump(state),
    nodes: {
      ...state.nodes,
      [moduleId]: { ...existing, label: processed },
    },
  };
}

// ---------------------------------------------------------------------------
// updateModuleSize (Story 8.1)
// ---------------------------------------------------------------------------

/** Minimum allowed width in world-space pixels (FR-7: half default width). */
const MIN_MODULE_WIDTH = 60;

/** Minimum allowed height in world-space pixels (FR-7: half default height). */
const MIN_MODULE_HEIGHT = 40;

/**
 * Update the `width` and `height` of a module.
 *
 * Values are clamped to minimums BEFORE comparison with current values.
 * This ensures that `updateModuleSize(state, id, 30, 50)` when current is
 * `{width: 60, height: 50}` correctly returns `unchanged(state)` (30 clamped
 * to 60, both match).
 *
 * When `ModuleNode.width` is `undefined`, `undefined !== clampedWidth` is
 * always `true` → counts as a change. This is correct: a module with no
 * stored dimensions receiving its first `updateModuleSize` call should
 * trigger a version bump.
 *
 * @returns A NEW `GraphState` with updated dimensions and `version` incremented.
 *   Returns no-op (unchanged version) if:
 *   - The module `moduleId` is not found
 *   - Both clamped dimensions equal the current values
 */
export function updateModuleSize(
  state: GraphState,
  moduleId: string,
  width: number,
  height: number,
): GraphState {
  const existing = state.nodes[moduleId];
  if (!existing) {
    return unchanged(state);
  }

  // Defensive validation: reject NaN and Infinity (consistent with updateCapacity).
  // Math.max() does NOT guard against NaN/Infinity - they pass through and would
  // corrupt the state (e.g. width: NaN causes rendering to disappear).
  if (!Number.isFinite(width) || !Number.isFinite(height)) {
    return unchanged(state);
  }

  // Clamp first, then compare with stored values
  const clampedW = Math.max(MIN_MODULE_WIDTH, width);
  const clampedH = Math.max(MIN_MODULE_HEIGHT, height);

  // undefined !== number is always true → correct for first-set
  if (existing.width === clampedW && existing.height === clampedH) {
    return unchanged(state);
  }

  return {
    ...bump(state),
    nodes: {
      ...state.nodes,
      [moduleId]: { ...existing, width: clampedW, height: clampedH },
    },
  };
}
