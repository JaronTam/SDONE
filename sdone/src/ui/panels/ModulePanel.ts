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

  /** Story 6.5 AC3 — Re-expand tab (visible when panel auto-hidden). */
  private readonly reExpandTab: HTMLElement;

  /** Story 6.5 — Bound click handler for reExpandTab cleanup in destroy(). */
  private readonly boundReExpandClick: () => void;

  /** Story 6.6 — Whether the panel is pinned (prevents auto-hide during simulation). */
  private _pinned: boolean = false;

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
    pinBtn.setAttribute('aria-label', '固定面板');
    pinBtn.setAttribute('aria-pressed', 'false');
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

    // ── Story 6.5 AC1: Compositions area (lower half) ──────────────
    const divider = document.createElement('div');
    divider.className = 'module-panel__divider';

    const compositionsSection = document.createElement('div');
    compositionsSection.className = 'module-panel__compositions';

    const compositionsHeader = document.createElement('div');
    compositionsHeader.className = 'module-panel__compositions-header';

    const compositionsTitle = document.createElement('span');
    compositionsTitle.className = 'module-panel__compositions-title';
    compositionsTitle.textContent = '组合';

    compositionsHeader.appendChild(compositionsTitle);

    const compositionsBody = document.createElement('div');
    compositionsBody.className = 'module-panel__compositions-body';

    const compositionsPlaceholder = document.createElement('p');
    compositionsPlaceholder.className = 'module-panel__compositions-placeholder';
    compositionsPlaceholder.textContent = '选中三个模块后命名此逻辑堆栈';

    compositionsBody.appendChild(compositionsPlaceholder);
    compositionsSection.appendChild(compositionsHeader);
    compositionsSection.appendChild(compositionsBody);

    root.appendChild(divider);
    root.appendChild(compositionsSection);

    container.appendChild(root);

    // ── Story 6.5 AC3: Re-expand tab (visible when panel auto-hidden) ──
    const reExpandTab = document.createElement('div');
    reExpandTab.className = 'module-panel__re-expand-tab';
    reExpandTab.title = '展开面板';
    reExpandTab.setAttribute('aria-label', '展开模块面板');
    reExpandTab.innerHTML = '<span class="module-panel__re-expand-arrow">▶</span>';
    this.boundReExpandClick = () => {
      this.setHidden(false);
      this.setPinned(true);  // Story 6.6 AC1 — re-expand also pins the panel
    };
    reExpandTab.addEventListener('click', this.boundReExpandClick);
    this.reExpandTab = reExpandTab;
    container.appendChild(reExpandTab);

    // Story 6.6 — Set initial pin button appearance
    this.updatePinButtonAppearance();
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
   * Story 6.5 — Clear highlighted icon selection (e.g., after placement).
   */
  clearSelection(): void {
    this.setHighlightedType(null);
  }

  /** Story 6.6 — Whether the panel is pinned (prevents auto-hide during simulation). */
  isPinned(): boolean {
    return this._pinned;
  }

  /** Story 6.6 — Programmatically set pin state (used by keyboard shortcut "P"). */
  setPinned(pinned: boolean): void {
    if (this._pinned !== pinned) {
      this._pinned = pinned;
      this.updatePinButtonAppearance();
    }
  }

  /**
   * Show or hide the panel via CSS transform.
   * Wired to EventBus RUN/PAUSE/RESET in Story 6.5.
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
    // Story 6.5 AC3: Clean up re-expand tab
    if (this.reExpandTab) {
      this.reExpandTab.removeEventListener('click', this.boundReExpandClick);
      if (this.reExpandTab.parentNode === this.container) {
        this.container.removeChild(this.reExpandTab);
      }
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

  /** Story 6.6 — Toggle pin state on pin button click. */
  private handlePinClick(): void {
    this._pinned = !this._pinned;
    this.updatePinButtonAppearance();
  }

  /** Story 6.6 — Update pin button to reflect current pinned state. */
  private updatePinButtonAppearance(): void {
    if (this._pinned) {
      this.pinBtn.classList.add('module-panel__pin-btn--active');
      this.pinBtn.setAttribute('aria-label', '取消固定面板');
      this.pinBtn.setAttribute('aria-pressed', 'true');
    } else {
      this.pinBtn.classList.remove('module-panel__pin-btn--active');
      this.pinBtn.setAttribute('aria-label', '固定面板');
      this.pinBtn.setAttribute('aria-pressed', 'false');
    }
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
