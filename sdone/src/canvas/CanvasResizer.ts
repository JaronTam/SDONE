/**
 * CanvasResizer — keeps canvas attribute dimensions in sync with layout.
 *
 * Browsers only allocate a pixel buffer matching the `width` / `height`
 * *attributes* on a `<canvas>` element; CSS `width` / `height` merely scales
 * that buffer.  This module listens for `window.resize` and writes the
 * computed client size into the attributes so the canvas always renders at
 * native resolution with no blur.
 *
 * Story 2.1 — Dual Canvas DOM Setup
 */

export class CanvasResizer {
  private readonly sceneCanvas: HTMLCanvasElement;
  private readonly minimapCanvas: HTMLCanvasElement;
  private readonly handle: () => void;

  constructor(sceneCanvas: HTMLCanvasElement, minimapCanvas: HTMLCanvasElement) {
    this.sceneCanvas = sceneCanvas;
    this.minimapCanvas = minimapCanvas;
    this.handle = this.resize.bind(this);

    // Initial sync
    this.resize();

    // Listen for window resize
    window.addEventListener('resize', this.handle);
  }

  /** Update both canvases' attribute dimensions to match their containers. */
  resize(): void {
    this.sync(this.sceneCanvas);
    this.sync(this.minimapCanvas);
  }

  /** Remove the resize listener. Call before disposing. */
  destroy(): void {
    window.removeEventListener('resize', this.handle);
  }

  // -------------------------------------------------------------------
  // Internal helpers
  // -------------------------------------------------------------------

  /**
   * Set `canvas.width` / `canvas.height` to match `clientWidth` / `clientHeight`.
   * The CSS in layout.css sizes the canvas to 100 % of its container, so
   * `clientWidth` always reflects the CSS-computed size of the container.
   */
  private sync(canvas: HTMLCanvasElement): void {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;

    if (w === 0 || h === 0) return; // element not yet laid out

    canvas.width = w;
    canvas.height = h;
  }
}