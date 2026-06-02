/**
 * SDONE — System Dynamics Modeling Tool
 * v0.1 — MVP Foundation
 *
 * Entry point. All domain wiring happens here:
 *   CanvasResizer + ViewportManager + SceneRenderer + InputManager
 *   Story 2.3 — Module selection, drag-move, and deletion wired to state.
 *   Story 3.2 — Panel-to-canvas drag-and-drop module placement.
 *   Story 3.7 — Connection selection, deletion, and selected-connection highlight.
 */
import './ui/styles/layout.css';
import './ui/panels/styles/module-panel.css';
import './ui/panels/styles/rate-editor-panel.css';
import './ui/overlays/styles/color-picker-popover.css';
import './ui/overlays/styles/achievement-toast.css'; // Story 5.5
import { CanvasResizer, ViewportManager, SceneRenderer, MinimapRenderer, getEdgePoint, ParticleEngine, ConfettiEngine, type ConfettiParticle } from './canvas/index.js';
import { ModulePanel, RateEditorPanel } from './ui/panels/index.js';
import { ColorPickerPopover, AchievementToast } from './ui/overlays/index.js';
import { InputManager, isEditingTarget } from './input/InputManager.js';
import type { GraphState, ModuleType, ModuleNode, StockNode } from './state/GraphState.js';
import { moveModule, deleteModule, addModule, addConnection, deleteConnection, updateRate, changeModuleColor } from './state/mutations.js';
import { detectFirstCompleteStack } from './state/achievement-detection.js';
import { HistoryManager } from './state/HistoryManager.js';
import { EventBus } from './event-bus/EventBus.js';
import { NudgeDebouncer } from './shared/NudgeDebouncer.js';
import { SimulationEngine, FormulaEngine, getAllEdgeWarnings } from './simulation/index.js';

// ── Infra: History + EventBus + SimulationEngine ───────────────────────
const historyManager = new HistoryManager();
const eventBus = new EventBus();
const simEngine = new SimulationEngine();
// ── Story 5.1: Particle Engine ──────────────────────────────────────────
const particleEngine = new ParticleEngine();

// ── Story 5.5: Confetti Engine + Achievement Toast ──────────────────────
const confettiEngine = new ConfettiEngine();
const achievementToast = new AchievementToast();

// ── Story 5.3: Color Picker Popover ─────────────────────────────────────
const colorPickerPopover = new ColorPickerPopover();

// ── Story 4.4: Formula Engine ──────────────────────────────────────────
simEngine.formulaEngine = new FormulaEngine();

// ── Story 4.3: Snapshot Bridge ─────────────────────────────────────────
simEngine.onTick = (state) => {
  eventBus.emit('SNAPSHOT_EMITTED', { state: structuredClone(state) });
};

// ── Semantic colour palettes (UX-DR3: source light, sink dark) ────────────
const SOURCE_PALETTE = ['#90EE90', '#87CEEB', '#E0E0A0', '#D8BFD8', '#FFDAB9'] as const;
const SINK_PALETTE = ['#8B0000', '#00008B', '#006400', '#4B0082', '#8B4500'] as const;

// ── Story 2.1: Dual-Canvas DOM Setup ──────────────────────────────────
const sceneCanvas = document.getElementById('scene') as HTMLCanvasElement | null;
const minimapCanvas = document.getElementById('minimap') as HTMLCanvasElement | null;

if (!sceneCanvas || !minimapCanvas) {
  throw new Error('SDONE: Required canvas elements (#scene, #minimap) not found in DOM.');
}

const canvasResizer = new CanvasResizer(sceneCanvas, minimapCanvas);

// ── Viewport + Render Loop ────────────────────────────────────────────
const viewportManager = new ViewportManager();

// ── Application State ─────────────────────────────────────────────────
let currentState: GraphState = {
  nodes: {},
  connections: {},
  version: 0,
  selectedModuleIds: [],
  selectedConnectionIds: [],
};

// ── Story 5.5: Achievement tracking (per-canvas-session) ─────────────
let hasFirstConnectionFired = false;
let hasFirstCompleteStackFired = false;
let borderFlashState: { moduleIds: string[]; life: number; maxLife: number } | null = null;
let confettiParticles: ConfettiParticle[] | null = null;
// Seed the undo stack with the initial state so the first action is undoable.
historyManager.push(currentState);

// ── Scene Renderer ────────────────────────────────────────────────────
const sceneRenderer = new SceneRenderer(sceneCanvas, viewportManager);
sceneRenderer.stateProvider = () => currentState;

// ── Minimap Renderer ───────────────────────────────────────────────────
const minimapRenderer = new MinimapRenderer(minimapCanvas, viewportManager, sceneCanvas);
minimapRenderer.nodesProvider = () => currentState.nodes;
minimapRenderer.connectionsProvider = () => Object.values(currentState.connections);

// ── Input Manager ─────────────────────────────────────────────────────
const inputManager = new InputManager(sceneCanvas, viewportManager);

// Provide nodes for hit-testing
inputManager.nodesProvider = () => currentState.nodes;

// Story 3.7: Provide connections for hit-testing
inputManager.connectionsProvider = () => currentState.connections;

// ── Story 5.4: Connection hover → scene glow + tooltip + HOVER_CHANGED ─
/** Story 5.4 AC3 — Chinese type labels for connection tooltip direction. */
const getModuleLabel = (type: string): string => {
  switch (type) {
    case 'source': return '源';
    case 'stock': return '存量';
    case 'sink': return '汇';
    default: return type;
  }
};

inputManager.onConnectionHover = (connectionId, screenPos) => {
  if (connectionId) {
    const conn = currentState.connections[connectionId];
    if (conn) {
      const fromNode = currentState.nodes[conn.fromId];
      const toNode = currentState.nodes[conn.toId];
      if (fromNode && toNode) {
        const dirLine = `${getModuleLabel(fromNode.type)} → ${getModuleLabel(toNode.type)}`;
        const rateLine = `速率: ${conn.rate}`;
        const parts = [dirLine, rateLine];
        // AC3: Show formula only when it differs from the evaluated rate
        if (conn.formulaStr && conn.formulaStr !== String(conn.rate)) {
          parts.push(`公式: ${conn.formulaStr}`);
        }
        sceneRenderer.tooltipText = parts.join('\n');
      } else {
        sceneRenderer.tooltipText = null;
      }
    } else {
      sceneRenderer.tooltipText = null;
    }
  } else {
    sceneRenderer.tooltipText = null;
  }
  sceneRenderer.tooltipScreenPos = screenPos;
  eventBus.emit('HOVER_CHANGED', { moduleId: null, connectionId, screenPos });
};
sceneRenderer.hoveredConnectionProvider = () => inputManager.getHoveredConnectionId();

// ── Story 2.3: Module Selection ──────────────────────────────────────
inputManager.onModuleSelect = (moduleId: string | null) => {
  if (moduleId === null) {
    // Deselect all (mutual exclusivity: clear both module & connection selection)
    currentState = { ...currentState, selectedModuleIds: [], selectedConnectionIds: [], version: currentState.version + 1 };
    // Story 4.5: Deselect connection when clicking empty space
    rateEditorPanel.setConnection(null);
    minimapRenderer.markDirty();
    return;
  }
  // Select single module AND deselect connections (mutually exclusive)
  if (!currentState.selectedModuleIds.includes(moduleId)) {
    currentState = {
      ...currentState,
      selectedModuleIds: [moduleId],
      selectedConnectionIds: [],
      version: currentState.version + 1,
    };
    // Story 4.5: Selecting a module clears the rate editor
    rateEditorPanel.setConnection(null);
  }
  minimapRenderer.markDirty();
};

// ── Story 3.7: Connection Selection ──────────────────────────────────
inputManager.onConnectionSelect = (connectionId: string | null) => {
  if (connectionId === null) {
    // Deselect all — clear both selections for mutual exclusivity
    currentState = { ...currentState, selectedConnectionIds: [], selectedModuleIds: [], version: currentState.version + 1 };
    // Story 4.5: Deselect connection → hide rate editor
    rateEditorPanel.setConnection(null);
    minimapRenderer.markDirty();
    return;
  }
  // Select connection AND deselect modules (mutually exclusive)
  currentState = {
    ...currentState,
    selectedConnectionIds: [connectionId],
    selectedModuleIds: [],
    version: currentState.version + 1,
  };

  // Story 4.5 AC1: Populate RateEditorPanel when connection is selected
  const conn = currentState.connections[connectionId];
  if (conn) {
    const fromNode = currentState.nodes[conn.fromId];
    const toNode = currentState.nodes[conn.toId];
    rateEditorPanel.setConnection({
      id: connectionId,
      fromId: conn.fromId,
      toId: conn.toId,
      rate: conn.rate,
      fromType: fromNode?.type,
      toType: toNode?.type,
    });
  }

  minimapRenderer.markDirty();
};

// ── Story 2.3: Module Drag-Start ──────────────────────────────────────
inputManager.onModuleDragStart = () => {
  // No-op: history snapshot is pushed at dragEnd (POST-mutation).
};

// ── Story 2.3: Module Move (drag) ────────────────────────────────────
inputManager.onModuleMove = (moduleId: string, _fromWorld: import('./shared/Vec2.js').Vec2, toWorld: import('./shared/Vec2.js').Vec2) => {
  // Only move if we can find the module
  if (!currentState.nodes[moduleId]) return;
  currentState = moveModule(currentState, moduleId, toWorld);
  minimapRenderer.markDirty();
};

// ── Story 2.3: Module Drag-End (commit history + emit event) ────────
inputManager.onModuleDragEnd = (moduleId: string, fromWorld: import('./shared/Vec2.js').Vec2, toWorld: import('./shared/Vec2.js').Vec2) => {
  // POST-mutation push: currentState already reflects all onModuleMove calls.
  historyManager.push(currentState);
  eventBus.emit('MODULE_MOVED', { type: 'move', moduleId, from: fromWorld, to: toWorld });
};

  // ── Story 3.4: Module Delete (Click + Delete Key) ──────────────────────
  inputManager.onModuleDelete = () => {
    const selected = currentState.selectedModuleIds[0];
    if (!selected) return;                        // AC5: no-op if nothing selected

    currentState = deleteModule(currentState, selected);  // AC1 + AC2
    // Clear all selections (mutual exclusivity)
    currentState = { ...currentState, selectedModuleIds: [], selectedConnectionIds: [] };
    historyManager.push(currentState);            // AC3: POST-mutation push
    eventBus.emit('MODULE_DELETED', { moduleId: selected });  // audit event
    minimapRenderer.markDirty();
    // Story 4.5: Deleting a module may cascade-delete the selected connection
    rateEditorPanel.setConnection(null);
  };

  // ── Story 3.7: Connection Delete (Click + Delete Key) ──────────────────
  inputManager.onConnectionDelete = () => {
    const selected = currentState.selectedConnectionIds[0];
    if (!selected) return; // no-op if no connection selected

    currentState = deleteConnection(currentState, selected);
    currentState = { ...currentState, selectedConnectionIds: [] };
    historyManager.push(currentState);
    eventBus.emit('CONNECTION_DELETED', { connectionId: selected });
    minimapRenderer.markDirty();
    // Story 4.5: Stale-rate guard — deleted connection must clear panel
    rateEditorPanel.setConnection(null);
  };

// ── Story 3.5: Tab → cycle module selection (AC1, AC5) ──────────────
inputManager.onTabNext = () => {
  const moduleIds = Object.keys(currentState.nodes);
  if (moduleIds.length === 0) return; // AC5: no-op if no modules

  const current = currentState.selectedModuleIds[0];
  const currentIndex = current ? moduleIds.indexOf(current) : -1;
  const nextIndex = (currentIndex + 1) % moduleIds.length;

  // Cycling modules clears connection selection (mutual exclusivity)
  currentState = {
    ...currentState,
    selectedModuleIds: [moduleIds[nextIndex]],
    selectedConnectionIds: [],
  };
  minimapRenderer.markDirty();
  // Story 4.5: Tab-cycling to a module clears the rate editor
  rateEditorPanel.setConnection(null);
};

// ── Story 3.5: Arrow keys → nudge selected module with debounced history (AC2, AC3, AC6) ──
const nudgeDebouncer = new NudgeDebouncer(300);

inputManager.onModuleNudge = (direction) => {
  const selected = currentState.selectedModuleIds[0];
  if (!selected) return;
  const node = currentState.nodes[selected];
  if (!node) return;

  const zoom = viewportManager.viewport.zoom;
  const step = 10 / zoom; // 10 screen pixels → world-space distance
  const dirDelta: Record<string, { x: number; y: number }> = {
    up: { x: 0, y: -step },
    down: { x: 0, y: step },
    left: { x: -step, y: 0 },
    right: { x: step, y: 0 },
  };
  const delta = dirDelta[direction];
  const newPos = { x: node.position.x + delta.x, y: node.position.y + delta.y };

  const isFirst = nudgeDebouncer.nudge(() => {
    historyManager.push(currentState);
  });
  if (isFirst) {
    historyManager.push(currentState);
  }

  currentState = moveModule(currentState, selected, newPos);
  minimapRenderer.markDirty();
};

// ── Shared helper: assign next palette colour to a newly-created source/sink ──
function applyPaletteColor(
  prevState: GraphState,
  nextState: GraphState,
  type: 'source' | 'sink',
): GraphState {
  const palette = type === 'source' ? SOURCE_PALETTE : SINK_PALETTE;
  const existing = Object.values(nextState.nodes).filter(n => n.type === type).length;
  const colour = palette[(existing - 1) % palette.length];
  const newNodeId = Object.keys(nextState.nodes).find(id => !(id in prevState.nodes));
  if (!newNodeId) return nextState;
  return {
    ...nextState,
    nodes: {
      ...nextState.nodes,
      [newNodeId]: { ...nextState.nodes[newNodeId], color: colour },
    },
  };
}

// ── Story 4.5: Sync RateEditorPanel from state (used by undo/redo/selection) ─
function syncRateEditorPanel(state: GraphState): void {
  const connId = state.selectedConnectionIds[0];
  if (!connId) {
    rateEditorPanel.setConnection(null);
    return;
  }
  const conn = state.connections[connId];
  if (!conn) {
    rateEditorPanel.setConnection(null);
    return;
  }
  const fromNode = state.nodes[conn.fromId];
  const toNode = state.nodes[conn.toId];
  rateEditorPanel.setConnection({
    id: connId,
    fromId: conn.fromId,
    toId: conn.toId,
    rate: conn.rate,
    fromType: fromNode?.type,
    toType: toNode?.type,
  });
}

// ── Story 5.3: Color picker popover callback ──────────────────────────
colorPickerPopover.onColorPicked = (moduleId: string, color: string) => {
  const nextState = changeModuleColor(currentState, moduleId, color);
  // No-op guard: mutation returns same state if unchanged
  if (nextState.version === currentState.version) return;
  currentState = nextState;
  // POST-mutation push: stack top reflects current state so redo restores
  // the colour-changed state (not the pre-change state).
  historyManager.push(currentState);
  minimapRenderer.markDirty();
};

// ── Story 5.3: Double-click → open color picker popover ───────────────
inputManager.onModuleDoubleClick = (moduleId: string) => {
  const node = currentState.nodes[moduleId];
  if (!node) return;
  // AC8: stock modules have fixed white colour — no popover
  if (node.type === 'stock') return;

  // Compute module center in screen space
  const canvasCenter = {
    x: sceneCanvas.clientWidth / 2,
    y: sceneCanvas.clientHeight / 2,
  };
  const worldPos = { x: node.position.x, y: node.position.y };
  const screenPos = viewportManager.worldToScreen(worldPos, canvasCenter);

  const palette = node.type === 'source' ? SOURCE_PALETTE : SINK_PALETTE;
  const currentColor = node.color ?? palette[0];

  colorPickerPopover.open({
    moduleId,
    moduleType: node.type,
    currentColor,
    anchorScreenX: screenPos.x,
    anchorScreenY: screenPos.y,
    palette,
  });
};

// ── Story 3.5: Enter → place module at viewport center (AC4) ─────────────────
inputManager.onModulePlaceAtCenter = () => {
  const highlightedType = modulePanel.getSelectedType();
  if (!highlightedType) return; // AC4: no-op if no type highlighted

  // Clear any pending DnD ghost so it doesn't linger after placement
  inputManager.ghostWorldPosition = null;
  inputManager.ghostModuleType = null;

  // Get viewport center in world coords
  const canvasCenter = {
    x: sceneCanvas.clientWidth / 2,
    y: sceneCanvas.clientHeight / 2,
  };
  const worldPos = viewportManager.screenToWorld(canvasCenter, canvasCenter);

  let nextState = addModule(currentState, highlightedType as ModuleType, worldPos);
  if (highlightedType === 'source' || highlightedType === 'sink') {
    nextState = applyPaletteColor(currentState, nextState, highlightedType);
  }

  currentState = nextState;
  historyManager.push(currentState);
  eventBus.emit('MODULE_PLACED', { type: highlightedType as ModuleType, position: worldPos });
};

// ── Story 2.2: Viewport Reset (Fit All) ───────────────────────────────
const btnResetViewport = document.querySelector('.btn-reset-viewport') as HTMLButtonElement | null;
if (btnResetViewport) {
  btnResetViewport.addEventListener('click', () => {
    viewportManager.reset();
  });
}

// Ctrl+0 keyboard shortcut for reset viewport
// Ctrl+Z → Undo (AC4); Shift+Ctrl+Z → Redo (UX-DR5)
const handleResetShortcut = (e: KeyboardEvent): void => {
  if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.code === 'Digit0') {
    e.preventDefault();
    viewportManager.reset();
    return;
  }

  // ── AC4: Undo (Ctrl+Z) ──────────────────────────────────────────
  // UX-DR5: don't intercept when user is typing in a text input
  if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.code === 'KeyZ') {
    if (isEditingTarget(e.target)) return;
    e.preventDefault();
    nudgeDebouncer.cancel();
    // Cancel active drag before undo. Push the partial-drag state first
    // so the user can redo back to it if desired.
    if (inputManager.isDragging) {
      inputManager.cancelDrag();
      historyManager.push(currentState);
    }
    if (historyManager.canUndo()) {
      const prevState = historyManager.undo();
      if (prevState) {
        eventBus.emit('UNDO', { fromState: currentState, toState: prevState });
        currentState = prevState;
        minimapRenderer.markDirty();
        // Story 4.5: Sync RateEditorPanel after undo (AC5, AC7)
        syncRateEditorPanel(currentState);
      }
    }
    return;
  }

  // ── AC4: Redo (Shift+Ctrl+Z) ────────────────────────────────────
  // UX-DR5: don't intercept when user is typing in a text input
  if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.code === 'KeyZ') {
    if (isEditingTarget(e.target)) return;
    e.preventDefault();
    nudgeDebouncer.cancel();
    // Cancel active drag before redo. Push the partial-drag state first.
    if (inputManager.isDragging) {
      inputManager.cancelDrag();
      historyManager.push(currentState);
    }
    if (historyManager.canRedo()) {
      const nextState = historyManager.redo();
      if (nextState) {
        eventBus.emit('REDO', { fromState: currentState, toState: nextState });
        currentState = nextState;
        minimapRenderer.markDirty();
        // Story 4.5: Sync RateEditorPanel after redo (AC5, AC7)
        syncRateEditorPanel(currentState);
      }
    }
    return;
  }

  // ── Story 4.2: Space → Run/Pause toggle ────────────────────────────
  if (!e.shiftKey && !e.ctrlKey && !e.metaKey && e.code === 'Space') {
    if (e.repeat) return;                        // ignore key repeat (~30Hz)
    if (isEditingTarget(e.target)) return;       // don't toggle when typing
    if (inputManager.isDragging) return;         // don't toggle during drag
    e.preventDefault();
    if (simEngine.state === 'running') {
      eventBus.emit('PAUSE', undefined);
    } else {
      eventBus.emit('RUN', undefined);
    }
    return;
  }
};
window.addEventListener('keydown', handleResetShortcut);

// ── Story 4.2: Simulation State Machine ────────────────────────────────

// ── Story 4.5 AC3: Live rate display during simulation ─────────────────
eventBus.on('SNAPSHOT_EMITTED', (payload: { state: GraphState }) => {
  const selectedConnId = currentState.selectedConnectionIds[0];
  if (!selectedConnId) return;

  const conn = payload.state.connections[selectedConnId];
  if (conn) {
    rateEditorPanel.setRate(conn.rate);
  }
});

// Event handlers — wired at composition root (Architecture Decision 3)
eventBus.on('RUN', () => {
  simEngine.start(() => currentState);
  updateRunButton();
});

eventBus.on('PAUSE', () => {
  simEngine.pause();
  updateRunButton();
});

eventBus.on('RESET', () => {
  simEngine.reset();
  // Restore all stock values to initialValue via immutable update
  const resetNodes = { ...currentState.nodes };
  for (const [id, node] of Object.entries(resetNodes)) {
    if (node.type === 'stock') {
      const stock = node as StockNode;
      resetNodes[id] = { ...stock, value: stock.initialValue } as unknown as ModuleNode;
    }
  }
  currentState = { ...currentState, nodes: resetNodes };
  // Clear selection state (consistent with initial state semantics)
  currentState.selectedModuleIds = [];
  currentState.selectedConnectionIds = [];
  // Story 4.5: Clear rate editor panel on reset (AC4)
  rateEditorPanel.setConnection(null);
  // Signal state change for downstream consumers (Snapshot Bridge, renderers)
  currentState.version++;
  // Clear undo/redo history
  historyManager.clear();
  historyManager.push(currentState);
  minimapRenderer.markDirty();
  particleEngine.reset(); // Story 5.1 AC6: clear particles on RESET
  sceneRenderer.resetAnimatedFills(); // Story 5.2 AC5: snap fill to restored values
  // Story 5.5 AC3: Reset per-session achievement state
  hasFirstConnectionFired = false;
  hasFirstCompleteStackFired = false;
  confettiEngine.reset();
  confettiParticles = null;
  borderFlashState = null;
  achievementToast.dismissAll();
  updateRunButton(); // reset → idle, button shows "▶ Run"
});

// ── Story 4.2: Run/Pause button text helper ──────────────────────────────
// (hoisted function declaration — referenced by EventBus handlers above)
function updateRunButton(): void {
  const btnRun = document.querySelector('.btn-run') as HTMLButtonElement | null;
  if (btnRun) btnRun.textContent = simEngine.state === 'running' ? '⏸ Pause' : '▶ Run';
}

// ── Story 4.2: Run/Pause/Reset buttons ──────────────────────────────────
const btnRun = document.querySelector('.btn-run') as HTMLButtonElement | null;

if (btnRun) {
  btnRun.addEventListener('click', () => {
    if (simEngine.state === 'running') {
      eventBus.emit('PAUSE', undefined);
    } else {
      eventBus.emit('RUN', undefined);
    }
  });
}

const btnResetSim = document.querySelector('.btn-reset-sim') as HTMLButtonElement | null;
if (btnResetSim) {
  btnResetSim.addEventListener('click', () => {
    eventBus.emit('RESET', undefined);
  });
}

// ── Lifecycle (hot-reload cleanup) ────────────────────────────────────
void import.meta.hot?.dispose(() => {
  window.removeEventListener('keydown', handleResetShortcut);
  nudgeDebouncer.cancel();
  simEngine.reset(); // stop interval + reset state
  updateRunButton();  // button → '▶ Run' (reset sets state to idle)
  canvasResizer.destroy();
  sceneRenderer.stop();
  // Story 4.6: Clean up stock warning provider (follows provider dereference pattern)
  sceneRenderer.stockWarningProvider = null;
  sceneRenderer.onPreFrame = null;
  sceneRenderer.particleStateProvider = null;
  minimapRenderer.destroy();
  inputManager.destroy();
  modulePanel.destroy();
  rateEditorPanel.destroy();
  colorPickerPopover.destroy();
  achievementToast.destroy(); // Story 5.5: clean up toast timers + DOM
});

// ── Story 3.1: Left Sidebar Module Panel ──────────────────────────────
const panelLeftContainer = document.querySelector('.layer-panel-left') as HTMLElement | null;
if (!panelLeftContainer) {
  throw new Error('SDONE: Required container .layer-panel-left not found in DOM.');
}
const modulePanel = new ModulePanel(panelLeftContainer);

// ── Story 4.5: Right Sidebar Rate Editor ──────────────────────────────
const panelRightContainer = document.querySelector('.layer-panel-right') as HTMLElement | null;
if (!panelRightContainer) {
  throw new Error('SDONE: Required container .layer-panel-right not found in DOM.');
}
const rateEditorPanel = new RateEditorPanel(panelRightContainer);

  // ── Story 4.5: Rate Editor Submit Callback ───────────────────────────
  rateEditorPanel.onRateSubmit = (newRate: number) => {
    const selectedConnId = currentState.selectedConnectionIds[0];
    if (!selectedConnId) return;
    const conn = currentState.connections[selectedConnId];
    // Guard: no-op if connection missing or rate unchanged
    if (!conn || conn.rate === newRate) return;

    const nextState = updateRate(currentState, selectedConnId, newRate);
    // No-op guard: mutation returns same state if connection not found
    if (nextState.version === currentState.version) return;
    // AC2/AC7: POST-mutation push — stack top reflects current state for correct redo
    currentState = nextState;
    historyManager.push(currentState);
    minimapRenderer.markDirty();
  };

// ── Story 3.2: Drag & Drop Module Placement ───────────────────────────

// ── AC4: Connection edge-drag callbacks ──────────────────────────────

inputManager.onConnectionDragStart = (_sourceModuleId: string) => {
  // No-op: rubber-band preview drawn by SceneRenderer reading
  // inputManager.connectionDragWorldPosition / connectionDragSourceId.
};

inputManager.onConnectionDragMove = (_sourceModuleId: string, _worldCursor: import('./shared/Vec2.js').Vec2) => {
  // No-op: preview is handled by SceneRenderer's connectionDragProvider.
};

inputManager.onConnectionDragEnd = (sourceModuleId: string, targetModuleId: string) => {
  // AC3: Create directed connection via addConnection mutation
  // AC6: Already enforced in InputManager.handleMouseUp (source !== target)
  let nextState = addConnection(currentState, sourceModuleId, targetModuleId);

  // If no-op (duplicate or missing endpoints), don't push history
  if (nextState.version === currentState.version) {
    return;
  }

  // AC3: Edge-drag connections default to rate:1 (addConnection defaults to 0).
  // Find the new connection and patch its rate + formulaStr.
  const newConnId = Object.keys(nextState.connections).find(
    (id) => !(id in currentState.connections),
  );
  if (newConnId) {
    nextState = {
      ...nextState,
      connections: {
        ...nextState.connections,
        [newConnId]: { ...nextState.connections[newConnId], rate: 1, formulaStr: '1' },
      },
    };
  }

  currentState = nextState;

  // AC5: POST-mutation push for undo/redo integration
  historyManager.push(currentState);

  // AC9: Mark minimap dirty
  minimapRenderer.markDirty();

  // AC4: Emit CONNECTION_CREATED event with rate:1
  eventBus.emit('CONNECTION_CREATED', {
    connectionId: newConnId!,
    fromId: sourceModuleId,
    toId: targetModuleId,
    rate: 1,
  });

  // ── Story 5.5: Achievement detection ───────────────────────────
  if (!hasFirstConnectionFired) {
    hasFirstConnectionFired = true;
    // Trigger confetti at connection midpoint
    const fromNode = currentState.nodes[sourceModuleId];
    const toNode = currentState.nodes[targetModuleId];
    if (fromNode && toNode) {
      const midX = (fromNode.position.x + toNode.position.x) / 2;
      const midY = (fromNode.position.y + toNode.position.y) / 2;
      confettiEngine.burst(midX, midY);
    }
    achievementToast.show('Great! 🎉');
    eventBus.emit('ACHIEVEMENT_UNLOCKED', {
      achievementId: 'first-connection',
      message: 'Great! 🎉',
    });
  }
  if (!hasFirstCompleteStackFired && detectFirstCompleteStack(currentState)) {
    hasFirstCompleteStackFired = true;
    // Collect all modules in the complete source→stock→sink stack
    const stackModuleIds = new Set<string>();
    for (const stockNode of Object.values(currentState.nodes)) {
      if (stockNode.type !== 'stock') continue;
      const sourceConns = Object.values(currentState.connections).filter(
        c => c.toId === stockNode.id && currentState.nodes[c.fromId]?.type === 'source'
      );
      const sinkConns = Object.values(currentState.connections).filter(
        c => c.fromId === stockNode.id && currentState.nodes[c.toId]?.type === 'sink'
      );
      if (sourceConns.length > 0 && sinkConns.length > 0) {
        stackModuleIds.add(stockNode.id);
        for (const sc of sourceConns) stackModuleIds.add(sc.fromId);
        for (const sk of sinkConns) stackModuleIds.add(sk.toId);
        break;
      }
    }
    borderFlashState = { moduleIds: [...stackModuleIds], life: 1.5, maxLife: 1.5 };
    achievementToast.show('恭喜！你构建了第一个完整系统 🎊');
    eventBus.emit('ACHIEVEMENT_UNLOCKED', {
      achievementId: 'first-complete-stack',
      message: '恭喜！你构建了第一个完整系统 🎊',
    });
  }
};

inputManager.onConnectionDragCancel = () => {
  // AC7: Cleanup handled by InputManager internally.
  // No additional side effects needed.
};

// ── Story 3.6: Connection drag preview provider for SceneRenderer ────
sceneRenderer.connectionDragProvider = () => {
  const sourceId = inputManager.connectionDragSourceId;
  const worldPos = inputManager.connectionDragWorldPosition;
  if (!sourceId || !worldPos) return null;
  const sourceNode = currentState.nodes[sourceId];
  if (!sourceNode) return null;
  const sourceEdge = getEdgePoint(sourceNode, worldPos);
  // AC2: Include snap target info for rubber-band snapping + edge highlight
  const snapId = inputManager.snapTargetId;
  const snapPos = inputManager.snapTargetEdgeWorldPos;
  return {
    sourceWorldPos: sourceEdge,
    cursorWorldPos: worldPos,
    ...(snapId && snapPos ? { snapTargetId: snapId, snapTargetWorldPos: snapPos } : {}),
  };
};

// ── Story 5.4: Snap target edge glow provider ──────────────────────────
sceneRenderer.snapTargetEdgeGlowProvider = () => {
  const snapId = inputManager.snapTargetId;
  const snapPos = inputManager.snapTargetEdgeWorldPos;
  if (!snapId || !snapPos) return null;
  return { worldPos: snapPos, moduleId: snapId };
};

// Story 3.7: Selected connection provider for SceneRenderer highlight
sceneRenderer.selectedConnectionProvider = () => currentState.selectedConnectionIds[0] ?? null;

// Story 4.6: Stock edge-warning provider for SceneRenderer warning arcs
sceneRenderer.stockWarningProvider = () => getAllEdgeWarnings(currentState);

// ── Story 5.1 + 5.5 — Pre-frame updates wired at composition root ──────
sceneRenderer.onPreFrame = (dt: number) => {
  particleEngine.update(dt, currentState.connections, currentState.nodes, simEngine.state);
  // Story 5.5: update confetti engine + border flash lifetime
  const nextConfetti = confettiEngine.update(dt);
  confettiParticles = (nextConfetti && nextConfetti.length > 0) ? nextConfetti : null;
  if (borderFlashState) {
    borderFlashState = { ...borderFlashState, life: borderFlashState.life - dt };
    if (borderFlashState.life <= 0) borderFlashState = null;
  }
};
sceneRenderer.particleStateProvider = () => particleEngine.getState();
sceneRenderer.confettiProvider = () => confettiParticles;
sceneRenderer.borderFlashProvider = () => borderFlashState;

// Ghost provider: expose InputManager ghost state to renderers
sceneRenderer.ghostProvider = () => {
  const worldPos = inputManager.ghostWorldPosition;
  const rawType = inputManager.ghostModuleType;
  if (!worldPos || !rawType) return null;
  const moduleType = rawType as ModuleType;
  return { moduleType, worldPosition: worldPos };
};
minimapRenderer.ghostProvider = () => {
  const worldPos = inputManager.ghostWorldPosition;
  const rawType = inputManager.ghostModuleType;
  if (!worldPos || !rawType) return null;
  const moduleType = rawType as ModuleType;
  return { moduleType, worldPosition: worldPos };
};

// onModuleDrop: push history snapshot, create module, assign palette colour,
// emit MODULE_PLACED event, and renderers pick up on next rAF.
inputManager.onModuleDrop = (moduleType, worldPos) => {
  // Create new state
  let nextState = addModule(currentState, moduleType as ModuleType, worldPos);

  // Assign palette colour for source/sink (shared helper)
  if (moduleType === 'source' || moduleType === 'sink') {
    nextState = applyPaletteColor(currentState, nextState, moduleType);
  }
  // Stock modules: no colour property (white fill + black border per spec)

  // Commit
  currentState = nextState;

  // POST-mutation push: stack top always reflects current state
  historyManager.push(currentState);

  // Emit MODULE_PLACED event
  eventBus.emit('MODULE_PLACED', { type: moduleType as ModuleType, position: worldPos });
};

// Start the render loops
sceneRenderer.start();
minimapRenderer.start();

console.log(
  'SDONE v0.1 – dual-canvas DOM + viewport + input + module interaction initialized',
  '\n  scene:', sceneCanvas.id, `(${sceneCanvas.width}x${sceneCanvas.height})`,
  '\n  minimap:', minimapCanvas.id, `(${minimapCanvas.width}x${minimapCanvas.height})`,
  '\n  viewport zoom:', viewportManager.viewport.zoom,
  '\n  modules:', Object.keys(currentState.nodes).length,
);