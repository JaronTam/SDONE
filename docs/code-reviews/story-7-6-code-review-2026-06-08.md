# Code Review: Story 7.6 — Vitest Unit & Integration Tests

| Field | Value |
|-------|-------|
| **Story** | 7.6: Vitest Unit & Integration Tests |
| **Spec Path** | `_bmad-output/implementation-artifacts/7-6-vitest-unit-and-integration-tests.md` |
| **Baseline Commit** | `035376a4ace9765df07c62443b1e60e14262d769` |
| **Review Date** | 2026-06-08 |
| **Skill** | bmad-code-review |
| **Reviewer** | Cline (Adversarial Code Review) |
| **Final Status** | ✅ Pass with 2 patches, 4 deferred |

---

## §1 Scope

### Declared Scope

Story 7.6 adds `toMatchObject()` snapshot validation to `mutations.test.ts` and creates a new `SimulationEngine.integration.test.ts` with 19 EventBus+SimulationEngine integration tests.

### Actual Diff

| File | Status | Lines Changed |
|------|--------|---------------|
| `sdone/src/state/mutations.test.ts` | Modified | +42 / -0 |
| `sdone/src/simulation/SimulationEngine.integration.test.ts` | New | +405 |
| `package.json` | New (untracked) | jsdom dependency |
| `package-lock.json` | Modified | +550 lock entries |

**Excluded from review:** `package.json`, `package-lock.json` (dependency management only), `docs/code-reviews/story-7-5-code-review-2026-06-08.md` (prior review fix).

---

## §2 Three-Layer Review

| Layer | Status | Findings |
|-------|--------|----------|
| Blind Hunter | ✅ Completed | 3 findings |
| Edge Case Hunter | ✅ Completed | 6 findings |
| Acceptance Auditor | ✅ Completed | 2 findings (both dismissed as false positives) |

---

## §3 Findings

### Dismissed (6)

| # | Source | Title | Dismiss Reason |
|---|--------|-------|----------------|
| 1 | blind | `expect.any(String) as string` 类型转换 | Gate 1: 运行时正确，`as string` 是 TS 样式问题 |
| 2 | blind | `toMatchObject` 部分匹配不验证精确形状 | Gate 1: Spec 明确要求 `toMatchObject()`，是正确的非脆弱选择 |
| 3 | auditor | 集成测试因 `document is not defined` 失败 | **误报** — 实测 750/750 全部通过，jsdom 正常 |
| 4 | auditor | 全套测试 177 个失败 | **误报** — 实测 750/750 全部通过 |
| 5 | edge | 缺少 no-op 状态机转换测试（RESET from idle, PAUSE from paused） | Gate 1: Spec 不要求测试每个状态机转换 |
| 6 | blind | `SNAPSHOT_EMITTED` 深克隆测试中 `snapshotStock.value = 999` 后又读 `snapshotStock.value` | 冗余断言但非错误，测试逻辑正确 |

### Patch (2)

| # | Source | Title | Severity | Location |
|---|--------|-------|----------|----------|
| P1 | audit | Dead code: unused `makeSink` function and `SinkNode` import | 🟢 Low | `SimulationEngine.integration.test.ts:8,31-33` |
| P2 | audit | `afterEach` cleanup incomplete — engine not reset before restoring real timers | 🟡 Medium | `SimulationEngine.integration.test.ts:104-106` |

**P1 Detail:** `makeSink()` (lines 31-33) is defined but never called in any test. `SinkNode` is imported (line 8) only for the `makeSink` return type. Both should be removed to keep the test file clean.

**P2 Detail:** `afterEach` only calls `vi.useRealTimers()` but does not call `engine.reset()`. When a test ends with the engine running, the `setInterval` handle and `visibilitychange` listener remain attached. While Vitest's `useRealTimers()` clears pending fake timers (so no test interference occurs today), this violates the "leave no side effects" principle. Fix: add `engine.reset()` before `vi.useRealTimers()` in `afterEach`. Discovered during deep audit — see `memory/story-7-6-review-audit-2026-06-08.md`.

### Deferred (4)

| # | Source | Title | Severity | Location | Target |
|---|--------|-------|----------|----------|--------|
| D1 | edge | `addFeedbackConnection` 零测试覆盖 | 🟠 High | `mutations.ts:342-380` | Next feedback story |
| D2 | edge | `updateFormula` 零测试覆盖 | 🟡 Medium | `mutations.ts:400-421` | Next formula story |
| D3 | edge | 反馈连接集成路径未测试 | 🟠 High | `SimulationEngine.ts:178-216` | Story 7.7 |
| D4 | blind | 不安全的 `as StockNode` 类型断言无运行时守卫 | 🟢 Low | `mutations.test.ts:97` | Epic 8 |

---

## §4 Verification

| Check | Result |
|-------|--------|
| Full test suite (`npx vitest run`) | ✅ 32 files, 750 tests, 0 failures |
| AC1: `toMatchObject()` snapshot validation | ✅ Added to addModule, moveModule, addConnection, updateRate |
| AC2: EventBus+SimulationEngine integration | ✅ 19 tests, RUN/PAUSE/RESET/snapshot events |
| AC2: Test suite <5s | ✅ Core-logic execution 715ms |
| AC3: jsdom confirmed | ✅ v29.1.1, all DOM-dependent tests pass |

---

## §5 Summary

> **Code review complete.** 0 `decision-needed`, 2 `patch`, 4 `defer`, 6 dismissed as noise.
>
> Findings written to the review findings section in `7-6-vitest-unit-and-integration-tests.md`.

Two patch findings: P1 (unused `makeSink`/`SinkNode` dead code) and P2 (`afterEach` cleanup incomplete — discovered in deep audit). All 4 deferred findings are pre-existing coverage gaps outside Story 7.6's scope. The Acceptance Auditor's two critical findings were verified as **false positives** — the test suite passes cleanly with 750/750 tests.
