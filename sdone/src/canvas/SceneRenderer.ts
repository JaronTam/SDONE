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
import type { ConfettiParticle } from './ConfettiEngine.js';

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

// ── Story 7.1 — Feedback connection constants ──
/** Amber-600 color for feedback connections and handles. */
const FEEDBACK_LINE_COLOR = '#d97706';
/** Feedback connection line width. */
const FEEDBACK_LINE_WIDTH = 1.5;
/** Dash pattern for feedback connections [solid, gap]. */
const FEEDBACK_DASH_SEGMENTS = [6, 4] as const;
/** Feedback handle radius (8px diameter). */
export const FEEDBACK_HANDLE_RADIUS = 4;
/** Default opacity for feedback handle (not hovered). */
const FEEDBACK_HANDLE_OPACITY_DEFAULT = 0.3;
/** Hover opacity for feedback handle. */
const FEEDBACK_HANDLE_OPACITY_HOVER = 0.9;
/** Control point offset from stock edge for feedback Bezier arc. */
export const FEEDBACK_ARC_OFFSET = 60;
/** Diamond arrowhead length for feedback connections. */
const DIAMOND_ARROW_LENGTH = 10;
/** Diamond arrowhead half-width for feedback connections. */
const DIAMOND_ARROW_HALF_WIDTH = 3;

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
  return Math.max(0, value / capacity);
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

// ── Story 5.4 — Hover highlight colour ─────────────────────────
/** Warm amber-gold used for the hovered connection glow and tooltip border. */
const HOVER_HIGHLIGHT_COLOR = '#f9e2af';

// ── Story 5.1 — Particle rendering constants ──────────────────────────
/** Warm amber glow colour for particles. */
const PARTICLE_COLOR = '#ffb74d';
/** Radius of each particle dot in world-pixels. */
const PARTICLE_RADIUS = 4;

// ── Story 5.2 — Fill animation constants ──────────────────────────────
/** Lerp speed — fraction of remaining distance covered per 16ms frame.
 *  At 60fps, reaches ~95% of target in ~300ms. */
const FILL_LERP_SPEED = 0.15;
/** AC4: Red/warning tint for stock overflow (value > capacity). */
const STOCK_FILL_OVERFLOW = '#EF9A9A';

// ── Story 7.3 — Breathing glow constants for auto-paused stocks ──────────
/** Full breathing cycle in milliseconds (opacity_min → max → min). */
const BREATHING_GLOW_CYCLE_MS = 2000;
/** Minimum opacity at trough of the breathing cycle. */
const BREATHING_GLOW_OPACITY_MIN = 0.2;
/** Maximum opacity at peak of the breathing cycle. */
const BREATHING_GLOW_OPACITY_MAX = 0.6;
/** Blue-400 glow tint for the breathing overlay. */
const BREATHING_GLOW_COLOR = '#60a5fa';
/** Shadow blur radius for the breathing glow halo. */
const BREATHING_GLOW_BLUR = 20;

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

  // ── Story 5.4: Hovered connection provider ───────────────────────────
  public hoveredConnectionProvider: (() => string | null) | null = null;

  // ── Story 5.4: Tooltip state ─────────────────────────────────────────
  public tooltipScreenPos: { x: number; y: number } | null = null;
  public tooltipText: string | null = null;

  // ── Story 5.4: Snap target edge glow provider ────────────────────────
  /** Returns the world-space position where the snap-target edge glow
   *  ring should be drawn (null = hidden).  Used during connection drag
   *  when cursor is within snap range of a module edge. */
  public snapTargetEdgeGlowProvider: (() => { worldPos: { x: number; y: number }; moduleId: string } | null) | null = null;

  public stockWarningProvider: (() => Record<
    string,
    { inflowMissing: boolean; outflowMissing: boolean }
  >) | null = null;

  // ── Story 5.1 — Particle providers ──────────────────────────────────
  /** Called before each frame render; receives dt in seconds since last frame. */
  public onPreFrame: ((dt: number) => void) | null = null;
  public particleStateProvider: (() => import('./ParticleEngine.js').ParticleState | null) | null = null;

  // ── Story 5.5 — Confetti + border flash providers ────────────────────
  /** Story 5.5 AC1 — Confetti burst state for achievement celebrations.
   *  Returns an array of confetti particles to render this frame.
   *  null = no confetti active. */
  public confettiProvider: (() => ConfettiParticle[] | null) | null = null;

  /** Story 5.5 AC2 — Border flash around a group of module IDs.
   *  Returns the set of module IDs to flash and remaining lifetime. */
  public borderFlashProvider: (() => { moduleIds: string[]; life: number; maxLife: number } | null) | null = null;

  // ── Story 7.1 — Feedback handle/providers ────────────────────────────
  /** Story 7.1 — Returns the stock ID whose feedback handle is currently hovered (null = none). */
  public feedbackHandleHoveredStockIdProvider: (() => string | null) | null = null;

  /** Story 7.1 — Returns the current simulation state for dash animation. */
  public simStateProvider: (() => string) | null = null;

  /** Story 7.1 — Feedback drag preview position in world space (null = hidden). */
  public feedbackDragProvider: (() => { stockId: string; cursorWorldPos: Vec2 } | null) | null = null;

  // ── Story 7.3 — Breathing glow provider ──────────────────────────────
  /** Story 7.3 — Returns the set of stock IDs that should render breathing glow.
   *  Only rendered when simStateProvider returns 'paused'. */
  public breathingGlowStockIdsProvider: (() => Set<string>) | null = null;

  /** Story 7.3 — Animation start time for the breathing glow (continuous from page load). */
  private readonly breathingGlowStartTime: number = performance.now();

  // ── Story 5.2 — Fill animation state ─────────────────────────────────
  /** Per-stock animated fill ratios for smooth fill/shrink transitions.
   *  Keyed by stock node id, value is the currently-displayed fill ratio (0.0–1.0+).
   *  Each frame lerps toward the target ratio computed from node.value / node.capacity. */
  private animatedFillRatios = new Map<string, number>();
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

  private lastFrameTime: number = 0;

  private tick(): void {
    const now = performance.now();
    const rawDt = this.lastFrameTime > 0 ? (now - this.lastFrameTime) / 1000 : 1 / 60;
    this.lastFrameTime = now;
    // Clamp dt to avoid spiral of death (e.g. tab was backgrounded) and guard against negative values
    const clampedDt = Math.min(Math.max(0, rawDt), 0.1);
    if (this.onPreFrame) this.onPreFrame(clampedDt);
    if (this.stateProvider) this.graphState = this.stateProvider();
    // Story 5.2: advance fill animations before drawing
    if (this.graphState) this.tickAnimatedFillRatios(this.graphState.nodes);
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
      this.drawBorderFlash(this.graphState);  // Story 5.5 AC2: flash rings around achieved stack
      this.drawSnapTargetEdgeGlow();  // Story 5.4 AC4 — between modules and connections
      this.drawConnections(this.graphState);
    }
    this.drawGhost();
    this.drawConnectionDragPreview();
    this.drawParticles();
    this.drawConfetti();        // Story 5.5 AC1: confetti above particles, below tooltip
    // Story 5.4 AC3: tooltip drawn last, on top of everything, in screen space
    this.drawHoverTooltip();
  }

  // ── Story 5.4 — Hover Tooltip ────────────────────────────────────────

  /**
   * Story 5.4 AC3 — Draw a multi-line tooltip in screen space showing
   * the connection direction (源 → 存量), rate (速率: X), and optional
   * formula (公式: …). Offsets from the cursor so it doesn't occlude
   * interaction. First line (direction) is dimmed for visual hierarchy.
   */
  private drawHoverTooltip(): void {
    if (!this.tooltipText || !this.tooltipScreenPos) return;
    const { ctx } = this;
    const { x, y } = this.tooltipScreenPos;
    const lines = this.tooltipText.split('\n');
    ctx.save();
    ctx.resetTransform(); // Story 5.4 — tooltip renders in screen space, not world space
    ctx.font = '12px system-ui, sans-serif';
    // measure widest line
    let maxW = 0;
    for (const ln of lines) {
      const m = ctx.measureText(ln);
      if (m.width > maxW) maxW = m.width;
    }
    const lineHeight = 16;
    const pad = 7;
    const tw = maxW;
    const th = lines.length * lineHeight;
    const cr = 5;
    // Position: offset right and below cursor, clamped to canvas bounds
    let bx = Math.max(0, x + 14);
    let by = Math.max(0, y + 14);
    if (bx + tw + pad * 2 > this.canvas.width) bx = Math.max(0, x - tw - pad * 2 - 14);
    if (by + th + pad * 2 > this.canvas.height) by = Math.max(0, y - th - pad * 2 - 14);
    // Background with roundedRect
    ctx.fillStyle = 'rgba(18, 18, 30, 0.94)';
    ctx.strokeStyle = HOVER_HIGHLIGHT_COLOR;
    ctx.lineWidth = 1.2;
    ctx.shadowColor = HOVER_HIGHLIGHT_COLOR;
    ctx.shadowBlur = 8;
    ctx.beginPath();
    this.roundedRect(ctx, bx, by, tw + pad * 2, th + pad * 2, cr);
    ctx.fill();
    ctx.stroke();
    ctx.shadowBlur = 0;
    // Text lines — first line (direction) is dimmer per spec
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    for (let i = 0; i < lines.length; i++) {
      ctx.fillStyle = i === 0 ? 'rgba(200, 200, 200, 0.7)' : '#ffffff';
      ctx.fillText(lines[i], bx + pad, by + pad + i * lineHeight);
    }
    ctx.restore();
  }

  // ── Story 5.2 — Fill Animation ───────────────────────────────────────

  /**
   * Advance animated fill ratios toward their targets.
   * Called once per frame before drawStock so all stocks lerp in sync.
   *
   * @param nodes - Current graph nodes (read-only for target computation).
   */
  private tickAnimatedFillRatios(nodes: Record<string, { type: string }>): void {
    for (const [id, node] of Object.entries(nodes)) {
      if ((node as { type: string }).type !== 'stock') continue;
      const stock = node as unknown as StockNode;
      const target = computeFillRatio(stock.value, stock.capacity);
      const current = this.animatedFillRatios.get(id) ?? target;
      if (Math.abs(target - current) < 0.001) {
        this.animatedFillRatios.set(id, target);
        continue;
      }
      const next = current + (target - current) * FILL_LERP_SPEED;
      this.animatedFillRatios.set(id, next);
    }
    // Clean up stale entries for stocks that no longer exist in the graph.
    // Without this, deleted stocks accumulate forever (memory leak) and
    // stale values resurface after undo/redo cycles as wrong animation start points.
    for (const id of this.animatedFillRatios.keys()) {
      const node = nodes[id];
      if (!node || (node as { type: string }).type !== 'stock') {
        this.animatedFillRatios.delete(id);
      }
    }
  }

  /** Story 5.2 AC5: Clear animated fills so next frame snaps to target (no stale lerp). */
  public resetAnimatedFills(): void {
    this.animatedFillRatios.clear();
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
    const targetRatio = computeFillRatio(node.value, node.capacity);
    const ratio = this.animatedFillRatios.get(node.id) ?? targetRatio;
    // AC3: Infinity capacity → no fill. Guard fill drawing.
    if (ratio > 0 && Number.isFinite(node.capacity) && node.capacity > 0) {
      ctx.save();
      ctx.beginPath();
      this.roundedRect(ctx, x - hw, y - hh, STOCK_WIDTH, STOCK_HEIGHT, cr);
      ctx.clip();
      const fillHeight = STOCK_HEIGHT * ratio;
      // AC4: Overflow tint — red when value exceeds capacity
      const isOverflow = targetRatio > 1.0;
      ctx.fillStyle = isOverflow ? STOCK_FILL_OVERFLOW : STOCK_FILL_BLUE;
      ctx.fillRect(x - hw, y + hh - fillHeight, STOCK_WIDTH, fillHeight);
      ctx.restore();
      ctx.beginPath();
      this.roundedRect(ctx, x - hw, y - hh, STOCK_WIDTH, STOCK_HEIGHT, cr);
      ctx.stroke();
    }

    // ── Story 7.3: Breathing glow overlay for auto-paused stocks ──
    // Z-order: between fill and value text (value text remains readable on top).
    const breathingIds = this.breathingGlowStockIdsProvider?.();
    if (
      breathingIds &&
      breathingIds.has(node.id) &&
      this.simStateProvider?.() === 'paused'
    ) {
      const elapsed = performance.now() - this.breathingGlowStartTime;
      const phase = (elapsed % BREATHING_GLOW_CYCLE_MS) / BREATHING_GLOW_CYCLE_MS;
      const sinVal = Math.sin(phase * Math.PI * 2);
      const opacity =
        BREATHING_GLOW_OPACITY_MIN +
        ((sinVal + 1) / 2) * (BREATHING_GLOW_OPACITY_MAX - BREATHING_GLOW_OPACITY_MIN);
      ctx.save();
      ctx.globalAlpha = opacity;
      ctx.shadowColor = BREATHING_GLOW_COLOR;
      ctx.shadowBlur = BREATHING_GLOW_BLUR;
      ctx.fillStyle = BREATHING_GLOW_COLOR;
      ctx.beginPath();
      this.roundedRect(ctx, x - hw, y - hh, STOCK_WIDTH, STOCK_HEIGHT, cr);
      ctx.fill();
      ctx.restore();
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

    // ── Story 7.1: Feedback handle (amber dot at bottom-right of stock) ──
    // Only draw if stock has at least one incoming connection from a source
    if (this.graphState) {
      const hasSourceInflow = Object.values(this.graphState.connections).some(
        c => c.toId === node.id && !c.isFeedback && this.graphState!.nodes[c.fromId]?.type === 'source',
      );
      if (hasSourceInflow) {
        const handleX = x + hw - FEEDBACK_HANDLE_RADIUS;
        const handleY = y + hh - FEEDBACK_HANDLE_RADIUS;
        const hoveredStockId = this.feedbackHandleHoveredStockIdProvider?.() ?? null;
        const isHovered = hoveredStockId === node.id;
        ctx.save();
        ctx.globalAlpha = isHovered ? FEEDBACK_HANDLE_OPACITY_HOVER : FEEDBACK_HANDLE_OPACITY_DEFAULT;
        ctx.fillStyle = FEEDBACK_LINE_COLOR;
        ctx.beginPath();
        ctx.arc(handleX, handleY, FEEDBACK_HANDLE_RADIUS, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }
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

    // ── Story 5.4: Hovered connection glow (behind all lines) ──
    // Suppressed when the same connection is selected — selection
    // takes visual priority (Dev Notes Decision 1).
    const hoveredId = this.hoveredConnectionProvider?.() ?? null;
    if (hoveredId && hoveredId !== selectedId) {
      const hoveredConn = state.connections[hoveredId];
      if (hoveredConn) {
        const hFromNode = state.nodes[hoveredConn.fromId];
        const hToNode = state.nodes[hoveredConn.toId];
        if (hFromNode && hToNode) {
          const hFromEdge = getEdgePoint(hFromNode, hToNode.position);
          const hToEdge = getEdgePoint(hToNode, hFromNode.position);
          if (!(hFromEdge.x === hToEdge.x && hFromEdge.y === hToEdge.y)) {
            ctx.save();
            ctx.strokeStyle = HOVER_HIGHLIGHT_COLOR;
            ctx.lineWidth = CONNECTION_LINE_WIDTH + 2.5;
            ctx.globalAlpha = 0.35;
            ctx.shadowColor = HOVER_HIGHLIGHT_COLOR;
            ctx.shadowBlur = 8;
            ctx.beginPath();
            ctx.moveTo(hFromEdge.x, hFromEdge.y);
            ctx.lineTo(hToEdge.x, hToEdge.y);
            ctx.stroke();
            ctx.shadowBlur = 0;
            ctx.restore();
          }
        }
      }
    }

    ctx.save();
    ctx.globalAlpha = 0.85;
    for (const conn of connections) {
      const fromNode = state.nodes[conn.fromId];
      const toNode = state.nodes[conn.toId];
      if (!fromNode || !toNode) continue;

      // ── Story 7.1: Feedback connections — dashed amber Bezier self-loop ──
      if (conn.isFeedback && fromNode.type === 'stock') {
        // Story 7.3 (deferred from 7.1): defense-in-depth — feedback must target a source
        if (toNode.type !== 'source') continue;
        const stock = fromNode as StockNode;
        const sx = stock.position.x;
        const sy = stock.position.y;
        const hw = STOCK_WIDTH / 2;
        const hh = STOCK_HEIGHT / 2;

        // Start: bottom-right of stock (feedback handle position)
        const startX = sx + hw - FEEDBACK_HANDLE_RADIUS;
        const startY = sy + hh - FEEDBACK_HANDLE_RADIUS;
        // End: top inflow slot (top edge center)
        const endX = sx;
        const endY = sy - hh;
        // Control point: right side arc
        const cpX = sx + hw + FEEDBACK_ARC_OFFSET;
        const cpY = sy;

        const isSelected = conn.id === selectedId;
        const isHovered = conn.id === hoveredId;
        const lineColor = isSelected ? SELECTION_COLOR : isHovered ? HOVER_HIGHLIGHT_COLOR : FEEDBACK_LINE_COLOR;

        ctx.save();
        ctx.strokeStyle = lineColor;
        ctx.lineWidth = isSelected ? FEEDBACK_LINE_WIDTH + 2 : isHovered ? FEEDBACK_LINE_WIDTH + 1 : FEEDBACK_LINE_WIDTH;
        ctx.setLineDash([...FEEDBACK_DASH_SEGMENTS]);

        // Animate dash offset during simulation
        const simState = this.simStateProvider?.();
        if (simState === 'running') {
          ctx.lineDashOffset = -(performance.now() / 50) % (FEEDBACK_DASH_SEGMENTS[0] + FEEDBACK_DASH_SEGMENTS[1]);
        }

        ctx.beginPath();
        ctx.moveTo(startX, startY);
        ctx.quadraticCurveTo(cpX, cpY, endX, endY);
        ctx.stroke();
        ctx.setLineDash([]);

        // Diamond arrowhead at end point
        this.drawDiamondArrowhead(ctx, cpX, cpY, endX, endY, lineColor);

        // Rate label at Bezier midpoint (t=0.5)
        const midX = 0.25 * startX + 0.5 * cpX + 0.25 * endX;
        const midY = 0.25 * startY + 0.5 * cpY + 0.25 * endY;
        ctx.fillStyle = isSelected ? SELECTION_COLOR : '#d97706';
        ctx.font = '10px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillText(`∝${conn.rate.toFixed(2)}`, midX, midY - 4);

        ctx.restore();
        continue;
      }

      // ── Normal connections — straight lines ──
      const fromEdge = getEdgePoint(fromNode, toNode.position);
      const toEdge = getEdgePoint(toNode, fromNode.position);
      if (fromEdge.x === toEdge.x && fromEdge.y === toEdge.y) continue;
      const isSelected = conn.id === selectedId;
      const isHovered = conn.id === hoveredId;
      const lineColor = isSelected ? SELECTION_COLOR : isHovered ? HOVER_HIGHLIGHT_COLOR : CONNECTION_LINE_COLOR;
      const lineWidth = isSelected
        ? CONNECTION_LINE_WIDTH + 2
        : isHovered
          ? CONNECTION_LINE_WIDTH + 1
          : CONNECTION_LINE_WIDTH;
      ctx.strokeStyle = lineColor;
      ctx.lineWidth = lineWidth;
      ctx.beginPath();
      ctx.moveTo(fromEdge.x, fromEdge.y);
      ctx.lineTo(toEdge.x, toEdge.y);
      ctx.stroke();
      const arrowColor = isSelected ? SELECTION_COLOR : isHovered ? HOVER_HIGHLIGHT_COLOR : CONNECTION_ARROW_COLOR;
      this.drawArrowhead(ctx, fromEdge.x, fromEdge.y, toEdge.x, toEdge.y, arrowColor);
      const midX = (fromEdge.x + toEdge.x) / 2;
      const midY = (fromEdge.y + toEdge.y) / 2;
      ctx.fillStyle = isSelected ? SELECTION_COLOR : isHovered ? '#ffffff' : '#c0c0c0';
      ctx.font = '11px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillText(`${conn.rate}x`, midX, midY - 4);
    }
    ctx.restore();

    // ── Story 7.1: Feedback drag preview ──
    this.drawFeedbackDragPreview(state);
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

  // ── Story 5.4 — Snap Target Edge Glow ───────────────────────────────

  /**
   * Story 5.4 AC4 — Draw a pulsing glow ring at the snap-target module
   * edge during connection drag.  Two concentric filled circles with
   * animated opacity, using the cyan connection colour (#4fc3f7) for
   * semantic consistency with the connection preview line.
   *
   * Called from drawFrame() between drawModules() and drawConnections()
   * so the rubber-band line (drawn later) appears on top of the glow.
   */
  private drawSnapTargetEdgeGlow(): void {
    const snapGlow = this.snapTargetEdgeGlowProvider?.();
    if (!snapGlow) return;
    const { ctx } = this;
    const t = performance.now() / 1000;
    const pulse = 0.3 + 0.3 * Math.sin(t * 4); // oscillate 0.0–0.6
    ctx.save();
    // Inner ring — brighter
    ctx.globalAlpha = pulse;
    ctx.fillStyle = 'rgba(79, 195, 247, 0.6)';
    ctx.shadowColor = '#4fc3f7';
    ctx.shadowBlur = 16;
    ctx.beginPath();
    ctx.arc(snapGlow.worldPos.x, snapGlow.worldPos.y, 8, 0, Math.PI * 2);
    ctx.fill();
    // Outer ring — softer, larger
    ctx.globalAlpha = pulse * 0.5;
    ctx.beginPath();
    ctx.arc(snapGlow.worldPos.x, snapGlow.worldPos.y, 14, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
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

  // ── Story 5.5 — Confetti ────────────────────────────────────────────

  /**
   * Story 5.5 AC1 — Draw confetti particles as small rotated rectangles.
   * Confetti renders above particles but below tooltip.
   */
  private drawConfetti(): void {
    const particles = this.confettiProvider?.();
    if (!particles || particles.length === 0) return;
    const { ctx } = this;
    for (const p of particles) {
      const alpha = Math.max(0, p.life / p.maxLife);
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rotation);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
      ctx.restore();
    }
  }

  // ── Story 5.5 — Border Flash ────────────────────────────────────────

  /**
   * Story 5.5 AC2 — Draw a pulsing gold ring around each module in the
   * achievement group, fading out over ~1.5s.
   */
  private drawBorderFlash(state: GraphState): void {
    const flash = this.borderFlashProvider?.();
    if (!flash || flash.life <= 0) return;
    const { ctx } = this;
    const alpha = flash.life / flash.maxLife;
    const pulse = 1 + 0.15 * Math.sin(performance.now() / 1000 * 2 * Math.PI * 8); // 8 Hz shimmer
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = '#ffd700';
    ctx.lineWidth = 4 * pulse;
    for (const id of flash.moduleIds) {
      const node = state.nodes[id];
      if (!node) continue;
      const r = getModuleBoundingRadius(node);
      ctx.beginPath();
      ctx.arc(node.position.x, node.position.y, r + 4, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  // ── Story 5.1 — Particles ───────────────────────────────────────────

  /**
   * Draw all particles on their respective connection paths.
   *
   * AC1: Particles are small amber dots (#ffb74d) moving from source to
   *   destination along the connection line.
   * AC2: Particle speed is proportional to connection rate.
   * AC3: Zero-rate connections show no particles.
   * AC4: Paused state freezes particles in place.
   * AC5: Particles have a lifespan; they fade in at spawn and disappear
   *   at arrival.
   */
  private drawParticles(): void {
    const particleState = this.particleStateProvider?.();
    if (!particleState) return;
    if (!this.graphState) return;
    const { ctx } = this;
    ctx.save();
    for (const [connId, particles] of particleState.particlesByConnection) {
      if (particles.length === 0) continue;
      const conn = this.graphState.connections[connId];
      if (!conn) continue;
      const fromNode = this.graphState.nodes[conn.fromId];
      const toNode = this.graphState.nodes[conn.toId];
      if (!fromNode || !toNode) continue;
      const fromEdge = getEdgePoint(fromNode, toNode.position);
      const toEdge = getEdgePoint(toNode, fromNode.position);
      if (fromEdge.x === toEdge.x && fromEdge.y === toEdge.y) continue;
      for (const p of particles) {
        // Linear interpolation along connection path
        const x = fromEdge.x + (toEdge.x - fromEdge.x) * p.t;
        const y = fromEdge.y + (toEdge.y - fromEdge.y) * p.t;
        ctx.globalAlpha = p.alpha;
        ctx.fillStyle = PARTICLE_COLOR;
        ctx.beginPath();
        ctx.arc(x, y, PARTICLE_RADIUS, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  // ── Story 7.1 — Diamond Arrowhead for feedback connections ──────────

  /**
   * Draw an open diamond arrowhead at the end point of a feedback Bezier.
   * Oriented along the tangent from the control point to the end point.
   */
  private drawDiamondArrowhead(
    ctx: CanvasRenderingContext2D,
    cpX: number, cpY: number,
    endX: number, endY: number,
    strokeColor: string,
  ): void {
    const dx = endX - cpX;
    const dy = endY - cpY;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (!Number.isFinite(len) || len < 1) return;
    const ux = dx / len;
    const uy = dy / len;

    // Diamond: tip at end point, then back + perpendicular, then back to center, then other perpendicular
    const tipX = endX;
    const tipY = endY;
    const backX = tipX - ux * DIAMOND_ARROW_LENGTH;
    const backY = tipY - uy * DIAMOND_ARROW_LENGTH;
    const midX = tipX - ux * DIAMOND_ARROW_LENGTH / 2;
    const midY = tipY - uy * DIAMOND_ARROW_LENGTH / 2;
    const leftX = midX + uy * DIAMOND_ARROW_HALF_WIDTH;
    const leftY = midY - ux * DIAMOND_ARROW_HALF_WIDTH;
    const rightX = midX - uy * DIAMOND_ARROW_HALF_WIDTH;
    const rightY = midY + ux * DIAMOND_ARROW_HALF_WIDTH;

    ctx.save();
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = FEEDBACK_LINE_WIDTH;
    ctx.beginPath();
    ctx.moveTo(tipX, tipY);
    ctx.lineTo(leftX, leftY);
    ctx.lineTo(backX, backY);
    ctx.lineTo(rightX, rightY);
    ctx.closePath();
    ctx.stroke();
    ctx.restore();
  }

  // ── Story 7.1 — Feedback Drag Preview ──────────────────────────────

  /**
   * Draw a dashed amber preview line from the stock's feedback handle
   * to the cursor position during feedback handle drag.
   */
  private drawFeedbackDragPreview(state: GraphState): void {
    const dragData = this.feedbackDragProvider?.();
    if (!dragData) return;
    const { stockId, cursorWorldPos } = dragData;
    const stockNode = state.nodes[stockId];
    if (!stockNode || stockNode.type !== 'stock') return;
    const stock = stockNode as StockNode;
    const hw = STOCK_WIDTH / 2;
    const hh = STOCK_HEIGHT / 2;
    const startX = stock.position.x + hw - FEEDBACK_HANDLE_RADIUS;
    const startY = stock.position.y + hh - FEEDBACK_HANDLE_RADIUS;

    const { ctx } = this;
    ctx.save();
    ctx.globalAlpha = 0.6;
    ctx.strokeStyle = FEEDBACK_LINE_COLOR;
    ctx.lineWidth = FEEDBACK_LINE_WIDTH;
    ctx.setLineDash([...FEEDBACK_DASH_SEGMENTS]);
    ctx.beginPath();
    ctx.moveTo(startX, startY);
    ctx.lineTo(cursorWorldPos.x, cursorWorldPos.y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
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