/**
 * ModulePanel — Left Sidebar Module Panel (Story 3.1)
 *
 * Renders three draggable primitive icons (source cloud, stock rounded-rect,
 * sink funnel) in the left sidebar panel. Each icon is rendered on a small
 * <canvas> using the shared ShapePaths drawing functions for visual
 * consistency with the main scene canvas.
 *
 * Public API:
 *   constructor(container: HTMLElement)
 *   setHidden(hidden: boolean): void
 *   destroy(): void
 *
 * No EventBus dependency — pure DOM component per architecture DI pattern.
 */

import { drawCloud, drawStock, drawSink } from '../../shared/ShapePaths.js';

// ── Constants ──────────────────────────────────────────────────────────

/** CSS class applied to the root panel element. */
const PANEL_CLASS = 'module-panel';
/** CSS class toggled for auto-hide (slides panel off-screen). */
const PANEL_HIDDEN_CLASS = 'module-panel--hidden';

/** Internal canvas buffer size (128×128 for 2× devicePixelRatio = 64px display). */
const ICON_BUFFER_SIZE = 128;
/** CSS display size of each icon canvas (AC2: 64×64px). */
const ICON_DISPLAY_SIZE = 64;

const ICON_DEFINITIONS: Array<{
  type: string;
  label: string;
  fillColor: string;
  strokeColor: string;
  drawFn: (ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, cx: number, cy: number, size: number) => void;
}> = [
  {
    type: 'source',
    label: '源',
    fillColor: '#90EE90',
    strokeColor: 'rgba(0,0,0,0.3)',
    drawFn: drawCloud,
  },
  {
    type: 'stock',
    label: '存量',
    fillColor: '#FFFFFF',
    strokeColor: '#000000',
    drawFn: drawStock,
  },
  {
    type: 'sink',
    label: '汇',
    fillColor: '#8B0000',
    strokeColor: 'rgba(0,0,0,0.3)',
    drawFn: drawSink,
  },
];

// ── Main Class ─────────────────────────────────────────────────────────

export class ModulePanel {
  private readonly container: HTMLElement;
  private readonly rootEl: HTMLElement;
  private readonly pinBtn: HTMLButtonElement;
  private readonly boundPinClick: () => void;

  /** Story 3.5 — Currently highlighted module type (set by click, read by Enter handler). */
  private selectedType: 'source' | 'stock' | 'sink' | null = null;

  /** Icon elements mapped by type for class toggling. */
  private readonly iconElements: Map<string, HTMLElement> = new Map();

  /** Drag event listeners keyed by element for cleanup on destroy(). */
  private readonly dragDisposers: Array<{
    el: HTMLElement;
    handler: (e: DragEvent) => void;
  }> = [];

  constructor(container: HTMLElement) {
    this.container = container;

    // Build root element
    const root = document.createElement('div');
    root.className = PANEL_CLASS;
    this.rootEl = root;

    // ── Header ──────────────────────────────────────
    const header = document.createElement('div');
    header.className = 'module-panel__header';

    const title = document.createElement('span');
    title.className = 'module-panel__title';
    title.textContent = '构件面板';

    const pinBtn = document.createElement('button');
    pinBtn.className = 'module-panel__pin-btn';
    pinBtn.textContent = '📌';
    pinBtn.setAttribute('aria-label', 'Toggle panel pin');
    this.pinBtn = pinBtn;

    this.boundPinClick = this.handlePinClick.bind(this);
    pinBtn.addEventListener('click', this.boundPinClick);

    header.appendChild(title);
    header.appendChild(pinBtn);
    root.appendChild(header);

    // ── Icon List ───────────────────────────────────
    const iconList = document.createElement('div');
    iconList.className = 'module-panel__icon-list';

    for (const def of ICON_DEFINITIONS) {
      const iconItem = this.createIconItem(def);
      iconList.appendChild(iconItem);
    }

    root.appendChild(iconList);
    container.appendChild(root);
  }

  // ── Public API ───────────────────────────────────────────────────────

  /**
   * Story 3.5 — Return the currently highlighted module type.
   * Returns null if no type has been selected (or after a module was placed).
   */
  getSelectedType(): 'source' | 'stock' | 'sink' | null {
    return this.selectedType;
  }

  /**
   * Show or hide the panel via CSS transform.
   * Will be wired to EventBus RUN/PAUSE/RESET in Story 6.6.
   */
  setHidden(hidden: boolean): void {
    if (hidden) {
      this.rootEl.classList.add(PANEL_HIDDEN_CLASS);
    } else {
      this.rootEl.classList.remove(PANEL_HIDDEN_CLASS);
    }
  }

  /**
   * Remove all DOM nodes and event listeners.
   * Called from main.ts hot-reload dispose.
   */
  destroy(): void {
    this.pinBtn.removeEventListener('click', this.boundPinClick);
    for (const { el, handler } of this.dragDisposers) {
      el.removeEventListener('dragstart', handler);
    }
    this.dragDisposers.length = 0;
    if (this.rootEl.parentNode === this.container) {
      this.container.removeChild(this.rootEl);
    }
  }

  // ── Private Helpers ──────────────────────────────────────────────────

  /**
   * Create a single icon item: <canvas> for shape + <span> for label.
   */
  private createIconItem(
    def: (typeof ICON_DEFINITIONS)[number],
  ): HTMLElement {
    const iconItem = document.createElement('div');
    iconItem.className = 'module-icon';
    iconItem.setAttribute('data-module-type', def.type);
    // Story 3.5: Make focusable for Enter-key placement
    iconItem.setAttribute('tabindex', '0');
    iconItem.setAttribute('role', 'option');
    iconItem.setAttribute('aria-selected', 'false');

    // Store for later class toggling
    this.iconElements.set(def.type, iconItem);

    // ── Story 3.5: Click to highlight for Enter placement ──
    iconItem.addEventListener('click', () => {
      this.setHighlightedType(def.type as 'source' | 'stock' | 'sink');
    });

    // Canvas for shape rendering
    const canvas = document.createElement('canvas');
    canvas.className = 'module-icon__canvas';
    canvas.width = ICON_BUFFER_SIZE;
    canvas.height = ICON_BUFFER_SIZE;
    canvas.style.width = `${ICON_DISPLAY_SIZE}px`;
    canvas.style.height = `${ICON_DISPLAY_SIZE}px`;

    // Render the shape
    this.renderIconShape(canvas, def);

    // Label span
    const label = document.createElement('span');
    label.className = 'module-icon__label';
    label.textContent = def.label;

    iconItem.appendChild(canvas);
    iconItem.appendChild(label);

    // ── Story 3.2: Drag-start wiring ──────────────
    iconItem.setAttribute('draggable', 'true');

    const dragHandler = (e: DragEvent): void => {
      // Set drag data for HTML DnD API
      if (e.dataTransfer) {
        e.dataTransfer.setData('application/x-sdone-module', def.type);
        e.dataTransfer.effectAllowed = 'copy';
      }
    };

    iconItem.addEventListener('dragstart', dragHandler);
    this.dragDisposers.push({ el: iconItem, handler: dragHandler });

    return iconItem;
  }

  /**
   * Render a single module icon shape onto the provided canvas.
   *
   * Uses the same draw functions as SceneRenderer (via ShapePaths)
   * to guarantee visual consistency across main canvas and sidebar.
   */
  private renderIconShape(
    canvas: HTMLCanvasElement,
    def: (typeof ICON_DEFINITIONS)[number],
  ): void {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Scale for device-pixel ratio for HiDPI crispness
    const dpr = window.devicePixelRatio || 1;
    const logicalSize = ICON_DISPLAY_SIZE;
    const bufferSize = Math.ceil(logicalSize * dpr);

    // Resize canvas buffer if DPR differs from default
    if (bufferSize !== ICON_BUFFER_SIZE) {
      canvas.width = bufferSize;
      canvas.height = bufferSize;
      canvas.style.width = `${logicalSize}px`;
      canvas.style.height = `${logicalSize}px`;
    }

    ctx.save();
    ctx.scale(dpr, dpr);

    // Clear
    ctx.clearRect(0, 0, logicalSize, logicalSize);

    const cx = logicalSize / 2;
    const cy = logicalSize / 2;
    // Scale the shape to fit within the logical canvas size,
    // leaving a small padding margin.
    const shapeSize = logicalSize * 0.75;

    ctx.fillStyle = def.fillColor;
    ctx.strokeStyle = def.strokeColor;
    ctx.lineWidth = 1.2;

    def.drawFn(ctx, cx, cy, shapeSize);

    ctx.restore();
  }

  /**
   * Pin button click handler — no-op for Story 3.1.
   * Logs to console per AC5.
   */
  private handlePinClick(): void {
    console.log('[ModulePanel] pin toggle clicked (no-op in 3.1)');
  }

  /**
   * Story 3.5 — Set the currently highlighted module type and update
   * ARIA attributes + visual classes on icon elements.
   */
  private setHighlightedType(type: 'source' | 'stock' | 'sink' | null): void {
    this.selectedType = type;

    // Update aria-selected and data-highlighted on all icons
    for (const [iconType, el] of this.iconElements) {
      const isSelected = iconType === type;
      el.setAttribute('aria-selected', String(isSelected));
      if (isSelected) {
        el.setAttribute('data-highlighted', 'true');
      } else {
        el.removeAttribute('data-highlighted');
      }
    }
  }
}
