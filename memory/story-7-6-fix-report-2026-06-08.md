# Story 7.6 Code Review — Fix Report

**Date:** 2026-06-08
**Story:** 7.6: Vitest Unit & Integration Tests
**Review Report:** `docs/code-reviews/story-7-6-code-review-2026-06-08.md`
**Audit Report:** `memory/story-7-6-review-audit-2026-06-08.md`

---

## Patches Applied (2)

### P1: Dead code — unused `makeSink` function and `SinkNode` import ✅

| Field | Value |
|-------|-------|
| **Severity** | 🟢 Low |
| **Source** | audit (deep review) |
| **Location** | `SimulationEngine.integration.test.ts:8,31-33` |
| **Status** | ✅ Fixed |

**Problem:** `makeSink()` function (lines 31-33) was defined but never called in any test. `SinkNode` type was imported (line 8) only for the `makeSink` return type.

**Fix:** Removed `SinkNode` from import and deleted `makeSink()` function entirely.

**Diff:**
```diff
-import type {
-  GraphState,
-  StockNode,
-  SourceNode,
-  SinkNode,
-  Connection,
-} from '../state/GraphState.js';
+import type {
+  GraphState,
+  StockNode,
+  SourceNode,
+  Connection,
+} from '../state/GraphState.js';

-function makeSink(id: string): SinkNode {
-  return { id, type: 'sink', position: { x: 0, y: 0 } };
-}
-
 function makeConnection(
```

---

### P2: `afterEach` cleanup incomplete — engine not reset before restoring real timers ✅

| Field | Value |
|-------|-------|
| **Severity** | 🟡 Medium |
| **Source** | audit (deep review) |
| **Location** | `SimulationEngine.integration.test.ts:104-106` |
| **Status** | ✅ Fixed |

**Problem:** `afterEach` only called `vi.useRealTimers()` but did not call `engine.reset()`. When a test ended with the engine running, the `setInterval` handle and `visibilitychange` listener remained attached. While Vitest's `useRealTimers()` clears pending fake timers (so no test interference occurred), this violated the "leave no side effects" principle.

**Fix:** Added `engine.reset()` before `vi.useRealTimers()` in `afterEach`. `engine.reset()` calls `pause()` → `clearInterval()` + removes `visibilitychange` listener → resets state to idle.

**Diff:**
```diff
   afterEach(() => {
+    engine.reset();
     vi.useRealTimers();
   });
```

---

## Verification

| Check | Result |
|-------|--------|
| Integration test file (`SimulationEngine.integration.test.ts`) | ✅ 19/19 pass |
| Full test suite (`npx vitest run`) | ✅ 32 files, 750 tests, 0 failures |
| No `makeSink`/`SinkNode` references remain | ✅ Confirmed via search |
| `engine.reset()` present in `afterEach` before `vi.useRealTimers()` | ✅ Line 100-101 |

---

## Deferred Items (4)

All deferred items are pre-existing coverage gaps outside Story 7.6's scope. Implementation suggestions provided in `deferred-work.md`.

| # | Title | Target |
|---|-------|--------|
| D1 | `addFeedbackConnection` 零测试覆盖 | Next feedback story |
| D2 | `updateFormula` 零测试覆盖 | Next formula story |
| D3 | 反馈连接集成路径未测试 | Story 7.7 |
| D4 | 不安全 `as StockNode` 断言 | Epic 8 |