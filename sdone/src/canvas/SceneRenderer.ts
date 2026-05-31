import type { Vec2 } from '../shared/Vec2.js';
import { vec2 } from '../shared/Vec2.js';
import {
  CLOUD_RADIUS,
  SHAPE_STOCK_WIDTH,
  SHAPE_STOCK_HEIGHT,
  SHAPE_STOCK_CORNER_RADIUS,
  SINK_RADIUS as SHARED_SINK_RADIUS,
  drawCloud,
  drawStock as drawStockShape,
  drawSink as drawSinkShape,
} from '../shared/ShapePaths.js';
import type { GraphState, StockNode, SourceNode, SinkNode, ModuleType } from '../state/GraphState.js';
import type { ViewportManager } from './Viewport.js';

// ── Module size constants (exported for InputManager hit-testing) ──────
export const SOURCE_CLOUD_RADIUS = CLOUD_RADIUS;
export const SOURCE_HIT_RADIUS = SOURCE_CLOUD_RADIUS * 2;
export const STOCK_WIDTH = SHAPE_STOCK_WIDTH;
export const STOCK_HEIGHT = SHAPE_STOCK_HEIGHT;
export const STOCK_CORNER_RADIUS = SHAPE_STOCK_CORNER_RADIUS;
export const STOCK_HIT_RADIUS = Math.sqrt(STOCK_WIDTH ** 2 + STOCK_HEIGHT ** 2) / 2;
export const SINK_RADIUS = SHARED_SINK_RADIUS;
export const SINK_HIT_RADIUS = SINK_RADIUS;

export const SELECTION_RING_OFFSET = 6;

// ── Story 4.6 AC1–AC4 — Warning arc constants (exported for rendering tests) ──
/** Muted grey arc color. */
export const WARNING_ARC_COLOR = '#6c7086';
/** Opacity level for warning arcs (0 = fully transparent, 1 = fully opaque). */
export const WARNING_ARC_OPACITY = 0.4;
/** Warning arc stroke width in world-pixels. */
export const WARNING_ARC_LINE_WIDTH = 2;
/** Dash pattern for warning arcs [solid_len, gap_len] in world-pixels. */
export const WARNING_ARC_DASH = [3, 3] as const;
/** Angular sweep of each warning arc in radians (π/6 = 30°). */
export const WARNING_ARC_SWEEP_RAD = Math.PI / 6;
/** Arc radius in world-pixels (drawn just outside the stock edge). */
export const WARNING_ARC_RADIUS = 10;

/**
 * Story 4.6 — Pure function: compute the world-space arc center for an
 * inflow or outflow warning arc on a stock's edge.
 *
 * AC1: Inflow arc on left edge midpoint, outflow arc on right edge midpoint.
 * AC3: Arc centre offset by WARNING_ARC_RADIUS just outside the edge.
 *
 * @param nodePosition - Stock module world position (centre).
 * @param side - Which side: `'inflow'` (left edge) or `'outflow'` (right edge).
 * @returns World-space centre point for the warning arc.
 */
export function getWarningArcCenter(
  nodePosition: { x: number; y: number },
  side: 'inflow' | 'outflow',
): { x: number; y: number } {
  const hw = STOCK_WIDTH / 2;
  const { x, y } = nodePosition;
  if (side === 'inflow') {
    return { x: x - hw - WARNING_ARC_RADIUS, y };
  }
  return { x: x + hw + WARNING_ARC_RADIUS, y };
}

// ── Exported helpers ──────────────────────────────────────────────────

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

export function getModuleBoundingRadius(node: { type: string }): number {
  switch (node.type) {
    case 'source':
      return SOURCE_CLOUD_RADIUS * 2 + SELECTION_RING_OFFSET;
    case 'stock':
      return Math.sqrt(STOCK_WIDTH ** 2 + STOCK_HEIGHT ** 2) / 2 + SELECTION_RING_OFFSET;
    case 'sink':
      return SINK_RADIUS + SELECTION_RING_OFFSET;
    default:
      return SINK_RADIUS + SELECTION_RING_OFFSET;
  }
}

export function getEdgePoint(
  node: { type: string; position: { x: number; y: number } },
  towardWorld: { x: number; y: number },
): { x: number; y: number } {
  const cx = node.position.x;
  const cy = node.position.y;
  const dx = towardWorld.x - cx;
  const dy = towardWorld.y - cy;
  const dist = Math.sqrt(dx * dx + dy * dy);
  if (dist < 1e-10) return { x: cx, y: cy - 20 };
  const nx = dx / dist;
  const ny = dy / dist;
  switch (node.type) {
    case 'source': {
      const r = SOURCE_CLOUD_RADIUS * 1.6;
      return { x: cx + nx * r, y: cy + ny * r };
    }
    case 'sink': {
      return { x: cx + nx * SINK_RADIUS, y: cy + ny * SINK_RADIUS };
    }
    case 'stock': {
      const hw = STOCK_WIDTH / 2;
      const hh = STOCK_HEIGHT / 2;
      const tx = nx !== 0 ? hw / Math.abs(nx) : Infinity;
      const ty = ny !== 0 ? hh / Math.abs(ny) : Infinity;
      const t = Math.min(tx, ty);
      return { x: cx + nx * t, y: cy + ny * t };
    }
    default: {
      return { x: cx + nx * SINK_RADIUS, y: cy + ny * SINK_RADIUS };
    }
  }
}

export function computeFillRatio(value: number, capacity: number): number {
  if (!Number.isFinite(value) || !(capacity > 0)) return 0;
  return Math.max(0, Math.min(1, value / capacity));
}

export function computePulseAlpha(
  elapsedMs: number,
  periodMs: number = 2000,
): { phantomAlpha: number; dotAlpha: number } {
  const normalized = (elapsedMs % periodMs) / periodMs;
  const radians = normalized * Math.PI * 2;
  const wave = -Math.cos(radians);
  const phantomAlpha = 0.3 + (wave + 1) * 0.15;
  const dotAlpha = 0.4 + (-wave + 1) * 0.2;
  return { phantomAlpha, dotAlpha };
}

// ── Internal colour palette constants ─────────────────────────────────

const SOURCE_DEFAULT_FILL = '#90EE90';
const SINK_DEFAULT_FILL = '#8B0000';
const STOCK_FILL = '#ffffff';
const STOCK_STROKE = '#000000';
const STOCK_FILL_BLUE = '#BBDEFB';
const STOCK_VALUE_TEXT = '#333333';
const STOCK_LABEL_TEXT = '#000000';
const MODULE_LABEL_COLOR = '#cccccc';

const PHANTOM_BORDER_COLOR = '#888888';
const PHANTOM_DASH_SEGMENTS: number[] = [8, 4];
const SLOT_DOT_RADIUS = 4;
const SLOT_DOT_COLOR = '#aaaaaa';
const PULSE_PERIOD_MS = 2000;

const CONNECTION_LINE_COLOR = '#4fc3f7';
const CONNECTION_LINE_WIDTH = 2.5;
const CONNECTION_ARROW_COLOR = '#4fc3f7';
const ARROWHEAD_LENGTH = 14;
const ARROWHEAD_HALF_WIDTH = 7;
const SNAP_ZONE_RADIUS = 14;

const SELECTION_COLOR = '#f9e2af';

// ═══════════════════════════════════════════════════════════════════════
// SceneRenderer
// ═══════════════════════════════════════════════════════════════════════

export class SceneRenderer {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly viewportManager: ViewportManager;

  private rafId: number | null = null;
  private graphState: GraphState | null = null;
  private readonly pulseStartTime: number;

  public stateProvider: (() => GraphState) | null = null;
  public ghostProvider: (() => { moduleType: ModuleType; worldPosition: Vec2 } | null) | null = null;
  public connectionDragProvider: (() => {
    sourceWorldPos: Vec2;
    cursorWorldPos: Vec2;
    snapTargetWorldPos?: { x: number; y: number };
    snapTargetId?: string;
  } | null) | null = null;
  public selectedConnectionProvider: (() => string | null) | null = null;
  public stockWarningProvider: (() => Record<
    string,
    { inflowMissing: boolean; outflowMissing: boolean }
  >) | null = null;

  constructor(canvas: HTMLCanvasElement, viewportManager: ViewportManager) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('SceneRenderer: Cannot acquire 2D rendering context for scene canvas.');
    this.ctx = ctx;
    this.viewportManager = viewportManager;
    this.pulseStartTime = performance.now();
  }

  // ── Lifecycle ───────────────────────────────────────────────────────

  start(): void {
    if (this.rafId !== null) return;
    const loop = () => {
      this.tick();
      this.rafId = requestAnimationFrame(loop);
    };
    this.rafId = requestAnimationFrame(loop);
  }

  stop(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  // ── Frame ───────────────────────────────────────────────────────────

  private tick(): void {
    if (this.stateProvider) this.graphState = this.stateProvider();
    this.drawFrame();
  }

  private drawFrame(): void {
    const { ctx, canvas } = this;
    ctx.resetTransform();
    ctx.fillStyle = '#11111b';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const canvasCenter = vec2(canvas.width / 2, canvas.height / 2);
    this.viewportManager.applyTransform(ctx, canvasCenter);
    this.drawEmptyCanvasAffordance();
    this.drawGrid();
    if (this.graphState) {
      this.drawModules(this.graphState);
      this.drawConnections(this.graphState);
    }
    this.drawGhost();
    this.drawConnectionDragPreview();
  }

  // ── Ghost ───────────────────────────────────────────────────────────

  private static readonly GHOST_ALPHA = 0.5;
  private static readonly GHOST_PULSE_PERIOD_MS = 800;

  private drawGhost(): void {
    const ghostData = this.ghostProvider?.();
    if (!ghostData) return;
    const { moduleType, worldPosition } = ghostData;
    const { ctx } = this;
    const elapsed = performance.now() - this.pulseStartTime;
    const pulse = Math.sin(((elapsed % SceneRenderer.GHOST_PULSE_PERIOD_MS) / SceneRenderer.GHOST_PULSE_PERIOD_MS) * Math.PI * 2);
    const alpha = SceneRenderer.GHOST_ALPHA + pulse * 0.1;
    ctx.save();
    ctx.globalAlpha = alpha;
    const { x, y } = worldPosition;
    switch (moduleType) {
      case 'source': {
        ctx.fillStyle = SOURCE_DEFAULT_FILL;
        ctx.strokeStyle = 'rgba(0,0,0,0.3)';
        ctx.lineWidth = 1.5;
        drawCloud(ctx, x, y, CLOUD_RADIUS * 3.2);
        break;
      }
      case 'stock': {
        ctx.fillStyle = STOCK_FILL;
        ctx.strokeStyle = STOCK_STROKE;
        ctx.lineWidth = 2;
        drawStockShape(ctx, x, y, STOCK_WIDTH);
        break;
      }
      case 'sink': {
        ctx.fillStyle = SINK_DEFAULT_FILL;
        ctx.strokeStyle = 'rgba(0,0,0,0.3)';
        ctx.lineWidth = 1.5;
        drawSinkShape(ctx, x, y, SINK_RADIUS * 2);
        break;
      }
    }
    ctx.restore();
  }

  // ── Empty-Canvas Affordance ─────────────────────────────────────────

  private drawEmptyCanvasAffordance(): void {
    const { ctx } = this;
    if (!this.graphState) return;
    if (Object.keys(this.graphState.nodes).length > 0) return;
    const elapsed = performance.now() - this.pulseStartTime;
    const { phantomAlpha, dotAlpha } = computePulseAlpha(elapsed, PULSE_PERIOD_MS);
    const hw = STOCK_WIDTH / 2;
    const hh = STOCK_HEIGHT / 2;
    const cx = 0;
    const cy = 0;
    ctx.save();
    ctx.globalAlpha = phantomAlpha;
    ctx.strokeStyle = PHANTOM_BORDER_COLOR;
    ctx.lineWidth = 2;
    ctx.setLineDash(PHANTOM_DASH_SEGMENTS);
    ctx.beginPath();
    this.roundedRect(ctx, cx - hw, cy - hh, STOCK_WIDTH, STOCK_HEIGHT, STOCK_CORNER_RADIUS);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = dotAlpha;
    ctx.fillStyle = SLOT_DOT_COLOR;
    ctx.beginPath();
    ctx.arc(cx, cy - hh, SLOT_DOT_RADIUS, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx, cy + hh, SLOT_DOT_RADIUS, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx - hw, cy, SLOT_DOT_RADIUS, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx + hw, cy, SLOT_DOT_RADIUS, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // ── Grid ────────────────────────────────────────────────────────────

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
    for (let x = startX; x <= worldRight; x += spacing) { ctx.moveTo(x, worldTop); ctx.lineTo(x, worldBottom); }
    for (let y = startY; y <= worldBottom; y += spacing) { ctx.moveTo(worldLeft, y); ctx.lineTo(worldRight, y); }
    ctx.stroke();
    ctx.strokeStyle = '#444466';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(0, worldTop);
    ctx.lineTo(0, worldBottom);
    ctx.moveTo(worldLeft, 0);
    ctx.lineTo(worldRight, 0);
    ctx.stroke();
  }

  // ── Modules ─────────────────────────────────────────────────────────

  private drawModules(state: GraphState): void {
    const { ctx } = this;
    const selectedIds = new Set(state.selectedModuleIds);
    for (const id of selectedIds) {
      const node = state.nodes[id];
      if (!node) continue;
      const r = getModuleBoundingRadius(node);
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
    for (const [_id, node] of Object.entries(state.nodes)) {
      switch (node.type) {
        case 'source': this.drawSource(node as SourceNode); break;
        case 'stock': this.drawStock(node as StockNode); break;
        case 'sink': this.drawSink(node as SinkNode); break;
        default: this.drawFallback(node.position.x, node.position.y);
      }
      if (node.label) {
        ctx.fillStyle = node.type === 'stock' ? STOCK_LABEL_TEXT : MODULE_LABEL_COLOR;
        ctx.font = '12px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillText(node.label, node.position.x, node.position.y + getModuleBoundingRadius(node) + 4);
      }
    }
    this.drawWarningArcs(state);
  }

  private drawSource(node: SourceNode): void {
    const { ctx } = this;
    ctx.save();
    const { x, y } = node.position;
    const fillColor = node.color ?? SOURCE_DEFAULT_FILL;
    const r = SOURCE_CLOUD_RADIUS;
    const offsets: Vec2[] = [vec2(-r * 0.7, 0), vec2(r * 0.7, 0), vec2(0, -r * 0.5), vec2(-r * 0.5, -r * 0.5), vec2(r * 0.5, -r * 0.5)];
    ctx.fillStyle = fillColor;
    ctx.strokeStyle = 'rgba(0,0,0,0.3)';
    ctx.lineWidth = 1.5;
    for (const off of offsets) { ctx.beginPath(); ctx.arc(x + off.x, y + off.y, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); }
    ctx.fillStyle = MODULE_LABEL_COLOR;
    ctx.font = '10px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText('source', x, y + r * 2 + 2);
    ctx.restore();
  }

  private drawStock(node: StockNode): void {
    const { ctx } = this;
    const { x, y } = node.position;
    const hw = STOCK_WIDTH / 2;
    const hh = STOCK_HEIGHT / 2;
    const cr = STOCK_CORNER_RADIUS;
    ctx.fillStyle = STOCK_FILL;
    ctx.strokeStyle = STOCK_STROKE;
    ctx.lineWidth = 2;
    ctx.beginPath();
    this.roundedRect(ctx, x - hw, y - hh, STOCK_WIDTH, STOCK_HEIGHT, cr);
    ctx.fill();
    ctx.stroke();
    const ratio = computeFillRatio(node.value, node.capacity);
    if (ratio > 0) {
      ctx.save();
      ctx.beginPath();
      this.roundedRect(ctx, x - hw, y - hh, STOCK_WIDTH, STOCK_HEIGHT, cr);
      ctx.clip();
      const fillHeight = STOCK_HEIGHT * ratio;
      ctx.fillStyle = STOCK_FILL_BLUE;
      ctx.fillRect(x - hw, y + hh - fillHeight, STOCK_WIDTH, fillHeight);
      ctx.restore();
      ctx.beginPath();
      this.roundedRect(ctx, x - hw, y - hh, STOCK_WIDTH, STOCK_HEIGHT, cr);
      ctx.stroke();
    }
    ctx.fillStyle = STOCK_VALUE_TEXT;
    ctx.font = 'bold 14px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const valueStr = node.value === Math.floor(node.value) ? String(node.value) : node.value.toFixed(1);
    ctx.fillText(valueStr, x, y);
    ctx.fillStyle = STOCK_LABEL_TEXT;
    ctx.font = '10px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText('stock', x, y + hh + 4);
  }

  private drawSink(node: SinkNode): void {
    const { ctx } = this;
    ctx.save();
    const { x, y } = node.position;
    const fillColor = node.color ?? SINK_DEFAULT_FILL;
    const r = SINK_RADIUS;
    ctx.fillStyle = fillColor;
    ctx.strokeStyle = 'rgba(0,0,0,0.3)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(x - r * 0.55, y, r * 0.75, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x + r * 0.55, y, r * 0.75, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = 'rgba(0,0,0,0.4)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x - r * 0.05, y - r * 0.45);
    ctx.lineTo(x + r * 0.05, y - r * 0.45);
    ctx.moveTo(x - r * 0.05, y + r * 0.45);
    ctx.lineTo(x + r * 0.05, y + r * 0.45);
    ctx.stroke();
    ctx.fillStyle = MODULE_LABEL_COLOR;
    ctx.font = '10px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText('sink', x, y + r + 4);
    ctx.restore();
  }

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

  private roundedRect(ctx: CanvasRenderingContext2D, left: number, top: number, w: number, h: number, r: number): void {
    if (w <= 0 || h <= 0) return;
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

  // ── Connections ─────────────────────────────────────────────────────

  private drawConnections(state: GraphState): void {
    const { ctx } = this;
    const connections = Object.values(state.connections);
    if (connections.length === 0) return;
    const selectedId = this.selectedConnectionProvider?.() ?? null;
    ctx.save();
    if (selectedId) {
      const selectedConn = state.connections[selectedId];
      if (selectedConn) {
        const fromNode = state.nodes[selectedConn.fromId];
        const toNode = state.nodes[selectedConn.toId];
        if (fromNode && toNode) {
          const fromEdge = getEdgePoint(fromNode, toNode.position);
          const toEdge = getEdgePoint(toNode, fromNode.position);
          if (!(fromEdge.x === toEdge.x && fromEdge.y === toEdge.y)) {
            ctx.strokeStyle = SELECTION_COLOR;
            ctx.lineWidth = CONNECTION_LINE_WIDTH + 6;
            ctx.globalAlpha = 0.5;
            ctx.shadowColor = SELECTION_COLOR;
            ctx.shadowBlur = 12;
            ctx.beginPath();
            ctx.moveTo(fromEdge.x, fromEdge.y);
            ctx.lineTo(toEdge.x, toEdge.y);
            ctx.stroke();
            ctx.shadowBlur = 0;
            ctx.globalAlpha = 1;
          }
        }
      }
    }
    ctx.restore();
    ctx.save();
    ctx.globalAlpha = 0.85;
    for (const conn of connections) {
      const fromNode = state.nodes[conn.fromId];
      const toNode = state.nodes[conn.toId];
      if (!fromNode || !toNode) continue;
      const fromEdge = getEdgePoint(fromNode, toNode.position);
      const toEdge = getEdgePoint(toNode, fromNode.position);
      if (fromEdge.x === toEdge.x && fromEdge.y === toEdge.y) continue;
      const isSelected = conn.id === selectedId;
      const lineColor = isSelected ? SELECTION_COLOR : CONNECTION_LINE_COLOR;
      const lineWidth = isSelected ? CONNECTION_LINE_WIDTH + 2 : CONNECTION_LINE_WIDTH;
      ctx.strokeStyle = lineColor;
      ctx.lineWidth = lineWidth;
      ctx.beginPath();
      ctx.moveTo(fromEdge.x, fromEdge.y);
      ctx.lineTo(toEdge.x, toEdge.y);
      ctx.stroke();
      const arrowColor = isSelected ? SELECTION_COLOR : CONNECTION_ARROW_COLOR;
      this.drawArrowhead(ctx, fromEdge.x, fromEdge.y, toEdge.x, toEdge.y, arrowColor);
      const midX = (fromEdge.x + toEdge.x) / 2;
      const midY = (fromEdge.y + toEdge.y) / 2;
      ctx.fillStyle = isSelected ? SELECTION_COLOR : '#c0c0c0';
      ctx.font = '11px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillText(`${conn.rate}x`, midX, midY - 4);
    }
    ctx.restore();
  }

  private drawConnectionDragPreview(): void {
    const preview = this.connectionDragProvider?.();
    if (!preview) return;
    const { ctx } = this;
    const snapped = !!(preview.snapTargetId && preview.snapTargetWorldPos);
    const endX = snapped ? preview.snapTargetWorldPos!.x : preview.cursorWorldPos.x;
    const endY = snapped ? preview.snapTargetWorldPos!.y : preview.cursorWorldPos.y;
    ctx.save();
    ctx.globalAlpha = 0.7;
    ctx.strokeStyle = CONNECTION_LINE_COLOR;
    ctx.lineWidth = CONNECTION_LINE_WIDTH * 0.8;
    ctx.setLineDash([6, 6]);
    ctx.beginPath();
    ctx.moveTo(preview.sourceWorldPos.x, preview.sourceWorldPos.y);
    ctx.lineTo(endX, endY);
    ctx.stroke();
    ctx.setLineDash([]);
    if (snapped) {
      ctx.strokeStyle = 'rgba(79, 195, 247, 0.6)';
      ctx.lineWidth = 2;
      ctx.shadowColor = CONNECTION_LINE_COLOR;
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.arc(endX, endY, 6, 0, Math.PI * 2);
      ctx.stroke();
      ctx.shadowBlur = 0;
    }
    ctx.strokeStyle = 'rgba(79, 195, 247, 0.5)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(endX, endY, SNAP_ZONE_RADIUS, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  // ── Story 4.6 — Warning Arcs ────────────────────────────────────────

  /**
   * Story 4.6 — Iterate over stock nodes and draw warning arcs for
   * edges with missing inflow/outflow connections.
   *
   * AC1: Arc drawn at edge midpoint when inflow/outflow is missing.
   * AC2: Muted grey (#6c7086) dashed [3,3] 2px line at 40% opacity.
   * AC3: 30° arc drawn just outside the stock's bounding rectangle.
   * AC4: Arc disappears once the missing connection is added.
   */
  private drawWarningArcs(state: GraphState): void {
    const warnings = this.stockWarningProvider?.();
    if (!warnings) return;
    const { ctx } = this;
    for (const [stockId, w] of Object.entries(warnings)) {
      if (!w.inflowMissing && !w.outflowMissing) continue;
      const node = state.nodes[stockId];
      if (!node || node.type !== 'stock') continue;
      const sweep = WARNING_ARC_SWEEP_RAD;
      ctx.save();
      ctx.globalAlpha = WARNING_ARC_OPACITY;
      ctx.strokeStyle = WARNING_ARC_COLOR;
      ctx.lineWidth = WARNING_ARC_LINE_WIDTH;
      ctx.setLineDash(WARNING_ARC_DASH);
      if (w.inflowMissing) {
        const pos = getWarningArcCenter(node.position, 'inflow');
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, WARNING_ARC_RADIUS, Math.PI - sweep / 2, Math.PI + sweep / 2);
        ctx.stroke();
      }
      if (w.outflowMissing) {
        const pos = getWarningArcCenter(node.position, 'outflow');
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, WARNING_ARC_RADIUS, -sweep / 2, sweep / 2);
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  // ── Arrowhead ───────────────────────────────────────────────────────

  private drawArrowhead(ctx: CanvasRenderingContext2D, fromX: number, fromY: number, toX: number, toY: number, fillColor?: string): void {
    const dx = toX - fromX;
    const dy = toY - fromY;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (!Number.isFinite(len) || len < 1) return;
    const ux = dx / len;
    const uy = dy / len;
    const tipX = toX;
    const tipY = toY;
    const leftX = tipX - ux * ARROWHEAD_LENGTH + uy * ARROWHEAD_HALF_WIDTH;
    const leftY = tipY - uy * ARROWHEAD_LENGTH - ux * ARROWHEAD_HALF_WIDTH;
    const rightX = tipX - ux * ARROWHEAD_LENGTH - uy * ARROWHEAD_HALF_WIDTH;
    const rightY = tipY - uy * ARROWHEAD_LENGTH + ux * ARROWHEAD_HALF_WIDTH;
    ctx.fillStyle = fillColor ?? CONNECTION_ARROW_COLOR;
    ctx.beginPath();
    ctx.moveTo(tipX, tipY);
    ctx.lineTo(leftX, leftY);
    ctx.lineTo(rightX, rightY);
    ctx.closePath();
    ctx.fill();
  }
}