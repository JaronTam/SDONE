# AC2 深度审计报告 — Story 3.6

**审计对象：** 第二轮代码审查中对 AC2 的判定（Acceptance Auditor P1 finding）  
**审计日期：** 2026-05-29  
**审计方法：** 逐行源码验证 + AC 原文逐词对照 + 第一性原理校准  
**审计范围：** 仅 AC2，不涉及其他 AC 或其他审查发现

---

## [审计核心结论]

**此前判定严重偏差等级：轻微（Minor）**

第二轮审查的 Acceptance Auditor 对 AC2 的判定**在核心事实上正确，但在细节粒度上存在两处偏差**：

1. **正确判定（维持）：** AC2 Then 子句的两个行为——"rubber-band snaps to target edge"和"edge highlights briefly"——确实未实现。这是真实的 P1 AC 违反。
2. **粒度偏差（修正）：** Auditor 将 AC2 的 3 个子需求捆绑为单一的"not implemented"判定，实际上 snap zone 检测是通过不同机制（hitTest）部分实现的，只是方式偏离了 spec 意图。
3. **严重性偏差（修正）：** 将 "~20px snap zone" 的检测方式差异定性为 P2 偏离，实际上 hitTest() 对所有模块类型使用 ≥20px 半径，功能上等价或更优。应从 P2 降级为 P3。

**实质性问题不变：AC2 的 Then 子句中两个视觉行为缺失是真实的 P1。**

---

## [偏差明细清单]

### 偏差 1：AC2 被捆绑为二元判定 — 实际有 3 个独立子需求

**原报告称：** "AC2 violation -- 2 aspects unimplemented" （后修正为 "Snap highlight and rubber-band snap-to-target not implemented"）

**源码验证：** AC2 可拆解为 3 个独立子需求：

| # | 子需求 | AC 来源 | 源码状态 | 判定 |
|---|--------|---------|----------|------|
| A | 检测 ~20px snap zone | Given: "within ~20px snap radius of module B's edge" | 部分实现 — 使用 `hitTest()` 在 mouseup 时检测，半径 32-72px（≥20px） | P3 设计偏差 |
| B | 橡皮筋 snap 到目标边缘 | Then: "Rubber-band snaps to module B's nearest edge point" | **未实现** — `cursorWorldPos` 始终为原始光标位置（SceneRenderer.ts:777, main.ts:374） | **P1** |
| C | 目标模块边缘高亮 | Then: "B's edge highlights briefly" | **未实现** — 零代码（无 `snapTargetId`、无高亮渲染） | **P1** |

**证据链：**
- (A) `InputManager.ts:485` — `const targetId = this.hitTest(screenPos)` 在 mouseup 时使用全 hit 半径
- (B) `main.ts:365-376` — `connectionDragProvider` 返回 `cursorWorldPos: worldPos`（原始光标，非 snap 目标边缘）
- (C) `grep -r "snapTargetId\|highlightTarget\|edgeHighlight" sdone/src/` 零匹配

**第一性原理纠正：** AC2 的 3 个行为在因果链上是独立的。snap zone 检测是前提条件，snap 视觉效果是反馈，高亮是确认信号。缺少 B 和 C 意味着 AC2 的 Then 子句完全未满足，但 AC2 的功能结果（连接被正确创建）仍然达成——因为 mouseup 时的 hitTest 代替了 snap zone 检测。

---

### 偏差 2：snap zone 检测方式被错误归类为 P2 "偏离"

**原报告称：** "P2 — Snap detection uses hit-test radii (~32-72px) instead of ~20px snap zone"

**源码验证：**

AC2 Given 子句原文："User drags within ~20px snap radius of module B's edge"

关键分析：
1. **"~" 表示近似值** — 不是精确的 20px 硬约束
2. **hitTest() 使用 ≥20px 所有模块** — source=32px, stock=~72px, sink=24px。所有类型 ≥20px，使连接创建**更容易**而非更困难
3. **功能等价性评估：** 从 UX 角度，更大的检测范围 = 更容易创建连接 = 用户体验更好。这不是缺陷，而是实现选择的差异
4. **但与 spec 意图的差异：** spec 意图是 edge-distance-based（距边缘 20px），当前实现是 center-distance-based（距中心 hitRadius）。两者几何语义不同（中心距离 vs 边缘距离）

**修正定级：** P3（实现选择差异，功能等价或更优，AC 文本使用近似值标记 "~"）

**第一性原理：** AC 文本中的 "~" 是一个显式的近似标记，表示精确值不是规范性约束。`~20px` 的语义是"大约 20 像素"，意图是"靠近边缘即可"，而非"恰好 20 像素"。当前实现满足"靠近即可"的意图，且对所有模块类型使用 ≥20px 的检测范围。

---

### 偏差 3（次要）：AC1 判定过于悲观

**此前 Auditor 的 AC1 判定：** PASS（正确识别 source edge 起点）

**补充验证：** 这个 PASS 判定是正确的，但值得细化：
- `main.ts:371` — `getEdgePoint(sourceNode, worldPos)` 正确计算 source 模块边界点
- `SceneRenderer.ts:777` — `ctx.moveTo(preview.sourceWorldPos.x, preview.sourceWorldPos.y)` 从边界点开始
- ✅ AC1 的 "from module A's nearest edge point" 已实现
- ❌ AC1 的 "follows the pointer" — 线条跟随的是原始光标位置，而非 snap 后的目标边缘（这属于 AC2 的范围）

**无偏差。** 此条仅记录用于完整性验证。

---

## [修正与原点溯源]

### 修正后的 AC2 判定

| # | 严重性 | 类别 | 描述 | 文件:行 |
|---|--------|------|------|---------|
| 1 | **P1** | AC2 Then 违反 | 橡皮筋线未 snap 到目标模块最近边缘点（始终画到原始光标位置） | SceneRenderer.ts:777, main.ts:374 |
| 2 | **P1** | AC2 Then 违反 | 拖拽中无目标模块边缘高亮效果（snapTargetId 概念不存在于代码库中） | SceneRenderer.ts, InputManager.ts |
| 3 | **P3** | AC2 Given 实现选择 | Snap 检测使用 hitTest() center-distance 半径 (32-72px) 而非 edge-distance ~20px | InputManager.ts:485, SceneRenderer.ts:39-49 |

### 原报告修正

| 原发现 | 原定级 | 修正定级 | 原因 |
|--------|--------|----------|------|
| "AC2 snap/highlight not implemented" | P1 | **维持 P1**（但拆分为 2 个独立 P1） | 核心事实正确，但需要更精确地拆分 |
| "Snap zone radius mismatch" | P2 | **降级 P3** | AC 使用 "~" 近似标记，hitTest 使用 ≥20px 对所有类型，功能等价 |
| "Rubber-band doesn't snap to target edge" | P2 | **合并入 P1 #1** | 不是独立问题，是 AC2 Then 违反的一部分 |

### 第一性原理溯源：此前为何偏离逻辑原点

**此前的推理链：**
1. 搜索 `findSnapTarget`、`SNAP_RADIUS_PX`、`snapTargetId` → 零匹配
2. 结论：AC2 未实现
3. 将 snap zone 检测半径差异也归入"未实现"类别

**正确的推理链应该是：**
1. **解析 AC2 的独立子需求**（Given 条件 vs When 触发 vs Then 行为）
2. **对每个子需求独立验证**（检测机制、视觉效果、高亮）
3. **区分"未实现"和"实现方式不同"**（snap zone 用 hitTest 替代）
4. **评估功能等价性**（hitTest≥20px → 功能等价或更优 → 不是 P1/P2）

**偏离节点：** 在"检查功能是否实现"步骤中，模型将所有非 spec-matched 的实现都归入"未实现"桶，而未区分"完全不同"（P1）和"等价替代"（P3）。

---

## [认知偏差分析]

### 偏差 1：二元分类偏差（Binary Classification Bias）

**现象：** 将多维度问题压缩为"已实现/未实现"的单一判定。

**推理节点：** 在验证 AC2 时，模型执行了 `grep findSnapTarget/SNAP_RADIUS_PX/snapTargetId → 零匹配 → AC2未实现` 的简化推理链。这个链条跳过了两个关键步骤：
1. 是否存在功能性等价替代？（hitTest 代替了 snap zone 检测）
2. 子需求是否可以独立判定？（snap visual 和 highlight 是独立的）

**纠正：** 对于每个 AC 子句，应执行"分解→独立验证→等价性评估→定级"四步法，而非一步到位。

### 偏差 2：严重性通胀（Severity Inflation）

**现象：** snap zone 检测半径差异（≥20px vs ~20px）被定性为 P2 偏离。

**推理节点：** 模型将数值差异（14≠20，32≠20，72≠20）直接等同于"AC 违反"，而未评估：
1. AC 文本中的 "~" 近似标记
2. 功能等价性（所有检测半径 ≥20px）
3. UX 影响方向（更大范围 → 更容易创建连接 → 正向体验）

**纠正：** 对于使用近似标记（~）的 AC 约束，应评估功能等价性而非精确数值匹配。

### 偏差 3：确认偏误（Confirmation Bias）

**现象：** Edge Case Hunter 的 #12 发现重新验证后认为 "This is actually correct. No issue here." 但这个自我纠正在 triage 阶段被忽略，Acceptance Auditor 的"未实现"结论被优先采纳。

**推理节点：** 不同审查层的结论在 triage 时不应简单地以"更权威"的层为准。Edge Case Hunter 的正确自我纠正在 triage 中被覆盖了。

**纠正：** Triage 时应追踪各层之间的冲突发现，尤其注意"自我纠正"的发现。多层一致可能是回声室，多层冲突反而可能是某层发现了另一层的盲点。

---

## [总结]

| 指标 | 原始 | 修正 |
|------|------|------|
| AC2 P1 发现 | 1 条捆绑 | 2 条独立 P1 |
| AC2 P2 发现 | 2 条 | 0 条 |
| AC2 P3 发现 | 0 条 | 1 条 |
| 误报 | 0 | 0 |

**AC2 实质性问题确认：**
- P1: 橡皮筋线不 snap 到目标边缘（未实现）
- P1: 无目标模块边缘高亮（未实现）
- P3: Snap 检测使用 center-distance 而非 edge-distance（实现选择差异）

**审计结论：** 审查方向正确，核心发现有效。唯需在子需求拆解粒度、等价性评估、"~"近似标记解读三个维度上进行细化修正。
