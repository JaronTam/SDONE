# Pre-existing Issues Index

> **用途**：跟踪所有在代码审查中发现的 pre-existing 问题（非当前 Story 引入），方便将来统一处理。
> **维护规则**：每次代码审查发现 pre-existing 问题时，追加到对应分类下。处理完毕后标记为 ✅ 已解决。
> **最后更新**：2026-06-18

---

## 📊 概览

| 分类 | 数量 | 状态 |
|------|------|------|
| Flaky 性能测试 | 3 个文件 | 🔴 未解决 |
| 代码健壮性 | 1 项 | 🔴 未解决 |
| **合计** | **4 项** | |

---

## 🔴 Flaky 性能测试

这些测试依赖实际执行时间，在环境负载较高时偶尔失败。非代码缺陷，是测试设计问题。

### 1. `ModulePlaceLatency.test.ts` — NFR-P3 模块放置延迟

| 属性 | 值 |
|------|-----|
| **文件** | `sdone/src/state/ModulePlaceLatency.test.ts` |
| **引入 Story** | Story 7.x（NFR-P3） |
| **失败测试** | `stock <5ms x100`、`source+palette <5ms`、`populated state <5ms` |
| **失败原因** | 测量真实执行时间并与 5ms 阈值比较，环境负载波动导致偶尔超限 |
| **发现于** | Story 8.3 代码审查（2026-06-18） |
| **建议修复** | 改用 mock 时间，或将阈值放宽并标记为 `skip` 在 CI 中 |
| **状态** | 🔴 未解决 |

### 2. `SimulationEngine.integration.test.ts` — NFR-P4 运行/暂停延迟

| 属性 | 值 |
|------|-----|
| **文件** | `sdone/src/simulation/SimulationEngine.integration.test.ts` |
| **引入 Story** | Story 7.7（NFR-P4） |
| **失败测试** | `emit RUN to first SNAPSHOT_EMITTED ≤ 120ms (setInterval ≥100ms + jitter)` |
| **失败原因** | setInterval 抖动 + 环境负载导致偶尔超过 120ms 阈值 |
| **发现于** | Story 8.3 代码审查（2026-06-18） |
| **建议修复** | 改用 mock 时间，或放宽阈值至 150ms |
| **状态** | 🔴 未解决 |

### 3. `PerformanceMonitor.test.ts` — 性能预算断言

| 属性 | 值 |
|------|-----|
| **文件** | `sdone/src/canvas/PerformanceMonitor.test.ts` |
| **引入 Story** | Story 7.5 |
| **失败测试** | L104: `expect(ts[ts.length-1]).toBeLessThan(SYNC_BUDGET_MS)` |
| **失败原因** | 性能测试测量真实执行时间并与预算阈值比较，环境负载波动导致偶尔超限 |
| **发现于** | Story 8.3 代码审查（2026-06-18） |
| **建议修复** | 改用 mock 时间而非真实时间 |
| **状态** | 🔴 未解决 |

---

## 🔴 代码健壮性

### 4. ViewportManager 构造函数不 clamp zoom

| 属性 | 值 |
|------|-----|
| **文件** | `sdone/src/canvas/Viewport.ts:46-51` |
| **引入版本** | V1.0（Story 2.2） |
| **问题描述** | ViewportManager 构造函数直接赋值 `zoom` 未调用 `clampZoom()`，传入越界值（zoom:0/-1/100）会被原样存储 |
| **影响** | 低 — `worldToScreen` 用乘法不用除法，zoom=0 不会崩溃；但违反了 zoom 应在 [0.1, 5.0] 范围内的不变量 |
| **发现于** | Story 8.3 代码审查（2026-06-18） |
| **建议修复** | 在构造函数中调用 `clampZoom()` 或添加输入验证 |
| **状态** | 🔴 未解决（已记录在 `deferred-work.md`） |

---

## ✅ 已解决

（暂无）

---

## 📝 处理优先级建议

1. **高优先级**：Flaky 性能测试（#1-3）— 影响 CI 稳定性，建议在 Epic 8 结束后统一处理
2. **中优先级**：ViewportManager zoom clamp（#4）— 建议在 V1.2 或后续 ViewportManager 重构时修复

## 📝 统一修复方案建议

对于 #1-3 的 flaky 性能测试，建议创建一个独立的"测试稳定性改进"任务：

1. **方案 A（推荐）**：将所有依赖真实时间的性能测试改为使用 mock 时间
2. **方案 B**：放宽阈值并标记为 `skip` 在 CI 中，仅在本地手动运行
3. **方案 C**：使用 `vitest` 的 `retry` 配置，对 flaky 测试自动重试