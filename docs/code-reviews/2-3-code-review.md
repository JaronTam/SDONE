# Code Review: Story 2.3 — Module Shape Renderer

**Date:** 2026-05-22
**Reviewer:** AI Senior Developer (BMad Code Review)
**Mode:** Full (spec file available)
**Outcome:** Changes Requested (see action items)

---

## Review Summary

| Severity | Count | Items |
|----------|-------|-------|
| 🔴 HIGH | 1 | B1: Missing unit tests |
| 🟡 MEDIUM | 2 | B2: Cross-story scope violation (drawConnections); E5: Hit-radius default branch assumption |
| 🟢 LOW | 5 | B3: Unused import; B4: roundedRect robustness; E2: save/restore consistency; E3/E4: Edge cases (low risk) |

All 8 Acceptance Criteria are satisfied. Core rendering logic is correct.

---

## Layer 1: Blind Hunter — Architecture & Spec Violations

### B1 [HIGH] — Missing Unit Tests

**Location:** `SceneRenderer.ts:29-40, 189-205, 309-312`

`getHitRadius()`, `getModuleBoundingRadius()`, fill ratio calculation, and color constants are pure logic that should be unit tested. No test files exist in the story's File List. The following are untestable without a test suite:

- Hit-radius constant correctness (SOURCE_HIT_RADIUS = 32, STOCK_HIT_RADIUS ≈ 72.1, SINK_HIT_RADIUS = 24)
- `getHitRadius()` dispatches correctly for each type
- `getModuleBoundingRadius()` includes SELECTION_RING_OFFSET (6px) correctly
- Fill ratio: `clamp(value / capacity, 0, 1)` behavior including capacity=0

**Recommendation:** Add unit tests in `sdone/src/canvas/__tests__/SceneRenderer.test.ts` covering at minimum `getHitRadius()`, `getModuleBoundingRadius()`, and fill ratio calculation.

---

### B2 [MEDIUM] — Cross-Story Scope Violation (drawConnections)

**Location:** `SceneRenderer.ts:431-446, 135`

`drawConnections()` draws center-to-center pink lines. Story 2.3 spec explicitly states:
> ❌ No connection arrow rendering — Story 2.4

While this may have been added for development convenience, `drawFrame()` calls `this.drawConnections(this.graphState)` unconditionally at L135. When Story 2.4 implements proper arrow rendering, these placeholder lines could cause visual conflicts or duplicate rendering.

**Recommendation:** Comment out the `drawConnections()` call in `drawFrame()` or guard it with a feature flag. Do NOT remove the method entirely (it provides a skeleton for Story 2.4), but prevent it from drawing in production.

---

### B3 [LOW] — Unused Import

**Location:** `main.ts:2`

```typescript
import { vec2 } from '../shared/Vec2.js';
```

`vec2` is imported as a value but never used in `main.ts`. Only the type `Vec2` is used (L69 inline type import). This is dead code.

**Recommendation:** Remove `{ vec2 }` from the import, keeping only the type import: `import type { Vec2 } from '../shared/Vec2.js';`

---

### B4 [LOW] — roundedRect Robustness

**Location:** `SceneRenderer.ts:407-425`

`roundedRect()` does not guard against negative width/height. Currently only called with positive constants (STOCK_WIDTH=120, STOCK_HEIGHT=80), so no immediate issue. If this helper is reused elsewhere with computed dimensions, the arc path could be malformed.

**Recommendation:** Add a guard: `if (w <= 0 || h <= 0) return;` at the top, or document that callers must ensure positive dimensions.

---

## Layer 2: Edge Case Hunter

### E1 [MEDIUM] — Hit-Radius Default Branch Assumption

**Location:** `SceneRenderer.ts:29-40, 189-205`

Both `getHitRadius()` and `getModuleBoundingRadius()` default to sink values for unknown types. This is consistent with `drawModules()`'s `default: drawFallback()`. However, if a new module type is added to `ModuleType` without updating these switch statements, the behavior silently falls through to sink values — no compilation error, no runtime warning.

**Recommendation:** Consider adding a `default: throw new Error(`Unsupported module type: ${moduleType}`)` in `getHitRadius()`, or at minimum add a console warning. The current behavior is defensive but hides bugs.

---

### E2 [LOW] — Save/Restore Consistency

**Location:** `SceneRenderer.ts:314-328, 258-288, 351-391`

`drawStock()` uses `ctx.save()`/`ctx.restore()` to isolate the clip path for fill level. `drawSource()` and `drawSink()` directly set `fillStyle`/`strokeStyle`/`lineWidth` without save/restore — they rely on the next draw call to set its own styles. Safe in the current two-pass architecture, but a future refactor that changes draw order could bleed styles.

**Recommendation:** Add `ctx.save()`/`ctx.restore()` wrappers to `drawSource()` and `drawSink()` for consistency and future-proofing.

---

### E3 [LOW] — Empty State Rendering

**Location:** `SceneRenderer.ts:133-136`

Empty `nodes: {}, connections: {}` state is handled gracefully — `Object.entries({})` returns empty array, loops don't execute, no crash. ✓

---

### E4 [LOW] — Zero-Height Fill Rect

**Location:** `SceneRenderer.ts:319-321`

When ratio = 0, `fillHeight = 0` and `fillRect(x, y, w, 0)` is called. Canvas silently ignores zero-size rects. ✓

---

## Layer 3: Acceptance Auditor

| AC | Description | Status | Evidence |
|----|-------------|--------|----------|
| AC1 | Source cloud shape (light green, overlapping circles) | ✅ PASS | `drawSource()` L258-288 |
| AC2 | Stock rounded rect with fill level (120×80, white, blue fill, centered value) | ✅ PASS | `drawStock()` L292-347 |
| AC3 | Sink infinity/funnel shape (dark red) | ✅ PASS | `drawSink()` L351-391 |
| AC4 | Viewport transform applied (world→screen mapping) | ✅ PASS | `drawFrame()` L127-130 |
| AC5 | Per-module color override (node.color ?? default) | ✅ PASS | L261, L354 |
| AC6 | Module labels below shape (per-type colors) | ✅ PASS | L244-252 |
| AC7 | Unknown type fallback (gray circle) | ✅ PASS | L239-240 → L395-404 |
| AC8 | Selected module highlight (warm yellow glow behind) | ✅ PASS | L212-225 (pass 1), L228 (pass 2) |

---

## Action Items

- [ ] **[HIGH]** B1: Add unit tests for `getHitRadius()`, `getModuleBoundingRadius()`, and fill ratio calculation
- [ ] **[MEDIUM]** B2: Guard `drawConnections()` call in `drawFrame()` — comment out or feature-flag until Story 2.4
- [ ] **[LOW]** B3: Remove unused `{ vec2 }` value import from `main.ts:2`
- [ ] **[LOW]** B4: Add negative-dimension guard to `roundedRect()`
- [ ] **[LOW]** E2: Add `save()`/`restore()` to `drawSource()` and `drawSink()` for consistency

---

## Files Reviewed

| File | Lines | Purpose |
|------|-------|---------|
| `sdone/src/canvas/SceneRenderer.ts` | 1-447 | Module shape rendering, color palette, hit-radius helpers, selection highlight |
| `sdone/src/canvas/index.ts` | 1-3 | Module re-exports |
| `sdone/src/main.ts` | 1-116 | Seed modules, state wiring, interaction callbacks |

## References

- Story spec: `_bmad-output/implementation-artifacts/2-3-module-shape-renderer-source-stock-sink-primitives.md`
- Architecture: `_bmad-output/planning-artifacts/architecture.md#Decision 2`
- UX Design: `_bmad-output/planning-artifacts/ux-design-specification.md#Design Rulings`
- Types: `sdone/src/state/GraphState.ts`
- Viewport: `sdone/src/canvas/Viewport.ts`