# Story 7.5 — F2/F3 修复报告

**日期**: 2026-06-08  
**修复范围**: F2（SceneRenderer 降级集成测试缺失）、F3（Dev Agent Record 测试计数偏差）

---

## F2 修复 — SceneRenderer 降级集成测试

### 问题

Spec Task 6.2 要求 5 个 SceneRenderer 降级测试，实际交付 0 个。SceneRenderer 的降级渲染路径（粒子跳过 + 指示器绘制）完全无测试覆盖。

### 修复方案

在 `sdone/src/canvas/__tests__/SceneRenderer.test.ts` 中新增 `Story 7.5 — Degradation mode rendering` describe block，包含 5 个测试：

| 测试                                                          | AC      | 验证内容                                     |
| ------------------------------------------------------------- | ------- | -------------------------------------------- |
| `[P0] degradation mode full → all particles rendered`         | AC3/AC4 | 4 粒子 → 4 次 `ctx.arc` 调用                 |
| `[P0] degradation mode off → zero particles rendered`         | AC4     | 0 次 `ctx.arc` 调用（粒子完全禁用）          |
| `[P0] degradation mode sparse → every other particle skipped` | AC3     | 4 粒子 → 2 次 `ctx.arc` 调用（奇数索引跳过） |
| `[P0] degradation indicator text rendered when mode ≠ full`   | AC3/AC4 | `ctx.fillText` 被调用，文本为 "粒子: 稀疏"   |
| `[P0] no degradation indicator when mode = full`              | AC3/AC4 | `ctx.fillText` 未被调用                      |

### 实现细节

1. **Mock PerformanceMonitor**：`createMockPerfMonitor(mode)` 返回 `{ getDegradationMode: () => mode, recordFrame: vi.fn() }`，模拟固定降级模式
2. **Graph State 设置**：直接设置 `(renderer as any).graphState = graphState`，因为 `drawParticles()` 依赖 `this.graphState`（通常由 `tick()` → `stateProvider()` 设置，但测试直接调用 `drawParticles()`）
3. **Particle State**：4 个粒子在 conn1 上（t=0.2, 0.4, 0.6, 0.8），alpha=1
4. **断言方式**：通过 `ctx.arc` 调用次数验证粒子渲染数量，通过 `ctx.fillText` 参数验证指示器文本

### 修改文件

- `sdone/src/canvas/__tests__/SceneRenderer.test.ts` — 新增 ~80 行（5 个测试 + 辅助函数 + 数据）

---

## F3 修复 — Dev Agent Record 测试计数偏差

### 问题

Spec Dev Agent Record 声称 "20 active tests"，但 `PerformanceMonitor.test.ts` 实际只有 19 个 `it()` 调用。

### 修复方案

将 spec 中所有 "20" 引用修正为 "19"：

| 位置                                    | 修改前                                             | 修改后                                             |
| --------------------------------------- | -------------------------------------------------- | -------------------------------------------------- |
| Dev Agent Record — Debug Log References | `🟢 GREEN (20 active tests, all passing)`          | `🟢 GREEN (19 active tests, all passing)`          |
| Dev Agent Record — File List            | `单元测试（20 个测试，5 个 AC + 常量 + 边界情况）` | `单元测试（19 个测试，5 个 AC + 常量 + 边界情况）` |
| Dev Agent Record — Completion Notes     | `单元测试（19 个测试，5 个 AC + 常量 + 边界情况）` | 已正确（无需修改）                                 |

### 修改文件

- `_bmad-output/implementation-artifacts/7-5-performance-monitor-fps-tracking-and-degradation-triggers.md` — 2 处 "20" → "19"

---

## 验证结果

| 验证项          | 命令                            | 结果                                          |
| --------------- | ------------------------------- | --------------------------------------------- |
| 测试套件        | `npx vitest run --reporter=dot` | ✅ 731 passed (31 files), 0 failed, 0 skipped |
| TypeScript 编译 | `npx tsc --noEmit`              | ✅ 0 errors                                   |
| 新增测试明细    | vitest verbose output           | ✅ 5/5 Story 7.5 degradation tests pass       |

### 测试计数变化

- 修复前：726 tests (707 baseline + 19 PerformanceMonitor)
- 修复后：731 tests (707 baseline + 19 PerformanceMonitor + 5 SceneRenderer degradation)

---

## 剩余 Open Findings

| ID  | 严重度  | 标题                    | 状态    |
| --- | ------- | ----------------------- | ------- |
| F1  | 🔴 High | 两个新文件未被 git 跟踪 | 🔴 Open |

**F1 修复操作**（需手动执行）：

```bash
git add sdone/src/canvas/PerformanceMonitor.ts sdone/src/canvas/PerformanceMonitor.test.ts
```

---

_修复人: AI Agent | 验证: 731/731 tests pass, tsc clean_
