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
  };
}

/** Create a new graph state without incrementing version (no-op wrapper). */
function unchanged(state: GraphState): GraphState {
  return {
    nodes: state.nodes,
    connections: state.connections,
    version: state.version,
    selectedModuleIds: state.selectedModuleIds,
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
 *   - `stock`: `value: 0`, `capacity: Infinity`, `initialValue: 0`
 *   - `source`: no `color` property — the placement layer assigns color
 *   - `sink`:   no `color` property — same reasoning
 */
export function addModule(
  state: GraphState,
  type: ModuleType,
  position: Vec2,
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
        capacity: Infinity,
        initialValue: 0,
      } as StockNode;
      break;
    case 'source':
      node = {
        id,
        type: 'source',
        position,
      } satisfies SourceNode;
      break;
    case 'sink':
      node = {
        id,
        type: 'sink',
        position,
      } satisfies SinkNode;
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
export function deleteModule(
  state: GraphState,
  id: string,
): GraphState {
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
export function moveModule(
  state: GraphState,
  id: string,
  position: Vec2,
): GraphState {
  const existing = state.nodes[id];
  if (!existing) {
    return unchanged(state);
  }

  if (
    existing.position.x === position.x &&
    existing.position.y === position.y
  ) {
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
export function addConnection(
  state: GraphState,
  fromId: string,
  toId: string,
): GraphState {
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
export function deleteConnection(
  state: GraphState,
  id: string,
): GraphState {
  if (!(id in state.connections)) {
    return unchanged(state);
  }

  const nextConnections = { ...state.connections };
  delete nextConnections[id];

  if (
    Object.keys(nextConnections).length ===
    Object.keys(state.connections).length
  ) {
    return unchanged(state);
  }

  return {
    ...bump(state),
    connections: nextConnections,
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
export function updateRate(
  state: GraphState,
  connectionId: string,
  rate: number,
): GraphState {
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