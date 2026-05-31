# SDONE 故事状态总览

**最后更新：** 2026-05-31 11:58
**更新原因：** Story 5.1 实现完成 — 粒子引擎（468 测试 / 22 文件 / Epic 5 开始）

---

## 项目整体进度

| Epic | 状态 | 故事数 | 审查状态 |
|------|------|--------|----------|
| Epic 1 — Core Protocol Foundation | ✅ 完成 | 5 (1.1–1.5) | 全部通过 |
| Epic 2 — Canvas & Viewport | ✅ 完成 | 3 (2.1–2.3) | 全部审查 |
| Epic 3 — Interactions & DnD | ✅ 完成 | 7 (3.1–3.7) | 6 个审查报告 + 4 个深度审计 |
| Epic 4 — Simulation & Formula | ✅ 完成 | 6 (4.1–4.6) | 3 个深度审计报告 |
| Epic 5 — Particles & Visual Feedback | 🚧 进行中 | 2+ | 1/2+（Story 5.1 review） |
| Epic 6 — Countdown & Grouping | 🔜 待开始 | 2+ | 未开始 |

---

## Epic 1 — Core Protocol Foundation ✅

| 故事 | 描述 | 审查状态 | 测试 | 备注 |
|------|------|----------|------|------|
| 1.1 | GraphState 类型定义 | ✅ 通过 | 15 测试 (GraphState.test.ts) | — |
| 1.2 | EventBus 类型安全发布/订阅 | ✅ 通过 | 17 测试 (EventBus.test.ts) | — |
| 1.3 | HistoryManager 撤销/重做 | ✅ 通过 | 24 测试 (HistoryManager.test.ts) | — |
| 1.4 | utils.ts（管线 + UUID + Vec2） | ✅ 通过 | 3 测试 (utils.test.ts) | — |
| 1.5 | Mutations 层（add/delete/move/updateRate） | ✅ 通过 | 27 测试 (mutations.test.ts) | — |

**Epic 1 总结：** 全部完成，86 测试通过。

---

## Epic 2 — Canvas & Viewport ✅

**回顾：** `docs/retrospectives/epic-2.md`（2026-05-27）

| 故事 | 审查报告 | 结论 | 关键发现 |
|------|----------|------|----------|
| 2.1 | `story-2-1-code-review.md` | ✅ 通过 | P0×0，P1×0，P2×1 |
| 2.2 | `story-2-2-code-review.md` | ✅ 已修复 | 3/3 P1 已修复（键盘拦截、HMR 内存泄漏×2） |
| 2.3 | `2-3-code-review.md` | ✅ 通过 | P1×1（缺少单元测试 — 已修复），P2×1（已修复） |

### Story 2.2 遗留 P2 项

| 描述 | 状态 |
|------|------|
| ViewportManager.viewport 公开可变 | ❌ 未修复 (非阻塞) |
| SceneRenderer.drawGrid 极端 zoom 下网格线过多 | ❌ 未修复 (非阻塞) |
| bump() 浅拷贝命名模糊 | ❌ 未修复 (非阻塞) |

### Story 2.3 修复状态

| 描述 | 状态 |
|------|------|
| 缺少单元测试（getHitRadius/getModuleBoundingRadius/fill ratio） | ✅ 已修复 — 28 测试 |
| drawConnections() 跨故事范围违规 | ✅ 已修复 — 方法链已移除 |
| main.ts 中未使用的 vec2 导入 | ❌ 未修复 (P3 — 非阻塞) |
| roundedRect() 缺少负尺寸守卫 | ✅ 已修复 |
| drawSource()/drawSink() 缺少 save/restore 包裹 | ✅ 已修复 |

---

## Epic 3 — Interactions & Drag-and-Drop ✅

| 故事 | 审查报告 | 结论 | 说明 |
|------|----------|------|------|
| 3.1 | `story-3-1-code-review.md` | ✅ 通过 | Left Sidebar Module Panel - drag-from-panel |
| 3.2 | `story-3-2-code-review.md` | ✅ 通过 | Drag & Drop Module Placement onto canvas |
| 3.3 | `story-3-3-code-review.md` | ✅ 通过 | Module drag-move + history integration |
| 3.4 | `story-3-4-confession-report.md` | ✅ 通过 | Module Deletion (Click + Delete Key) |
| 3.5 | — | ✅ 已实现 | Tab 循环选择 + 方向键微移 + Enter 中心放置 |
| 3.6 | `story-3-6-confession-report.md` + audit | ✅ 已审查 | Connection drag preview provider (rubber-band) |
| 3.7 | — | ✅ 已实现 | Connection selection, highlight, deletion |

### Story 3.1 待修复（P2/P3 遗留）

| 优先级 | 描述 |
|--------|------|
| 🔵 P2 | destroy() 检查 parentNode === this.container |
| 🟢 P3 | getContext 失败时静默返回 |

### Story 3.3 待修复

| 优先级 | 描述 | 状态 |
|--------|------|------|
| 🔵 P2 | 测试未覆盖关键边缘场景 | ❌ 未修复 |

---

## Epic 4 — Simulation & Formula ✅

| 故事 | 审查报告 | 结论 | 说明 |
|------|----------|------|------|
| 4.1 | `story-4-1-deep-audit.md` | ✅ 通过（偏差中度） | SimulationEngine: Euler integration + state machine |
| 4.2 | — | ✅ 已实现 | Run/Pause/Reset buttons + Space toggle |
| 4.3 | `story-4-3-deep-audit.md` | ✅ 通过（无偏差） | Snapshot Bridge: structuredClone at 10Hz |
| 4.4 | — | ✅ 已实现 | Formula Engine (tokenizer → parser → evaluator) |
| 4.5 | — | ✅ 已实现 | Right Sidebar Rate Editor Panel |
| 4.6 | — | ✅ 已实现 | Stock Edge Warning Arcs (inflow/outflow missing signal rendering) |

### Story 4.6 摘要

- **StackValidator:** `getAllEdgeWarnings()` 检测每个存量是否有流入/流出连接
- **SceneRenderer:** 无流入连接 → 左边缘绘制预警弧线，无流出连接 → 右边缘绘制预警弧线
- **HMR:** `main.ts` dispose 中清理 `stockWarningProvider = null`
- **测试:** `StackValidator.test.ts` (17 tests) + `StackValidator-rendering.test.ts` (26 tests)
- **导出:** `getWarningArcCenter`, `WARNING_ARC_COLOR`, `WARNING_ARC_OPACITY`, `WARNING_ARC_LINE_WIDTH`, `WARNING_ARC_DASH`, `WARNING_ARC_SWEEP_RAD`, `WARNING_ARC_RADIUS`
- **自循环检测:** `getAllEdgeWarnings` 自循环连接不满足流入/流出条件

### Epic 4 测试统计

| 测试文件 | 测试数 |
|----------|--------|
| SimulationEngine.test.ts | 43 |
| FormulaEngine.test.ts | 13 |
| tokenizer.test.ts | 19 |
| parser.test.ts | 23 |
| evaluator.test.ts | 33 |
| RateEditorPanel.test.ts | 8 |
| StackValidator.test.ts | 17 |
| StackValidator-rendering.test.ts | 26 |
| **小计** | **182** |

### SimulationEngine 架构决策

1. **Euler 积分:** 6 子步/100ms 间隔，dt=1/60，1× 实时速度
2. **就地突变:** `tick()` 直接修改 GraphState（性能优先），Snapshot Bridge 负责 `structuredClone`
3. **状态机:** IDLE → RUNNING ↔ PAUSED → IDLE
4. **职责分离:** `SimulationEngine.reset()` 只重置引擎时钟；状态恢复由 Story 4.2 的 RESET handler 处理

---

## 测试统计摘要

| 指标 | 数值 |
|------|------|
| 测试文件数 | 22 |
| 测试总数 | **468** |
| 通过 | **468** |
| 失败 | 0 |
| `npx tsc --noEmit` | **0 错误** |
| 已实现故事数 | ≥18 |
| 有审查报告的故事 | 10+ |
| 活跃的 P0 问题 | 0 |
| 活跃的 P1 问题 | 0 |

### 按 Epic 测试分布

| Epic | 测试文件 | 测试数 |
|------|----------|--------|
| 1 — Core Protocol | GraphState(15) + EventBus(17) + HistoryManager(24) + utils(3) + mutations(27) | 86 |
| 2 — Canvas & Viewport | SceneRenderer(33) + Viewport(31) + ShapePaths(7) + NudgeDebouncer(7) + EmptyCanvasAffordance(1) | 79 |
| 3 — Interactions | InputManager(57) + ModulePanel(25) + MinimapRenderer(12) | 94 |
| 4 — Simulation | SimulationEngine(43) + FormulaEngine(13) + tokenizer(19) + parser(23) + evaluator(33) + RateEditorPanel(8) + StackValidator(17) + StackValidator-rendering(26) | 182 |
| 5 — Particles & Visual Feedback | ParticleEngine(14) | 14 |
| **合计** | **22 文件** | **468** |

---

## 审查文件索引

```
docs/code-reviews/
├── story-status-master.md                    ← 本文件（状态总览）
├── story-2-1-code-review.md                  ← Story 2.1 审查
├── story-2-2-code-review.md                  ← Story 2.2 审查
├── story-2-2-confession-report.md            ← Story 2.2 悔过审计
├── 2-3-code-review.md                        ← Story 2.3 审查
├── story-3-1-code-review.md                  ← Story 3.1 审查
├── story-3-2-code-review.md                  ← Story 3.2 审查（原始）
├── story-3-2-code-review-merged.md           ← Story 3.2 审查（合并修订版）
├── adversarial-general-review-story-3-2.md   ← Story 3.2 对抗性通用审查
├── confession-report-story-3-2.md            ← Story 3.2 悔过审计
├── story-3-3-code-review.md                  ← Story 3.3 审查
├── story-3-3-confession-report.md            ← Story 3.3 悔过审计
├── story-3-4-confession-report.md            ← Story 3.4 悔过审计
├── story-3-4-confession-report-deep-audit.md ← Story 3.4 深度审计
├── story-3-6-confession-report.md            ← Story 3.6 悔过审计
├── story-3-6-ac2-deep-audit.md               ← Story 3.6 AC2 深度审计
├── story-3-6-p3-deep-audit.md                ← Story 3.6 P3 深度审计
├── story-4-1-deep-audit.md                   ← Story 4.1 深度审计
├── story-4-3-deep-audit.md                   ← Story 4.3 深度审计
└── epic-2-retrospective-confession-report.md ← Epic 2 回顾独立审计

docs/stories/
├── 3-4-module-deletion-click-delete-key.md  ← Story 3.4 规格文件
└── 5.1-particle-engine.md                   ← Story 5.1 规格文件

docs/retrospectives/
├── epic-1.md                                 ← Epic 1 回顾
├── epic-1-revisit.md                         ← Epic 1 回顾复查
└── epic-2.md                                 ← Epic 2 回顾
```

---

## 已知待修复项

### TypeScript 编译错误

| # | 文件 | 描述 |
|---|------|------|
| (无) | — | `npx tsc --noEmit` 通过，0 错误 |

### P2 遗留（非阻塞）

| # | 描述 | 文件 |
|---|------|------|
| P2-1 | ViewportManager.viewport 公开可变 | `Viewport.ts` |
| P2-2 | SceneRenderer.drawGrid 极端 zoom 下网格线过多 | `SceneRenderer.ts` |
| P2-3 | bump() 浅拷贝命名模糊 | — |
| P2-4 | destroy() parentNode 检查 | `ModulePanel.ts` |
| P2-5 | Story 3.3 关键边缘场景未测试 | — |

### P3 遗留（非阻塞）

| # | 描述 | 文件 |
|---|------|------|
| P3-1 | main.ts 中未使用的 vec2 导入 | `main.ts` |
| P3-2 | getContext 失败时静默返回 | `ModulePanel.ts` |

---

## Epic 5 — Particles & Visual Feedback 🚧

| 故事 | 描述 | 审查状态 | 测试 | 备注 |
|------|------|----------|------|------|
| 5.1 | ParticleEngine — 连接流可视化粒子 | ✅ review | 14 测试 (ParticleEngine.test.ts) | 等待审查 |

### Epic 5 测试统计

| 测试文件 | 测试数 |
|----------|--------|
| ParticleEngine.test.ts | 14 |
| **小计** | **14** |

### 下一步：Epic 5 剩余故事

根据 `idea.md` 需求：

1. ~~**流线粒子光特效**~~ → Story 5.1 ✅ 已实现
2. **最小地图增强** — 支持位置调整到四角
3. **更多粒子/视觉反馈** — 按需扩展

详见 `docs/stories/` 中的故事文件。

---

## 下一步：Epic 6 — Countdown & Grouping

根据 `idea.md` 需求：

1. **右边栏下半部分** — 存量倒计时显示
   - 负速率 → 归零倒计时
   - 正速率 → 到达/超过最大值的倒计时
2. **左边栏下半部分** — 组合功能（用户选定模块 → 生成/修改组合名称）

详见 `docs/stories/` 中待创建的故事文件。