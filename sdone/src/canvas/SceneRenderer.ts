import type { Vec2 } from '../shared/Vec2.js';
import { vec2 } from '../shared/Vec2.js';
import type { GraphState, StockNode, SourceNode, SinkNode } from '../state/GraphState.js';
import type { ViewportManager } from './Viewport.js';

// ── Module size constants (exported for InputManager hit-testing) ──────
/** Source cloud circle base radius for the individual circles forming the cloud. */
export const SOURCE_CLOUD_RADIUS = 16;
/** Effective hit-test radius for source (cloud cluster extent). */
export const SOURCE_HIT_RADIUS = SOURCE_CLOUD_RADIUS * 2;
/** Stock rounded-rectangle dimensions (width × height). */
export const STOCK_WIDTH = 120;
export const STOCK_HEIGHT = 80;
export const STOCK_CORNER_RADIUS = 12;
/** Effective hit-test radius for stock (half diagonal). */
export const STOCK_HIT_RADIUS = Math.sqrt(STOCK_WIDTH ** 2 + STOCK_HEIGHT ** 2) / 2;
/** Sink infinity-shape bounding radius. */
export const SINK_RADIUS = 24;
/** Effective hit-test radius for sink. */
export const SINK_HIT_RADIUS = SINK_RADIUS;

/** How far beyond the module edge the selection glow ring extends. */
const SELECTION_RING_OFFSET = 6;

/**
 * Return the hit-test radius for a module of the given type.
 * Used by InputManager for per-type hit detection.
 */
export function getHitRadius(moduleType: string): number {
  switch (moduleType) {
    case 'source':
      return SOURCE_HIT_RADIUS;
    case 'stock':
      return STOCK_HIT_RADIUS;
    case 'sink':
      return SINK_HIT_RADIUS;
    default:
      return SINK_HIT_RADIUS;
  }
}

/**
 * Story 2.6 — Pure function: compute pulsing opacity values for
 * phantom stock and slot dots from elapsed time.
 *
 * @param elapsedMs  Time since pulse origin (performance.now() delta).
 * @param periodMs   Full cycle period in ms (default 2000 = 2s).
 * @returns          { phantomAlpha: [0.3, 0.6], dotAlpha: [0.4, 0.8] }
 */
export function computePulseAlpha(
  elapsedMs: number,
  periodMs: number = 2000,
): { phantomAlpha: number; dotAlpha: number } {
  const normalized = (elapsedMs % periodMs) / periodMs; // 0.0 → 1.0 cyclic
  const radians = normalized * Math.PI * 2; // 0.0 → 2π cyclic
  // t=0 → phantom=0.3 (min), t=half → phantom=0.6 (max)
  // Use -cos so that at radians=0, value=-1 giving phantom=0.3
  const wave = -Math.cos(radians); // -1.0 → 1.0, starts at -1

  // phantom: 0.3 + (wave + 1) * 0.15  → range [0.3, 0.6]
  // dot:     0.4 + (-wave + 1) * 0.2  → range [0.4, 0.8]
  const phantomAlpha = 0.3 + (wave + 1) * 0.15;
  const dotAlpha = 0.4 + (-wave + 1) * 0.2;

  return { phantomAlpha, dotAlpha };
}

/** Color palette — per UX-DR3 and Story 2.3 AC. */
const SOURCE_DEFAULT_FILL = '#90EE90'; // light green
const SINK_DEFAULT_FILL = '#8B0000'; // dark red
const STOCK_FILL = '#ffffff'; // white body
const STOCK_STROKE = '#000000'; // black border
const STOCK_FILL_BLUE = '#BBDEFB'; // blue tint for value fill
const STOCK_VALUE_TEXT = '#333333'; // dark text for stock value
const STOCK_LABEL_TEXT = '#000000'; // black for stock label
const MODULE_LABEL_COLOR = '#cccccc'; // label for source/sink
const CONNECTION_COLOR = '#ff79c6';
const CONNECTION_LINE_WIDTH = 2;

/** Story 2.6 — Empty-canvas affordance constants */
const PHANTOM_BORDER_COLOR = '#888888';
const PHANTOM_DASH_SEGMENTS: number[] = [8, 4];
const SLOT_DOT_RADIUS = 4;
const SLOT_DOT_COLOR = '#aaaaaa';
const PULSE_PERIOD_MS = 2000;

/** Arrowhead dimensions — Story 2.4 AC2 */
const ARROWHEAD_HEIGHT = 10;
const ARROWHEAD_HALF_WIDTH = 5;
const SELECTION_COLOR = '#f9e2af'; // warm yellow highlight

/**
 * rAF-based render loop.
 *
 * Story 2.2 — Viewport transform + grid + placeholder module rendering.
 * Story 2.3 — Module shape renderer: source cloud, stock rounded-rect with
 *            fill level, sink infinity/funnel shape.
 */
export class SceneRenderer {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly viewportManager: ViewportManager;

  private rafId: number | null = null;
  private graphState: GraphState | null = null;

  /** Story 2.6 — Timestamp captured at construction for pulse animation origin. */
  private readonly pulseStartTime: number;

  /** Callback invoked each frame to pull latest GraphState. Set by main.ts. */
  public stateProvider: (() => GraphState) | null = null;

  constructor(
    canvas: HTMLCanvasElement,
    viewportManager: ViewportManager,
  ) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error(
        'SceneRenderer: Cannot acquire 2D rendering context for scene canvas.',
      );
    }
    this.ctx = ctx;
    this.viewportManager = viewportManager;
    this.pulseStartTime = performance.now();
  }

  // -------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------

  /** Start the render loop. No-op if already running. */
  start(): void {
    if (this.rafId !== null) return;
    const loop = () => {
      this.tick();
      this.rafId = requestAnimationFrame(loop);
    };
    this.rafId = requestAnimationFrame(loop);
  }

  /** Stop the render loop. */
  stop(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  // -------------------------------------------------------------------
  // Frame
  // -------------------------------------------------------------------

  private tick(): void {
    if (this.stateProvider) {
      this.graphState = this.stateProvider();
    }
    this.drawFrame();
  }

  /**
   * Master draw pipeline.
   *
   * Order: clear → applyTransform → drawEmptyCanvasAffordance →
   *        drawGrid → drawModules → drawConnections
   */
  private drawFrame(): void {
    const { ctx, canvas } = this;

    ctx.resetTransform();
    ctx.fillStyle = '#11111b';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const canvasCenter = vec2(canvas.width / 2, canvas.height / 2);

    this.viewportManager.applyTransform(ctx, canvasCenter);

    // Story 2.6 — Empty-canvas affordance (above background, below grid)
    // Renders BEFORE grid per AC4 pipeline requirement.
    // Rendering check per AC5: only when truly empty.
    this.drawEmptyCanvasAffordance();

    this.drawGrid();

    if (this.graphState) {
      this.drawModules(this.graphState);
      this.drawConnections(this.graphState);
    }
  }

  // -------------------------------------------------------------------
  // Story 2.6 — Empty-Canvas Visual Affordance
  // -------------------------------------------------------------------

  /**
   * AC1–AC5, AC8: Render phantom stock with dashed border and pulsing
   * slot dots at world-space origin (0, 0) when the canvas is empty.
   *
   * Uses save/restore to isolate style changes (AC8).
   * Driven by performance.now() – one call per frame (AC2, AC7).
   * Renders at world-space origin and moves with viewport (AC6).
   */
  private drawEmptyCanvasAffordance(): void {
    const { ctx } = this;

    // AC5 — only render when empty
    if (!this.graphState) return;
    if (Object.keys(this.graphState.nodes).length > 0) return;

    // AC2 — pulse animation via elapsed time
    const elapsed = performance.now() - this.pulseStartTime;
    const { phantomAlpha, dotAlpha } = computePulseAlpha(
      elapsed,
      PULSE_PERIOD_MS,
    );

    // AC1 — phantom stock at world origin, centered
    const hw = STOCK_WIDTH / 2;
    const hh = STOCK_HEIGHT / 2;
    const cx = 0;
    const cy = 0;

    ctx.save(); // AC8 — isolate all style changes

    // ── Phantom stock dashed border ──────────────────────
    ctx.globalAlpha = phantomAlpha;
    ctx.strokeStyle = PHANTOM_BORDER_COLOR;
    ctx.lineWidth = 2;
    ctx.setLineDash(PHANTOM_DASH_SEGMENTS);

    ctx.beginPath();
    this.roundedRect(ctx, cx - hw, cy - hh, STOCK_WIDTH, STOCK_HEIGHT, STOCK_CORNER_RADIUS);
    ctx.stroke();

    // Reset line dash for dots
    ctx.setLineDash([]);

    // ── Slot pulse dots at edge midpoints ─────────────────
    // AC3 — counter-phase: brighter when phantom is dimmest
    ctx.globalAlpha = dotAlpha;
    ctx.fillStyle = SLOT_DOT_COLOR;

    // Top midpoint
    ctx.beginPath();
    ctx.arc(cx, cy - hh, SLOT_DOT_RADIUS, 0, Math.PI * 2);
    ctx.fill();

    // Bottom midpoint
    ctx.beginPath();
    ctx.arc(cx, cy + hh, SLOT_DOT_RADIUS, 0, Math.PI * 2);
    ctx.fill();

    // Left midpoint
    ctx.beginPath();
    ctx.arc(cx - hw, cy, SLOT_DOT_RADIUS, 0, Math.PI * 2);
    ctx.fill();

    // Right midpoint
    ctx.beginPath();
    ctx.arc(cx + hw, cy, SLOT_DOT_RADIUS, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore(); // AC8 — restore all style changes
  }

  // -------------------------------------------------------------------
  // Grid
  // -------------------------------------------------------------------

  /** Subtle infinite reference grid. */
  private drawGrid(): void {
    const { ctx, canvas } = this;
    const { viewport } = this.viewportManager;
    const spacing = 100;

    const halfW = (canvas.width / 2) / viewport.zoom;
    const halfH = (canvas.height / 2) / viewport.zoom;
    const worldLeft = viewport.offset.x - halfW;
    const worldRight = viewport.offset.x + halfW;
    const worldTop = viewport.offset.y - halfH;
    const worldBottom = viewport.offset.y + halfH;

    const startX = Math.floor(worldLeft / spacing) * spacing;
    const startY = Math.floor(worldTop / spacing) * spacing;

    ctx.strokeStyle = '#2a2a3a';
    ctx.lineWidth = 0.8;
    ctx.beginPath();

    for (let x = startX; x <= worldRight; x += spacing) {
      ctx.moveTo(x, worldTop);
      ctx.lineTo(x, worldBottom);
    }
    for (let y = startY; y <= worldBottom; y += spacing) {
      ctx.moveTo(worldLeft, y);
      ctx.lineTo(worldRight, y);
    }
    ctx.stroke();

    // Axis lines
    ctx.strokeStyle = '#444466';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(0, worldTop);
    ctx.lineTo(0, worldBottom);
    ctx.moveTo(worldLeft, 0);
    ctx.lineTo(worldRight, 0);
    ctx.stroke();
  }

  // -------------------------------------------------------------------
  // Modules — Story 2.3 per-type shape rendering
  // -------------------------------------------------------------------

  /** Return the rough bounding radius of a module for selection-glow purposes. */
  private getModuleBoundingRadius(node: { type: string }): number {
    switch (node.type) {
      case 'source':
        // cloud: circle cluster ≈ height of 3 circles
        return SOURCE_CLOUD_RADIUS * 2 + SELECTION_RING_OFFSET;
      case 'stock':
        // rounded-rect: half diagonal
        return (
          Math.sqrt(STOCK_WIDTH ** 2 + STOCK_HEIGHT ** 2) / 2 +
          SELECTION_RING_OFFSET
        );
      case 'sink':
        return SINK_RADIUS + SELECTION_RING_OFFSET;
      default:
        return SINK_RADIUS + SELECTION_RING_OFFSET; // fallback
    }
  }

  private drawModules(state: GraphState): void {
    const { ctx } = this;
    const selectedIds = new Set(state.selectedModuleIds);

    // ── First pass: draw selection glow ──
    for (const id of selectedIds) {
      const node = state.nodes[id];
      if (!node) continue;
      const r = this.getModuleBoundingRadius(node);
      ctx.save();
      ctx.strokeStyle = SELECTION_COLOR;
      ctx.lineWidth = 3;
      ctx.shadowColor = SELECTION_COLOR;
      ctx.shadowBlur = 14;
      ctx.beginPath();
      ctx.arc(node.position.x, node.position.y, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // ── Second pass: draw each module shape ──
    for (const [_id, node] of Object.entries(state.nodes)) {
      switch (node.type) {
        case 'source':
          this.drawSource(node as SourceNode);
          break;
        case 'stock':
          this.drawStock(node as StockNode);
          break;
        case 'sink':
          this.drawSink(node as SinkNode);
          break;
        default:
          this.drawFallback(node.position.x, node.position.y);
      }

      // Module label (below shape)
      if (node.label) {
        ctx.fillStyle = node.type === 'stock' ? STOCK_LABEL_TEXT : MODULE_LABEL_COLOR;
        ctx.font = '12px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        const labelY =
          node.position.y + this.getModuleBoundingRadius(node) + 4;
        ctx.fillText(node.label, node.position.x, labelY);
      }
    }
  }

  // ── Source: cloud shape (overlapping circles) ─────────────────────

  private drawSource(node: SourceNode): void {
    const { ctx } = this;
    const { x, y } = node.position;
    const fillColor = node.color ?? SOURCE_DEFAULT_FILL;
    const r = SOURCE_CLOUD_RADIUS;
    const offsets: Vec2[] = [
      vec2(-r * 0.7, 0),
      vec2(r * 0.7, 0),
      vec2(0, -r * 0.5),
      vec2(-r * 0.5, -r * 0.5),
      vec2(r * 0.5, -r * 0.5),
    ];

    ctx.fillStyle = fillColor;
    ctx.strokeStyle = 'rgba(0,0,0,0.3)';
    ctx.lineWidth = 1.5;

    for (const off of offsets) {
      ctx.beginPath();
      ctx.arc(x + off.x, y + off.y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }

    // Type label
    ctx.fillStyle = MODULE_LABEL_COLOR;
    ctx.font = '10px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText('source', x, y + r * 2 + 2);
  }

  // ── Stock: rounded rectangle with fill level ──────────────────────

  private drawStock(node: StockNode): void {
    const { ctx } = this;
    const { x, y } = node.position;
    const hw = STOCK_WIDTH / 2;
    const hh = STOCK_HEIGHT / 2;
    const cr = STOCK_CORNER_RADIUS;

    // White body
    ctx.fillStyle = STOCK_FILL;
    ctx.strokeStyle = STOCK_STROKE;
    ctx.lineWidth = 2;
    ctx.beginPath();
    this.roundedRect(ctx, x - hw, y - hh, STOCK_WIDTH, STOCK_HEIGHT, cr);
    ctx.fill();
    ctx.stroke();

    // Blue fill from bottom proportional to value/capacity
    const ratio =
      node.capacity > 0
        ? Math.max(0, Math.min(1, node.value / node.capacity))
        : 0;
    if (ratio > 0) {
      ctx.save();
      ctx.beginPath();
      this.roundedRect(ctx, x - hw, y - hh, STOCK_WIDTH, STOCK_HEIGHT, cr);
      ctx.clip();

      const fillHeight = STOCK_HEIGHT * ratio;
      ctx.fillStyle = STOCK_FILL_BLUE;
      ctx.fillRect(x - hw, y + hh - fillHeight, STOCK_WIDTH, fillHeight);
      ctx.restore();

      // Re-draw border over fill so it stays crisp
      ctx.beginPath();
      this.roundedRect(ctx, x - hw, y - hh, STOCK_WIDTH, STOCK_HEIGHT, cr);
      ctx.stroke();
    }

    // Value text centered
    ctx.fillStyle = STOCK_VALUE_TEXT;
    ctx.font = 'bold 14px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const valueStr =
      node.value === Math.floor(node.value)
        ? String(node.value)
        : node.value.toFixed(1);
    ctx.fillText(valueStr, x, y);

    // Type label below
    ctx.fillStyle = STOCK_LABEL_TEXT;
    ctx.font = '10px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText('stock', x, y + hh + 4);
  }

  // ── Sink: infinity (∞) shape approximated by two circles + waist ──

  private drawSink(node: SinkNode): void {
    const { ctx } = this;
    const { x, y } = node.position;
    const fillColor = node.color ?? SINK_DEFAULT_FILL;
    const r = SINK_RADIUS;

    // Draw as a stylized funnel / infinity shape:
    // two overlapping circles with a connecting waist line
    ctx.fillStyle = fillColor;
    ctx.strokeStyle = 'rgba(0,0,0,0.3)';
    ctx.lineWidth = 1.5;

    // Left circle
    ctx.beginPath();
    ctx.arc(x - r * 0.55, y, r * 0.75, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Right circle
    ctx.beginPath();
    ctx.arc(x + r * 0.55, y, r * 0.75, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Waist connector lines (top and bottom)
    ctx.strokeStyle = 'rgba(0,0,0,0.4)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x - r * 0.05, y - r * 0.45);
    ctx.lineTo(x + r * 0.05, y - r * 0.45);
    ctx.moveTo(x - r * 0.05, y + r * 0.45);
    ctx.lineTo(x + r * 0.05, y + r * 0.45);
    ctx.stroke();

    // Type label
    ctx.fillStyle = MODULE_LABEL_COLOR;
    ctx.font = '10px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText('sink', x, y + r + 4);
  }

  // ── Fallback for unknown types ────────────────────────────────────

  private drawFallback(x: number, y: number): void {
    const { ctx } = this;
    ctx.fillStyle = '#555555';
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, SINK_RADIUS, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  /** Helper: draw a rounded rectangle path. */
  private roundedRect(
    ctx: CanvasRenderingContext2D,
    left: number,
    top: number,
    w: number,
    h: number,
    r: number,
  ): void {
    ctx.moveTo(left + r, top);
    ctx.lineTo(left + w - r, top);
    ctx.arcTo(left + w, top, left + w, top + r, r);
    ctx.lineTo(left + w, top + h - r);
    ctx.arcTo(left + w, top + h, left + w - r, top + h, r);
    ctx.lineTo(left + r, top + h);
    ctx.arcTo(left, top + h, left, top + h - r, r);
    ctx.lineTo(left, top + r);
    ctx.arcTo(left, top, left + r, top, r);
    ctx.closePath();
  }

  // Connections — Story 2.4 edge-clipped lines + directional arrowheads
  // -------------------------------------------------------------------

  /**
   * Draw lines between connected modules with edge-clipped endpoints and
   * directional arrowheads.  The line is clipped to each module's bounding
   * radius (center→center direction vector), and the arrowhead at the
   * destination edge points in the flow direction (fromId → toId).
   *
   * AC 1–6: clipped lines, arrowheads, direction, viewport-transform,
   *         live update on module reposition.
   */
  private drawConnections(state: GraphState): void {
    const { ctx } = this;
    ctx.save();

    for (const [_id, conn] of Object.entries(state.connections)) {
      const fromNode = state.nodes[conn.fromId];
      const toNode = state.nodes[conn.toId];
      if (!fromNode || !toNode) continue;

      const dx = toNode.position.x - fromNode.position.x;
      const dy = toNode.position.y - fromNode.position.y;
      const dist = Math.hypot(dx, dy);

      // Overlapping modules — skip rendering (AC 4 edge-case)
      if (dist < 0.001) continue;

      const udx = dx / dist;
      const udy = dy / dist;

      const fromRadius = getModuleBoundingRadiusForConnection(fromNode, udx, udy);
      const toRadius = getModuleBoundingRadiusForConnection(toNode, udx, udy);

      const startX = fromNode.position.x + udx * fromRadius;
      const startY = fromNode.position.y + udy * fromRadius;
      const endX = toNode.position.x - udx * toRadius;
      const endY = toNode.position.y - udy * toRadius;

      // Draw clipped line
      ctx.strokeStyle = CONNECTION_COLOR;
      ctx.lineWidth = CONNECTION_LINE_WIDTH;
      ctx.beginPath();
      ctx.moveTo(startX, startY);
      ctx.lineTo(endX, endY);
      ctx.stroke();

      // Draw directional arrowhead at destination edge
      const angle = Math.atan2(dy, dx);
      this.drawArrowhead(endX, endY, angle);
    }

    ctx.restore();
  }

  /**
   * Draw a filled triangular arrowhead.
   *
   * @param tipX  Arrow tip x-coordinate (world space)
   * @param tipY  Arrow tip y-coordinate (world space)
   * @param angle Direction the arrow is pointing (radians, from positive x-axis)
   */
  private drawArrowhead(tipX: number, tipY: number, angle: number): void {
    const { ctx } = this;
    ctx.save();

    const baseX = tipX - Math.cos(angle) * ARROWHEAD_HEIGHT;
    const baseY = tipY - Math.sin(angle) * ARROWHEAD_HEIGHT;

    const perpX = Math.cos(angle + Math.PI / 2) * ARROWHEAD_HALF_WIDTH;
    const perpY = Math.sin(angle + Math.PI / 2) * ARROWHEAD_HALF_WIDTH;

    ctx.fillStyle = CONNECTION_COLOR;
    ctx.beginPath();
    ctx.moveTo(tipX, tipY);
    ctx.lineTo(baseX + perpX, baseY + perpY);
    ctx.lineTo(baseX - perpX, baseY - perpY);
    ctx.closePath();
    ctx.fill();

    ctx.restore();
  }
}

// ── Pure helper (exported for testing) ────────────────────────────

/**
 * Return the bounding radius used for edge-clipping connection lines.
 * For rectangular modules (stock), computes the actual distance from
 * center to the rectangle boundary along the given direction, so
 * connections meet the visual edge rather than floating at the
 * half-diagonal circle.
 *
 * @param node  The module node (must have `type` property).
 * @param udx   Unit direction x-component (from→to).
 * @param udy   Unit direction y-component (from→to).
 */
export function getModuleBoundingRadiusForConnection(
  node: { type: string },
  udx: number,
  udy: number,
): number {
  switch (node.type) {
    case 'source':
      return SOURCE_CLOUD_RADIUS * 2;
    case 'stock': {
      const hw = STOCK_WIDTH / 2;   // half-width
      const hh = STOCK_HEIGHT / 2;  // half-height
      const tx = Math.abs(udx) > 1e-6 ? hw / Math.abs(udx) : Infinity;
      const ty = Math.abs(udy) > 1e-6 ? hh / Math.abs(udy) : Infinity;
      return Math.min(tx, ty);
    }
    case 'sink':
      return SINK_RADIUS;
    default:
      return SINK_RADIUS;
  }
}