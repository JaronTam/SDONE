import type { Vec2 } from '../shared/Vec2.js';
import { vec2, distance } from '../shared/Vec2.js';
import type { ViewportManager } from '../canvas/Viewport.js';
import type { ModuleNode, Connection, StockNode } from '../state/GraphState.js';
import { DEFAULT_MODULE_WIDTH, DEFAULT_MODULE_HEIGHT } from '../state/GraphState.js';
import { getHitRadius, getVisualEdgeDistance, getEdgePoint, STOCK_WIDTH, STOCK_HEIGHT, FEEDBACK_HANDLE_RADIUS, FEEDBACK_ARC_OFFSET } from '../canvas/SceneRenderer.js';

/** Minimum screen-pixel distance before a mousedown becomes a drag. */
const DRAG_THRESHOLD_PX = 4;

/** Story 3.6 AC2 — Snap zone radius in screen pixels (~20px from module edge). */
const SNAP_RADIUS_PX = 20;

/** Story 3.7 AC1 — Max screen-pixel distance from a connection line for a click to count as a hit. */
const CONNECTION_HIT_THRESHOLD_PX = 10;

/** Story 5.3 — Max ms between two clicks on the same module to count as double-click. */
const DOUBLE_CLICK_WINDOW_MS = 300;

/** Story 5.3 — Max screen-pixel distance between two clicks to count as double-click. */
const DOUBLE_CLICK_MAX_PX = 5;

/** Story 7.1 — Feedback handle hit radius in screen pixels. */
const FEEDBACK_HANDLE_HIT_RADIUS_PX = 12;

/** Story 7.1 — Number of samples for Bezier curve hit-testing. */
const BEZIER_HIT_SAMPLES = 20;

/** Story 8.2 — Hit radius for diamond/handle hit-testing in screen pixels. */
const DIAMOND_HANDLE_HIT_RADIUS_PX = 8;

/**
 * Story 3.7 — Pure function (module-level, exported for testing).
 * Computes the shortest distance from point p to the line segment ab.
 *
 * All coordinates must be in the same space (screen pixels for hit-testing).
 * Returns the distance in the same units.
 */
export function pointToSegmentDistance(p: Vec2, a: Vec2, b: Vec2): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;

  if (lenSq === 0) {
    return distance(p, a);
  }

  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));

  const projX = a.x + t * dx;
  const projY = a.y + t * dy;
  return distance(p, vec2(projX, projY));
}

/**
 * Story 8.2 AC1 — Pure function (module-level, exported for testing).
 * Hit-test the connection-point diamonds at module edge midpoints.
 *
 * Each module has 4 edge midpoints (top/bottom/left/right) computed from
 * its world-space dimensions. Hit radius is in screen pixels (zoom-independent).
 *
 * Returns the first match found, or null if no diamond is within range.
 */
export function hitTestConnectionPoint(
  screenPos: Vec2,
  nodes: Record<string, ModuleNode>,
  viewportManager: ViewportManager,
  canvasCenter: Vec2,
): { moduleId: string; edge: 'top' | 'bottom' | 'left' | 'right' } | null {
  for (const node of Object.values(nodes)) {
    const w = node.width ?? DEFAULT_MODULE_WIDTH;
    const h = node.height ?? DEFAULT_MODULE_HEIGHT;
    const cx = node.position.x;
    const cy = node.position.y;

    const midpoints: { edge: 'top' | 'bottom' | 'left' | 'right'; world: Vec2 }[] = [
      { edge: 'top', world: vec2(cx, cy - h / 2) },
      { edge: 'bottom', world: vec2(cx, cy + h / 2) },
      { edge: 'left', world: vec2(cx - w / 2, cy) },
      { edge: 'right', world: vec2(cx + w / 2, cy) },
    ];

    for (const { edge, world } of midpoints) {
      const screen = viewportManager.worldToScreen(world, canvasCenter);
      if (distance(screenPos, screen) <= DIAMOND_HANDLE_HIT_RADIUS_PX) {
        return { moduleId: node.id, edge };
      }
    }
  }
  return null;
}

/**
 * Story 8.2 AC3 — Pure function (module-level, exported for testing).
 * Hit-test the resize handles at module corners.
 *
 * Each module has 4 corners (nw/ne/sw/se) computed from its world-space
 * dimensions. Hit radius is in screen pixels (zoom-independent).
 *
 * Returns the first match found, or null if no handle is within range.
 */
export function hitTestResizeHandle(
  screenPos: Vec2,
  nodes: Record<string, ModuleNode>,
  viewportManager: ViewportManager,
  canvasCenter: Vec2,
): { moduleId: string; corner: 'nw' | 'ne' | 'sw' | 'se' } | null {
  for (const node of Object.values(nodes)) {
    const w = node.width ?? DEFAULT_MODULE_WIDTH;
    const h = node.height ?? DEFAULT_MODULE_HEIGHT;
    const cx = node.position.x;
    const cy = node.position.y;

    const corners: { corner: 'nw' | 'ne' | 'sw' | 'se'; world: Vec2 }[] = [
      { corner: 'nw', world: vec2(cx - w / 2, cy - h / 2) },
      { corner: 'ne', world: vec2(cx + w / 2, cy - h / 2) },
      { corner: 'sw', world: vec2(cx - w / 2, cy + h / 2) },
      { corner: 'se', world: vec2(cx + w / 2, cy + h / 2) },
    ];

    for (const { corner, world } of corners) {
      const screen = viewportManager.worldToScreen(world, canvasCenter);
      if (distance(screenPos, screen) <= DIAMOND_HANDLE_HIT_RADIUS_PX) {
        return { moduleId: node.id, corner };
      }
    }
  }
  return null;
}

/**
 * Returns true if the event target is an editable element (input, textarea,
 * or contentEditable).  We use this to avoid consuming keystrokes (Space,
 * Delete, Backspace) that the user intends for a text field.
 */
export function isEditingTarget(target: EventTarget | null): boolean {
  if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
    return true;
  }
  if (target instanceof HTMLElement && target.isContentEditable) {
    return true;
  }
  return false;
}

/**
 * Maps raw DOM input events (mouse, keyboard, wheel) into:
 *   - Viewport pan / zoom (Story 2.2)
 *   - Module selection, dragging, and deletion (Story 2.3)
 *   - Panel-to-canvas drag-and-drop module creation (Story 3.2)
 *   - Edge-drag connection creation (Story 3.6)
 *
 * Pan / zoom (unchanged from 2.2):
 *   - Middle-mouse drag → pan
 *   - Space + left-click drag → pan
 *   - Mouse wheel → zoom toward cursor, clamped [0.1×, 5×]
 *
 * Module interaction (Story 2.3):
 *   - Left-click on module inner zone → select
 *   - Left-click on empty space → deselect
 *   - Left-click drag on module inner zone → move (via onModuleMove callback)
 *   - Delete key → delete selected (via onModuleDelete callback)
 *
 * Story 3.2 — Panel drop:
 *   - dragover → track ghost position and module type
 *   - dragleave → hide ghost
 *   - drop → create new module at world position
 *
 * Story 3.6 — Edge-drag connection creation:
 *   - Left-click on module edge zone (outside visual shape) → start connection drag
 *   - Drag to another module's hit zone → create directed connection
 *   - Esc during drag → cancel
 *   - Rubber-band preview line data exposed via connectionDragWorldPosition
 *
 * All mutations are communicated through callbacks so this
 * class stays free of direct state dependencies.
 */
export class InputManager {
  private readonly canvas: HTMLCanvasElement;
  private readonly viewportManager: ViewportManager;

  // ── Pan state ─────────────────────────────────────────────────
  private isPanning = false;
  private lastMousePos: Vec2 = vec2(0, 0);

  // Space key tracking
  private spaceHeld = false;

  // ── Module drag state ─────────────────────────────────────────
  private isDraggingModule = false;
  private dragModuleId: string | null = null;
  private dragModuleWorldStart: Vec2 | null = null;

  // ── Click-vs-drag disambiguation ──────────────────────────────
  private mouseDownPos: Vec2 = vec2(0, 0);
  private mouseDownModuleId: string | null = null;
  /** True if the most recent mousedown that this manager saw was on the canvas.
   *  Guards handleMouseUp against processing clicks that originated outside the
   *  canvas (e.g. sidebar panels) — without this, a click on the rate-editor
   *  input would be misrouted as "clicked empty canvas" and deselect everything. */
  private _mouseDownOnCanvas = false;

  // ── Story 8.2: V1.1 boolean state flags ────────────────────────
  /** True during resize handle drag (drag wiring → Story 8.5). */
  // @ts-ignore TS6133 — forward-declared, consumed by Story 8.5
  private _isResizing = false;
  /** True while Toolbar name input is focused (ToolbarController → Story 8.4). */
  private isEditingName = false;
  /** True while ColorPickerPopover is visible (ToolbarController → Story 8.4). */
  // @ts-ignore TS6133 — forward-declared, consumed by Story 8.4
  private _isColorPickerOpen = false;

  // ── Story 8.2: Diamond & Handle hover tracking ─────────────────
  // DECISION-1 fix: use precise union types instead of widened `string`
  private hoveredDiamond: { moduleId: string; edge: 'top' | 'bottom' | 'left' | 'right' } | null = null;
  private hoveredHandle: { moduleId: string; corner: 'nw' | 'ne' | 'sw' | 'se' } | null = null;

  /** Story 8.2 — Reset all selection-scoped state on deselect.
   *  Called from Escape handler and handleMouseUp deselect paths. */
  private resetSelectionState(): void {
    this.isEditingName = false;
    this._isColorPickerOpen = false;
    this.hoveredDiamond = null;
    this.hoveredHandle = null;
  }

  // ── Story 3.6: Edge-drag connection state ─────────────────────
  private isDraggingConnection = false;
  private edgeDragSourceId: string | null = null;

  // ── Story 7.1: Feedback handle drag state ─────────────────────
  private isDraggingFeedback = false;
  private _feedbackDragStockId: string | null = null;
  /** Feedback handle hover state — stock ID whose handle is hovered. */
  private _feedbackHandleHoveredStockId: string | null = null;

  // ── Callbacks (set by main.ts) ────────────────────────────────

  /** Provides current module nodes for hit-testing. */
  public nodesProvider: (() => Record<string, ModuleNode>) | null = null;

  /** Story 3.7: Provides current connections for hit-testing. */
  public connectionsProvider: (() => Record<string, Connection>) | null = null;

  /** Called when user clicks a module (select) or empty space (deselect). */
  public onModuleSelect: ((moduleId: string | null) => void) | null = null;

  /** Called when user drag crosses the threshold and begins moving a module. */
  public onModuleDragStart: ((moduleId: string) => void) | null = null;

  /** Called every frame during a module drag. Passes world-space positions. */
  public onModuleMove:
    | ((moduleId: string, fromWorld: Vec2, toWorld: Vec2) => void)
    | null = null;

  /** Called when user finishes dragging a module. Passes world-space positions. */
  public onModuleDragEnd:
    | ((moduleId: string, fromWorld: Vec2, toWorld: Vec2) => void)
    | null = null;

  /** Called when user presses Delete and a module is selected. */
  public onModuleDelete: (() => void) | null = null;

  /** Story 3.5 — Called when user presses Tab to cycle to next module. */
  public onTabNext: (() => void) | null = null;

  /** Story 3.5 — Called when user presses Arrow keys to nudge selected module. */
  public onModuleNudge: ((direction: 'up' | 'down' | 'left' | 'right') => void) | null = null;

  /** Story 3.5 — Called when user presses Enter to place module at viewport center. */
  public onModulePlaceAtCenter: (() => void) | null = null;

  /** Story 3.2 — Called when user drops a module from the panel onto the canvas. */
  public onModuleDrop: ((moduleType: string, worldPosition: Vec2) => void) | null = null;

  /** Story 3.2 — Ghost preview position in world space (null = hidden). */
  public ghostWorldPosition: Vec2 | null = null;
  public ghostModuleType: string | null = null;

  // ── Story 3.6: Connection edge-drag callbacks ─────────────────

  /** Called when user starts dragging from the edge of a module (connection creation). */
  public onConnectionDragStart: ((sourceModuleId: string) => void) | null = null;

  /** Called every frame during a connection drag. Passes world-space cursor position. */
  public onConnectionDragMove: ((sourceModuleId: string, worldCursor: Vec2) => void) | null = null;

  /** Called when user finishes connection drag over a valid target module. */
  public onConnectionDragEnd: ((sourceModuleId: string, targetModuleId: string) => void) | null = null;

  /** Called when connection drag is cancelled (Esc, window blur, no valid target). */
  public onConnectionDragCancel: (() => void) | null = null;

  /** Story 3.7: Called when user clicks on a connection (select) or empty space (deselect). */
  public onConnectionSelect: ((connectionId: string | null) => void) | null = null;

  /** Story 6.5 — Called when user clicks empty canvas space (no module/connection hit). */
  public onCanvasClickEmpty: ((worldPos: Vec2) => void) | null = null;

  /** Story 3.7: Called when user presses Delete and a connection is selected. */
  public onConnectionDelete: (() => void) | null = null;

  /** Story 3.6: Connection drag cursor position in world-space (null when not dragging a connection). */
  public connectionDragWorldPosition: Vec2 | null = null;
  /** Story 3.6: Source module ID during connection edge-drag (null when not dragging). */
  public connectionDragSourceId: string | null = null;
  /** Story 3.6 AC2: Snap target module ID during connection edge-drag (null = no snap). */
  public snapTargetId: string | null = null;
  /** Story 3.6 AC2: World-space edge point on snap target module nearest to cursor. */
  public snapTargetEdgeWorldPos: Vec2 | null = null;

  // ── Story 7.1: Feedback handle callbacks ──────────────────────
  /** Story 7.1 — Called when user finishes dragging from a feedback handle to a source. */
  public onFeedbackDragEnd: ((stockId: string, sourceId: string) => void) | null = null;

  /** Story 7.1 — Called when feedback drag is cancelled (Esc, blur). */
  public onFeedbackDragCancel: (() => void) | null = null;

  /** Story 7.1 AC6 — Called when feedback handle hover state changes. */
  public onFeedbackHandleHover: ((stockId: string | null, screenPos: Vec2) => void) | null = null;

  /** Story 7.1 — Feedback drag cursor position in world-space (null when not dragging). */
  public feedbackDragWorldPosition: Vec2 | null = null;

  /** Story 7.1 — Stock ID being feedback-dragged (null when not dragging). */
  public get feedbackDragStockId(): string | null {
    return this._feedbackDragStockId;
  }

  // ── Story 5.3: Double-click detection ────────────────────────
  /** Called when user double-clicks a module (same module, <300ms, <5px). */
  public onModuleDoubleClick: ((moduleId: string) => void) | null = null;

  // ── Story 5.4: Connection hover detection ────────────────────
  /** Called when user hovers over a connection line (or moves away).
   *  Fires when the hovered connection changes. Passes null + current
   *  screen position when cursor moves away from all connections. */
  public onConnectionHover: ((connectionId: string | null, screenPos: Vec2) => void) | null = null;

  // ── Story 8.2: V1.1 callbacks ──────────────────────────────────

  /** Provides the currently selected module ID (null if none selected).
   *  Story 8.5 wires this to state.selectedModuleIds[0]. */
  public selectedModuleIdProvider: (() => string | null) | null = null;

  /** Story 8.5 — Called when resize handle drag starts. */
  public onResizeStart: ((moduleId: string) => void) | null = null;

  /** Story 8.5 — Called every frame during resize handle drag.
   *  Passes world-space positions. */
  public onResizeMove:
    | ((moduleId: string, fromWorld: Vec2, toWorld: Vec2) => void)
    | null = null;

  /** Story 8.5 — Called when resize handle drag ends.
   *  Passes new dimensions (not Vec2 — dimensions use {width, height}). */
  public onResizeEnd:
    | ((moduleId: string, newSize: { width: number; height: number }) => void)
    | null = null;

  /** Story 8.4 — Called when toolbar name label is clicked. */
  public onToolbarNameClick: ((moduleId: string) => void) | null = null;

  /** Story 8.4 — Called when color dot in toolbar is clicked. */
  public onColorDotClick: ((moduleId: string) => void) | null = null;

  /** Story 8.5 — Called when diamond hover state changes.
   *  Passes null for moduleId and edge when cursor leaves all diamonds. */
  public onDiamondHover:
    | ((moduleId: string | null, edge: string | null, screenPos: Vec2) => void)
    | null = null;

  /** Story 8.5 — Called when handle hover state changes.
   *  Passes null for moduleId and corner when cursor leaves all handles. */
  public onHandleHover:
    | ((moduleId: string | null, corner: string | null, screenPos: Vec2) => void)
    | null = null;

  /** Currently hovered connection ID (null if cursor not near any connection). */
  private hoveredConnectionId: string | null = null;

  /** Story 5.4 — Last known screen-space cursor position (for clearHoveredConnection). */
  private lastScreenPos: Vec2 = vec2(0, 0);

  private lastClickModuleId: string | null = null;
  private lastClickTime = 0;
  private lastClickScreenPos: Vec2 = vec2(0, 0);

  /** Whether the user is currently dragging something (module, connection, or feedback). */
  public get isDragging(): boolean {
    return this.isDraggingModule || this.isDraggingConnection || this.isDraggingFeedback;
  }

  /** Story 3.6 — Whether a connection edge-drag is in progress. */
  public get isDraggingConnectionEdge(): boolean {
    return this.isDraggingConnection;
  }

  // ── Bound handlers (for cleanup) ──────────────────────────────
  private readonly boundMouseDown: (e: MouseEvent) => void;
  private readonly boundMouseMove: (e: MouseEvent) => void;
  private readonly boundMouseUp: (e: MouseEvent) => void;
  private readonly boundMouseLeave: (e: MouseEvent) => void;
  private readonly boundWheel: (e: WheelEvent) => void;
  private readonly boundKeyDown: (e: KeyboardEvent) => void;
  private readonly boundKeyUp: (e: KeyboardEvent) => void;
  private readonly boundContextMenu: (e: Event) => void;
  private readonly boundWindowBlur: () => void;
  private readonly boundDragOver: (e: DragEvent) => void;
  private readonly boundDragLeave: (e: DragEvent) => void;
  private readonly boundDrop: (e: DragEvent) => void;

  constructor(canvas: HTMLCanvasElement, viewportManager: ViewportManager) {
    this.canvas = canvas;
    this.viewportManager = viewportManager;

    this.boundMouseDown = this.handleMouseDown.bind(this);
    this.boundMouseMove = this.handleMouseMove.bind(this);
    this.boundMouseUp = this.handleMouseUp.bind(this);
    this.boundMouseLeave = this.handleMouseLeave.bind(this);
    this.boundWheel = this.handleWheel.bind(this);
    this.boundKeyDown = this.handleKeyDown.bind(this);
    this.boundKeyUp = this.handleKeyUp.bind(this);
    this.boundContextMenu = this.handleContextMenu.bind(this);
    this.boundWindowBlur = this.handleWindowBlur.bind(this);
    this.boundDragOver = this.handleDragOver.bind(this);
    this.boundDragLeave = this.handleDragLeave.bind(this);
    this.boundDrop = this.handleDrop.bind(this);

    canvas.addEventListener('mousedown', this.boundMouseDown);
    window.addEventListener('mousemove', this.boundMouseMove);
    window.addEventListener('mouseup', this.boundMouseUp);
    canvas.addEventListener('mouseleave', this.boundMouseLeave);
    canvas.addEventListener('wheel', this.boundWheel, { passive: false });

    window.addEventListener('keydown', this.boundKeyDown);
    window.addEventListener('keyup', this.boundKeyUp);

    canvas.addEventListener('contextmenu', this.boundContextMenu);

    // Story 3.2: drag-and-drop from ModulePanel to scene canvas
    canvas.addEventListener('dragover', this.boundDragOver);
    canvas.addEventListener('dragleave', this.boundDragLeave);
    canvas.addEventListener('drop', this.boundDrop);

    // Story 2.3: reset held keys on window blur (Alt+Tab safety)
    window.addEventListener('blur', this.boundWindowBlur);
  }

  /** Remove all event listeners. */
  destroy(): void {
    this.canvas.removeEventListener('mousedown', this.boundMouseDown);
    window.removeEventListener('mousemove', this.boundMouseMove);
    window.removeEventListener('mouseup', this.boundMouseUp);
    this.canvas.removeEventListener('mouseleave', this.boundMouseLeave);
    this.canvas.removeEventListener('wheel', this.boundWheel);
    window.removeEventListener('keydown', this.boundKeyDown);
    window.removeEventListener('keyup', this.boundKeyUp);
    this.canvas.removeEventListener('contextmenu', this.boundContextMenu);
    this.canvas.removeEventListener('dragover', this.boundDragOver);
    this.canvas.removeEventListener('dragleave', this.boundDragLeave);
    this.canvas.removeEventListener('drop', this.boundDrop);
    window.removeEventListener('blur', this.boundWindowBlur);
  }

  // -------------------------------------------------------------------
  // Story 3.2 — Drag-and-Drop from ModulePanel
  // -------------------------------------------------------------------

  /**
   * dragover handler: prevent default to allow drop, update ghost position
   * from the cursor location converted to world space, and read the module
   * type from the drag data.
   */
  private handleDragOver(e: DragEvent): void {
    e.preventDefault();
    if (!e.dataTransfer) return;

    // Only accept our custom drag type
    const moduleType = e.dataTransfer.getData('application/x-sdone-module');
    // Validate moduleType against known set — guards against arbitrary
    // string values flowing into addModule (which has no default branch).
    if (moduleType !== 'source' && moduleType !== 'stock' && moduleType !== 'sink') return;

    // Set dropEffect to indicate a copy operation
    e.dataTransfer.dropEffect = 'copy';

    // Update ghost preview position in world space
    const screenPos = vec2(e.clientX, e.clientY);
    const canvasCenter = this.getCanvasCenter();
    const worldPos = this.viewportManager.screenToWorld(screenPos, canvasCenter);

    this.ghostModuleType = moduleType;
    this.ghostWorldPosition = worldPos;
  }

  /**
   * dragleave: clear ghost when drag leaves the canvas.
   */
  private handleDragLeave(_e: DragEvent): void {
    this.ghostModuleType = null;
    this.ghostWorldPosition = null;
  }

  /**
   * drop handler: prevent default, read the module type, convert screen
   * position to world space, and fire onModuleDrop.
   */
  private handleDrop(e: DragEvent): void {
    e.preventDefault();
    if (!e.dataTransfer) return;

    const moduleType = e.dataTransfer.getData('application/x-sdone-module');
    if (moduleType !== 'source' && moduleType !== 'stock' && moduleType !== 'sink') return;

    // Clear ghost immediately
    this.ghostModuleType = null;
    this.ghostWorldPosition = null;

    // Convert drop point to world space
    const screenPos = vec2(e.clientX, e.clientY);
    const canvasCenter = this.getCanvasCenter();
    const worldPos = this.viewportManager.screenToWorld(screenPos, canvasCenter);

    this.onModuleDrop?.(moduleType, worldPos);
  }

  // -------------------------------------------------------------------
  // Window blur — Alt+Tab safety (Story 2.3 + Story 3.6)
  // -------------------------------------------------------------------

  private handleWindowBlur(): void {
    // Release all held state so keys aren't "stuck" after refocus
    this.spaceHeld = false;
    this.isPanning = false;
    this.isDraggingModule = false;
    this.dragModuleId = null;
    this.mouseDownModuleId = null;
    this._mouseDownOnCanvas = false;
    this.ghostModuleType = null;
    this.ghostWorldPosition = null;
    // Story 8.2 — reset V1.1 boolean state flags
    this._isResizing = false;
    this.isEditingName = false;
    this._isColorPickerOpen = false;
    // Story 8.2 — reset hover tracking
    this.hoveredDiamond = null;
    this.hoveredHandle = null;
    // Story 3.6 — cancel connection drag on blur
    if (this.isDraggingConnection) {
      this.cancelConnectionDrag();
    }
    // Story 7.1 — cancel feedback drag on blur
    if (this.isDraggingFeedback || this._feedbackDragStockId !== null) {
      this.cancelFeedbackDrag();
    }
    this.canvas.style.cursor = '';
  }

  // -------------------------------------------------------------------
  // Hit-testing helpers
  // -------------------------------------------------------------------

  /**
   * Find the top-most module whose rendered circle contains the given
   * screen-space point. Returns its id, or null if none match.
   */
  private hitTest(screenPos: Vec2): string | null {
    const nodes = this.nodesProvider?.();
    if (!nodes) return null;

    const canvasCenter = this.getCanvasCenter();

    // Check every module — last drawn = "top", so iterate values
    for (const node of Object.values(nodes)) {
      const worldPos = vec2(node.position.x, node.position.y);
      const screenPosOfNode = this.viewportManager.worldToScreen(
        worldPos,
        canvasCenter,
      );
      // Per-type hit radius, scaled by zoom
      const hitRadius = getHitRadius(node.type);
      const zoomedRadius = hitRadius * this.viewportManager.viewport.zoom;
      if (distance(screenPos, screenPosOfNode) <= zoomedRadius) {
        return node.id;
      }
    }
    return null;
  }

  /**
   * Classify a screen-space point relative to a module's hit-test zones.
   *
   * Uses the VISUAL shape edge (getVisualEdgeDistance) as the inner/edge
   * boundary rather than a single fraction of the hit radius.  This ensures
   * that clicks on the visible module shape are always "inner" (select/move)
   * and clicks in the halo between the visual edge and the hit radius are
   * "edge" (connection drag).
   */
  // @ts-ignore TS6133 — preserved per AC5 for future reuse; call site removed in Story 8.2
  private classifyHitZone(moduleId: string, screenPos: Vec2): 'none' | 'inner' | 'edge' {
    const nodes = this.nodesProvider?.();
    if (!nodes) return 'none';

    const node = nodes[moduleId];
    if (!node) return 'none';

    const canvasCenter = this.getCanvasCenter();
    const worldPos = vec2(node.position.x, node.position.y);
    const screenPosOfNode = this.viewportManager.worldToScreen(worldPos, canvasCenter);
    const hitRadius = getHitRadius(node.type);
    const zoomedHitRadius = hitRadius * this.viewportManager.viewport.zoom;
    const dist = distance(screenPos, screenPosOfNode);

    if (dist > zoomedHitRadius) return 'none';

    // The inner zone is the visible shape extent (with a small margin).
    // Everything between the visual edge and the hit radius is the edge zone.
    const visualEdge = getVisualEdgeDistance(node.type);
    const zoomedVisualEdge = visualEdge * this.viewportManager.viewport.zoom;

    if (dist <= zoomedVisualEdge) return 'inner';
    return 'edge';
  }

  /**
   * Story 3.6 AC2 — Find the nearest module whose edge is within
   * SNAP_RADIUS_PX screen pixels of the cursor (edge-distance-based).
   * Returns the module ID and its edge point closest to the cursor,
   * or null if no module's edge is within range.
   */
  private findSnapTarget(
    cursorScreen: Vec2,
    cursorWorld: Vec2,
    excludeModuleId: string,
  ): { moduleId: string; edgeWorldPos: Vec2 } | null {
    const nodes = this.nodesProvider?.();
    if (!nodes) return null;

    const canvasCenter = this.getCanvasCenter();
    let closestScreenDist = Infinity;
    let closest: { moduleId: string; edgeWorldPos: Vec2 } | null = null;

    for (const [id, node] of Object.entries(nodes)) {
      if (id === excludeModuleId) continue;

      const edgeWorldPos = getEdgePoint(node, cursorWorld);
      const screenEdgePos = this.viewportManager.worldToScreen(edgeWorldPos, canvasCenter);
      const screenDist = distance(cursorScreen, screenEdgePos);

      if (screenDist <= SNAP_RADIUS_PX && screenDist < closestScreenDist) {
        closestScreenDist = screenDist;
        closest = { moduleId: id, edgeWorldPos };
      }
    }

    return closest;
  }

  // ── Story 7.1: Feedback handle hit-testing ────────────────────

  /**
   * Story 7.1 — Hit-test the feedback handle (amber dot at bottom-right of stock).
   * Returns the stock ID if the cursor is within FEEDBACK_HANDLE_HIT_RADIUS_PX
   * of the handle center, or null if no handle is hit.
   *
   * Only stocks that have at least one incoming source connection are eligible.
   */
  private hitTestFeedbackHandle(screenPos: Vec2): string | null {
    const nodes = this.nodesProvider?.();
    const connections = this.connectionsProvider?.();
    if (!nodes || !connections) return null;

    const canvasCenter = this.getCanvasCenter();

    for (const node of Object.values(nodes)) {
      if (node.type !== 'stock') continue;
      const stock = node as StockNode;

      // Only stocks with incoming source connections have feedback handles
      const hasSourceInflow = Object.values(connections).some(
        c => c.toId === stock.id && !c.isFeedback && nodes[c.fromId]?.type === 'source',
      );
      if (!hasSourceInflow) continue;

      // Handle position: bottom-right of stock
      const hw = STOCK_WIDTH / 2;
      const hh = STOCK_HEIGHT / 2;
      const handleWorldX = stock.position.x + hw - FEEDBACK_HANDLE_RADIUS;
      const handleWorldY = stock.position.y + hh - FEEDBACK_HANDLE_RADIUS;
      const handleScreenPos = this.viewportManager.worldToScreen(
        vec2(handleWorldX, handleWorldY), canvasCenter,
      );

      if (distance(screenPos, handleScreenPos) <= FEEDBACK_HANDLE_HIT_RADIUS_PX) {
        return stock.id;
      }
    }
    return null;
  }

  /**
   * Story 7.1 — Hit-test a feedback Bezier curve connection.
   * Samples the quadratic Bezier at BEZIER_HIT_SAMPLES points and checks
   * screen-space distance to each segment.
   */
  private hitTestFeedbackBezier(screenPos: Vec2): string | null {
    const nodes = this.nodesProvider?.();
    const connections = this.connectionsProvider?.();
    if (!nodes || !connections) return null;

    const canvasCenter = this.getCanvasCenter();

    for (const conn of Object.values(connections)) {
      if (!conn.isFeedback) continue;
      const stockNode = nodes[conn.fromId];
      if (!stockNode || stockNode.type !== 'stock') continue;
      const stock = stockNode as StockNode;

      const hw = STOCK_WIDTH / 2;
      const hh = STOCK_HEIGHT / 2;
      const sx = stock.position.x;
      const sy = stock.position.y;

      // Match the rendering constants from SceneRenderer
      const startX = sx + hw - FEEDBACK_HANDLE_RADIUS;
      const startY = sy + hh - FEEDBACK_HANDLE_RADIUS;
      const endX = sx;
      const endY = sy - hh;
      const cpX = sx + hw + FEEDBACK_ARC_OFFSET;
      const cpY = sy;

      // Sample Bezier at N points and check distance to each segment
      const points: Vec2[] = [];
      for (let i = 0; i <= BEZIER_HIT_SAMPLES; i++) {
        const t = i / BEZIER_HIT_SAMPLES;
        const bx = (1 - t) * (1 - t) * startX + 2 * (1 - t) * t * cpX + t * t * endX;
        const by = (1 - t) * (1 - t) * startY + 2 * (1 - t) * t * cpY + t * t * endY;
        points.push(this.viewportManager.worldToScreen(vec2(bx, by), canvasCenter));
      }

      for (let i = 0; i < points.length - 1; i++) {
        const dist = pointToSegmentDistance(screenPos, points[i], points[i + 1]);
        if (dist <= CONNECTION_HIT_THRESHOLD_PX) {
          return conn.id;
        }
      }
    }
    return null;
  }

  // ── Story 8.2: Diamond & Handle hit-test instance wrappers ────

  /**
   * Story 8.2 AC1 — Instance wrapper for the module-level hitTestConnectionPoint.
   * Resolves nodesProvider and canvasCenter before delegating.
   */
  private hitTestConnectionPointInstance(
    screenPos: Vec2,
  ): { moduleId: string; edge: 'top' | 'bottom' | 'left' | 'right' } | null {
    const nodes = this.nodesProvider?.();
    if (!nodes) return null;
    const canvasCenter = this.getCanvasCenter();
    return hitTestConnectionPoint(screenPos, nodes, this.viewportManager, canvasCenter);
  }

  /**
   * Story 8.2 AC3 — Instance wrapper for the module-level hitTestResizeHandle.
   * Resolves nodesProvider and canvasCenter before delegating.
   */
  private hitTestResizeHandleInstance(
    screenPos: Vec2,
  ): { moduleId: string; corner: 'nw' | 'ne' | 'sw' | 'se' } | null {
    const nodes = this.nodesProvider?.();
    if (!nodes) return null;
    const canvasCenter = this.getCanvasCenter();
    return hitTestResizeHandle(screenPos, nodes, this.viewportManager, canvasCenter);
  }

  /** Story 7.1 — Returns the stock ID whose feedback handle is currently hovered. */
  public get feedbackHandleHoveredStockId(): string | null {
    return this._feedbackHandleHoveredStockId;
  }

  /**
   * Story 3.7 AC1 — Find the first connection whose screen-space line segment
   * is within CONNECTION_HIT_THRESHOLD_PX of the given screen point.
   * Uses point-to-segment distance in screen space.
   * Returns the connection ID, or null if no connection matches.
   */
  private hitTestConnection(screenPos: Vec2): string | null {
    const nodes = this.nodesProvider?.();
    const connections = this.connectionsProvider?.();
    if (!nodes || !connections) return null;

    const canvasCenter = this.getCanvasCenter();

    // Story 7.1: Check feedback Bezier curves FIRST (they overlay normal connections)
    const feedbackHit = this.hitTestFeedbackBezier(screenPos);
    if (feedbackHit) return feedbackHit;

    for (const conn of Object.values(connections)) {
      if (conn.isFeedback) continue; // Already checked via hitTestFeedbackBezier

      const fromNode = nodes[conn.fromId];
      const toNode = nodes[conn.toId];
      if (!fromNode || !toNode) continue;

      // Use edge-point endpoints to match the rendered line exactly.
      const fromEdge = getEdgePoint(fromNode, toNode.position);
      const toEdge = getEdgePoint(toNode, fromNode.position);
      const p1Screen = this.viewportManager.worldToScreen(fromEdge, canvasCenter);
      const p2Screen = this.viewportManager.worldToScreen(toEdge, canvasCenter);

      const dist = pointToSegmentDistance(screenPos, p1Screen, p2Screen);
      if (dist <= CONNECTION_HIT_THRESHOLD_PX) {
        return conn.id;
      }
    }
    return null;
  }

  /**
   * Story 3.7 — Pure function (module-level, exported for testing).
   * Computes the shortest distance from point p to the line segment ab
   * (all in the same coordinate space). Returns the distance in the
   * same units as the inputs (screen pixels for our use case).
   */
  public pointToSegmentDist = pointToSegmentDistance;

  // -------------------------------------------------------------------
  // Story 5.4 — Connection Hover Detection
  // -------------------------------------------------------------------

  /** Story 5.4 — Returns the currently hovered connection ID (or null). */
  public getHoveredConnectionId(): string | null {
    return this.hoveredConnectionId;
  }

  /**
   * Story 5.4 — Mirrors the visibility guard in SceneRenderer.drawConnections().
   * A connection is "renderable" if its edge-point endpoints are not coincident.
   * This prevents the hover system from reporting a connection that the renderer will
   * never draw (e.g., when two modules' centers are perfectly aligned on one axis).
   */
  private isConnectionRenderable(connectionId: string): boolean {
    const nodes = this.nodesProvider?.();
    const connections = this.connectionsProvider?.();
    if (!nodes || !connections) return false;
    const conn = connections[connectionId];
    if (!conn) return false;
    // Story 7.1: Feedback connections use Bezier curves, always renderable
    if (conn.isFeedback) return true;
    const fromNode = nodes[conn.fromId];
    const toNode = nodes[conn.toId];
    if (!fromNode || !toNode) return false;
    const fromEdge = getEdgePoint(fromNode, toNode.position);
    const toEdge = getEdgePoint(toNode, fromNode.position);
    return !(fromEdge.x === toEdge.x && fromEdge.y === toEdge.y);
  }

  /**
   * Story 5.4 — Clear the hovered connection (called on pointer leave,
   * drag start, etc.) so the highlight + tooltip are removed.
   */
  public clearHoveredConnection(): void {
    if (this.hoveredConnectionId !== null) {
      this.hoveredConnectionId = null;
      this.onConnectionHover?.(null, this.lastScreenPos);
    }
  }

  private handleMouseLeave(_e: MouseEvent): void {
    this.clearHoveredConnection();
    this.ghostModuleType = null;
    this.ghostWorldPosition = null;
    // PATCH-4 fix: clear diamond/handle hover on cursor leave
    if (this.hoveredDiamond !== null) {
      this.hoveredDiamond = null;
      this.onDiamondHover?.(null, null, this.lastScreenPos);
    }
    if (this.hoveredHandle !== null) {
      this.hoveredHandle = null;
      this.onHandleHover?.(null, null, this.lastScreenPos);
    }
  }

  // -------------------------------------------------------------------
  // Mouse Handlers — Pan + Module / Connection Drag
  // -------------------------------------------------------------------

  private handleMouseDown(e: MouseEvent): void {
    // Middle-mouse → pan (Story 2.2)
    if (e.button === 1) {
      e.preventDefault();
      this.clearHoveredConnection(); // Story 5.4 — clear hover before pan
      this.startPan(e);
      return;
    }

    // Space + left-click → pan (Story 2.2)
    if (e.button === 0 && this.spaceHeld) {
      e.preventDefault();
      this.clearHoveredConnection(); // Story 5.4 — clear hover before pan
      this.startPan(e);
      return;
    }

    // ── Story 2.3 + 3.6 + 7.1: Left-click on canvas → check hits ──
    if (e.button === 0) {
      this._mouseDownOnCanvas = true;
      const screenPos = vec2(e.clientX, e.clientY);

      // Story 7.1: Check feedback handle hit FIRST (highest priority)
      const feedbackStockId = this.hitTestFeedbackHandle(screenPos);
      if (feedbackStockId) {
        this._feedbackDragStockId = feedbackStockId;
        this.mouseDownPos = screenPos;
        this.canvas.style.cursor = 'grab';
        return;
      }

      const hitId = this.hitTest(screenPos);

      this.mouseDownPos = screenPos;
      this.mouseDownModuleId = hitId;

      if (hitId) {
        // Story 5.4: on any interaction start, clear connection hover
        this.clearHoveredConnection();
      }
    }
  }

  private handleMouseMove(e: MouseEvent): void {
    const current = vec2(e.clientX, e.clientY);
    this.lastScreenPos = current; // Story 5.4 — track for clearHoveredConnection

    // ── Panning (Story 2.2) ─────────────────────────────────────
    if (this.isPanning) {
      const delta = vec2(current.x - this.lastMousePos.x, current.y - this.lastMousePos.y);
      this.viewportManager.panByScreenDelta(delta);
      this.lastMousePos = current;
      return;
    }

    // ── Story 7.1: Feedback handle drag ─────────────────────────
    // Defer drag start until mouse moves beyond DRAG_THRESHOLD_PX
    // so a simple click on the handle selects the parent stock
    if (this._feedbackDragStockId !== null && !this.isDraggingFeedback) {
      if (distance(current, this.mouseDownPos) >= DRAG_THRESHOLD_PX) {
        this.isDraggingFeedback = true;
        this.clearHoveredConnection();
      } else {
        return; // Still waiting for drag threshold
      }
    }

    if (this.isDraggingFeedback && this.feedbackDragStockId) {
      const canvasCenter = this.getCanvasCenter();
      const worldPos = this.viewportManager.screenToWorld(current, canvasCenter);
      this.feedbackDragWorldPosition = worldPos;
      this.canvas.style.cursor = 'grabbing';
      return;
    }

    // ── Story 3.6: Connection edge-drag ─────────────────────────
    if (this.isDraggingConnection && this.edgeDragSourceId) {
      const canvasCenter = this.getCanvasCenter();
      const worldPos = this.viewportManager.screenToWorld(current, canvasCenter);
      this.connectionDragWorldPosition = worldPos;

      // AC2: Per-frame edge-distance-based snap detection
      const snap = this.findSnapTarget(current, worldPos, this.edgeDragSourceId);
      this.snapTargetId = snap?.moduleId ?? null;
      this.snapTargetEdgeWorldPos = snap?.edgeWorldPos ?? null;

      this.onConnectionDragMove?.(this.edgeDragSourceId, worldPos);
      this.canvas.style.cursor = 'crosshair';
      return;
    }

    // ── Module drag (Story 2.3) ─────────────────────────────────
    if (this.mouseDownModuleId !== null) {
      const dist = distance(current, this.mouseDownPos);
      if (dist >= DRAG_THRESHOLD_PX && !this.isDraggingModule) {
        // Story 5.4: clear hover when module drag starts
        this.clearHoveredConnection();
        // Start dragging
        this.isDraggingModule = true;
        this.dragModuleId = this.mouseDownModuleId;
        // Record world position at drag start
        const nodes = this.nodesProvider?.();
        if (nodes && this.dragModuleId) {
          const node = nodes[this.dragModuleId];
          if (node) {
            this.dragModuleWorldStart = vec2(node.position.x, node.position.y);
          }
        }
        // Fire drag-start callback (e.g. for history snapshot)
        if (this.dragModuleId) {
          this.onModuleDragStart?.(this.dragModuleId);
        }
      }

      if (this.isDraggingModule && this.dragModuleId && this.dragModuleWorldStart) {
        // Compute new world position
        const canvasCenter = this.getCanvasCenter();
        const worldPos = this.viewportManager.screenToWorld(current, canvasCenter);
        // Fire move callback for real-time visual feedback
        this.onModuleMove?.(this.dragModuleId, this.dragModuleWorldStart, worldPos);
        this.canvas.style.cursor = 'grabbing';
      }
    }

    // ── Story 7.1: Feedback handle hover detection ──────────────
    // Track which stock's feedback handle the cursor is near (for opacity change)
    if (
      !this.isPanning &&
      !this.isDraggingModule &&
      !this.isDraggingConnection &&
      !this.isDraggingFeedback &&
      this.mouseDownModuleId === null
    ) {
      const prevHovered = this._feedbackHandleHoveredStockId;
      this._feedbackHandleHoveredStockId = this.hitTestFeedbackHandle(current);
      if (this._feedbackHandleHoveredStockId !== prevHovered) {
        this.onFeedbackHandleHover?.(this._feedbackHandleHoveredStockId, current);
      }
    }

    // ── Story 8.2: Diamond & Handle hover detection ─────────────
    // Only when a module is selected and the user is idle.
    // Fires onDiamondHover / onHandleHover on state transition.
    if (
      !this.isPanning &&
      !this.isDraggingModule &&
      !this.isDraggingConnection &&
      !this.isDraggingFeedback &&
      this.mouseDownModuleId === null &&
      this.selectedModuleIdProvider?.() != null
    ) {
      // PATCH-2 fix: only report hover for the selected module
      const selectedId = this.selectedModuleIdProvider?.();

      // Diamond hover
      const rawDiamondHit = this.hitTestConnectionPointInstance(current);
      const diamondHit = (rawDiamondHit && rawDiamondHit.moduleId === selectedId)
        ? rawDiamondHit
        : null;
      const prevDiamond = this.hoveredDiamond;
      if (
        diamondHit?.moduleId !== prevDiamond?.moduleId ||
        diamondHit?.edge !== prevDiamond?.edge
      ) {
        this.hoveredDiamond = diamondHit;
        this.onDiamondHover?.(
          diamondHit?.moduleId ?? null,
          diamondHit?.edge ?? null,
          current,
        );
      }

      // Handle hover
      const rawHandleHit = this.hitTestResizeHandleInstance(current);
      const handleHit = (rawHandleHit && rawHandleHit.moduleId === selectedId)
        ? rawHandleHit
        : null;
      const prevHandle = this.hoveredHandle;
      if (
        handleHit?.moduleId !== prevHandle?.moduleId ||
        handleHit?.corner !== prevHandle?.corner
      ) {
        this.hoveredHandle = handleHit;
        this.onHandleHover?.(
          handleHit?.moduleId ?? null,
          handleHit?.corner ?? null,
          current,
        );
      }
    }

    // ── Story 5.4: Connection hover detection ───────────────────
    // Only run when user is idle (not panning, not dragging, not
    // mousedown on a module).  Fires onConnectionHover when the
    // hovered connection changes.
    if (
      !this.isPanning &&
      !this.isDraggingModule &&
      !this.isDraggingConnection &&
      this.mouseDownModuleId === null
    ) {
      let hoveredId = this.hitTestConnection(current);
      // Story 5.4: suppress non-renderable connections (coincident endpoints)
      if (hoveredId && !this.isConnectionRenderable(hoveredId)) {
        hoveredId = null;
      }
      if (hoveredId !== this.hoveredConnectionId) {
        this.hoveredConnectionId = hoveredId;
        this.onConnectionHover?.(hoveredId, current);
      }
    }
  }

  private handleMouseUp(e: MouseEvent): void {
    // Middle-mouse release → stop pan
    if (e.button === 1) {
      this.stopPan();
      return;
    }

    // Left-click release while space-panning
    if (e.button === 0 && this.isPanning) {
      this.stopPan();
      return;
    }

    // ── Story 7.1: Feedback handle drag release ─────────────────
    if (e.button === 0 && this._feedbackDragStockId !== null && !this.isDraggingFeedback) {
      // Click on feedback handle without drag → select the parent stock
      this.onModuleSelect?.(this._feedbackDragStockId);
      this._feedbackDragStockId = null;
      this._feedbackHandleHoveredStockId = null;
      this.canvas.style.cursor = '';
      return;
    }

    if (e.button === 0 && this.isDraggingFeedback && this.feedbackDragStockId) {
      const stockId = this.feedbackDragStockId;
      const screenPos = vec2(e.clientX, e.clientY);
      const hitId = this.hitTest(screenPos);

      // If released over a source node, create feedback connection
      if (hitId) {
        const nodes = this.nodesProvider?.();
        if (nodes && nodes[hitId]?.type === 'source') {
          this.onFeedbackDragEnd?.(stockId, hitId);
        }
      }

      this.isDraggingFeedback = false;
      this._feedbackDragStockId = null;
      this._feedbackHandleHoveredStockId = null;
      this.feedbackDragWorldPosition = null;
      this.canvas.style.cursor = '';
      return;
    }

    // ── Story 3.6: Connection edge-drag release ─────────────────
    if (e.button === 0 && this.isDraggingConnection && this.edgeDragSourceId) {
      const sourceId = this.edgeDragSourceId;
      const screenPos = vec2(e.clientX, e.clientY);
      const targetId = this.hitTest(screenPos);

      // AC6: only create connection if target is different from source
      if (targetId && targetId !== sourceId) {
        this.onConnectionDragEnd?.(sourceId, targetId);
      } else {
        this.onConnectionDragCancel?.();
      }

      this.isDraggingConnection = false;
      this.edgeDragSourceId = null;
      this.connectionDragWorldPosition = null;
      this.connectionDragSourceId = null;
      this.snapTargetId = null;
      this.snapTargetEdgeWorldPos = null;
      this.mouseDownModuleId = null;
      this.canvas.style.cursor = '';
      return;
    }

    // ── Story 2.3: Module click / drag release ──────────────────
    if (e.button === 0) {
      // Guard: ignore mouseup if the mousedown did not originate on the
      // canvas (e.g. click on sidebar panels). Without this, a click on
      // the rate-editor input fires onModuleSelect(null) and hides the form.
      if (!this._mouseDownOnCanvas) return;
      this._mouseDownOnCanvas = false;

      if (this.isDraggingModule) {
        // Drag finished — fire end callback with final position
        const moduleId = this.dragModuleId;
        const fromWorld = this.dragModuleWorldStart;
        if (moduleId && fromWorld) {
          const canvasCenter = this.getCanvasCenter();
          const toWorld = this.viewportManager.screenToWorld(
            vec2(e.clientX, e.clientY),
            canvasCenter,
          );
          this.onModuleDragEnd?.(moduleId, fromWorld, toWorld);
        }
        this.isDraggingModule = false;
        this.dragModuleId = null;
        this.dragModuleWorldStart = null;
        this.mouseDownModuleId = null;
        this.canvas.style.cursor = '';
        return;
      }

      // Was a click (not a drag)
      if (this.mouseDownModuleId !== null) {
        const screenPos = vec2(e.clientX, e.clientY);
        const hitId = this.hitTest(screenPos);
        // Only treat as a select if we're still on the same module
        if (hitId === this.mouseDownModuleId) {
          // ── Story 5.3: Double-click detection ──────────────────
          const now = performance.now();
          if (
            this.onModuleDoubleClick &&
            this.lastClickModuleId === hitId &&
            now - this.lastClickTime <= DOUBLE_CLICK_WINDOW_MS &&
            distance(screenPos, this.lastClickScreenPos) <= DOUBLE_CLICK_MAX_PX
          ) {
            this.onModuleDoubleClick(hitId);
            // Reset last-click to prevent triple-click being treated as two double-clicks
            this.lastClickModuleId = null;
            this.lastClickTime = 0;
          } else {
            // Not a double-click — record as last click for future double-click check
            this.lastClickModuleId = hitId;
            this.lastClickTime = now;
            this.lastClickScreenPos = screenPos;

            // Story 3.7: connection hit-test BEFORE module (thin lines need priority)
            const connId = this.hitTestConnection(screenPos);
            if (connId) {
              this.onConnectionSelect?.(connId);
            } else {
              this.onModuleSelect?.(hitId);
              // PATCH-1a fix: reset selection-scoped state on selection change
              // (clicking a different module also needs reset, not just deselect)
              this.resetSelectionState();
            }
          }
        } else {
          // Click on empty space — reset double-click tracking
          this.lastClickModuleId = null;
          this.lastClickTime = 0;

          const connId = this.hitTestConnection(screenPos);
          if (connId) {
            this.onConnectionSelect?.(connId);
          } else {
            this.onModuleSelect?.(null);
            // PATCH-1+3 fix: reset selection-scoped state on mouse deselect
            this.resetSelectionState();
          }
        }
      } else {
        // Clicked empty space initially — reset double-click tracking
        this.lastClickModuleId = null;
        this.lastClickTime = 0;

        const screenPos = vec2(e.clientX, e.clientY);
        const connId = this.hitTestConnection(screenPos);
        if (connId) {
          this.onConnectionSelect?.(connId);
        } else {
          // Story 6.5: Click-to-place — only when truly nothing is hit
          // Guard: require click (not drag) — threshold matches DOUBLE_CLICK_MAX_PX
          const clickDist = this.mouseDownPos ? distance(screenPos, this.mouseDownPos) : 0;
          if (clickDist <= DOUBLE_CLICK_MAX_PX) {
            const canvasCenter = this.getCanvasCenter();
            const worldPos = this.viewportManager.screenToWorld(screenPos, canvasCenter);
            this.onCanvasClickEmpty?.(worldPos);
          }
          this.onModuleSelect?.(null);
            // PATCH-1+3 fix: reset selection-scoped state on mouse deselect
            this.resetSelectionState();
        }
      }

      // Reset tracking
      this.mouseDownModuleId = null;
    }
  }

  // -------------------------------------------------------------------
  // Pan helpers
  // -------------------------------------------------------------------

  private startPan(e: MouseEvent): void {
    this.isPanning = true;
    this.lastMousePos = vec2(e.clientX, e.clientY);
    this.canvas.style.cursor = 'grabbing';
  }

  private stopPan(): void {
    this.isPanning = false;
    this.canvas.style.cursor = '';
  }

  // -------------------------------------------------------------------
  // Wheel — Zoom (Story 2.2)
  // -------------------------------------------------------------------

  private handleWheel(e: WheelEvent): void {
    e.preventDefault();

    // deltaY > 0: scroll down → zoom out (factor < 1)
    // deltaY < 0: scroll up → zoom in (factor > 1)
    const factor = e.deltaY > 0 ? 0.9 : 1.1;

    const mousePos = vec2(e.clientX, e.clientY);
    const canvasCenter = this.getCanvasCenter();

    this.viewportManager.zoomAtScreenPoint(factor, mousePos, canvasCenter);
  }

  // -------------------------------------------------------------------
  // Keyboard
  // -------------------------------------------------------------------

  private handleKeyDown(e: KeyboardEvent): void {
    // Don't intercept keystrokes when the user is typing in a text input
    if (isEditingTarget(e.target)) return;

    // Space → pan mode hint
    if (e.code === 'Space') {
      e.preventDefault();
      if (!this.spaceHeld) {
        this.spaceHeld = true;
        if (!this.isPanning && !this.isDragging) {
          this.canvas.style.cursor = 'grab';
        }
      }
      return;
    }

    // ── Escape → cancel active drag, then deselect if idle ──────
    if (e.code === 'Escape') {
      const wasDragging = this.isDragging || this._feedbackDragStockId !== null;
      if (this.isDraggingFeedback || this._feedbackDragStockId !== null) {
        this.cancelFeedbackDrag();
      }
      if (this.isDraggingModule) {
        this.cancelDrag();
      }
      if (this.isDraggingConnection) {
        this.cancelConnectionDrag();
      }
      // AC10: If no drag was active and a module is selected, deselect
      if (!wasDragging && this.selectedModuleIdProvider?.() != null) {
        this.onModuleSelect?.(null);
        // Reset selection-scoped state on deselect (PATCH-1+3 fix)
        this.resetSelectionState();
      }
      return;
    }

    // ── Story 3.5 + Story 8.2: Tab → cycle to next module (only when selected) ──
    if (e.code === 'Tab') {
      e.preventDefault();
      if (this.isDragging) return;
      if (this.selectedModuleIdProvider?.() != null) {
        this.onTabNext?.();
      }
      return;
    }

    // ── Story 3.5: Arrow keys → nudge selected module (AC2) ───
    if (e.code === 'ArrowUp' || e.code === 'ArrowDown' || e.code === 'ArrowLeft' || e.code === 'ArrowRight') {
      e.preventDefault();
      if (this.isDragging) return;
      const dirMap: Record<string, 'up' | 'down' | 'left' | 'right'> = {
        ArrowUp: 'up',
        ArrowDown: 'down',
        ArrowLeft: 'left',
        ArrowRight: 'right',
      };
      this.onModuleNudge?.(dirMap[e.code]);
      return;
    }

    // ── Story 3.5 + Story 8.2: Enter → edit name (selected) or place module (idle) ─
    // PATCH-5 fix: when a module is selected, Enter NEVER places a new module (AC9)
    if (e.code === 'Enter') {
      e.preventDefault();
      if (this.isDragging) return;
      if (this.selectedModuleIdProvider?.() != null) {
        if (!this.isEditingName) {
          this.isEditingName = true;
        }
        // When a module is selected, Enter NEVER places a new module (AC9)
        // If already editing, this Enter is consumed by the name input (Story 8.4)
      } else {
        // IDLE state: V1.0 behavior preserved
        this.onModulePlaceAtCenter?.();
      }
      return;
    }

    // ── Story 2.3 + 3.7: Delete → delete selected module or connection ──
    if (e.code === 'Delete' || e.code === 'Backspace') {
      e.preventDefault();
      if (this.isDragging) return;
      // Story 3.7: Delete selected item.
      // Both callbacks are called — each is self-guarding (checks its own
      // selection state and returns early if nothing is selected). Due to
      // mutual exclusivity of selection, at most one deletion fires per keypress.
      if (this.onConnectionDelete) {
        this.onConnectionDelete();
      }
      if (this.onModuleDelete) {
        this.onModuleDelete();
      }
    }
  }

  private handleKeyUp(e: KeyboardEvent): void {
    // Don't intercept keystrokes when the user is typing in a text input
    if (isEditingTarget(e.target)) return;

    if (e.code === 'Space') {
      this.spaceHeld = false;
      if (!this.isPanning && !this.isDragging) {
        this.canvas.style.cursor = '';
      }
    }
  }

  // -------------------------------------------------------------------
  // Context menu prevention
  // -------------------------------------------------------------------

  private handleContextMenu(e: Event): void {
    e.preventDefault();
  }

  // -------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------

  /** Get the center of the scene canvas in pixel coordinates. */
  private getCanvasCenter(): Vec2 {
    return vec2(this.canvas.clientWidth / 2, this.canvas.clientHeight / 2);
  }

  // -------------------------------------------------------------------
  // Drag cancellation
  // -------------------------------------------------------------------

  /**
   * Cancel an active module drag without firing `onModuleDragEnd`.
   *
   * Called when Ctrl+Z/Shift+Ctrl+Z undoes/redoes state while the user
   * is mid-drag.  Without this, `dragModuleId` and `dragModuleWorldStart`
   * would reference stale state after the undo/redo replaces `currentState`.
   */
  public cancelDrag(): void {
    this.isDraggingModule = false;
    this.dragModuleId = null;
    this.dragModuleWorldStart = null;
    this.mouseDownModuleId = null;
    this._mouseDownOnCanvas = false;
    if (this.isDraggingConnection) {
      this.cancelConnectionDrag();
    }
    this.canvas.style.cursor = '';
  }

  /**
   * Story 7.1 — Cancel an active feedback handle drag.
   */
  private cancelFeedbackDrag(): void {
    this.isDraggingFeedback = false;
    this._feedbackDragStockId = null;
    this._feedbackHandleHoveredStockId = null;
    this.feedbackDragWorldPosition = null;
    this.onFeedbackDragCancel?.();
    this.canvas.style.cursor = '';
  }

  /**
   * Story 3.6 — Cancel an active connection edge-drag without creating a connection.
   */
  private cancelConnectionDrag(): void {
    this.isDraggingConnection = false;
    this.edgeDragSourceId = null;
    this.connectionDragWorldPosition = null;
    this.connectionDragSourceId = null;
    this.snapTargetId = null;
    this.snapTargetEdgeWorldPos = null;
    this.mouseDownModuleId = null;
    this.onConnectionDragCancel?.();
    this.canvas.style.cursor = '';
  }
}
