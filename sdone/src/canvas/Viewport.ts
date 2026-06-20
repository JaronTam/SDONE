import type { Vec2 } from '../shared/Vec2.js';
import { vec2 } from '../shared/Vec2.js';

/**
 * Current viewport (camera) state for the infinite canvas.
 *
 * The viewport maps world/model coordinates to screen pixel coordinates:
 *   screen = (world − offset) × zoom
 *   world  = screen / zoom + offset
 */
export interface Viewport {
  /** Camera position in world coordinates (what point is at the canvas center). */
  offset: Vec2;
  /** Zoom level. 1.0 = 100 % scale. Clamped to [MIN_ZOOM, MAX_ZOOM]. */
  zoom: number;
}

/** Minimum zoom level (0.1× = 10 % scale). */
export const MIN_ZOOM = 0.1;

/** Maximum zoom level (5× = 500 % scale). */
export const MAX_ZOOM = 5.0;

/** Default viewport: centered at origin, 100 % scale. */
export const DEFAULT_VIEWPORT: Viewport = {
  offset: vec2(0, 0),
  zoom: 1.0,
};

/**
 * Manages the viewport (camera) state for pan/zoom operations.
 *
 * All coordinate transformations are pure math — no DOM or canvas dependencies.
 * The manager stores the mutable viewport state and provides convenience methods
 * for screen ↔ world coordinate conversion.
 */
export class ViewportManager {
  /** Current viewport state. Mutated internally by pan/zoom/reset. */
  private _viewport: Viewport;

  /** Read-only access to the current viewport state. */
  public get viewport(): Viewport {
    return this._viewport;
  }

  constructor(initial?: Partial<Viewport>) {
    this._viewport = {
      offset: initial?.offset ?? vec2(0, 0),
      zoom: initial?.zoom ?? 1.0,
    };
  }

  // -------------------------------------------------------------------
  // Coordinate Transformations
  // -------------------------------------------------------------------

  /**
   * Convert screen (canvas pixel) coordinates to world coordinates.
   *
   * Formula: world = screen / zoom + offset
   *
   * @param screenPos — pixel position on the canvas element.
   * @param canvasCenter — center of the canvas in pixels (clientWidth/2, clientHeight/2).
   *   This is needed because the viewport offset refers to what's at the *center*
   *   of the canvas, not the top-left corner.
   * @returns World-space position.
   */
  screenToWorld(screenPos: Vec2, canvasCenter: Vec2): Vec2 {
    // Screen space relative to canvas center (top-left origin)
    const relX = screenPos.x - canvasCenter.x;
    const relY = screenPos.y - canvasCenter.y;
    // Undo zoom + offset
    return vec2(
      relX / this.viewport.zoom + this.viewport.offset.x,
      relY / this.viewport.zoom + this.viewport.offset.y,
    );
  }

  /**
   * Convert world coordinates to screen (canvas pixel) coordinates.
   *
   * Formula: screen = (world − offset) × zoom + canvasCenter
   */
  worldToScreen(worldPos: Vec2, canvasCenter: Vec2): Vec2 {
    return vec2(
      (worldPos.x - this.viewport.offset.x) * this.viewport.zoom + canvasCenter.x,
      (worldPos.y - this.viewport.offset.y) * this.viewport.zoom + canvasCenter.y,
    );
  }

  // -------------------------------------------------------------------
  // Pan
  // -------------------------------------------------------------------

  /**
   * Pan the viewport by a delta in screen pixels.
   *
   * Since the viewport offset is in world coordinates and zoomed, we scale
   * the pixel delta down by zoom to get the world-space delta.
   *
   * Pan direction: dragging right (positive screen dx) should move the
   * camera right, which means the world content shifts left relative to the
   * view. So we SUBTRACT the world delta from offset.
   */
  panByScreenDelta(screenDelta: Vec2): void {
    const worldDeltaX = screenDelta.x / this.viewport.zoom;
    const worldDeltaY = screenDelta.y / this.viewport.zoom;
    this.viewport.offset = vec2(
      this.viewport.offset.x - worldDeltaX,
      this.viewport.offset.y - worldDeltaY,
    );
  }

  // -------------------------------------------------------------------
  // Zoom
  // -------------------------------------------------------------------

  /**
   * Zoom toward/away from a specific screen point.
   *
   * The zoom origin = mouse position stays fixed in world space. This is the
   * standard "zoom toward mouse" behavior.
   *
   * @param factor — multiplier applied to current zoom (e.g. 1.1 for zoom-in).
   * @param originScreen — the screen position that should stay fixed (typically the mouse).
   * @param canvasCenter — center of the canvas in pixels.
   */
  zoomAtScreenPoint(factor: number, originScreen: Vec2, canvasCenter: Vec2): void {
    const oldZoom = this.viewport.zoom;
    const newZoom = this.clampZoom(oldZoom * factor);

    if (newZoom === oldZoom) return;

    // World point under the mouse before zoom
    const worldUnderMouse = this.screenToWorld(originScreen, canvasCenter);

    // Apply new zoom
    this.viewport.zoom = newZoom;

    // Adjust offset so that the world point under the mouse stays at the same screen position.
    // After zoom: screenPos = (world − offset') × newZoom + center
    // We want screenPos == originScreen for worldUnderMouse.
    // So: originScreen.x = (worldUnderMouse.x − offset'.x) × newZoom + center.x
    // ⇒ offset'.x = worldUnderMouse.x − (originScreen.x − center.x) / newZoom
    this.viewport.offset = vec2(
      worldUnderMouse.x - (originScreen.x - canvasCenter.x) / newZoom,
      worldUnderMouse.y - (originScreen.y - canvasCenter.y) / newZoom,
    );
  }

  // -------------------------------------------------------------------
  // Reset
  // -------------------------------------------------------------------

  /** Reset viewport to default (zoom 1×, centered at origin). */
  reset(): void {
    this.viewport.offset = vec2(0, 0);
    this.viewport.zoom = 1.0;
  }

  /**
   * Apply a 2D canvas transform for this viewport.
   *
   * Call this at the start of each frame before drawing world-space content.
   * The transform maps world coordinates to canvas pixel coordinates.
   *
   * @param ctx — the 2D rendering context of the scene canvas.
   * @param canvasCenter — center of the canvas in pixels.
   */
  applyTransform(ctx: CanvasRenderingContext2D, canvasCenter: Vec2): void {
    const { offset, zoom } = this.viewport;
    // Translate to canvas center (origin for the viewport), then scale by zoom,
    // then translate by -offset to move the camera.
    ctx.setTransform(
      zoom, // a — horizontal scaling
      0, // b — horizontal skew
      0, // c — vertical skew
      zoom, // d — vertical scaling
      canvasCenter.x - offset.x * zoom, // e — horizontal translation
      canvasCenter.y - offset.y * zoom, // f — vertical translation
    );
  }

  // -------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------

  private clampZoom(z: number): number {
    return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));
  }
}
