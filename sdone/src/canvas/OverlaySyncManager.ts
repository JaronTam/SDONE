import type { Vec2 } from '../shared/Vec2.js';
import { vec2 } from '../shared/Vec2.js';
import type { ViewportManager } from './Viewport.js';

/**
 * Computes screen-space positions from world-space module coordinates for DOM overlay positioning.
 *
 * This class is a pure coordinate translator — it has NO DOM dependencies, NO rAF logic,
 * and NO side effects. It only depends on ViewportManager for world→screen transforms.
 *
 * Immutable Boundary #2: zero DOM imports. Only outputs Vec2 coordinates.
 */
export class OverlaySyncManager {
  constructor(private viewport: ViewportManager) {}

  /**
   * Compute the screen-space position where the Toolbar should be rendered.
   *
   * The Toolbar is anchored to the top-center of the module, offset 8px above
   * the module's top edge (UX-D6). This method does NOT access the DOM — it
   * only returns a screen-space Vec2 for the caller to apply via CSS transform.
   *
   * @param moduleWorldCenter — module center position in world coordinates (from node.position)
   * @param moduleHeight — actual module render height in world units (module.height ?? DEFAULT_MODULE_HEIGHT)
   * @param canvasCenter — center of the canvas in screen pixels (clientWidth/2, clientHeight/2)
   * @returns Screen-space position of the module's top-center point. Caller must handle
   *          horizontal centering (e.g., `translate(-50%, 0)` or `transform-origin: center top`).
   *          The returned `{x, y}` is the target point, NOT a complete CSS transform solution.
   */
  getToolbarScreenPosition(
    moduleWorldCenter: Vec2,
    moduleHeight: number,
    canvasCenter: Vec2,
  ): Vec2 {
    const topCenterWorld = vec2(moduleWorldCenter.x, moduleWorldCenter.y - moduleHeight / 2);
    const screen = this.viewport.worldToScreen(topCenterWorld, canvasCenter);
    return vec2(screen.x, screen.y - 8);
  }
}
