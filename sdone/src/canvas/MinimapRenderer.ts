import type { Connection, ModuleNode, ModuleType } from '../state/GraphState.js';
import type { ViewportManager } from './Viewport.js';
import type { Vec2 } from '../shared/Vec2.js';

// ── Minimap constants ──────────────────────────────────────────────────
const MINIMAP_WIDTH = 200;
const MINIMAP_HEIGHT = 150;
const MODULE_DOT_RADIUS = 3;
const VIEWPORT_FILL = 'rgba(100, 150, 255, 0.15)';
const VIEWPORT_STROKE = 'rgba(100, 150, 255, 0.5)';
const VIEWPORT_LINE_WIDTH = 1;
const BACKGROUND_COLOR = '#1e1e2e';
const WORLD_PADDING = 50;
const MIN_WORLD_RANGE = 100;

// ── Module dot colors (semantic, from Story 2.3 / UX-DR3) ──────────────
const SOURCE_COLOR = '#90EE90';
const STOCK_COLOR = '#FFFFFF';
const SINK_COLOR = '#8B0000';
const FALLBACK_COLOR = '#888888';

// Dot border for contrast against dark background
const DOT_BORDER_COLORS: Record<string, string> = {
  source: '#5da55d',
  stock: '#aaaaaa',
  sink: '#5a0000',
};
const DOT_FALLBACK_BORDER = '#666666';

/**
 * MinimapRenderer — scaled scene overview in the bottom-right corner.
 *
 * Renders module dots and a viewport rectangle onto a dedicated 200×150 px
 * `<canvas id="minimap">`.  Uses a lightweight continuous rAF loop with
 * hash-based change detection (O(1) per frame) to avoid repainting a static
 * scene (AC 3 — Idle rendering).
 *
 * Story 2.5 — Minimap: Scaled Scene Overview
 * Story 3.2 — Ghost preview + connections list support.
 */
export class MinimapRenderer {
  private readonly minimapCanvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly viewportManager: ViewportManager;
  private readonly sceneCanvas: HTMLCanvasElement;

  /** Callback that returns live module map. Set by main.ts after construction. */
  public nodesProvider: (() => Record<string, ModuleNode>) | null = null;

  /** Story 3.2 — Connections provider for minimap rendering. */
  public connectionsProvider: (() => Connection[]) | null = null;

  /** Story 3.2 — Ghost preview provider for drag-and-drop preview. */
  public ghostProvider: (() => { moduleType: ModuleType; worldPosition: Vec2 } | null) | null =
    null;

  private rafId: number | null = null;
  private stopped = false;
  private lastVpHash = '';
  private lastNodesHash = '';
  private lastGhostHash = '';

  /** External consumers call this when modules change. */
  public markDirty(): void {
    this.lastVpHash = ''; // force next loop to repaint
    this.lastNodesHash = '';
    this.lastGhostHash = '';
  }

  constructor(
    minimapCanvas: HTMLCanvasElement,
    viewportManager: ViewportManager,
    sceneCanvas: HTMLCanvasElement,
  ) {
    this.minimapCanvas = minimapCanvas;
    this.viewportManager = viewportManager;
    this.sceneCanvas = sceneCanvas;

    const ctx = minimapCanvas.getContext('2d');
    if (!ctx) {
      throw new Error('MinimapRenderer: Cannot acquire 2D rendering context for minimap canvas.');
    }
    this.ctx = ctx;
  }

  // --------------------------------------------------------------------
  // Lifecycle
  // --------------------------------------------------------------------

  /** Start the lightweight hash-check rAF loop. No-op if already running. */
  start(): void {
    if (this.rafId !== null) return;
    this.stopped = false;
    this.loop();
  }

  /** Stop the rAF loop. */
  stop(): void {
    this.stopped = true;
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  /** Stop the loop and release all references. */
  destroy(): void {
    this.stop();
    this.nodesProvider = null;
    this.connectionsProvider = null;
    this.ghostProvider = null;
  }

  // --------------------------------------------------------------------
  // Loop — AC 3 Idle Rendering (no wasted frames)
  // --------------------------------------------------------------------

  private loop(): void {
    const vp = this.viewportManager.viewport;
    const vpHash = `${vp.offset.x},${vp.offset.y},${vp.zoom}`;

    const nodes = this.nodesProvider ? this.nodesProvider() : {};
    const nodesHash = this.computeNodesHash(nodes);

    const ghost = this.ghostProvider ? this.ghostProvider() : null;
    const ghostHash = ghost
      ? `${ghost.moduleType}:${ghost.worldPosition.x}:${ghost.worldPosition.y}`
      : '';

    if (
      vpHash !== this.lastVpHash ||
      nodesHash !== this.lastNodesHash ||
      ghostHash !== this.lastGhostHash
    ) {
      this.lastVpHash = vpHash;
      this.lastNodesHash = nodesHash;
      this.lastGhostHash = ghostHash;
      this.paint(nodes, ghost);
    }

    if (!this.stopped) {
      this.rafId = requestAnimationFrame(() => this.loop());
    }
  }

  /**
   * Compute a stable hash string from module positions/count for cheap
   * change detection.  Avoids deep object comparisons every frame.
   */
  private computeNodesHash(nodes: Record<string, ModuleNode>): string {
    const keys = Object.keys(nodes);
    if (keys.length === 0) return '0';

    // Sort keys for deterministic hash
    keys.sort();
    const parts: string[] = [String(keys.length)];
    for (const k of keys) {
      const n = nodes[k];
      parts.push(`${k}:${n.type}:${n.position.x}:${n.position.y}`);
    }
    return parts.join('|');
  }

  // --------------------------------------------------------------------
  // Paint — AC 1, 2, 5
  // --------------------------------------------------------------------

  private paint(
    nodes: Record<string, ModuleNode>,
    ghost: { moduleType: string; worldPosition: Vec2 } | null,
  ): void {
    const { ctx } = this;
    const w = this.minimapCanvas.width;
    const h = this.minimapCanvas.height;

    if (w === 0 || h === 0) return; // canvas not yet laid out

    // ── Clear & background ──
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = BACKGROUND_COLOR;
    ctx.fillRect(0, 0, w, h);

    // ── Compute world bounds ──
    const moduleList = Object.values(nodes);
    let minX = Infinity,
      maxX = -Infinity;
    let minY = Infinity,
      maxY = -Infinity;

    // Include ghost in world bounds if present
    if (ghost) {
      if (ghost.worldPosition.x < minX) minX = ghost.worldPosition.x;
      if (ghost.worldPosition.x > maxX) maxX = ghost.worldPosition.x;
      if (ghost.worldPosition.y < minY) minY = ghost.worldPosition.y;
      if (ghost.worldPosition.y > maxY) maxY = ghost.worldPosition.y;
    }

    if (moduleList.length > 0) {
      for (const node of moduleList) {
        if (node.position.x < minX) minX = node.position.x;
        if (node.position.x > maxX) maxX = node.position.x;
        if (node.position.y < minY) minY = node.position.y;
        if (node.position.y > maxY) maxY = node.position.y;
      }

      // Add padding
      minX -= WORLD_PADDING;
      maxX += WORLD_PADDING;
      minY -= WORLD_PADDING;
      maxY += WORLD_PADDING;

      // Guard against zero-width/height (single module or all at same pos)
      if (maxX - minX < 1) {
        minX -= MIN_WORLD_RANGE / 2;
        maxX += MIN_WORLD_RANGE / 2;
      }
      if (maxY - minY < 1) {
        minY -= MIN_WORLD_RANGE / 2;
        maxY += MIN_WORLD_RANGE / 2;
      }
    } else if (!ghost) {
      // Zero modules — default range (AC 7 edge case)
      minX = -200;
      maxX = 200;
      minY = -200;
      maxY = 200;
    } else {
      // Only ghost present — center on ghost
      minX = ghost.worldPosition.x - MIN_WORLD_RANGE / 2;
      maxX = ghost.worldPosition.x + MIN_WORLD_RANGE / 2;
      minY = ghost.worldPosition.y - MIN_WORLD_RANGE / 2;
      maxY = ghost.worldPosition.y + MIN_WORLD_RANGE / 2;
    }

    // ── Uniform scale (AC 5 — no distortion) ──
    const scaleX = MINIMAP_WIDTH / (maxX - minX);
    const scaleY = MINIMAP_HEIGHT / (maxY - minY);
    const scale = Math.min(scaleX, scaleY);

    // World center for centering on minimap
    const worldCenterX = (minX + maxX) / 2;
    const worldCenterY = (minY + maxY) / 2;

    const worldToMinimap = (wx: number, wy: number): { x: number; y: number } => ({
      x: (wx - worldCenterX) * scale + w / 2,
      y: (wy - worldCenterY) * scale + h / 2,
    });

    // ── Draw module dots (AC 1) ──
    for (const [, node] of Object.entries(nodes)) {
      const mp = worldToMinimap(node.position.x, node.position.y);

      // Skip dots outside minimap bounds (tiny performance win)
      if (
        mp.x < -MODULE_DOT_RADIUS ||
        mp.x > w + MODULE_DOT_RADIUS ||
        mp.y < -MODULE_DOT_RADIUS ||
        mp.y > h + MODULE_DOT_RADIUS
      ) {
        continue;
      }

      const fillColor = this.getDotFillColor(node);
      const borderColor = this.getDotBorderColor(node);

      ctx.fillStyle = fillColor;
      ctx.beginPath();
      ctx.arc(mp.x, mp.y, MODULE_DOT_RADIUS, 0, Math.PI * 2);
      ctx.fill();

      // Optional 0.5px border for visibility (especially white stock dots)
      ctx.strokeStyle = borderColor;
      ctx.lineWidth = 0.5;
      ctx.stroke();
    }

    // ── Story 3.2: Draw ghost preview dot (semi-transparent pulsing) ──
    if (ghost) {
      const gp = worldToMinimap(ghost.worldPosition.x, ghost.worldPosition.y);
      const ghostFillColor = this.getGhostDotColor(ghost.moduleType);

      ctx.fillStyle = ghostFillColor;
      ctx.globalAlpha = 0.5;
      ctx.beginPath();
      ctx.arc(gp.x, gp.y, MODULE_DOT_RADIUS + 1, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1.0;

      // Thin dashed ring for extra visibility
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
      ctx.lineWidth = 0.5;
      ctx.setLineDash([2, 2]);
      ctx.beginPath();
      ctx.arc(gp.x, gp.y, MODULE_DOT_RADIUS + 2, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // ── Draw viewport rectangle (AC 2) ──
    // TODO: Story 3.x — wire viewport rectangle drag interaction here
    const sceneW = this.sceneCanvas.clientWidth;
    const sceneH = this.sceneCanvas.clientHeight;

    if (sceneW > 0 && sceneH > 0) {
      const cx = sceneW / 2;
      const cy = sceneH / 2;

      const topLeft = this.viewportManager.screenToWorld({ x: 0, y: 0 }, { x: cx, y: cy });
      const bottomRight = this.viewportManager.screenToWorld(
        { x: sceneW, y: sceneH },
        { x: cx, y: cy },
      );

      const tl = worldToMinimap(topLeft.x, topLeft.y);
      const br = worldToMinimap(bottomRight.x, bottomRight.y);

      const vpMinX = Math.min(tl.x, br.x);
      const vpMinY = Math.min(tl.y, br.y);
      let vpW = Math.abs(br.x - tl.x);
      let vpH = Math.abs(br.y - tl.y);

      // Enforce minimum 2×2 pixels on minimap for extreme zoom levels (AC 7)
      if (vpW < 2) vpW = 2;
      if (vpH < 2) vpH = 2;

      ctx.fillStyle = VIEWPORT_FILL;
      ctx.strokeStyle = VIEWPORT_STROKE;
      ctx.lineWidth = VIEWPORT_LINE_WIDTH;
      ctx.fillRect(vpMinX, vpMinY, vpW, vpH);
      ctx.strokeRect(vpMinX, vpMinY, vpW, vpH);
    }
  }

  // --------------------------------------------------------------------
  // Dot color helpers
  // --------------------------------------------------------------------

  private getDotFillColor(node: ModuleNode): string {
    switch (node.type) {
      case 'source':
      case 'sink':
        return (
          (
            node as
              | import('../state/GraphState.js').SourceNode
              | import('../state/GraphState.js').SinkNode
          ).color ?? (node.type === 'source' ? SOURCE_COLOR : SINK_COLOR)
        );
      case 'stock':
        return STOCK_COLOR;
      default:
        return FALLBACK_COLOR;
    }
  }

  private getDotBorderColor(node: ModuleNode): string {
    return DOT_BORDER_COLORS[node.type] ?? DOT_FALLBACK_BORDER;
  }

  private getGhostDotColor(moduleType: string): string {
    switch (moduleType) {
      case 'source':
        return SOURCE_COLOR;
      case 'stock':
        return STOCK_COLOR;
      case 'sink':
        return SINK_COLOR;
      default:
        return FALLBACK_COLOR;
    }
  }
}
