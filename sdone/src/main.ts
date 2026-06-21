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
import './ui/panels/styles/control-bar.css'; // Story 6.1
import './ui/panels/styles/analytics-panel.css'; // Story 6.2
import './ui/panels/styles/countdown-panel.css'; // Story 6.3
import './ui/overlays/styles/color-picker-popover.css';
import './ui/overlays/styles/achievement-toast.css'; // Story 5.5
import './ui/overlays/styles/modal-dialog.css'; // Story 6.1
import './ui/overlays/styles/capacity-input-popover.css'; // Infinity fix
import './ui/overlays/styles/toolbar.css'; // Story 8.6
import {
  CanvasResizer,
  ViewportManager,
  SceneRenderer,
  MinimapRenderer,
  getEdgePoint,
  ParticleEngine,
  ConfettiEngine,
  PerformanceMonitor,
  OverlaySyncManager,
  type ConfettiParticle,
} from './canvas/index.js';
import {
  ModulePanel,
  RateEditorPanel,
  ControlBar,
  AnalyticsPanel,
  computeStockAnalytics,
  CountdownPanel,
  computeAllStockCountdowns,
  sortCountdownsByUrgency,
} from './ui/panels/index.js';
import {
  ColorPickerPopover,
  AchievementToast,
  ModalDialog,
  CapacityInputPopover,
  ToolbarController,
} from './ui/overlays/index.js';
import { InputManager, isEditingTarget } from './input/InputManager.js';
import type { GraphState, ModuleType, ModuleNode, StockNode } from './state/GraphState.js';
import { DEFAULT_MODULE_HEIGHT } from './state/GraphState.js';
import type { Vec2 } from './shared/Vec2.js';
import {
  moveModule,
  deleteModule,
  addModule,
  addConnection,
  addFeedbackConnection,
  deleteConnection,
  updateRate,
  updateFormula,
  changeModuleColor,
  updateCapacity,
  updateModuleSize,
  updateModuleLabel,
} from './state/mutations.js';
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

// ── Infinity Fix: Capacity Input Popover ────────────────────────────────
const capacityInputPopover = new CapacityInputPopover();

// ── Story 6.1: Modal Dialog ──────────────────────────────────────────────
const modalDialog = new ModalDialog();

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

// ── Story 8.6: Overlay Coordinate Sync + Toolbar Controller ────────────────
const overlaySyncManager = new OverlaySyncManager(viewportManager);

const toolbarController = new ToolbarController({
  onNameEditStart: () => {
    inputManager.isEditingName = true;
  },
  onNameCommit: (label: string) => {
    const moduleId = currentState.selectedModuleIds[0];
    if (!moduleId) return;
    currentState = updateModuleLabel(currentState, moduleId, label);
    historyManager.push(currentState);
    inputManager.isEditingName = false;
  },
  onNameEditCancel: () => {
    inputManager.isEditingName = false;
  },
  onColorDotClick: () => {
    const moduleId = currentState.selectedModuleIds[0];
    if (!moduleId) return;
    const node = currentState.nodes[moduleId];
    if (!node || node.type === 'stock') return;
    // Compute toolbar screen position for popover anchor
    const canvasCenter = { x: sceneCanvas.clientWidth / 2, y: sceneCanvas.clientHeight / 2 };
    const moduleHeight = node.height ?? DEFAULT_MODULE_HEIGHT;
    const screenPos = overlaySyncManager.getToolbarScreenPosition(
      node.position,
      moduleHeight,
      canvasCenter,
    );
    const palette = node.type === 'source' ? SOURCE_PALETTE : SINK_PALETTE;
    const currentColor = node.color ?? palette[0];
    // No flag assignment — colorPickerOpenProvider reads colorPickerPopover.isOpen directly
    colorPickerPopover.open({
      moduleId,
      moduleType: node.type,
      currentColor,
      anchorScreenX: screenPos.x,
      anchorScreenY: screenPos.y,
      palette,
    });
  },
});

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

// ── Story 7.5: Performance Monitor (NFR-P1, NFR-P7) ────────────────
// DI pattern per Architecture Decision 6: moduleCountSignal callback
// avoids a direct import from canvas/ → simulation/.
const perfMonitor = new PerformanceMonitor(() => Object.keys(currentState.nodes).length);
sceneRenderer.performanceMonitor = perfMonitor;

// ── Minimap Renderer ───────────────────────────────────────────────────
const minimapRenderer = new MinimapRenderer(minimapCanvas, viewportManager, sceneCanvas);
minimapRenderer.nodesProvider = () => currentState.nodes;
minimapRenderer.connectionsProvider = () => Object.values(currentState.connections);

// ── UX-DR13: Minimap configurable corner position ──────────────────────
// Double-click the minimap to cycle through four corners:
// bottom-right → bottom-left → top-left → top-right → bottom-right
const MINIMAP_POSITIONS = ['bottom-right', 'bottom-left', 'top-left', 'top-right'] as const;
let minimapPositionIndex = 0;
const minimapContainer = document.querySelector('.layer-minimap') as HTMLElement | null;
const cycleMinimapPosition = () => {
  if (!minimapContainer) return;
  minimapPositionIndex = (minimapPositionIndex + 1) % MINIMAP_POSITIONS.length;
  const pos = MINIMAP_POSITIONS[minimapPositionIndex];
  for (const p of MINIMAP_POSITIONS) minimapContainer.classList.remove(`layer-minimap--${p}`);
  minimapContainer.classList.add(`layer-minimap--${pos}`);
};
minimapContainer?.addEventListener('dblclick', cycleMinimapPosition);

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
    case 'source':
      return '源';
    case 'stock':
      return '存量';
    case 'sink':
      return '汇';
    default:
      return type;
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
        const isFeedback = conn.isFeedback === true;
        const rateLabel = isFeedback ? '乘数' : '速率';
        const rateLine = `${rateLabel}: ${conn.rate}`;
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
    // Story 8.6: Hide toolbar on deselect (AC2)
    toolbarController.hide();

    // Deselect all (mutual exclusivity: clear both module & connection selection)
    currentState = {
      ...currentState,
      selectedModuleIds: [],
      selectedConnectionIds: [],
      version: currentState.version + 1,
    };
    // Story 4.5: Deselect connection when clicking empty space
    rateEditorPanel.setConnection(null);
    // Story 6.2: Clear analytics panel when deselecting (AC3)
    analyticsPanel.setStock(null);
    // Story 7.2: Refresh countdown panels (multi-stock)
    refreshCountdownPanels();
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
  // Story 6.2: Update analytics panel on module selection (AC1)
  refreshAnalyticsPanel();
  // Story 7.2: Update countdown panels on module selection
  refreshCountdownPanels();

  // Story 8.6: Show toolbar with module data on select (AC1, AC4)
  const node = currentState.nodes[moduleId];
  if (node) {
    // Compute stock-specific dataText (net change)
    let dataText = '';
    let dataTextColor: string | undefined;
    if (node.type === 'stock') {
      const stats = computeStockAnalytics(currentState, moduleId);
      if (stats) {
        const netChange = stats.netChange;
        dataText = `净变化：${netChange >= 0 ? '+' : ''}${netChange.toFixed(1)}`;
        dataTextColor = netChange > 0 ? '#10b981' : netChange < 0 ? '#ef4444' : undefined;
      }
    }

    toolbarController.show();
    toolbarController.updateData({
      moduleId,
      moduleType: node.type,
      label: node.label ?? node.type,
      color: node.color,
      dataText,
      dataTextColor,
    });
  }

  minimapRenderer.markDirty();
};

// ── Story 3.7: Connection Selection ──────────────────────────────────
inputManager.onConnectionSelect = (connectionId: string | null) => {
  if (connectionId === null) {
    // Deselect all — clear both selections for mutual exclusivity
    currentState = {
      ...currentState,
      selectedConnectionIds: [],
      selectedModuleIds: [],
      version: currentState.version + 1,
    };
    // Story 8.6 (code review 2026-06-21): hide toolbar — a previously-selected module's
    // toolbar would otherwise stay visible since this path clears module selection directly.
    toolbarController.hide();
    // Story 4.5: Deselect connection → hide rate editor
    rateEditorPanel.setConnection(null);
    // Story 6.2: Clear analytics panel when deselecting via connection click (AC3)
    analyticsPanel.setStock(null);
    // Story 7.2: Refresh countdown panels on connection deselect
    refreshCountdownPanels();
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
  // Story 8.6 (code review 2026-06-21): hide toolbar — selecting a connection clears
  // module selection, so the module toolbar must be hidden (InputManager routes connection
  // hits before module hits, so onModuleSelect(null)'s hide branch is not reached).
  toolbarController.hide();

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
      isFeedback: conn.isFeedback, // Story 7.1
      formulaStr: conn.formulaStr, // Story 7.1
    });
  }

  // Story 6.2: Selecting a connection deselects modules → clear analytics (AC3)
  analyticsPanel.setStock(null);
  // Story 7.2: Selecting a connection deselects modules → refresh countdown
  refreshCountdownPanels();

  minimapRenderer.markDirty();
};

// ── Story 2.3: Module Drag-Start ──────────────────────────────────────
inputManager.onModuleDragStart = () => {
  // No-op: history snapshot is pushed at dragEnd (POST-mutation).
};

// ── Story 2.3: Module Move (drag) ────────────────────────────────────
inputManager.onModuleMove = (
  moduleId: string,
  _fromWorld: import('./shared/Vec2.js').Vec2,
  toWorld: import('./shared/Vec2.js').Vec2,
) => {
  // Only move if we can find the module
  if (!currentState.nodes[moduleId]) return;
  currentState = moveModule(currentState, moduleId, toWorld);
  minimapRenderer.markDirty();
};

// ── Story 2.3: Module Drag-End (commit history + emit event) ────────
inputManager.onModuleDragEnd = (
  moduleId: string,
  fromWorld: import('./shared/Vec2.js').Vec2,
  toWorld: import('./shared/Vec2.js').Vec2,
) => {
  // POST-mutation push: currentState already reflects all onModuleMove calls.
  historyManager.push(currentState);
  eventBus.emit('MODULE_MOVED', { type: 'move', moduleId, from: fromWorld, to: toWorld });
};
// ── Story 8.6: Resize Drag (AC13, AC14) ─────────────────────────────
let resizeAnchorWorld: Vec2 | null = null;

inputManager.onResizeStart = (_moduleId: string, _corner: string, anchorWorld: Vec2) => {
  resizeAnchorWorld = anchorWorld;
  // No history push — follows move-drag pattern: push at onResizeEnd
};

inputManager.onResizeMove = (moduleId: string, _fromWorld: Vec2, toWorld: Vec2) => {
  if (!resizeAnchorWorld) return;
  // toWorld IS the new center (InputManager contract: InputManager.ts:1176,1183);
  // resizeAnchorWorld is the fixed opposite corner (InputManager.ts:243-244).
  // newCenter is therefore toWorld itself — NOT the midpoint of (toWorld, anchor).
  // width/height = 2 * |center - fixed corner|.
  const newCenter = toWorld;
  const newW = 2 * Math.abs(toWorld.x - resizeAnchorWorld.x);
  const newH = 2 * Math.abs(toWorld.y - resizeAnchorWorld.y);
  currentState = moveModule(currentState, moduleId, newCenter);
  currentState = updateModuleSize(currentState, moduleId, newW, newH);
};

inputManager.onResizeEnd = (moduleId: string, newSize: { width: number; height: number }) => {
  // Apply final size (handles both normal completion and Escape revert)
  currentState = updateModuleSize(currentState, moduleId, newSize.width, newSize.height);
  // POST-mutation push: currentState already reflects all onResizeMove calls
  historyManager.push(currentState);
  eventBus.emit('MODULE_RESIZED', { moduleId, width: newSize.width, height: newSize.height });
  resizeAnchorWorld = null;
};

// ── Story 3.4: Module Delete (Click + Delete Key) ──────────────────────
inputManager.onModuleDelete = () => {
  const selected = currentState.selectedModuleIds[0];
  if (!selected) return; // AC5: no-op if nothing selected

  currentState = deleteModule(currentState, selected); // AC1 + AC2
  // Clear all selections (mutual exclusivity)
  currentState = { ...currentState, selectedModuleIds: [], selectedConnectionIds: [] };
  // Story 8.6 (code review 2026-06-21): hide toolbar — the deleted module's toolbar
  // would otherwise stay mounted/visible since this path clears selection directly
  // rather than going through onModuleSelect(null), and onPreFrame skips toolbar
  // updates when no module is selected.
  toolbarController.hide();
  historyManager.push(currentState); // AC3: POST-mutation push
  eventBus.emit('MODULE_DELETED', { moduleId: selected }); // audit event
  minimapRenderer.markDirty();
  // Story 4.5: Deleting a module may cascade-delete the selected connection
  rateEditorPanel.setConnection(null);
  // Story 6.2: Deleting a module clears analytics (selection is now empty)
  analyticsPanel.setStock(null);
  // Story 7.2: Deleting a module → refresh countdown panels
  refreshCountdownPanels();
  // Story 7.3: Clean up stale auto-pause + overflow tracking for the deleted module
  _autoPausedStockIds.delete(selected);
  _cumulativeOverflow.delete(selected);
  _prevCountdownMap.delete(selected); // Story 7.4: deferred from 7.2 — clean up stale zero-crossing tracking
  updateAutoPauseStatus();
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
  // Story 6.2: Connection deletion changes inflow/outflow → refresh analytics
  refreshAnalyticsPanel();
  // Story 7.2: Connection deletion changes net rate → refresh countdown
  refreshCountdownPanels();
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
  // Story 6.2: Tab-cycling changes module selection → refresh analytics (AC4)
  refreshAnalyticsPanel();
  // Story 7.2: Tab-cycling changes module selection → refresh countdown
  refreshCountdownPanels();
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

// ── Infinity Fix: Shared module placement helper ──────────────────────
// Consolidates 3 placement paths (drag-drop, click-to-place, center-place)
// into a single helper that handles stock capacity popover vs immediate placement.

function handleModulePlace(moduleType: ModuleType, worldPos: Vec2): void {
  // sceneCanvas is guaranteed non-null by the guard at the top of this file.
  const canvas = sceneCanvas!;
  if (moduleType === 'stock') {
    const canvasCenter = {
      x: canvas.clientWidth / 2,
      y: canvas.clientHeight / 2,
    };
    const screenPos = viewportManager.worldToScreen(worldPos, canvasCenter);
    capacityInputPopover.onConfirm = (capacity: number) => {
      currentState = addModule(currentState, 'stock', worldPos, capacity);
      historyManager.push(currentState);
      eventBus.emit('MODULE_PLACED', { type: 'stock', position: worldPos });
      minimapRenderer.markDirty();
      refreshCountdownPanels();
      modulePanel.clearSelection();
    };
    capacityInputPopover.onCancel = () => {
      modulePanel.clearSelection();
    };
    capacityInputPopover.open(screenPos.x, screenPos.y, 100);
    return;
  }

  // Non-stock types: immediate placement
  let nextState = addModule(currentState, moduleType, worldPos);
  if (moduleType === 'source' || moduleType === 'sink') {
    nextState = applyPaletteColor(currentState, nextState, moduleType);
  }
  currentState = nextState;
  historyManager.push(currentState);
  eventBus.emit('MODULE_PLACED', { type: moduleType, position: worldPos });
  minimapRenderer.markDirty();
  // clearSelection handled by each path wrapper
}

// ── Shared helper: assign next palette colour to a newly-created source/sink ──
function applyPaletteColor(
  prevState: GraphState,
  nextState: GraphState,
  type: 'source' | 'sink',
): GraphState {
  const palette = type === 'source' ? SOURCE_PALETTE : SINK_PALETTE;
  const existing = Object.values(nextState.nodes).filter((n) => n.type === type).length;
  const colour = palette[(existing - 1) % palette.length];
  const newNodeId = Object.keys(nextState.nodes).find((id) => !(id in prevState.nodes));
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
    isFeedback: conn.isFeedback, // Story 7.1
    formulaStr: conn.formulaStr, // Story 7.1
  });
}

// ── Story 6.2: Refresh analytics panel from current state ────────────

/**
 * Refresh the analytics panel for the currently selected module.
 *
 * @param snapshotState — Optional live simulation snapshot from SNAPSHOT_EMITTED.
 *   When provided, analytics data (notably currentValue) is computed from the
 *   live snapshot rather than the module-level `currentState` which is frozen
 *   during simulation. Selection is always read from `currentState`.
 */
function refreshAnalyticsPanel(snapshotState?: GraphState): void {
  const selectedId = currentState.selectedModuleIds[0];
  if (!selectedId) {
    analyticsPanel.setStock(null);
    return;
  }
  const stateToUse = snapshotState ?? currentState;
  const analytics = computeStockAnalytics(stateToUse, selectedId);
  // Story 7.3 AC4: pass cumulative overflow for the selected stock
  analyticsPanel.setStock(analytics, _cumulativeOverflow.get(selectedId) ?? 0); // null → empty state for non-stock selections
}

// ── Story 7.2: Refresh countdown panels (multi-stock) from current state ─

/** Per-stock tracking for zero-crossing detection (AC4). */
const _prevCountdownMap = new Map<string, number>();

// ── Story 7.3: Auto-pause + overflow tracking (UI-local state, not in GraphState) ──
/** Story 7.3: Set of stock IDs that triggered auto-pause (used for breathing glow render). */
const _autoPausedStockIds = new Set<string>();
/** Story 7.3 AC4: Cumulative (max-observed) overflow per stock — monotonic during a session. */
const _cumulativeOverflow = new Map<string, number>();
/** Story 7.4: Single-slot save point — structuredClone of complete GraphState at save time. */
let _checkpoint: GraphState | null = null;

function refreshCountdownPanels(snapshotState?: GraphState): void {
  const stateToUse = snapshotState ?? currentState;
  const allCountdowns = computeAllStockCountdowns(stateToUse);
  const sorted = sortCountdownsByUrgency(allCountdowns);
  countdownPanel.setCountdowns(sorted);

  // Zero-crossing detection: emit COUNTDOWN_ZERO for each stock reaching threshold
  for (const cd of sorted) {
    if (cd.remainingSeconds !== null && cd.remainingSeconds <= 0) {
      const prevRemaining = _prevCountdownMap.get(cd.stockId);
      if (prevRemaining === undefined || prevRemaining > 0) {
        const direction = cd.direction;
        if (direction === 'to-capacity' || direction === 'to-zero') {
          eventBus.emit('COUNTDOWN_ZERO', {
            stockId: cd.stockId,
            direction,
          });
        }
      }
    }
    if (cd.remainingSeconds !== null) {
      _prevCountdownMap.set(cd.stockId, cd.remainingSeconds);
    }
  }
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

// ── Story 8.6: Name editing via Enter key (AC5, DEFER-8.4b) ─────
inputManager.onToolbarNameClick = (_moduleId: string) => {
  toolbarController.startEditing();
};

// ── Story 3.5: Enter → place module at viewport center (AC4) ─────────────────
inputManager.onModulePlaceAtCenter = () => {
  const highlightedType = modulePanel.getSelectedType();
  if (!highlightedType) return; // AC4: no-op if no type highlighted
  if (capacityInputPopover.isOpen) return; // 防止重复弹窗

  // Clear any pending DnD ghost so it doesn't linger after placement
  inputManager.ghostWorldPosition = null;
  inputManager.ghostModuleType = null;

  // Get viewport center in world coords
  const canvasCenter = {
    x: sceneCanvas.clientWidth / 2,
    y: sceneCanvas.clientHeight / 2,
  };
  const worldPos = viewportManager.screenToWorld(canvasCenter, canvasCenter);
  handleModulePlace(highlightedType as ModuleType, worldPos);
};

// ── Story 6.5: Click-to-place on empty canvas (AC2) ──────────────────
inputManager.onCanvasClickEmpty = (worldPos) => {
  const selectedType = modulePanel.getSelectedType();
  if (!selectedType) return; // No type selected → normal deselect flow

  handleModulePlace(selectedType as ModuleType, worldPos);
  if (selectedType !== 'stock') modulePanel.clearSelection();
};

// ── Story 2.2: Viewport Reset (Fit All) ───────────────────────────────
const btnResetViewport = document.querySelector('.btn-reset-viewport') as HTMLButtonElement | null;
if (btnResetViewport) {
  btnResetViewport.addEventListener('click', () => {
    viewportManager.reset();
  });
}

// ── Story 7.4: Save Point & Time Rewind Buttons ──────────────────────
const btnSaveCheckpoint = document.querySelector(
  '.btn-save-checkpoint',
) as HTMLButtonElement | null;
const btnRewindCheckpoint = document.querySelector(
  '.btn-rewind-checkpoint',
) as HTMLButtonElement | null;

/** Story 7.4: Enable save button when paused, rewind button when checkpoint exists. */
function updateCheckpointButtons(): void {
  if (btnSaveCheckpoint) {
    btnSaveCheckpoint.disabled = simEngine.state !== 'paused';
  }
  if (btnRewindCheckpoint) {
    btnRewindCheckpoint.disabled = _checkpoint === null;
  }
}

if (btnSaveCheckpoint) {
  btnSaveCheckpoint.addEventListener('click', () => {
    // AC6: Guard — save only allowed when simulation is paused
    if (simEngine.state !== 'paused') return;
    // AC1: Save complete GraphState via structuredClone
    _checkpoint = structuredClone(currentState);
    // AC4: Enable rewind button now that checkpoint exists
    updateCheckpointButtons();
    // AC1: Toast confirmation
    achievementToast.show('检查点已保存');
  });
}

if (btnRewindCheckpoint) {
  btnRewindCheckpoint.addEventListener('click', () => {
    // AC4: Guard — no-op if no checkpoint exists
    if (!_checkpoint) return;
    // Review F5: Cancel any active drag BEFORE replacing state.
    // Unlike Ctrl+Z handler, do NOT push history — rewind by design
    // discards all unsaved changes (consistent with RESET semantics,
    // spec line 128/306/336: "Rewind does NOT push to history").
    if (inputManager.isDragging) {
      inputManager.cancelDrag();
    }
    // AC2: Replace current state with checkpoint clone.
    // NOT pushed to history — the checkpoint itself IS the safety net.
    currentState = structuredClone(_checkpoint);
    // AC2: Ensure simulation is paused
    if (simEngine.state === 'running') {
      simEngine.pause();
      // Show panels — consistent with PAUSE handler and auto-pause handler (Story 7.3)
      modulePanel.setHidden(false);
      setRightSidebarHidden(false);
    }
    // AC7: Clear all runtime tracking state — the restored state is a fresh start
    _autoPausedStockIds.clear();
    _cumulativeOverflow.clear();
    _prevCountdownMap.clear();
    // Reset particle engine to clear stale particle positions (AC2)
    particleEngine.reset();
    sceneRenderer.resetAnimatedFills();
    // Refresh all panels from the restored state
    syncRateEditorPanel(currentState);
    refreshAnalyticsPanel();
    refreshCountdownPanels();
    updateAutoPauseStatus();
    updateCheckpointButtons();
    minimapRenderer.markDirty();
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
        // Story 6.2: Refresh analytics panel after undo
        refreshAnalyticsPanel();
        // Story 7.2: Refresh countdown panels after undo
        refreshCountdownPanels();
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
        // Story 6.2: Refresh analytics panel after redo
        refreshAnalyticsPanel();
        // Story 7.2: Refresh countdown panels after redo
        refreshCountdownPanels();
      }
    }
    return;
  }

  // ── Story 6.6: "P" key toggles panel pin state (AC1) ──────────────
  if (
    e.code === 'KeyP' &&
    !e.shiftKey &&
    !e.ctrlKey &&
    !e.metaKey &&
    !e.repeat &&
    !isEditingTarget(e.target as EventTarget | null)
  ) {
    e.preventDefault();
    const leftHidden = document.querySelector('.module-panel--hidden') !== null;
    const rightHidden = rightSidebarContent.classList.contains('right-sidebar__content--hidden');

    if (leftHidden || rightHidden) {
      // Re-show hidden panels and pin them
      if (leftHidden) {
        modulePanel.setHidden(false);
        modulePanel.setPinned(true); // Story 6.6 AC1 — re-expand also pins
      }
      if (rightHidden) {
        setRightSidebarHidden(false);
        if (!rightPanelPinned) {
          setRightPinned(true);
        }
      }
    } else {
      // Both visible — toggle both pin states
      modulePanel.setPinned(!modulePanel.isPinned());
      setRightPinned(!rightPanelPinned);
    }
    return;
  }

  // ── Story 4.2: Space → Run/Pause toggle ────────────────────────────
  if (!e.shiftKey && !e.ctrlKey && !e.metaKey && e.code === 'Space') {
    if (e.repeat) return; // ignore key repeat (~30Hz)
    if (isEditingTarget(e.target)) return; // don't toggle when typing
    if (inputManager.isDragging) return; // don't toggle during drag
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
  // Story 4.5 AC3: Live rate display during simulation
  const selectedConnId = currentState.selectedConnectionIds[0];
  if (selectedConnId) {
    const conn = payload.state.connections[selectedConnId];
    if (conn) {
      rateEditorPanel.setRate(conn.rate);
    }
  }

  // Story 6.2: Refresh analytics panel from snapshot (10Hz)
  refreshAnalyticsPanel(payload.state);
  // Story 7.2: Refresh countdown panels from snapshot (10Hz)
  refreshCountdownPanels(payload.state);

  // Story 7.3 AC4: Track cumulative overflow (max observed value - capacity) per stock
  for (const [id, node] of Object.entries(payload.state.nodes)) {
    if (node.type !== 'stock') continue;
    const stock = node as StockNode;
    // Story 7.3 P2 fix: guard against Infinity stock.value (degenerate simulation state)
    if (
      Number.isFinite(stock.capacity) &&
      Number.isFinite(stock.value) &&
      stock.value > stock.capacity
    ) {
      const overflow = stock.value - stock.capacity;
      const prev = _cumulativeOverflow.get(id) ?? 0;
      if (overflow > prev) {
        _cumulativeOverflow.set(id, overflow);
        // Refresh analytics panel if the overflowing stock is the selected one
        if (currentState.selectedModuleIds[0] === id) {
          refreshAnalyticsPanel(payload.state);
        }
      }
    }
  }
});

// ── Story 7.3: COUNTDOWN_ZERO → auto-pause ───────────────────────────────
eventBus.on('COUNTDOWN_ZERO', (payload) => {
  // Story 7.3 P1 fix: Track ALL threshold-crossing stocks BEFORE the guard,
  // so multi-stock same-tick crossings are all captured (AC7).
  // The guard only gates pause/panel-show — tracking is unconditional.
  _autoPausedStockIds.add(payload.stockId);
  // Only auto-pause if simulation was running (idempotent — pause() is a no-op when already paused)
  if (simEngine.state === 'running') {
    simEngine.pause();
    // Re-show panels (mirrors PAUSE handler behavior)
    modulePanel.setHidden(false);
    setRightSidebarHidden(false);
  }
  // Always refresh status text — ensures multi-stock labels appear even when
  // the Nth stock's COUNTDOWN_ZERO fires after the first stock already paused.
  updateAutoPauseStatus();
});

// Event handlers — wired at composition root (Architecture Decision 3)
eventBus.on('RUN', () => {
  simEngine.start(() => currentState);
  // Story 7.3: Resume clears auto-pause reason (breathing glow + status text)
  _autoPausedStockIds.clear();
  updateAutoPauseStatus();
  updateCheckpointButtons(); // Story 7.4: save disabled when running (AC6)
  modulePanel.clearSelection(); // Story 6.5 — prevent accidental placement during hide animation
  // Story 6.6: Only auto-hide when not pinned (AC3)
  if (!modulePanel.isPinned()) {
    modulePanel.setHidden(true);
  }
  // Story 6.6: Right sidebar auto-hide when not pinned (AC4)
  if (!rightPanelPinned) {
    setRightSidebarHidden(true);
  }
});

eventBus.on('PAUSE', () => {
  simEngine.pause();
  updateAutoPauseStatus();
  updateCheckpointButtons(); // Story 7.4: save enabled when paused
  modulePanel.setHidden(false); // Story 6.5 AC3
  setRightSidebarHidden(false); // Story 6.6 — re-show on pause
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
  // Story 6.2: Clear analytics panel on reset
  analyticsPanel.setStock(null);
  // Story 7.2: Clear countdown panels on reset
  _prevCountdownMap.clear(); // P4 fix: clear per-stock zero-crossing tracking on RESET
  // Story 7.3: Clear auto-pause + overflow tracking on RESET
  _autoPausedStockIds.clear();
  _cumulativeOverflow.clear();
  _checkpoint = null; // Story 7.4 AC5: clear checkpoint on reset
  refreshCountdownPanels();
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
  updateCheckpointButtons(); // Story 7.4: checkpoint cleared → rewind disabled
  updateAutoPauseStatus(); // reset → idle, button shows "▶ Run"
  modulePanel.setHidden(false); // Story 6.5 AC3 — re-show on reset
  setRightSidebarHidden(false); // Story 6.6 — re-show on reset
});

// ── Story 6.1: Control Bar (replaces ad-hoc updateRunButton + button handlers) ──
const controlBarContainer = document.querySelector('.layer-control-bar') as HTMLElement | null;
if (!controlBarContainer) {
  throw new Error('SDONE: Required container .layer-control-bar not found in DOM.');
}
const controlBar = new ControlBar(controlBarContainer);

// Wire Run/Pause callback (replaces ad-hoc btnRun click handler)
controlBar.onRunPause = () => {
  if (simEngine.state === 'running') {
    eventBus.emit('PAUSE', undefined);
  } else {
    eventBus.emit('RUN', undefined);
  }
};

// Wire Reset callback with confirmation modal (AC5)
controlBar.onReset = () => {
  modalDialog.open({
    title: '重置确认',
    body: '确定要重置画布吗？所有未保存的进度将丢失。',
    confirmText: '确认重置',
    cancelText: '取消',
    onConfirm: () => {
      eventBus.emit('RESET', undefined);
    },
    onCancel: () => {
      // No-op — modal auto-closes
    },
  });
};

// ── Story 6.7: Clear Canvas with Modal Confirmation ──────────────────
controlBar.onClearCanvas = () => {
  // Guard: no-op if canvas is already empty (check both nodes and connections)
  const moduleCount = Object.keys(currentState.nodes).length;
  const connectionCount = Object.keys(currentState.connections).length;
  if (moduleCount === 0 && connectionCount === 0) return;

  modalDialog.open({
    title: '清除确认',
    body: '此操作将清除画布上所有模块和连线，且不可撤销。',
    confirmText: '确认清除',
    cancelText: '取消',
    onConfirm: () => {
      // Wipe model state: delete all nodes and connections.
      // Must happen BEFORE emitting RESET so the RESET handler's
      // stock-restoration loop finds zero stocks to restore.
      currentState = {
        nodes: {},
        connections: {},
        version: currentState.version,
        selectedModuleIds: [],
        selectedConnectionIds: [],
      };
      // Delegate ALL downstream cleanup (panels, particles, achievements,
      // history, simEngine, render state) to the existing RESET handler.
      eventBus.emit('RESET', undefined);
    },
    onCancel: () => {
      // No-op — modal auto-closes, canvas unchanged (AC6)
    },
  });
};

// ── Story 6.1: Run/Pause button text helper ──────────────────────────────
// (hoisted function declaration — referenced by EventBus handlers above)
// Story 7.3: Renamed updateRunButton → updateAutoPauseStatus to surface
// the auto-pause reason text when stocks have triggered threshold.
function updateAutoPauseStatus(): void {
  if (_autoPausedStockIds.size > 0 && simEngine.state === 'paused') {
    const labels = [..._autoPausedStockIds]
      .map((id) => currentState.nodes[id]?.label || id.slice(0, 8))
      .join('、');
    controlBar.setRunState('paused', `PAUSED — ${labels} 已达阈值`);
  } else {
    controlBar.setRunState(simEngine.state);
  }
}

// ── Lifecycle (hot-reload cleanup) ────────────────────────────────────
void import.meta.hot?.dispose(() => {
  window.removeEventListener('keydown', handleResetShortcut);
  nudgeDebouncer.cancel();
  simEngine.reset(); // stop interval + reset state
  updateAutoPauseStatus(); // button → '▶ Run' (reset sets state to idle)
  canvasResizer.destroy();
  sceneRenderer.stop();
  // Story 4.6: Clean up stock warning provider (follows provider dereference pattern)
  sceneRenderer.stockWarningProvider = null;
  sceneRenderer.onPreFrame = null;
  sceneRenderer.particleStateProvider = null;
  // Story 8.6: Clean up selection overlay providers
  sceneRenderer.diamondHoverProvider = null;
  sceneRenderer.handleHoverProvider = null;
  minimapRenderer.destroy();
  inputManager.destroy();
  modulePanel.destroy();
  rateEditorPanel.destroy();
  analyticsPanel.destroy(); // Story 6.2: cleanup analytics panel DOM
  countdownPanel.destroy(); // Story 6.3: cleanup countdown panel DOM
  // Story 6.6: Clean up right sidebar event listeners and DOM
  rightPinBtn.removeEventListener('click', rightPinClickHandler);
  rightReExpandTab.removeEventListener('click', rightReExpandClickHandler);
  if (panelRightContainer && rightSidebarContent.parentNode === panelRightContainer) {
    panelRightContainer.removeChild(rightSidebarContent);
  }
  if (panelRightContainer && rightReExpandTab.parentNode === panelRightContainer) {
    panelRightContainer.removeChild(rightReExpandTab);
  }
  controlBar.destroy(); // Story 6.1: cleanup button listeners + status element
  modalDialog.destroy(); // Story 6.1: cleanup modal DOM + keyboard listeners
  colorPickerPopover.destroy();
  toolbarController.destroy(); // Story 8.6
  capacityInputPopover.destroy(); // Infinity fix
  achievementToast.destroy(); // Story 5.5: clean up toast timers + DOM
  // UX-DR13: Clean up minimap position cycle listener
  minimapContainer?.removeEventListener('dblclick', cycleMinimapPosition);
  // Story 7.4: Remove save/rewind button event listeners
  if (btnSaveCheckpoint) {
    btnSaveCheckpoint.replaceWith(btnSaveCheckpoint.cloneNode(true));
  }
  if (btnRewindCheckpoint) {
    btnRewindCheckpoint.replaceWith(btnRewindCheckpoint.cloneNode(true));
  }
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

// ── Story 6.6: Right sidebar content wrapper (slide target) ─────────────
const rightSidebarContent = document.createElement('div');
rightSidebarContent.className = 'right-sidebar__content';
panelRightContainer.appendChild(rightSidebarContent);

// ── Story 6.6: Right Sidebar Header with Pin Button ──────────────────────
const rightSidebarHeader = document.createElement('div');
rightSidebarHeader.className = 'right-sidebar__header';

const rightSidebarTitle = document.createElement('span');
rightSidebarTitle.className = 'right-sidebar__title';
rightSidebarTitle.textContent = '数据面板';

const rightPinBtn = document.createElement('button');
rightPinBtn.className = 'right-sidebar__pin-btn';
rightPinBtn.textContent = '📌';
rightPinBtn.setAttribute('aria-label', '固定面板');
rightPinBtn.setAttribute('aria-pressed', 'false');

let rightPanelPinned = false;

/** Story 6.6 — Set right sidebar pin state directly (used by keyboard shortcut "P" and re-expand tab). */
function setRightPinned(pinned: boolean): void {
  rightPanelPinned = pinned;
  if (pinned) {
    rightPinBtn.classList.add('right-sidebar__pin-btn--active');
    rightPinBtn.setAttribute('aria-label', '取消固定面板');
    rightPinBtn.setAttribute('aria-pressed', 'true');
  } else {
    rightPinBtn.classList.remove('right-sidebar__pin-btn--active');
    rightPinBtn.setAttribute('aria-label', '固定面板');
    rightPinBtn.setAttribute('aria-pressed', 'false');
  }
}

const rightPinClickHandler = () => setRightPinned(!rightPanelPinned);
rightPinBtn.addEventListener('click', rightPinClickHandler);

rightSidebarHeader.appendChild(rightSidebarTitle);
rightSidebarHeader.appendChild(rightPinBtn);
rightSidebarContent.appendChild(rightSidebarHeader);

// ── Story 6.6: Right sidebar visibility control ──────────────────────────
function setRightSidebarHidden(hidden: boolean): void {
  if (hidden) {
    rightSidebarContent.classList.add('right-sidebar__content--hidden');
  } else {
    rightSidebarContent.classList.remove('right-sidebar__content--hidden');
  }
}

const rateEditorPanel = new RateEditorPanel(rightSidebarContent);

// ── Story 6.2: Right Sidebar Stock Analytics Panel ────────────────────
const analyticsPanel = new AnalyticsPanel(rightSidebarContent);

// Infinity Fix: Capacity edit callback
analyticsPanel.onCapacitySubmit = (newCapacity: number) => {
  const selectedId = currentState.selectedModuleIds[0];
  if (!selectedId) return;
  const nextState = updateCapacity(currentState, selectedId, newCapacity);
  if (nextState.version === currentState.version) return;
  currentState = nextState;
  historyManager.push(currentState);
  refreshAnalyticsPanel();
  refreshCountdownPanels();
  minimapRenderer.markDirty();
};

// ── Story 6.3 → 7.2: Right Sidebar Countdown Timer Panel ─────────────
const countdownPanel = new CountdownPanel(rightSidebarContent);

// Story 7.2: Row click → select stock on canvas
countdownPanel.onRowClick = (stockId: string) => {
  const state = currentState;
  if (state.nodes[stockId] && state.nodes[stockId].type === 'stock') {
    currentState = {
      ...currentState,
      selectedModuleIds: [stockId],
      selectedConnectionIds: [],
      version: currentState.version + 1,
    };
    rateEditorPanel.setConnection(null);
    eventBus.emit('MODULE_SELECTED', { moduleId: stockId });
    refreshAnalyticsPanel();
    minimapRenderer.markDirty();
  }
};

// ── Story 6.6: Right sidebar re-expand tab ───────────────────────────────
const rightReExpandTab = document.createElement('div');
rightReExpandTab.className = 'right-sidebar__re-expand-tab';
rightReExpandTab.title = '展开面板';
rightReExpandTab.setAttribute('aria-label', '展开数据面板');
rightReExpandTab.innerHTML = '<span class="right-sidebar__re-expand-arrow">◀</span>';
const rightReExpandClickHandler = () => {
  setRightSidebarHidden(false);
  // Story 6.6 AC1 — re-expand also pins. Only toggle if not already pinned (idempotent).
  if (!rightPanelPinned) {
    setRightPinned(true);
  }
};
rightReExpandTab.addEventListener('click', rightReExpandClickHandler);
panelRightContainer.appendChild(rightReExpandTab);

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
  // Story 6.2: Rate change affects inflow/outflow → refresh analytics
  refreshAnalyticsPanel();
  // Story 7.2: Rate change affects net rate → refresh countdown
  refreshCountdownPanels();
};

// ── Story 7.1: Formula Editor Submit Callback ────────────────────────
rateEditorPanel.onFormulaSubmit = (formulaStr: string) => {
  const selectedConnId = currentState.selectedConnectionIds[0];
  if (!selectedConnId) return;
  const conn = currentState.connections[selectedConnId];
  if (!conn) return;

  const nextState = updateFormula(currentState, selectedConnId, formulaStr);
  if (nextState.version === currentState.version) return;
  currentState = nextState;
  historyManager.push(currentState);
  minimapRenderer.markDirty();
  refreshAnalyticsPanel();
  refreshCountdownPanels();
};

// ── Story 3.2: Drag & Drop Module Placement ───────────────────────────

// ── AC4: Connection edge-drag callbacks ──────────────────────────────

inputManager.onConnectionDragStart = (_sourceModuleId: string) => {
  // No-op: rubber-band preview drawn by SceneRenderer reading
  // inputManager.connectionDragWorldPosition / connectionDragSourceId.
};

inputManager.onConnectionDragMove = (
  _sourceModuleId: string,
  _worldCursor: import('./shared/Vec2.js').Vec2,
) => {
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

  // Story 6.2: New connection changes inflow/outflow → refresh analytics
  refreshAnalyticsPanel();
  // Story 7.2: New connection changes net rate → refresh countdown
  refreshCountdownPanels();

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
        (c) => c.toId === stockNode.id && currentState.nodes[c.fromId]?.type === 'source',
      );
      const sinkConns = Object.values(currentState.connections).filter(
        (c) => c.fromId === stockNode.id && currentState.nodes[c.toId]?.type === 'sink',
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

// ── Story 7.1: Feedback handle drag → create feedback connection ──────
inputManager.onFeedbackDragEnd = (stockId: string, sourceId: string) => {
  const nextState = addFeedbackConnection(currentState, stockId, sourceId);

  // No-op guard
  if (nextState.version === currentState.version) return;

  // Save previous state before reassignment for connection diff (P1 fix)
  const prevState = currentState;
  currentState = nextState;
  historyManager.push(currentState);
  minimapRenderer.markDirty();
  refreshAnalyticsPanel();
  refreshCountdownPanels();
  // Story 7.2: Include connectionId in FEEDBACK_CREATED payload (deferred from 7.1)
  const feedbackConnId = Object.keys(nextState.connections).find(
    (id) => !(id in prevState.connections),
  );
  eventBus.emit('FEEDBACK_CREATED', { stockId, sourceId, connectionId: feedbackConnId ?? '' });
};

inputManager.onFeedbackDragCancel = () => {
  // No-op: cleanup handled by InputManager
};

// Story 7.1: Feedback handle hover provider for SceneRenderer
sceneRenderer.feedbackHandleHoveredStockIdProvider = () =>
  inputManager.feedbackHandleHoveredStockId;

// Story 7.3: Breathing glow provider for SceneRenderer (renders during auto-pause)
sceneRenderer.breathingGlowStockIdsProvider = () => _autoPausedStockIds;

// Story 7.1 AC6: Feedback handle hover → tooltip "拖拽以创建反馈回路"
inputManager.onFeedbackHandleHover = (stockId, screenPos) => {
  if (stockId) {
    sceneRenderer.tooltipText = '拖拽以创建反馈回路';
    sceneRenderer.tooltipScreenPos = screenPos;
  } else {
    // Only clear tooltip if it was a feedback handle tooltip (not a connection tooltip)
    if (sceneRenderer.tooltipText === '拖拽以创建反馈回路') {
      sceneRenderer.tooltipText = null;
    }
  }
};

// Story 7.1: Simulation state provider for dash animation
sceneRenderer.simStateProvider = () => simEngine.state;

// Story 7.1: Feedback drag preview provider for SceneRenderer
sceneRenderer.feedbackDragProvider = () => {
  const stockId = inputManager.feedbackDragStockId;
  const worldPos = inputManager.feedbackDragWorldPosition;
  if (!stockId || !worldPos) return null;
  return { stockId, cursorWorldPos: worldPos };
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
  confettiParticles = nextConfetti && nextConfetti.length > 0 ? nextConfetti : null;
  if (borderFlashState) {
    borderFlashState = { ...borderFlashState, life: borderFlashState.life - dt };
    if (borderFlashState.life <= 0) borderFlashState = null;
  }

  // ── Story 8.6: Toolbar position sync + data refresh (AC3, AC4) ──────────
  const selectedModuleId = currentState.selectedModuleIds[0];
  if (selectedModuleId) {
    const node = currentState.nodes[selectedModuleId];
    if (node) {
      const canvasCenter = { x: sceneCanvas.clientWidth / 2, y: sceneCanvas.clientHeight / 2 };
      const moduleHeight = node.height ?? DEFAULT_MODULE_HEIGHT;
      const screenPos = overlaySyncManager.getToolbarScreenPosition(
        node.position,
        moduleHeight,
        canvasCenter,
      );
      toolbarController.updatePosition(screenPos);

      // Refresh dataText each frame (stock value changes during sim)
      let dataText = '';
      let dataTextColor: string | undefined;
      if (node.type === 'stock') {
        const stats = computeStockAnalytics(currentState, selectedModuleId);
        if (stats) {
          const netChange = stats.netChange;
          dataText = `净变化：${netChange >= 0 ? '+' : ''}${netChange.toFixed(1)}`;
          dataTextColor = netChange > 0 ? '#10b981' : netChange < 0 ? '#ef4444' : undefined;
        }
      }

      toolbarController.updateData({
        moduleId: selectedModuleId,
        moduleType: node.type,
        label: node.label ?? node.type,
        color: node.color,
        dataText,
        dataTextColor,
      });
    }
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

// ── Story 8.6: Selection overlay providers ────────────────────────────────
sceneRenderer.diamondHoverProvider = () => inputManager.hoveredDiamond;
sceneRenderer.handleHoverProvider = () => inputManager.hoveredHandle;
inputManager.selectedModuleIdProvider = () => currentState.selectedModuleIds[0] ?? null;
// Color picker open state — reads popover ground truth (no manual flag sync)
inputManager.colorPickerOpenProvider = () => colorPickerPopover.isOpen;

// onModuleDrop: push history snapshot, create module, assign palette colour,
// emit MODULE_PLACED event, and renderers pick up on next rAF.
inputManager.onModuleDrop = (moduleType, worldPos) => {
  handleModulePlace(moduleType as ModuleType, worldPos);
};

// Start the render loops
sceneRenderer.start();
minimapRenderer.start();

console.log(
  'SDONE v0.1 – dual-canvas DOM + viewport + input + module interaction initialized',
  '\n  scene:',
  sceneCanvas.id,
  `(${sceneCanvas.width}x${sceneCanvas.height})`,
  '\n  minimap:',
  minimapCanvas.id,
  `(${minimapCanvas.width}x${minimapCanvas.height})`,
  '\n  viewport zoom:',
  viewportManager.viewport.zoom,
  '\n  modules:',
  Object.keys(currentState.nodes).length,
);
