import type { Vec2 } from '../shared/Vec2.js';
import { vec2, distance } from '../shared/Vec2.js';
import type { ViewportManager } from '../canvas/Viewport.js';
import type { ModuleNode } from '../state/GraphState.js';
import { getHitRadius } from '../canvas/SceneRenderer.js';

/** Minimum screen-pixel distance before a mousedown becomes a drag. */
const DRAG_THRESHOLD_PX = 4;

/**
 * Returns true if the event target is an editable element (input, textarea,
 * or contentEditable).  We use this to avoid consuming keystrokes (Space,
 * Delete, Backspace) that the user intends for a text field.
 */
function isEditingTarget(target: EventTarget | null): boolean {
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
 *
 * Pan / zoom (unchanged from 2.2):
 *   - Middle-mouse drag → pan
 *   - Space + left-click drag → pan
 *   - Mouse wheel → zoom toward cursor, clamped [0.1×, 5×]
 *
 * Module interaction (Story 2.3):
 *   - Left-click on module → select
 *   - Left-click on empty space → deselect
 *   - Left-click drag on module → move (via onModuleMove callback)
 *   - Delete key → delete selected (via onModuleDelete callback)
 *
 * All module mutations are communicated through callbacks so this
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

  // ── Callbacks (set by main.ts) ────────────────────────────────

  /** Provides current module nodes for hit-testing. */
  public nodesProvider: (() => Record<string, ModuleNode>) | null = null;

  /** Called when user clicks a module (select) or empty space (deselect). */
  public onModuleSelect: ((moduleId: string | null) => void) | null = null;

  /** Called when user finishes dragging a module. Passes world-space positions. */
  public onModuleMove:
    | ((moduleId: string, fromWorld: Vec2, toWorld: Vec2) => void)
    | null = null;

  /** Called when user presses Delete and a module is selected. */
  public onModuleDelete: (() => void) | null = null;

  // ── Bound handlers (for cleanup) ──────────────────────────────
  private readonly boundMouseDown: (e: MouseEvent) => void;
  private readonly boundMouseMove: (e: MouseEvent) => void;
  private readonly boundMouseUp: (e: MouseEvent) => void;
  private readonly boundWheel: (e: WheelEvent) => void;
  private readonly boundKeyDown: (e: KeyboardEvent) => void;
  private readonly boundKeyUp: (e: KeyboardEvent) => void;
  private readonly boundContextMenu: (e: Event) => void;
  private readonly boundWindowBlur: () => void;

  constructor(canvas: HTMLCanvasElement, viewportManager: ViewportManager) {
    this.canvas = canvas;
    this.viewportManager = viewportManager;

    this.boundMouseDown = this.handleMouseDown.bind(this);
    this.boundMouseMove = this.handleMouseMove.bind(this);
    this.boundMouseUp = this.handleMouseUp.bind(this);
    this.boundWheel = this.handleWheel.bind(this);
    this.boundKeyDown = this.handleKeyDown.bind(this);
    this.boundKeyUp = this.handleKeyUp.bind(this);
    this.boundContextMenu = this.handleContextMenu.bind(this);
    this.boundWindowBlur = this.handleWindowBlur.bind(this);

    canvas.addEventListener('mousedown', this.boundMouseDown);
    window.addEventListener('mousemove', this.boundMouseMove);
    window.addEventListener('mouseup', this.boundMouseUp);
    canvas.addEventListener('wheel', this.boundWheel, { passive: false });

    window.addEventListener('keydown', this.boundKeyDown);
    window.addEventListener('keyup', this.boundKeyUp);

    canvas.addEventListener('contextmenu', this.boundContextMenu);

    // Story 2.3: reset held keys on window blur (Alt+Tab safety)
    window.addEventListener('blur', this.boundWindowBlur);
  }

  /** Remove all event listeners. */
  destroy(): void {
    this.canvas.removeEventListener('mousedown', this.boundMouseDown);
    window.removeEventListener('mousemove', this.boundMouseMove);
    window.removeEventListener('mouseup', this.boundMouseUp);
    this.canvas.removeEventListener('wheel', this.boundWheel);
    window.removeEventListener('keydown', this.boundKeyDown);
    window.removeEventListener('keyup', this.boundKeyUp);
    this.canvas.removeEventListener('contextmenu', this.boundContextMenu);
    window.removeEventListener('blur', this.boundWindowBlur);
  }

  // -------------------------------------------------------------------
  // Window blur — Alt+Tab safety (Story 2.3)
  // -------------------------------------------------------------------

  private handleWindowBlur(): void {
    // Release all held state so keys aren't "stuck" after refocus
    this.spaceHeld = false;
    this.isPanning = false;
    this.isDraggingModule = false;
    this.dragModuleId = null;
    this.mouseDownModuleId = null;
    this.canvas.style.cursor = '';
  }

  // -------------------------------------------------------------------
  // Hit-testing helper (Story 2.3)
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

  // -------------------------------------------------------------------
  // Mouse Handlers — Pan + Module Selection / Drag
  // -------------------------------------------------------------------

  private handleMouseDown(e: MouseEvent): void {
    // Middle-mouse → pan (Story 2.2)
    if (e.button === 1) {
      e.preventDefault();
      this.startPan(e);
      return;
    }

    // Space + left-click → pan (Story 2.2)
    if (e.button === 0 && this.spaceHeld) {
      e.preventDefault();
      this.startPan(e);
      return;
    }

    // ── Story 2.3: Left-click on canvas → check for module hit ──
    if (e.button === 0) {
      const screenPos = vec2(e.clientX, e.clientY);
      this.mouseDownPos = screenPos;
      this.mouseDownModuleId = this.hitTest(screenPos);
    }
  }

  private handleMouseMove(e: MouseEvent): void {
    const current = vec2(e.clientX, e.clientY);

    // ── Panning (Story 2.2) ─────────────────────────────────────
    if (this.isPanning) {
      const delta = vec2(current.x - this.lastMousePos.x, current.y - this.lastMousePos.y);
      this.viewportManager.panByScreenDelta(delta);
      this.lastMousePos = current;
      return;
    }

    // ── Module drag (Story 2.3) ─────────────────────────────────
    if (this.mouseDownModuleId !== null) {
      const dist = distance(current, this.mouseDownPos);
      if (dist >= DRAG_THRESHOLD_PX && !this.isDraggingModule) {
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

    // ── Story 2.3: Module click / drag release ──────────────────
    if (e.button === 0) {
      if (this.isDraggingModule) {
        // Drag finished — final position already applied via onModuleMove
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
          this.onModuleSelect?.(hitId);
        } else {
          // Click on empty space → deselect
          this.onModuleSelect?.(null);
        }
      } else {
        // Clicked empty space initially → deselect
        this.onModuleSelect?.(null);
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
        if (!this.isPanning && !this.isDraggingModule) {
          this.canvas.style.cursor = 'grab';
        }
      }
      return;
    }

    // ── Story 2.3: Delete → delete selected module ──────────────
    if (e.code === 'Delete' || e.code === 'Backspace') {
      e.preventDefault();
      this.onModuleDelete?.();
    }
  }

  private handleKeyUp(e: KeyboardEvent): void {
    // Don't intercept keystrokes when the user is typing in a text input
    if (isEditingTarget(e.target)) return;

    if (e.code === 'Space') {
      this.spaceHeld = false;
      if (!this.isPanning && !this.isDraggingModule) {
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
}