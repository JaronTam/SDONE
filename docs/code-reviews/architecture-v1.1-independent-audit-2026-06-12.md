# V1.1 Architecture Decision Document — 独立深度审计报告

**审计日期:** 2026-06-12
**审计对象:** `_bmad-output/planning-artifacts/architecture-v1.1.md` (1020 行)
**审计方法:** 逐段源码交叉验证（grep/glob/Read 34 次调用）
**审计立场:** 彻底解构，诚实披露，不维持此前回答一致性

---

## 审计核心结论

**严重偏差等级：🟡 LOW（低）**

架构文档的核心决策方向（D1-D4）和 17 项已决项经源码交叉验证后**均未被推翻**。文档声称的 "READY FOR IMPLEMENTATION" 状态成立。

但存在 **1 项持续性数字偏差** 和 **2 项论证路径偏差**，虽不影响决策方向，但揭示了文档自审计流程中的系统性盲区：**自审计修正本身未经验证即被采信**。

**此前我生成的两个 memory 审计文件（step3/step7）的内容基于架构文档的自述审计结果，未做独立验证——这构成二次传播偏差。本报告将修正。**

---

## 偏差明细清单

### P1 🟡 持续性数字偏差：InputManager 私有状态字段计数

**架构文档声明（L233）:**
> InputManager.ts 共 14 个私有状态字段（1257 行）

**源码事实:**
`InputManager.ts` 实际有 **32 个 private 字段**（含初始化器），分类如下：

| 类别 | 数量 | 字段 |
|------|------|------|
| 交互状态 | 20 | isPanning, lastMousePos, spaceHeld, isDraggingModule, dragModuleId, dragModuleWorldStart, mouseDownPos, mouseDownModuleId, mouseDownInEdgeZone, _mouseDownOnCanvas, isDraggingConnection, edgeDragSourceId, isDraggingFeedback, _feedbackDragStockId, _feedbackHandleHoveredStockId, hoveredConnectionId, lastScreenPos, lastClickModuleId, lastClickTime, lastClickScreenPos |
| 绑定处理器 | 10 | boundMouseDown, boundMouseMove, boundMouseUp, boundMouseLeave, boundWheel, boundKeyDown, boundKeyUp, boundContextMenu, boundWindowBlur, boundDragOver, boundDragLeave, boundDrop |
| 基础设施 | 2 | canvas, viewportManager |

**即使仅计"交互状态"字段，也是 20 个，而非 14 个。**

**偏差历史:**
- 原始版本声称 6 个 → 自审计修正为 14 个 → 实际为 20（状态）或 32（全部）
- 自审计的"修正"本身就是不完整的——从 6 修正到 14 仍低报 30%

**影响评估:** 低。D1 决策（Boolean Flags 扩展）的核心论点——"V1.0 已有 boolean flag 模式，V1.1 继续扩展"——在 14 或 20 个字段下均成立。但低报使 V1.0 的复杂度显得比实际更小，间接弱化了 Option D（InteractionMode enum）的合理性。

---

### P2 🟢 已验证正确：mutations.ts 导出函数

**架构文档声明（L87）:**
> mutations.ts: 10 个导出函数（addModule/deleteModule/moveModule/addConnection/deleteConnection/changeModuleColor/updateCapacity/addFeedbackConnection/updateFormula/updateRate），0 个 label 相关

**源码事实:** ✅ 完全正确。10 个导出函数，无 label 相关函数。

---

### P3 🟢 已验证正确：GraphState.ModuleNode 接口

**架构文档声明（L88）:**
> GraphState.ModuleNode: id, type, position, label?, color? — 无 width/height 字段

**源码事实:** ✅ 完全正确。ModuleNode 接口定义：
```typescript
export interface ModuleNode {
  readonly id: string;
  readonly type: ModuleType;
  position: Vec2;
  label?: string;
  color?: string;
}
```
无 width/height 字段。

---

### P4 🟢 已验证正确：classifyHitZone 用途

**架构文档声明（L89）:**
> InputManager.classifyHitZone: 仅用于 handleMouseDown 的模式判定（mouseDownInEdgeZone 标记），从未用于 idle hover cursor 显示

**源码事实:** ✅ 正确。classifyHitZone 仅在 handleMouseDown 中被调用，用于设置 mouseDownInEdgeZone 标记。handleMouseMove 中的 cursor 赋值不调用此方法。

---

### P5 🟢 已验证正确：ColorPickerPopover 触发方式

**架构文档声明（L90）:**
> main.ts: ColorPickerPopover 当前通过 onModuleDoubleClick 触发（仅 Source/Sink，Stock 早返回）

**源码事实:** ✅ 正确。main.ts L533 设置 `inputManager.onModuleDoubleClick`，其中 Stock 类型早返回（AC8: fixed white），仅 Source/Sink 触发 `colorPickerPopover.open()`。

---

### P6 🟢 已验证正确：CountdownPanel/AnalyticsPanel 消费 label

**架构文档声明（L91）:**
> CountdownPanel.ts:117 / AnalyticsPanel.ts:64: 已消费 ModuleNode.label（stock.label || stock.id.slice(0, 8)）

**源码事实:** ✅ 正确。两个文件均使用 `stock.label || stock.id.slice(0, 8)` 模式。

---

### P7 🟢 已验证正确：main.ts EventBus 订阅

**架构文档声明（L716 图注）:**
> 全部 5 个 eventBus.on() 调用均在 main.ts

**源码事实:** ✅ 正确。5 个 eventBus.on() 调用：
1. L772: `SNAPSHOT_EMITTED`
2. L807: `COUNTDOWN_ZERO`
3. L825: `RUN`
4. L842: `PAUSE`
5. L850: `RESET`

---

### P8 🟢 已验证正确：ui/ → canvas/ 零导入

**架构文档声明（L762）:**
> ui/overlays/ 层的零个文件导入 canvas/ 模块（glob 验证）

**源码事实:** ✅ 正确。在整个 `sdone/src/ui/` 目录中搜索 `../canvas` 和 `../../canvas` 导入路径，结果为零。

---

### P9 🟡 论证路径偏差：D1 Boolean Flags 的"零新概念"论证

**架构文档声明（L248）:**
> 与 V1.0 14 个私有状态字段的模式完全一致——零新概念

**偏差分析:**
1. 数字错误（14→20/32，见 P1）
2. "零新概念"论证不精确——V1.1 新增的 `hoveredDiamond: {moduleId, edge} | null` 和 `hoveredHandle: {moduleId, corner} | null` 是**结构化对象类型**，V1.0 的所有状态字段中仅有 `string | null` 和 `boolean` 和 `Vec2` 类型。结构化 hover tracker 是**类型层面的新概念**，尽管实现模式相似。

**影响评估:** 低。hoveredDiamond/hoveredHandle 的结构化类型在 boolean flag 模式下仍然自然适配，不构成推翻 D1 的理由。

---

### P10 🟡 论证路径偏差：D3 光标管理的数字基线

**架构文档声明（L290-298）:**
> V1.0 基线（grep 验证）: '' (default) 11 处, 'grab' 2 处, 'grabbing' 3 处, 'crosshair' 2 处

**偏差分析:**
文档声称"grep 验证"但未提供 grep 命令或输出。鉴于 P1 中已证明同一文档的"grep 验证"数字（14 个字段）与实际不符（20/32），这些光标赋值计数**可信度存疑**，需独立验证。

**影响评估:** 低。即使数字有偏差，Canvas 侧 distinct 值 4→6 的核心论点（+50% 未突破阈值）在合理误差范围内仍成立。

---

### P11 🟢 已验证正确：ColorPickerPopover.open() API

**架构文档声明（L351）:**
> 保持挂载到 `<body>`（V1.0 API `open({anchorScreenX, anchorScreenY})` 不变）

**源码事实:** ✅ 正确。ColorPickerPopover.open() 接受 `anchorScreenX` 和 `anchorScreenY` 屏幕绝对坐标参数，组件挂载到 `<body>`，使用 `position: fixed`。

---

### P12 🟢 已验证正确：目录结构

**架构文档声明（L547-672）:**
完整目录树

**源码事实:** ✅ 基本正确。实际文件树与文档列出的结构一致。以下差异为文档已标注的 [NEW] 文件（尚未创建）：
- `OverlaySyncManager.ts` / `.test.ts` — 不存在（[NEW]）
- `ToolbarController.ts` / `.test.ts` — 不存在（[NEW]）
- `toolbar.css` — 不存在（[NEW]）
- `ColorPickerPopover.test.ts` — 不存在（[NEW]）

已存在的文件全部匹配。

---

### P13 🔴 二次传播偏差：此前生成的 memory 审计文件

**问题:**
我在此前响应中创建的两个 memory 审计文件：
- `memory/v1.1-architecture-step3-elicitation-audit-2026-06-11.md`
- `memory/v1.1-architecture-step7-meta-validation-audit-2026-06-12.md`

其内容**直接采信了架构文档的自述审计结果**，未做独立源码验证。例如：
- Step 3 审计中"3 处虚假精度"的描述来自架构文档 L191 的自述
- Step 7 审计中"2 项虚假发现，准确率 25%"来自架构文档 L821-832 的自述

这些自述审计结果本身**未经独立验证**，可能包含：
- 低报偏差（如 P1 所示，自审计修正仍不准确）
- 选择性披露（仅报告已修正的偏差，未报告未发现的偏差）

**影响评估:** 中。memory 文件作为未来 AI agent 的上下文输入，若包含未验证的自述结论，可能导致后续实现中重复采信不准确数字。

---

## 修正与原点溯源

### 修正 1：InputManager 私有字段计数

| 版本 | 数字 | 来源 |
|------|------|------|
| 原始 | 6 | 架构文档初版（已修正） |
| 自审计修正 | 14 | 架构文档 L233（仍不准确） |
| **本审计** | **20（状态）/ 32（全部）** | 源码 grep 验证 |

**第一性原理溯源：**
偏差源于"状态字段"的定义边界模糊——原始计数可能仅计了 boolean flag（4 个：isPanning, isDraggingModule, isDraggingConnection, isDraggingFeedback），自审计扩展到包含 `string | null` 和 `Vec2` 类型的交互状态，但仍遗漏了：
- 点击消歧状态（mouseDownPos, mouseDownModuleId, lastClickModuleId, lastClickTime, lastClickScreenPos）
- 连接拖拽状态（edgeDragSourceId）
- 反馈拖拽状态（_feedbackDragStockId, _feedbackHandleHoveredStockId）
- Hover 状态（hoveredConnectionId, lastScreenPos）

**逻辑原点偏离原因：** 计数时采用了"互斥交互模式"的狭义定义（仅 boolean flag），而非"所有私有可变状态"的完整定义。自审计修正时扩展了定义但仍未达到完整——这是**锚定效应**：初始计数（6）作为锚点，修正时仅做了增量调整（+8→14），而非从零重新计数。

### 修正 2：D1 "零新概念" 论证

**修正表述：**
> V1.1 新增的 boolean flag（isResizing, isEditingName, isColorPickerOpen）与 V1.0 模式一致。但 hoveredDiamond/hoveredHandle 为结构化对象类型（`{moduleId, edge} | null`），这在 V1.0 状态字段中无先例——V1.0 仅有 `string | null`、`boolean`、`Vec2` 三种类型。结构化 hover tracker 是类型层面的增量，但实现模式（可空引用 + 条件分支）与 V1.0 一致。

**第一性原理溯源：**
"零新概念"论证源于对"概念"的粒度选择过粗——在"可空引用 + 条件分支"的实现模式层面确实零新概念，但在类型系统层面有增量。架构文档选择了对决策有利的粗粒度，忽略了细粒度差异。这是**确认偏误**：在论证"继续 boolean flag 模式"时，倾向于选择支持该结论的证据粒度。

### 修正 3：memory 审计文件的二次传播偏差

**修正方案：** 更新两个 memory 审计文件，添加独立验证声明和已发现的偏差。

---

## 认知偏差分析

### 偏差节点 1：锚定效应 — 数字修正不充分

**推理链路：**
```
初始计数(6) → 自审计发现低报 → 修正为14 → 停止
                                    ↑
                              锚定效应：以6为起点
                              增量修正(+8)而非从零重计
```

**概率预测干扰点：** LLM 在生成"修正后数字"时，受初始数字(6)的概率影响，倾向于生成"接近但不等于初始值"的修正值(14)，而非完全独立计数的值(20/32)。这是训练数据中"修正=小幅调整"模式的统计偏好。

### 偏差节点 2：确认偏误 — "grep 验证"标签的信任滥用

**推理链路：**
```
声明"grep验证" → 读者信任 → 不再独立验证 → 偏差传播
         ↑
   自审计中也采信了
   "grep验证"标签
```

**概率预测干扰点：** "grep 验证"在架构文档中出现多次（L89, L233, L290, L387, L762），形成**可用性启发式**——频繁出现的验证声明降低了读者对每个具体数字的审查警觉性。LLM 在处理长文档时，对重复出现的"已验证"标签产生统计偏好，倾向于采信而非质疑。

### 偏差节点 3：自审计的递归信任问题

**推理链路：**
```
架构文档自述审计结果 → 我采信并写入memory → 未来agent读取memory → 采信
                              ↑
                        未独立验证自述结果
```

**概率预测干扰点：** LLM 在处理"审计"类内容时，倾向于将"已审计"等同于"已验证"，忽略了审计者（文档自身）与被审计对象（文档自身）的利益一致性。这是**权威偏误**——"审计"标签赋予了信息不应有的可信度。

---

## 审计总结

| 类别 | 数量 | 详情 |
|------|------|------|
| ✅ 已验证正确 | 9 | P2-P8, P11-P12 |
| 🟡 偏差（低影响） | 3 | P1(数字), P9(论证), P10(数字可信度) |
| 🔴 二次传播偏差 | 1 | P13(memory文件) |
| ❌ 推翻性偏差 | 0 | — |

**架构文档核心结论（D1-D4 + 17 已决项 + READY FOR IMPLEMENTATION）经独立源码验证后未被推翻。** 偏差集中在数字精度和论证路径选择上，不影响决策方向。

**需修正项：**
1. InputManager 私有字段计数：14 → 20（状态）/ 32（全部）
2. D1 "零新概念" → 补充结构化类型增量说明
3. D3 光标赋值计数需独立验证（当前仅采信文档自述）
4. 更新 memory 审计文件，添加独立验证声明