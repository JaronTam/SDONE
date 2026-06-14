# SDONE 故事状态总览

**最后更新：** 2026-06-15 00:04
**更新原因：** Story 8.2 审查+深度审计+修复完成（822 测试 / 34 文件 / Epic 8 进行中）

---

## 项目整体进度

| Epic | 状态 | 故事数 | 审查状态 |
|------|------|--------|----------|
| Epic 1 — Core Protocol Foundation | ✅ 完成 | 5 (1.1–1.5) | 全部通过 |
| Epic 2 — Canvas & Viewport | ✅ 完成 | 3 (2.1–2.3) | 全部审查 |
| Epic 3 — Interactions & DnD | ✅ 完成 | 7 (3.1–3.7) | 6 个审查报告 + 4 个深度审计 |
| Epic 4 — Simulation & Formula | ✅ 完成 | 6 (4.1–4.6) | 3 个深度审计报告 |
| Epic 5 — Particles & Visual Feedback | ✅ 完成 | 7 (5.1–5.5) | 全部审查 |
| Epic 6 — Countdown & Grouping | ✅ 完成 | 7 (6.1–6.7) | 全部审查 |
| Epic 7 — NFR & Testing | ✅ 完成 | 7 (7.1–7.7) | 7/7 审查+修复完成（7.8 部署上云 → V2） |
| Epic 8 — Select First, Then Act | 🔄 进行中 | 6 (8.1–8.6) | 2/6 完成（8.1+8.2 审查+修复+深度审计） |

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
| 测试文件数 | 34 |
| 测试总数 | **822** |
| 通过 | **822** |
| 失败 | 0 |
| `npx tsc --noEmit` | **0 错误** |
| 已实现故事数 | ≥35 |
| 有审查报告的故事 | 20+ |
| 活跃的 P0 问题 | 0 |
| 活跃的 P1 问题 | 0 |

### 按 Epic 测试分布

| Epic | 测试文件 | 测试数 |
|------|----------|--------|
| 1 — Core Protocol | GraphState(15) + EventBus(17) + HistoryManager(24) + utils(3) + mutations(27) | 86 |
| 2 — Canvas & Viewport | SceneRenderer(33) + Viewport(31) + ShapePaths(7) + NudgeDebouncer(7) + EmptyCanvasAffordance(14) | 92 |
| 3 — Interactions | InputManager(75) + ModulePanel(36) + MinimapRenderer(12) | 123 |
| 4 — Simulation | SimulationEngine(53) + FormulaEngine(13) + tokenizer(19) + parser(23) + evaluator(33) + RateEditorPanel(15) + StackValidator(17) + StackValidator-rendering(26) | 199 |
| 5 — Particles & Visual Feedback | ParticleEngine(14) + PerformanceMonitor(20) + ConfettiEngine(7) + EmptyCanvasAffordance(14) | 55 |
| 6 — Countdown & Grouping | AnalyticsPanel(30) + CountdownPanel(63) + ModulePanel(36) + RateEditorPanel(15) + achievement-detection(6) + GraphState(15) + Formula(13) | 178 |
| 7 — NFR & Testing | NumericalDrift(3) + SimulationEngine.integration(25) + PerformanceMonitor(20) + Playwright smoke(4) | 52 |
| 8 — Select First, Then Act | mutations(66) + InputManager(90) + ShapePaths(7) + GraphState(15) + EventBus(17) + evaluator(33) + ConfettiEngine(7) + StackValidator(17) + FormulaEngine(13) + NudgeDebouncer(7) + StackValidator-rendering(26) + ParticleEngine(14) + Formula(13) + utils(3) + achievement-detection(6) | 822* |
| **合计** | **34 文件** | **822** |

*Epic 8 测试含全量回归套件，非仅 Epic 8 新增测试

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
├── story-7-7-review-2026-06-09.md            ← Story 7.7 主审查报告
├── story-7-7-deep-audit-2026-06-09.md        ← Story 7.7 深度审计
├── story-7-7-fix-report-2026-06-09.md        ← Story 7.7 修复报告
└── epic-2-retrospective-confession-report.md ← Epic 2 回顾独立审计
```

---

## Epic 8 — Select First, Then Act 🔄

| 故事 | 描述 | 审查状态 | 测试 | 备注 |
|------|------|----------|------|------|
| 8.1 | Schema Extension & Pure Mutations | ✅ 审查+修复完成 | 66 测试 (mutations) | updateModuleLabel/updateModuleSize + NaN 防御 |
| 8.2 | Selection State & Hit-Test Infrastructure | ✅ 审查+修复+深度审计 | 90 测试 (InputManager) | 7 项修复 + 2 回归测试 |

### Story 8.1 审查文件

| 文件 | 用途 |
|------|------|
| `story-8-1-code-review-2026-06-12.md` | 三层对抗性审查（1 P2 + 1 P3） |
| `story-8-1-audit-2026-06-12.md` | 独立审计 |
| `story-8-1-deep-audit-2026-06-12.md` | 深度审计 |

### Story 8.2 审查文件

| 文件 | 用途 |
|------|------|
| `story-8-2-code-review-2026-06-14.md` | 三层对抗性审查（2 P2 + 3 P3 + 1 Decision） |
| `story-8-2-fix-report-2026-06-14.md` | 7 项修复报告（含深度审计发现的 PATCH-1a） |
| `story-8-2-deep-audit-2026-06-14.md` | 深度审计（1 P2 遗漏 + 认知偏差分析） |

### Story 8.2 关键修复

| Patch | 严重度 | 修复 |
|-------|--------|------|
| PATCH-1 | 🔴 P2 | isEditingName 鼠标取消选择时未重置 → resetSelectionState() |
| PATCH-1a | 🔴 P2 | isEditingName 选择变更时未重置（深度审计发现） |
| PATCH-2 | 🔴 P2 | hit-test 未过滤到已选模块 → selectedId 过滤 |
| PATCH-3 | 🟡 P3 | hover 状态取消选择时未清理 → 与 PATCH-1 合并 |
| PATCH-4 | 🟡 P3 | handleMouseLeave 未清理 hover → 清理+回调触发 |
| PATCH-5 | 🟡 P3 | Enter 二次按下违反 AC9 → 选中时 Enter 永不放置 |
| DECISION-1 | 🟡 P3 | 类型拓宽丢失精度 → 恢复精确联合类型 |

### Story 8.2 Forward-Deferred Items

| 目标 Story | 描述 | 优先级 |
|-----------|------|--------|
| 8.4 | Escape 不区分 SELECTED/EDITING_NAME 状态 → 逐层退出 | P3 |
| 8.4 | _isColorPickerOpen 前向声明 + @ts-ignore → 接线后清理 | P4 |
| 8.5 | classifyHitZone 死代码 + @ts-ignore → 评估是否删除 | P4 |
| 8.5 | _isResizing 前向声明 + @ts-ignore → 接线后清理 | P4 |
| 8.5 | PATCH-2/4 回归测试 → 消费者接线后补充集成测试 | P3 |

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
| P3-3 | classifyHitZone 死代码 + @ts-ignore → Story 8.5 后评估 | `InputManager.ts` |
| P3-4 | _isResizing/_isColorPickerOpen 前向声明 + @ts-ignore → Story 8.4/8.5 后清理 | `InputManager.ts` |

---

## Epic 5 — Particles & Visual Feedback ✅

| 故事 | 描述 | 审查状态 | 测试 | 备注 |
|------|------|----------|------|------|
| 5.1 | ParticleEngine — 连接流可视化粒子 | ✅ 通过 | 14 测试 | — |
| 5.2 | PerformanceMonitor — FPS 追踪 + 降级 | ✅ 通过 | 19 测试 | — |
| 5.3 | SceneRenderer 降级集成 | ✅ 通过 | — | — |
| 5.4 | ConfettiEngine 庆祝特效 | ✅ 通过 | 7 测试 | — |
| 5.5 | EmptyCanvasAffordance 空画布引导 | ✅ 通过 | 14 测试 | — |

---

## Epic 6 — Countdown & Grouping ✅

| 故事 | 描述 | 审查状态 | 测试 | 备注 |
|------|------|----------|------|------|
| 6.1 | AnalyticsPanel — 存量分析面板 | ✅ 通过 | 30 测试 | — |
| 6.2 | CountdownPanel — 倒计时显示 | ✅ 通过 | 63 测试 | — |
| 6.3 | ModulePanel 增强 — 组合功能 | ✅ 通过 | 36 测试 | — |
| 6.4 | RateEditorPanel — 速率编辑 | ✅ 通过 | 15 测试 | — |
| 6.5 | Achievement Detection — 成就检测 | ✅ 通过 | 6 测试 | — |
| 6.6 | GraphState 扩展 | ✅ 通过 | 15 测试 | — |
| 6.7 | Formula 扩展 | ✅ 通过 | 13 测试 | — |

---

## Epic 7 — NFR & Testing ✅

| 故事 | 描述 | 审查状态 | 测试 | 备注 |
|------|------|----------|------|------|
| 7.1 | Event Contract 验证 | ✅ 通过 | — | FEEDBACK_CREATED connectionId 已确认 |
| 7.2 | PerformanceMonitor 防御性加固 | ✅ 通过 | +1 测试 | try/catch on moduleCountSignal |
| 7.3 | Numerical Drift 测试 | ✅ 通过 | 3 测试 (NumericalDrift.test.ts) | — |
| 7.4 | Latency 测试 | ✅ 通过 | 2 测试 | ≤120ms (Windows CI jitter) |
| 7.5 | Degradation Threshold 验证 | ✅ 通过 | — | 已由 Story 7.5 覆盖 |
| 7.6 | Vitest Unit + Integration Tests | ✅ 通过 | +25 测试 | EventBus+Engine 集成 |
| 7.7 | NFR Compliance Verification | ✅ 通过（审查+审计+修复） | 760 总测试 | 审查报告+深度审计+9项修复 |

### Story 7.7 审查文件

| 文件 | 用途 |
|------|------|
| `story-7-7-review-2026-06-09.md` | 主审查报告（7 Patch + 6 Dismissed） |
| `story-7-7-deep-audit-2026-06-09.md` | 深度审计（4 偏差：1 事实错误 + 2 遗漏 + 1 过度陈述） |
| `story-7-7-fix-report-2026-06-09.md` | 9 项修复报告（全部已修复，760 测试通过） |

### Story 7.7 关键修复

| Patch | 严重度 | 修复 |
|-------|--------|------|
| P2 | Medium | AC2 阈值 110ms→120ms + 原因说明 |
| 偏差C | Medium | Step 1 隔离测试重写（反馈+非反馈共存） |
| P6 | Medium | 验证文档补充 degradation indicator 观察方法 |
| P3 | Low | 异步测试添加 Promise.race 2s timeout |
| P1 | Low | ATDD RED→GREEN 注释更新 |
| P4 | Low | 移除未使用 statSync 导入 |
| P5 | Low | 添加 dist/ 目录存在性检查 |
| P7 | Low | 注释 ≤110ms→≤120ms 一致性 |
| 偏差B | Low | Story Spec Dev Notes RED→GREEN |
