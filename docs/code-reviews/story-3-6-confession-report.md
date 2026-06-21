# Confession Report — Story 3.6 Code Review 审计报告

**审计对象：** Story 3.6 代码审查（3 层并行审查：Blind Hunter + Edge Case Hunter + Acceptance Auditor）
**审计日期：** 2026-05-28
**审计方法：** 逐条回源验证 — 每一处声称的缺陷均重新读取源代码文件与 spec 原文进行交叉比对

---

## [审计核心结论]

**严重偏差等级：中等（Moderate）**

审查在宏观方向上正确——确实发现了多处 spec 偏离和状态机缺口。但在严重性定级上存在**系统性夸大**：将开发者的合理设计选择（颜色值、尺寸参数、比例阈值）错误地升级为 P1（AC 违反），而实际上这些参数在 AC 文本中没有约束力。

具体而言：

- 18 个 patch 中，**5 个被过度定级**（P1→P2/P3），**1 个为误报**（Enter guard 已存在），**3 个实质性问题确认**为真正的 P1
- 审查框架的"spec 合规"视角将 Dev Notes 中的**示例代码**错误地等同于**规范性 AC 约束**，这是本次审查最核心的认知偏差

---

## [偏差明细清单]

### 偏差 1：连接线颜色 #4fc3f7 — 定级 P1 属于过度升级

- **审查声称：** P1 — 违反 spec 要求 `#1a1a1a`
- **源代码：** `SceneRenderer.ts:127` → `CONNECTION_LINE_COLOR = '#4fc3f7'`
- **Spec 原文：** Dev Notes 第 4 节示例代码 `ctx.strokeStyle = '#1a1a1a'`
- **AC 文本：** AC8 "All connections drawn as solid lines with arrowheads" — **未指定颜色**
- **修正定级：** P2/P3。Dev Notes 中的代码示例是**建议性实现参考**，不是验收标准。AC8 不约束颜色值。开发者在深色画布上选择 `#4fc3f7`（浅蓝）是合理的视觉设计决策。

### 偏差 2：箭头尺寸 14/7 vs 8/6 — 定级 P1 属于过度升级

- **审查声称：** P1 — 违反 spec 要求
- **源代码：** `SceneRenderer.ts:130-131` → `ARROWHEAD_LENGTH = 14, ARROWHEAD_HALF_WIDTH = 7`
- **Spec 原文：** Dev Notes 示例 `const arrowLen = 8; const arrowHalfWidth = 6;`
- **AC 文本：** AC8 "solid lines with arrowheads" — **未指定箭头尺寸**
- **修正定级：** P3。8/6 和 14/7 的宽高比不同（1.33 vs 2.0），这是视觉偏好。AC 未约束。

### 偏差 3：EDGE_ZONE_INNER_FRACTION 0.7 vs 0.5 — 定级 P1 属于误判

- **审查声称：** P1 — 违反 spec 要求 0.5
- **源代码：** `InputManager.ts:12` → `EDGE_ZONE_INNER_FRACTION = 0.7`，注释明确写明 "outer 30%"
- **Spec 原文：** Dev Notes 示例代码 `dist > r * 0.5 && dist <= r`
- **分析：** 这是开发者**有意的设计选择**（缩小边缘拖拽区以减少误触发），注释中明确记录了意图。0.5 和 0.7 的选择取决于 UX 偏好，不构成 AC 违反。
- **修正定级：** P3（可讨论的设计参数，非缺陷）

### 偏差 4：Enter guard 声称缺失 — 属于误报（False Positive）

- **审查声称：** P1/P2 — "Enter handler guards isDraggingModule but not isDraggingConnection"
- **源代码：** `InputManager.ts:636` → `if (this.isDragging) return;`
- **`isDragging` getter：** `InputManager.ts:148-150` → `return this.isDraggingModule || this.isDraggingConnection;`
- **结论：** `this.isDragging` **已经覆盖了连接拖拽状态**。Enter handler 在连接拖拽期间会被正确阻止。该发现为**事实错误**，应**撤销（Dismiss）**。

### 偏差 5：Tab handler 缺少 guard — 确认但严重性被低估

- **审查声称：** P2 — "Tab handler not guarded against isDraggingConnection"
- **源代码：** `InputManager.ts:613-617` → Tab handler **没有任何** `isDragging` 或 `isDraggingConnection` 检查
- **对比：** Arrow handler（line 622）和 Enter handler（line 636）都使用 `if (this.isDragging) return;`
- **实际风险：** 连接拖拽中按 Tab 会改变 `selectedModuleIds`，与拖拽状态交错可能导致状态不一致
- **修正定级：** 维持 P2，但需要注明 Enter guard 误报所引发的混淆

### 偏差 6：Snap 检测半径 — 功能可用但偏离 spec 意图

- **审查声称：** P1 — SNAP_ZONE_RADIUS 14 vs 20，hitTest 使用完整 hit radius
- **源代码：** `SceneRenderer.ts:132` → `SNAP_ZONE_RADIUS = 14`（视觉反馈环）；`InputManager.ts:485` → `this.hitTest(screenPos)`（目标检测）
- **分析：**
  - 视觉环 14px vs spec 20px 是视觉选择
  - hitTest 的半径（source=32px, stock=~72px, sink=24px）比 spec 的 20px 更大，使连接创建**更容易**而非更难
  - AC2 写的是 "~20px"（约 20px），"~" 表示近似值
  - 实际用户体验：更宽松的检测范围 → 更容易创建连接 → 功能正常工作
- **修正定级：** P2（偏离 spec 意图但功能正确，UX 影响正向）

### 偏差 7：Rate 处理和调色板冲突 — 确认为真实但被淹没

这两项是审查中发现的**真正 P1/P2 问题**，但在 18 项 patch 中被噪音稀释：

- **rate:0（真实 P1）：** AC3 明确要求 `rate: 1, formulaStr: '1'`。`addConnection` 创建 rate:0，`main.ts` 的 `onConnectionDragEnd` 未覆盖。**AC3 直接违反。**
- **cancelDrag 状态泄漏（真实 P1）：** `main.ts` undo/redo handler 调用 `cancelDrag()`，但 `cancelDrag()` 只清除模块拖拽状态。连接拖拽中的 undo/redo 留下悬挂的 `isDraggingConnection`/`edgeDragSourceId`/`connectionDragSourceId`。`cancelConnectionDrag()` 是 private 的且不被 `cancelDrag()` 调用。
- **调色板死代码（真实 P2）：** `addModule` 硬编码颜色后，`applyPaletteColor` 中的 `SOURCE_PALETTE`/`SINK_PALETTE` 循环永远不会生效 → 所有同类型模块颜色相同。

---

## [修正与原点溯源]

### 修正后的真实问题清单

| #   | 严重性 | 类别       | 描述                                                          | 文件:行                              |
| --- | ------ | ---------- | ------------------------------------------------------------- | ------------------------------------ |
| 1   | **P1** | AC3 违反   | 新连接 rate:0 而非 rate:1                                     | main.ts:2070, mutations.ts:218       |
| 2   | **P1** | 状态泄漏   | undo/redo 中 cancelDrag() 不清除连接拖拽状态                  | main.ts:247, InputManager.ts:689-696 |
| 3   | **P1** | AC8 违反   | 箭头偏移硬编码 SINK_RADIUS(24px)，stock 模块箭头浮于内部 48px | SceneRenderer.ts:769                 |
| 4   | **P1** | AC8 违反   | 连线 center-to-center 而非 edge-to-edge（无 getEdgePoint）    | SceneRenderer.ts:699-700             |
| 5   | **P2** | 代码质量   | `expect(true).toBe(true)` 无用测试                            | EmptyCanvasAffordance.test.ts:16,22  |
| 6   | **P2** | 代码质量   | addModule 颜色与 applyPaletteColor 冲突，调色板循环死代码     | mutations.ts:74, main.ts:177-194     |
| 7   | **P2** | Guard 缺失 | Tab handler 无 isDragging 守卫（Arrow/Enter 已有）            | InputManager.ts:613                  |
| 8   | **P3** | 设计参数   | EDGE_ZONE_INNER_FRACTION 0.7 vs spec 0.5（有意选择）          | InputManager.ts:12                   |
| 9   | **P3** | 设计参数   | 连接线颜色 #4fc3f7 vs spec #1a1a1a（视觉选择）                | SceneRenderer.ts:127                 |
| 10  | **P3** | 设计参数   | 箭头尺寸 14/7 vs spec 8/6（视觉选择）                         | SceneRenderer.ts:130-131             |
| 11  | **P3** | 设计参数   | 线宽 2.5 vs spec 2（视觉选择）                                | SceneRenderer.ts:128                 |
| 12  | **P3** | 设计参数   | 虚线样式 [6,6] vs spec [6,4]（视觉选择）                      | SceneRenderer.ts:736                 |
| 13  | **P3** | 设计参数   | SNAP_ZONE_RADIUS 14 vs spec 20（视觉选择）                    | SceneRenderer.ts:132                 |
| 14  | **P3** | 边界条件   | NaN 通过 ShapePaths 尺寸守卫                                  | ShapePaths.ts                        |
| 15  | **P3** | 边界条件   | 零长度连接无守卫（drawArrowhead 有 len<1 但 line 仍绘制）     | SceneRenderer.ts:699-701             |
| 16  | **P3** | 边界条件   | 拖拽中删除源模块的竞态                                        | InputManager.ts:482                  |

**已撤销（Dismiss）：**

- Enter guard 缺失 → **误报**，`this.isDragging` 已覆盖

**降级为 Defer：**

- onModuleSelect 绕过 mutation 函数 → 预存（Story 2.3）
- Tab 阻止默认浏览器导航 → 预存（Story 3.5）
- Ghost provider 重复 → 预存
- CSS 缺少 data-highlighted 样式 → 预存（Story 3.5）
- 无端到端测试 → 测试覆盖缺口
- 回调签名偏离 spec 描述 → 架构选择

### 第一性原理溯源

**核心认知错误：将 Dev Notes 中的示例代码等同于 Acceptance Criteria。**

- **第一性原理：** AC（验收标准）是 Given-When-Then 格式的行为契约。Dev Notes 中的代码示例是实现建议，不是验收约束。只有 AC 表格中的 Then 子句对实现有约束力。
- **偏离原因：** Acceptance Auditor 角色被赋予"spec compliance"的审查目标，但在执行中未能区分 AC（规范性）和 Dev Notes（建议性）。这导致将颜色值、尺寸参数等示例代码中的 magic number 错误地视为必须遵守的规范。
- **纠正：** 只有明确出现在 AC 表格 Then 列中的约束（如 "rate: 1"、"edge to edge"、"~20px snap radius"）才是规范性要求。Dev Notes 中的代码示例是实现参考，开发者有权基于实际 UX 需求调整参数。

---

## [认知偏差分析]

### 偏差 1：确认偏误（Confirmation Bias）— 审查框架预设"代码有问题"

三个审查 agent 被赋予的角色分别是"cynical reviewer"、"path tracer"、"auditor"——它们被**预设为寻找问题**。这种框架在发现真实缺陷方面有效，但会导致：

- 将主观设计选择（颜色、尺寸）当作客观缺陷
- 系统性夸大严重性（P3→P1 升级）
- 审查 agent 之间形成回声室：Blind Hunter 的发现被 Acceptance Auditor 重复确认，产生虚假的"多重验证"

**推理节点偏离：** 在"检查 AC 合规性"步骤中，模型将 `<spec requirement>` 的语义范围从 AC 表格扩展到整个 Dev Notes 部分，失去了对"什么是规范性约束"的边界判断。

### 偏差 2：锚定效应（Anchoring）— 数值偏差被过度关注

当审查发现 `0.7 ≠ 0.5`、`14 ≠ 8`、`#4fc3f7 ≠ #1a1a1a` 等数值差异时，这些差异被**锚定**为"违反规范"——但实际上 AC 文本从未指定这些值。审查陷入了"spec 中有数字 → 代码数字不同 → 一定是 bug"的简化推理链。

**推理节点偏离：** 模型未能执行"此参数是否受 AC 约束"的判别步骤，直接从数值差异跳到了违规结论。

### 偏差 3：Enter guard 误报 — 代码阅读不完整

审查声称 Enter handler 缺少 `isDraggingConnection` 守卫，但实际上 `this.isDragging` 已经覆盖了。这是因为：

1. Edge Case Hunter 只看到代码摘要（非完整源代码），信息不完整
2. Acceptance Auditor 可能复用了 Edge Case Hunter 的结论而没有独立验证
3. 在 triage 阶段，我（作为合并者）没有逐行验证每个发现

**推理节点偏离：** Triage 阶段应该在合并前对每条发现进行代码验证，但实际操作中，我依赖了"多重审查一致"作为正确性信号（又一次确认偏误）。

### 偏差 4：严重性通胀 — P3→P1 升级模式

审查中存在系统性模式：视觉参数偏差 → 定性为"spec 违反" → 升级到 P1。正确的推理链应该是：

1. 代码值与 spec Dev Notes 值不同 → 这是 spec 建议还是 AC 要求？
2. 如果是 AC 要求 → P1
3. 如果是 Dev Notes 建议 → P2/P3
4. 如果开发者有明确的设计意图（如注释中说明的 0.7）→ P3

实际推理链跳过了步骤 1 和 4。

---

## [总结]

本次审查的**真实有效产出：4 个 P1 + 3 个 P2**（非原始声称的 9 个 P1 + 6 个 P2）。

审查框架的结构性问题是：将 Dev Notes 示例代码错误地提升为规范性约束。修正后的定级体系应以 AC 表格的 Then 子句为唯一合规性判断依据——Dev Notes 是实现参考，开发者有合理的设计自主权。
