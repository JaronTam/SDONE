# Story 7.7 Code Review — NFR Compliance Verification

**Date**: 2026-06-09  
**Reviewer**: Cline (bmad-code-review)  
**Story**: 7.7 — NFR Compliance Verification  
**Baseline Commit**: faddf43  
**Test Result**: 33 files, 760 tests PASS ✅

---

## Review Layers

| Layer                       | Focus                                | Findings                         |
| --------------------------- | ------------------------------------ | -------------------------------- |
| Blind Hunter                | Bugs, logic errors, security         | 4                                |
| Edge Case Hunter            | Boundary conditions, unhandled paths | 3                                |
| Acceptance Auditor          | AC-by-AC compliance                  | 2                                |
| **Total candidate patches** |                                      | **7 after triage → 7 confirmed** |

---

## Acceptance Criteria Audit

| AC                         | Description                               | Status         | Notes                                                                                      |
| -------------------------- | ----------------------------------------- | -------------- | ------------------------------------------------------------------------------------------ |
| AC1 (NFR-P2)               | Numerical drift ≤0.5% over 5min simulated | ✅ PASS        | 3 drift tests in `NumericalDrift.test.ts` + 1 feedback asymptotic test in integration file |
| AC2 (NFR-P4)               | engine.start() → first onTick ≤110ms      | ⚠️ CONDITIONAL | Threshold raised to 120ms (see P2). Dev record documents Windows CI jitter justification.  |
| AC3 (NFR-P7)               | Degradation thresholds at 16/31           | ✅ PASS        | Verified existing Story 7.5 tests cover all 4 scenarios. No gaps.                          |
| AC4 (NFR-P1)               | Manual verification document              | ⚠️ CONDITIONAL | Document exists but step 8 references unobservable "degradation indicator" (see P6).       |
| AC5 (NFR-P6)               | Bundle ≤200KB gzip                        | ✅ PASS        | 26.1KB gzipped (13.1%). `check-bundle-size.mjs` + `build:check` script work.               |
| AC6 (NFR-P3/P5)            | Playwright scaffold                       | ✅ PASS        | Config + 4 smoke tests + package.json scripts. All pass.                                   |
| AC7 (Event Contract)       | FEEDBACK_CREATED includes connectionId    | ✅ PASS        | Verified at `EventMap.ts:43`. Already present.                                             |
| AC8 (Feedback Integration) | 4-step tick pipeline verified             | ✅ PASS        | 4 feedback tests in `SimulationEngine.integration.test.ts`. All pass.                      |

---

## Findings (Post-Triage)

### P1 — Stale ATDD RED PHASE Comments [Low]

**Files**: `NumericalDrift.test.ts:1-10`, `e2e/smoke.test.ts:1-11`

**Issue**: Both files have headers stating "ATDD RED PHASE" and "all tests skipped — implementation pending", but the tests are **active and passing**. The `.skip()` was removed during implementation but the header comments were never updated.

**Evidence**:

- `NumericalDrift.test.ts:5-6`: _"These tests are intentionally skipped — they will be activated when the dev agent implements Task 1.1"_
- `smoke.test.ts:5-7`: _"These tests are intentionally skipped — they will be activated when Task 5 completes"_
- Neither file contains any `.skip()` calls — all tests run and pass.

**Triage**:

- Gate 1: Code ≠ spec intent (spec says tests should pass; comments say they're skipped) → Continue
- Gate 2: Documentation accuracy in test files → Continue
- Gate 3: Trivially fixable by updating comments → **PATCH**

**Fix**: Update file headers to reflect GREEN phase status. Remove references to `.skip()`.

---

### P2 — Latency Threshold Deviation from Spec (110ms → 120ms) [Medium]

**File**: `SimulationEngine.integration.test.ts:412,429,451`

**Issue**: AC2 specifies "Elapsed time ≤ 110ms", but the implementation asserts `elapsed < 120`. The Dev Agent Record explains this is due to Windows CI event-loop jitter (~14ms observed). However, the spec was not updated to reflect this deviation.

**Evidence**:

- Line 412: `describe('Story 7.7 — NFR-P4: Run/Pause Latency (≤120ms engine-internal)')`
- Line 429: `expect(elapsed).toBeLessThan(120);`
- Line 451: `expect(elapsed).toBeLessThan(120);`
- Story AC2: _"Elapsed time ≤ 110ms"_

**Triage**:

- Gate 1: Code ≠ spec (120ms vs 110ms) → Continue
- Gate 2: Real behavioral deviation from AC → Continue
- Gate 3: Fixable — either tighten threshold or update spec → **PATCH**

**Recommendation**: Update the story AC2 threshold to ≤120ms with a note about Windows CI jitter, OR add a CI-specific adjustment. The deviation is justified (Windows `setInterval` jitter is well-documented), but the spec should match reality.

---

### P3 — No Timeout on Async Latency Tests [Medium]

**File**: `SimulationEngine.integration.test.ts:415-453`

**Issue**: The two async latency tests use `await firstTickPromise` / `await firstSnapshotPromise` with no timeout. If `engine.start()` fails to fire `onTick` (e.g., due to a regression), the test will hang indefinitely rather than failing fast.

**Evidence**:

```typescript
// Line 421-423: No timeout race
const firstTickPromise = new Promise<number>((resolve) => {
  engine.onTick = () => resolve(performance.now() - t0);
});
engine.start(() => state);
const elapsed = await firstTickPromise; // Could hang forever
```

**Triage**:

- Gate 1: Spec doesn't address test timeouts → Continue (not a spec issue)
- Gate 2: Test robustness — a real risk of CI hangs → Continue
- Gate 3: Fixable with `Promise.race` + timeout → **PATCH**

**Fix**: Add a timeout guard:

```typescript
const TIMEOUT = 5000; // 5s safety net
const elapsed = await Promise.race([
  firstTickPromise,
  new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error("onTick never fired")), TIMEOUT),
  ),
]);
```

---

### P4 — Dead Import `statSync` in check-bundle-size.mjs [Low]

**File**: `scripts/check-bundle-size.mjs:3`

**Issue**: `statSync` is imported from `node:fs` but never used in the script.

**Evidence**: Line 3: `import { readFileSync, readdirSync, statSync } from 'node:fs';` — `statSync` is never referenced in the remaining 36 lines.

**Triage**:

- Gate 1: Not a spec issue → Continue
- Gate 2: Code quality (dead code) → Continue
- Gate 3: Trivially fixable → **PATCH**

**Fix**: Remove `statSync` from the import.

---

### P5 — check-bundle-size.mjs Doesn't Handle Missing dist/ Directory [Low]

**File**: `scripts/check-bundle-size.mjs:21`

**Issue**: Line 21 calls `readdirSync(distDir, ...)` before checking if the directory exists. If `dist/` doesn't exist (e.g., build failed silently), this throws `ENOENT` instead of the friendly error message on line 22.

**Evidence**:

```javascript
// Line 21: Will throw ENOENT if dist/ doesn't exist
if (!readdirSync(distDir, { withFileTypes: true }).length) {
  console.error("❌ dist/ directory is empty — run `npm run build` first");
  process.exit(1);
}
```

**Triage**:

- Gate 1: Not a spec issue → Continue
- Gate 2: Robustness — script crashes with unhelpful error → Continue
- Gate 3: Fixable with `existsSync` check or try/catch → **PATCH**

**Fix**: Add existence check before `readdirSync`:

```javascript
import { existsSync } from "node:fs";
if (!existsSync(distDir)) {
  console.error("❌ dist/ directory not found — run `npm run build` first");
  process.exit(1);
}
```

---

### P6 — NFR-P1 Verification Document References Unobservable "Degradation Indicator" [Medium]

**File**: `docs/nfr-verification-checklist.md:8`

**Issue**: Step 8 says _"Verify: PerformanceMonitor degradation indicator shows 'full' mode (not 'sparse' or 'off')"_ but there is no visible degradation indicator in the UI. `PerformanceMonitor.getDegradationMode()` is an internal API consumed by `ParticleEngine`/`SceneRenderer` — it's not surfaced to the user. AC4 requires the document to describe "how to read the degradation indicator."

**Evidence**:

- `nfr-verification-checklist.md:8`: _"PerformanceMonitor degradation indicator shows 'full' mode"_
- `PerformanceMonitor.ts`: `getDegradationMode()` returns an internal string, not displayed in UI
- AC4 requires: _"It describes: ... how to read the degradation indicator"_

**Triage**:

- Gate 1: Code ≠ spec (AC4 requires explaining how to read the indicator; document doesn't) → Continue
- Gate 2: Documentation completeness — directly affects AC4 compliance → Continue
- Gate 3: Fixable by updating the document → **PATCH**

**Fix**: Update step 8 to explain how to observe degradation mode indirectly:

- "Full" mode: particles render at full density
- "Sparse" mode: every other particle is skipped (visibly fewer particles)
- "Off" mode: no particles rendered
- Alternatively: add a console.log in development mode that outputs degradation state

---

### P7 — Internal Comment Inconsistency in Latency Test [Low]

**File**: `SimulationEngine.integration.test.ts:404-412`

**Issue**: The comment block on line 404 says "≤110ms" but the describe block on line 412 says "≤120ms". This is confusing for future readers.

**Evidence**:

- Line 404: `// Story 7.7 — NFR-P4: Run/Pause Latency (≤110ms engine-internal)`
- Line 412: `describe('Story 7.7 — NFR-P4: Run/Pause Latency (≤120ms engine-internal)')`

**Triage**:

- Gate 1: Not a spec compliance issue → Continue
- Gate 2: Documentation inconsistency → Continue
- Gate 3: Trivially fixable → **PATCH**

**Fix**: Update the comment on line 404 to match the actual threshold (≤120ms) and add a note about the deviation from the original spec.

---

## Dismissed Findings

| #   | Finding                                                              | Dismissal Reason                                                                                                                             |
| --- | -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | PerformanceMonitor try/catch doesn't handle NaN/Infinity from signal | **Gate 1**: Spec Task 7.2 only requires catching throws. NaN/Infinity handling is out of scope.                                              |
| D2  | No drift test for negative rates                                     | **Gate 1**: AC1 specifies "known constant rates" and "value = rate × time". Negative rates not in scope.                                     |
| D3  | No test for feedback with multiple inflow connections                | **Gate 1**: AC8 specifies singular "feedback connection". Multiple inflows not in scope.                                                     |
| D4  | Console error filter in smoke test (`!e.includes('favicon')`)        | **Gate 2**: Pragmatic test design choice. Favicon 404 is a known non-issue.                                                                  |
| D5  | No mobile/responsive viewport in Playwright config                   | **Gate 1**: AC6 specifies "Playwright configuration is initialized" — mobile not in scope.                                                   |
| D6  | No test for feedback formula evaluation error path                   | **Gate 1**: AC8 verifies the happy path of the 4-step pipeline. Error handling is FormulaEngine's responsibility (covered in its own tests). |

---

## Summary

| Severity      | Count | Items                                                                                |
| ------------- | ----- | ------------------------------------------------------------------------------------ |
| **Medium**    | 3     | P2 (threshold deviation), P3 (async timeout), P6 (verification doc)                  |
| **Low**       | 4     | P1 (stale comments), P4 (dead import), P5 (ENOENT guard), P7 (comment inconsistency) |
| **Dismissed** | 6     | D1–D6                                                                                |

### Overall Assessment: **PASS with conditions**

Story 7.7 delivers solid NFR compliance verification infrastructure. All 8 ACs are substantively met. The 3 medium-severity findings are documentation/robustness improvements, not functional bugs. No regressions in the 750 baseline tests.

**Recommended actions before merge**:

1. ✅ P2: Update story AC2 threshold to ≤120ms (or add CI-specific adjustment)
2. ✅ P3: Add timeout guards to async latency tests
3. ✅ P6: Update verification document to explain how to observe degradation mode
4. Optional: P1, P4, P5, P7 are low-priority cleanups

---

## File Change Summary

| File                                   | Change Type           | Lines | Quality                        |
| -------------------------------------- | --------------------- | ----- | ------------------------------ |
| `NumericalDrift.test.ts`               | NEW                   | 155   | ✅ Good (stale header comment) |
| `e2e/smoke.test.ts`                    | NEW                   | 71    | ✅ Good (stale header comment) |
| `playwright.config.ts`                 | NEW                   | 25    | ✅ Clean                       |
| `scripts/check-bundle-size.mjs`        | NEW                   | 39    | ✅ Good (dead import, ENOENT)  |
| `docs/nfr-verification-checklist.md`   | NEW                   | 30    | ⚠️ Step 8 incomplete           |
| `SimulationEngine.integration.test.ts` | MODIFIED (+254 lines) | 569   | ✅ Good (threshold + timeout)  |
| `PerformanceMonitor.ts`                | MODIFIED (+8 lines)   | 180   | ✅ Clean                       |
| `PerformanceMonitor.test.ts`           | MODIFIED (+22 lines)  | 375   | ✅ Clean                       |
| `package.json`                         | MODIFIED              | 24    | ✅ Clean                       |
