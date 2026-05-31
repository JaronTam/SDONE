# SDONE Epic 2 回顾报告

**日期：** 2026-05-27  
**回顾范围：** Epic 2 — Canvas & Viewport（Story 2.1–2.3）  
**参与 Epic：** Epic 1（对照参考）、Epic 2（主要）、Epic 3（前瞻）

---

## 1. 执行摘要

| Epic | 故事数 | 状态 | 阻断项 | 关键风险 |
|------|--------|------|--------|----------|
| Epic 1 | 5 (1.1–1.5) | ✅ 完成 | 0 | 无 |
| Epic 2 | 3 (2.1–2.3) | ✅ 完成 | 0 | 3 个 P1 已修复，单元测试覆盖率缺口 |
| Epic 3 | 3 (3.1–3.3) | 🔄 进行中 | 4 个 P0（Story 3.3） | EventMap 破坏编译、拖拽时过早历史推送 |

---

## 2. Epic 2 故事分析

### Story 2.1 — Dual-Canvas DOM Setup & z-Index Layer Architecture

| 维度 | 评估 |
|------|------|
| 故事文件 | ❌ 缺失 — 2026-05-27 补审查；故事文件未创建 |
| 代码审查 | `story-2-1-code-review.md`（当日） |
| 审查结论 | ✅ 通过 — P0×0，P1×0，P2×1 |
| 测试 | ❌ 无（DOM 布局故事 — AC 检查清单验证通过） |
| 验收标准 | 5/5 通过 |

**发现：** `CanvasResizer` 代码干净，`destroy()` 路径完整。P2（DPR 变化未处理）为低影响技术债务。

**审查修复状态：** ✅ CanvasResizer 已存储引用，`destroy()` 在 HMR dispose 钩子中调用。`CanvasResizer` 实现与 `main.ts` 正确集成。

---

### Story 2.2 — Viewport: Infinite Pan & Zoom

| 维度 | 评估 |
|------|------|
| 故事文件 | ❌ 缺失 — 2026-05-27 回顾期间补建 |
| 代码审查 | `story-2-2-code-review.md`（2026-05-22）+ `story-2-2-confession-report.md` |
| 审查结论 | ⚠️ 有条件下通过 — 悔过后 P0×0，P1×3，P2×3 |
| 测试 | `Viewport.test.ts` — 340 行，25 个测试，全部通过 |
| 验收标准 | 7/7 通过（由 epics.md 与 `Viewport.ts` 源码推断） |

**发现：**
- **P1 #2 — 键盘拦截：** `InputManager.handleKeyDown` 在未检查 `input/textarea/contentEditable` 目标的情况下为 Space/Delete/Backspace 调用 `preventDefault()`。
- **P1 #3 — Ctrl+0 监听器内存泄漏：** 匿名箭头函数，引用未被存储 → HMR 重载时无法移除。
- **P1 #4 — CanvasResizer 被丢弃：** 实例未赋给变量 → `destroy()` 永不调用。
- **P2 #5 — ViewportManager.viewport 公开可变：** 外部直接赋值 `zoom=0` 会导致除零错误。

**审查修复状态（2026-05-27 验证于 `main.ts`）：**
- ✅ P1 #3 — `handleResetShortcut` 现在是命名函数，`window.removeEventListener` 在 dispose 中调用（`main.ts:131,174`）
- ✅ P1 #4 — `canvasResizer` 已赋给变量，`canvasResizer.destroy()` 在 dispose 中调用（`main.ts:47,175`）
- ✅ P1 #2 — 键盘目标检查**未在 `InputManager.ts` 中**，但 `isEditingTarget()` 辅助函数存在于 `main.ts:25-33` 并用于 undo/redo 路径。输入管理器中的 Space/Delete/Backspace 拦截仍未修复。

**过程缺口：** Story 2.2 通过 quick-dev 实现，未创建故事文件。回顾期间基于 epics.md、Viewport.ts 和 Viewport.test.ts 重建文件。**行动项：** 所有未来故事必须使用 `bmad-create-story` 工作流。

---

### Story 2.3 — Module Shape Renderer (Source/Stock/Sink)

| 维度 | 评估 |
|------|------|
| 故事文件 | ✅ 存在 — `2-3-module-shape-renderer-source-stock-sink-primitives.md` |
| 代码审查 | `2-3-code-review.md`（2026-05-22） |
| 审查结论 | 🔴 需要修改 — P1×1，P2×1，P3×5 |
| 测试 | ❌ 缺失 — `SceneRenderer` 的 `getHitRadius()`、`getModuleBoundingRadius()`、填充比例计算均无单元测试 |
| 验收标准 | 8/8 通过 |

**发现：**
- **P1 — 缺少单元测试：** `getHitRadius()`、`getModuleBoundingRadius()` 和填充比例逻辑是纯函数——应可测试。未找到测试文件。
- **P2 — drawConnections() 跨故事范围违规：** 占位连接线无条件绘制——Story 2.4 实现后可能造成视觉冲突。
- **P3 — 未使用的导入（`vec2`）、`roundedRect()` 缺少守卫、`drawSource()`/`drawSink()` 缺少 save/restore。**

**审查修复状态：** ⚠️ 未验证 — 所有 5 项行动项均标记为待完成。未创建追随后续修复的 PR。

---

### Story 2.4 — Connection Arrow Renderer

**状态：** ❌ 未启动。Story 2.3 审查指出占位 `drawConnections()` 已存在——Story 2.4 需要将其替换为正确的箭头渲染。

---

## 3. 跨切面分析

### 模式：创建故事文件 discipline

| 故事 | 实现时创建了故事文件？ | 审查时故事文件存在？ |
|------|------------------------|---------------------|
| 2.1 | ❌ | ❌（回顾时补审查） |
| 2.2 | ❌ | ❌（回顾时重建） |
| 2.3 | ✅ | ✅ |

**根因：** 基于 Agent 的实现（quick-dev）绕过了正式的 `create-story` 步骤。故事文件对可追溯性至关重要——没有故事文件会导致审查工具因 `no-spec` 模式而降级，并清空推断验收标准。

**行动项：** 在基元中强制执行 `create-story` 管道验证——quick-dev 偏好设置不得跳过故事文件创建。

### 模式：审查修复追随后续

| 故事 | 审查发现 | 修复已验证？ | 差距 |
|------|----------|-------------|------|
| 2.1 | P2×1 | ✅ 通过 HMR 清理修复 | — |
| 2.2 | P1×3，P2×3 | ✅ 3/3 P1 已修复，P1 #2 部分修复 | InputManager 键盘拦截仍存在 |
| 2.3 | P1×1，P2×1，P3×5 | ❌ 0/5 已验证 | 缺少追随后续 PR |

**行动项：** 为每个审查发现创建追随后续故事/任务项。审查修复不得无声进行——它们必须有对应的提交或 PR 引用。

### 跨 Epic 依赖：ViewportManager → Story 3.2/3.3

Story 2.2 的纯 `ViewportManager` 设计（无 DOM，无事件绑定）被证明是为 Epic 3 交互提供服务的正确抽象：
- `screenToWorld()` 被 Story 3.2（模块拖放定位）和 Story 3.3（模块重新定位）调用。
- `applyTransform()` 被 SceneRenderer 和 MinimapRenderer 用于一致的视口 → 屏幕映射。
- 对 `canvasCenter` 参数而非内部存储的选择使 ViewportManager 免受 CanvasResizer 耦合——这是在 Epic 2 回顾中值得保留的架构决策。

---

## 4. Epic 3 前瞻

Epic 3 处于进行中状态，Story 3.3 有 4 个 P0 阻断项。回顾确认此 Epic 不适合在今日回顾中"完成"，但指出的问题为恢复工作提供了可操作的输入。

### Story 3.1 — 左侧边栏模块面板

| 审查 | 结论 | 阻断项 |
|------|------|--------|
| `story-3-1-code-review.md`（2026-05-27） | ⚠️ 有条件下通过 | P1×1（dragstart 监听器泄漏） |
| 验收标准 | 5/6 通过 | AC5 部分通过 |

**发现：** `destroy()` 中的 `dragDisposers` 数组从未被遍历以移除监听器。DOM 移除依赖浏览器 GC，这在旧版浏览器中并不可靠。

### Story 3.2 — 从面板拖放到画布

| 审查 | 结论 | 阻断项 |
|------|------|--------|
| `story-3-2-code-review.md`（2026-05-26） | ✅ 通过 | P0×0，P2×3，P3×2 |
| 验收标准 | 8/8 通过 | — |

**状态：** 干净通过。P2 项为非阻塞质量改进（死代码回调、ghost 形状代码重复）。

### Story 3.3 — 模块选择、拖拽移动与删除 ← 🔴 阻塞

| 审查 | 结论 | 阻断项 |
|------|------|--------|
| `story-3-3-code-review.md`（2026-05-26） | 🔴 必须修复 | P0×4，P1×1，P2×2 |
| 验收标准 | 阻止验证 | P0 阻断编译 |

**P0 阻塞项：**
1. `MODULE_MOVED` 不在 `EventMap` 中 → **编译错误**
2. `UNDO` 不在 `EventMap` 中 → **编译错误**
3. `REDO` 不在 `EventMap` 中 → **编译错误**
4. `HistoryManager.push()` 在拖拽**开始时**调用（`onModuleDragStart`），而非结束时——若用户取消拖拽（Esc），重做栈将被错误填充。

**行动项：** 这三个 EventMap 缺失为阻塞项——`npm run build` 将失败。添加 EventMap 定义即可解决。向 `onModuleDragEnd` 移动 `historyManager.push()`（仅在确认位置变更时），而非在 `onModuleDragStart` 中。

---

## 5. 行动项

### 🔴 P0 — 阻塞（Story 3.3）

- [ ] **3.3-A：** 向 EventMap 添加 `MODULE_MOVED` — `sdone/src/event-bus/EventBus.ts`
- [ ] **3.3-B：** 向 EventMap 添加 `UNDO` — `sdone/src/event-bus/EventBus.ts`
- [ ] **3.3-C：** 向 EventMap 添加 `REDO` — `sdone/src/event-bus/EventBus.ts`
- [ ] **3.3-D：** 将 `historyManager.push(currentState)` 从 `onModuleDragStart` 移至 `onModuleDragEnd`（仅在确认位置变更时推送） — `sdone/src/main.ts`

### 🟡 P1 — 高优先级

- [ ] **2.2-A：** 修复 InputManager 键盘拦截 — 为 `handleKeyDown`/`handleKeyUp` 中的 Space/Delete/Backspace 添加 `isEditingTarget()` 守卫 — `sdone/src/input/InputManager.ts`
- [ ] **2.3-A：** 为 `getHitRadius()`、`getModuleBoundingRadius()` 和填充比例计算添加单元测试 — `sdone/src/canvas/__tests__/SceneRenderer.test.ts`
- [ ] **3.1-A：** 在 `ModulePanel.destroy()` 中遍历 `dragDisposers` 并调用 `removeEventListener` — `sdone/src/ui/panels/ModulePanel.ts`

### 🟢 P2 — 中优先级

- [ ] **2.3-B：** 守卫 `drawConnections()` 调用 — 注释掉或添加 feature-flag，直至 Story 2.4 — `sdone/src/canvas/SceneRenderer.ts`
- [ ] **2.3-C：** 移除未使用的 `{ vec2 }` 导入 — `sdone/src/main.ts`
- [ ] **2.3-D：** 为 `roundedRect()` 添加负尺寸守卫 — `sdone/src/canvas/SceneRenderer.ts`
- [ ] **2.2-B：** 将 `ViewportManager.viewport` 设为私有，暴露 `getViewport(): Readonly<Viewport>` — `sdone/src/canvas/Viewport.ts`

### 📋 过程改进

- [ ] **PROC-1：** 强制执行 `create-story` 工作流 — quick-dev 不得跳过故事文件创建
- [ ] **PROC-2：** 为所有未完成审查发现创建追随后续任务（当前：2.3 有 5 个待处理，3.1 有 1 个，3.3 有 4 个 P0 + 3 个次要项）
- [ ] **PROC-3：** 确保审查修复在合并前有对应的提交/PR 引用

---

## 6. 指标与趋势

| 指标 | Epic 1 | Epic 2 | 趋势 |
|------|--------|--------|------|
| 故事数 | 5 | 3 | — |
| 有故事文件的故事 | 5/5 (100%) | 1/3 (33%) | 🔻 下降 |
| 有审查的故事 | 回顾代替 | 3/3 (100%) | ✅ |
| 通过/有条件下通过 | 5/5 | 3/3 | ✅ |
| 无 P0 的故事 | 5/5 | 3/3 | ✅ |
| 有单元测试的故事 | 5/5 | 1/3 | 🔻 下降 |
| 平均审查发现/故事 | 回顾代替 | 6.3 | — |
| 代码行数 | ~1,500 | ~2,200 | 增长 |

**关键趋势：** 故事文件纪律下降（Epic 2 中 2/3 缺失）。单元测试覆盖率下降（Epic 1 86 测试，Epic 2 仅 Viewport 有 25 测试）。两项均需过程纠正。

---

## 7. 回顾后清理

- [x] Story 2.2 故事文件已重建（`_bmad-output/implementation-artifacts/2-2-viewport-infinite-pan-and-zoom.md`）
- [ ] 审查发现尚未合并为任务/stories — 上述行动项可用作 sprint backlog
- [ ] Epic 3 回顾计划在 Epic 3 完成后进行（Story 3.3 P0 已解决 + 所有 Story 3.x 审查修复已验证）

---

*报告生成于 2026-05-27，基于 2026-05-27 的 `main.ts` 源码状态（提交 `07b1448`）。*