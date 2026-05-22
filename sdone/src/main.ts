/**
 * SDONE — System Dynamics Modeling Tool
 * v0.1 — MVP Foundation
 *
 * Entry point. All domain wiring happens here:
 *   CanvasResizer + ViewportManager + SceneRenderer + InputManager
 *   Story 2.3 — Module selection, drag-move, and deletion wired to state.
 */
import './ui/styles/layout.css';
import { CanvasResizer, ViewportManager, SceneRenderer, MinimapRenderer } from './canvas/index.js';
import { InputManager } from './input/InputManager.js';
import type { GraphState } from './state/GraphState.js';
import { addModule, addConnection, moveModule, deleteModule } from './state/mutations.js';

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
};

// Story 2.6 — Start with empty canvas. No seed modules.
//Seed sample modules for visual verification (removed per Story 2.6 AC5)

// ── Scene Renderer ────────────────────────────────────────────────────
const sceneRenderer = new SceneRenderer(sceneCanvas, viewportManager);
sceneRenderer.stateProvider = () => currentState;

// ── Minimap Renderer ───────────────────────────────────────────────────
const minimapRenderer = new MinimapRenderer(minimapCanvas, viewportManager, sceneCanvas);
minimapRenderer.nodesProvider = () => currentState.nodes;

// ── Input Manager ─────────────────────────────────────────────────────
const inputManager = new InputManager(sceneCanvas, viewportManager);

// Provide nodes for hit-testing
inputManager.nodesProvider = () => currentState.nodes;

// ── Story 2.3: Module Selection ──────────────────────────────────────
inputManager.onModuleSelect = (moduleId: string | null) => {
  if (moduleId === null) {
    // Deselect all
    currentState = { ...currentState, selectedModuleIds: [], version: currentState.version + 1 };
    return;
  }
  // Select single module (no multi-select yet)
  if (!currentState.selectedModuleIds.includes(moduleId)) {
    currentState = {
      ...currentState,
      selectedModuleIds: [moduleId],
      version: currentState.version + 1,
    };
  }
  minimapRenderer.markDirty();
};

// ── Story 2.3: Module Move (drag) ────────────────────────────────────
inputManager.onModuleMove = (moduleId: string, _fromWorld: import('./shared/Vec2.js').Vec2, toWorld: import('./shared/Vec2.js').Vec2) => {
  // Only move if we can find the module
  if (!currentState.nodes[moduleId]) return;
  currentState = moveModule(currentState, moduleId, toWorld);
  minimapRenderer.markDirty();
};

// ── Story 2.3: Module Delete ─────────────────────────────────────────
inputManager.onModuleDelete = () => {
  const selected = currentState.selectedModuleIds[0];
  if (!selected) return;
  currentState = deleteModule(currentState, selected);
  minimapRenderer.markDirty();
};

// ── Story 2.2: Viewport Reset (Fit All) ───────────────────────────────
const btnResetViewport = document.querySelector('.btn-reset-viewport') as HTMLButtonElement | null;
if (btnResetViewport) {
  btnResetViewport.addEventListener('click', () => {
    viewportManager.reset();
  });
}

// Ctrl+0 keyboard shortcut for reset viewport
const handleResetShortcut = (e: KeyboardEvent): void => {
  if (e.ctrlKey && e.key === '0') {
    e.preventDefault();
    viewportManager.reset();
  }
};
window.addEventListener('keydown', handleResetShortcut);

// ── Lifecycle (hot-reload cleanup) ────────────────────────────────────
void import.meta.hot?.dispose(() => {
  window.removeEventListener('keydown', handleResetShortcut);
  canvasResizer.destroy();
  sceneRenderer.stop();
  minimapRenderer.destroy();
  inputManager.destroy();
});

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