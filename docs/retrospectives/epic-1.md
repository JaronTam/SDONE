# Epic 1 Retrospective — Core Protocol Foundation

**Date:** 2026-05-21
**Status:** Complete ✅
**Test Results:** 86/86 passing, 0 failures

---

## What Was Planned

Epic 1 addressed the SDONE simulator's core data layer — the structural primitives every subsequent feature depends on:

- **Story 1.1:** `GraphState` type definitions (ModuleNode, StockNode, SourceNode, SinkNode, Connection, GraphState)
- **Story 1.2:** `EventBus` — type-safe pub/sub for simulation lifecycle events (RUN, PAUSE, RESET)
- **Story 1.3:** `HistoryManager` — undo/redo stack with `structuredClone` deep copies
- **Story 1.4:** `utils.ts` — pipeline + UUID generators

## What Was Actually Delivered

All four stories were delivered plus one additional story:

| Story | Deliverable | Tests | LOC |
|-------|------------|-------|-----|
| 1.1 | `src/state/GraphState.ts` + `test.ts` | 15 | ~80 |
| 1.2 | `src/event-bus/EventBus.ts` + `test.ts` | 17 | ~80 |
| 1.3 | `src/state/HistoryManager.ts` + `test.ts` | 24 | ~120 |
| 1.4 | `src/shared/utils.ts` + `test.ts` | 3 | ~40 |
| **1.5** | `src/state/mutations.ts` + `test.ts` | **27** | ~280 |

**Total: 86 tests, 5 files, full type safety**

### Story 1.5: Mutations Layer (Post-Retrospective Implementation)

The retrospective exposed a critical design gap: Epic 1 defined the **what** (state shape, history recording, event dispatch) but not the **how** (how state transitions occur). The mutations layer bridges this gap with six pure reducer-style functions:

| Mutation | Semantics |
|----------|----------|
| `addModule` | Creates stock/source/sink with type-specific defaults |
| `deleteModule` | Removes node + cascade-deletes all connected edges |
| `moveModule` | Updates canvas position (preserves other properties) |
| `addConnection` | Creates directed edge between existing modules |
| `deleteConnection` | Removes a single edge |
| `updateRate` | Sets rate/formulaStr on a connection |

All mutations follow a strict contract:
- **Pure functions** — no side effects, no EventBus, no DOM
- **Immutable** — return new `GraphState`; input is never mutated
- **Monotonic version** — version increments only on actual changes; no-ops return `version` unchanged
- **No operation returns void** — every function returns a `GraphState`
- **27 acceptance criteria** verified by tests

## Root Cause Analysis: The Design Gap

**Symptom:** HistoryManager stored state snapshots, but nothing produced meaningful transitions between snapshots.

**Root Cause:** Three-layer architecture misunderstanding:
1. `GraphState` = data shape ✓
2. `HistoryManager` = recording/restoring ✓
3. `Mutations` = state transitions ✗ (missing)

Without the mutations layer, every consumer (canvas, toolbar, keyboard shortcuts) would independently reinvent the same CRUD logic on `GraphState.nodes`/`GraphState.connections`, creating:
- Duplicate code
- Inconsistent default values
- Scattered version bumping logic
- No single place for cascade semantics (e.g., deleteModule → delete all connected edges)

**Fix:** Implemented Story 1.5 with full test coverage before proceeding to Epic 2.

## What Went Well

1. **Type-first design** — `GraphState.ts` discriminated unions caught errors at compile time
2. **Test coverage** — every story has dedicated test files with clear acceptance criteria labels
3. **Cascade semantics** — `deleteModule` correctly removes all connected `Connection` entries
4. **AC labeling** — tests reference specific acceptance criteria (AC1–AC20), making traceability trivial
5. **No-ops are explicit** — unchanged version clearly communicates "nothing happened" to callers

## What Could Be Improved

1. **No integration tests** — unit tests verify individual mutations but not composition (e.g., addModule → moveModule → undo via HistoryManager)
2. **No serialization tests for Infinity** — `capacity: Infinity` survives `structuredClone` but not `JSON.stringify`; this is a known risk for save/load
3. **Formula parsing not implemented** — `formulaStr` is always the string representation of `rate`; graph-based formula expressions (e.g., `stockA * 0.5`) are deferred to Epic 2

## Lessons Learned

1. **Plan mode should verify the full state machine** — we asked "what is the state shape?" but not "what are the valid transitions?" A three-question checklist (shape, transitions, recording) would have caught the gap earlier.
2. **Infinity as a default is a footgun** — `JSON.parse(JSON.stringify(state))` silently converts `Infinity → null`. Production save/load must use a custom serializer or avoid Infinity.
3. **Cascade semantics need explicit tests** — `deleteModule` cascade-deletes edges, but the test coverage for bidirectional edge removal was added as an edge case, not as a core AC. Future stories should list cascade rules explicitly in ACs.

## Epic 2 Readiness

Epic 2 (Simulation Engine) is ready to proceed. The mutations layer provides the canonical state transition functions that the engine will call each tick. Key dependencies satisfied:

- [x] GraphState type definitions
- [x] EventBus for simulation lifecycle (RUN/PAUSE/RESET)
- [x] HistoryManager for undo/redo
- [x] Mutations layer for CRUD operations
- [x] `updateRate` accepts negative rates (sink behavior) and zero rates
- [x] Barrel exports from `state/index.ts`

### Open Questions for Epic 2

1. Should simulation ticks be push-based (EventBus per tick) or pull-based (requestAnimationFrame)?
2. How does formula parsing work? Is `formulaStr` a simple arithmetic expression or a graph-based reference (e.g., `=stockA`)?
3. When does `capacity` enforcement occur — at the mutation level or the simulation level?