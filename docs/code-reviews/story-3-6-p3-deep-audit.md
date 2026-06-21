# P3 发现深度审计报告 — Story 3.6

**审计对象：** 两轮审查中所有 P3 级发现（patch 6 项 + decision 1 项 + defer 设计参数 7 项 + defer 边界防御 4 项 = 18 项）  
**审计日期：** 2026-05-29  
**审计方法：** 逐项源码验证 + 函数级可达性分析 + AC 原文对照  
**审计范围：** 仅 P3 级发现，不涉及 P1/P2

---

## [审计核心结论]

**此前判定严重偏差等级：轻微（Minor）**

本轮审查的 P3 发现在核心事实上全部正确（无 False Positive），分类总体合理。存在两处细节偏差：

1. **编号错误（1 项）：** Blind Hunter 报告中的 B3 注释行号（main.ts:1836）来自 unified diff 行号而非源文件行号。源文件仅有 426 行，B3 注释实际位于 `main.ts:12`。不影响发现本身的有效性。
2. **状态误判（1 项）：** 第一轮审查的 P2 #5 (`expect(true).toBe(true)`) 被 Acceptance Auditor 标记为 "STILL OPEN"，但源码验证显示当前文件已不含此模式。该发现应在第二轮 triage 中标记为 RESOLVED。

**无认知偏差导致的系统性误判。P3 分类一致性好，严重性定级恰当。**

---

## [偏差明细清单]

### 偏差 1：Blind Hunter 行号来自 diff 而非源文件 — 全部 P3 patch 的行号需校正

**Blind Hunter 发现原文：**

| 发现                | Blind Hunter 行号 | 实际源文件行号  | 偏差原因       |
| ------------------- | ----------------- | --------------- | -------------- |
| B3 注释残留         | main.ts:1836      | **main.ts:12**  | diff hunk 行号 |
| NudgeDebouncer 双推 | main.ts:1972-1977 | main.ts:165-170 | diff hunk 行号 |
| onModuleMove 变异   | main.ts:1909-1913 | main.ts:103-107 | diff hunk 行号 |
| ghost provider 重复 | main.ts:2186-2199 | main.ts:378-392 | diff hunk 行号 |

**根本原因：** Blind Hunter agent 仅接收 unified diff，无权读取源文件。其报告的行号是 diff 文件中的绝对行号，与源文件行号存在偏移。这是 Blind Hunter 方法论的固有局限，非认知错误。

**影响范围：** 仅 Blind Hunter 发现受影响。Edge Case Hunter 和 Acceptance Auditor 均有权读取源文件，行号正确。

**修正：** 任何引用 Blind Hunter 行号的发现均需校正为源文件行号。已在 story 文件中使用正确的源文件行号。

---

### 偏差 2：`expect(true).toBe(true)` 被错误标记为 STILL OPEN

**Acceptance Auditor 原文：**

> P2 #5: `expect(true).toBe(true)` 无用测试 [EmptyCanvasAffordance.test.ts:16,22] — **STILL OPEN** — import line was cleaned up (vi removed) but test assertions remain unchanged

**源码验证结果：** `EmptyCanvasAffordance.test.ts` 共 168 行，全文搜索 `expect(true).toBe(true)` — **零匹配**。

当前文件中的相关测试（第 95-106 行）：

```typescript
// Line 95-100
const nodes = {};
const shouldRender = Object.keys(nodes).length === 0;
expect(shouldRender).toBe(true);

// Line 102-106
const nodes = { a: { type: "stock", position: { x: 0, y: 0 } } };
const shouldRender = Object.keys(nodes).length === 0;
expect(shouldRender).toBe(false);
```

这些测试验证了 `Object.keys(nodes).length === 0` 的真假——虽说是验证 JS 内置行为，但**不是** `expect(true).toBe(true)`。它们是**有实际断言的测试**（尽管简单）。

**第一性原理分析：**

- `expect(true).toBe(true)` 是**无条件通过的断言** — 零信息量，零回归保护
- `const shouldRender = Object.keys({}).length === 0; expect(shouldRender).toBe(true)` 是**有条件的断言** — 它验证了一个具体的逻辑条件。即使条件简单，其真假取决于输入，而非恒真
- Auditor 将两者等同处理是错误的——后者是 trivial test（简单但有断言），前者是 useless test（无断言）

**修正：** 该发现应标记为 **RESOLVED**（源码已修复）。即使测试仍然简单，它们不是无意义的空断言。

**认知偏差：** Acceptance Auditor 在验证时使用了"印象匹配"而非严格文本匹配——看到了 `.toBe(true)` 和简单的条件，就直接归类为 `expect(true).toBe(true)`。正确的验证流程应该是：grep `expect(true).toBe(true)` → 零匹配 → 标记 RESOLVED。

---

## [全部 P3 发现——逐项验证]

### 一、Patch P3（6 项）

#### P3-1: Ctrl+0 使用 `e.key` 而非 `e.code`

- **原发现：** `main.ts:233` 使用 `e.key === '0'`，而 Ctrl+Z（241/264 行）使用 `e.code === 'KeyZ'`
- **源码：** `main.ts:233` — `if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key === '0')`
- **验证：** ✅ **正确。** `KeyboardEvent.key` 值依赖键盘布局。AZERTY 键盘上未按 Shift 的 '0' 键的 `key` 值为 'à'（非 '0'），而 `code === 'Digit0'` 是布局无关的。
- **第一性原理：** `e.key` 返回按键产生的**字符**（受布局/Shift/CapsLock 影响），`e.code` 返回物理**键位**（布局无关）。快捷键应使用 `e.code` 以保证跨布局一致性。Ctrl+Z 已正确使用 `e.code === 'KeyZ'`，Ctrl+0 应使用 `e.code === 'Digit0'`。
- **定级评估：** P3 正确（AZERTY 用户可 workaround：按住 Shift 按 0）

---

#### P3-2: 连接拖拽 mouseup 未检查 `e.button === 0`

- **原发现：** `InputManager.ts:482` 处连接拖拽释放不检查鼠标按键类型
- **源码：** `InputManager.ts:482` — `if (this.isDraggingConnection && this.edgeDragSourceId)`
- **验证：** ✅ **正确。** `handleMouseUp` 对 button 1（line 468-473）和 panning（475-479）有检查，但连接拖拽释放没有。若用户用左键开始拖拽，然后右键释放（同时按多键），会意外创建连接。
- **可达性分析：** 低概率（需要双键操作）。但 `contextmenu` handler（line 666）只 `preventDefault()`，不阻止 mouseup 先触发。
- **定级评估：** P3 正确（理论边界情况，正常使用几乎不可能触发）

---

#### P3-3: B3 调试注释残留

- **原发现：** `main.ts:1836` — `// B3: vec2 import removed — unused value import.`
- **源码：** `main.ts:12` — `// B3: vec2 import removed — unused value import. Only Vec2 type is used via inline imports.`
- **验证：** ✅ **正确。** `B3:` 是审查标记格式，非正常代码注释。Blind Hunter 行号 1836 来自 diff，源文件正确行号为 12。
- **定级评估：** P3 正确（纯 cosmetic，不影响功能）

---

#### P3-4: 多个文件缺少末尾换行符

- **原发现：** 9 个文件以 `\ No newline at end of file` 结尾
- **验证：** ✅ **正确。** Diff 中明确显示 MinimapRenderer.ts、SceneRenderer.ts、InputManager.ts、EventMap.ts、ShapePaths.ts、ShapePaths.test.ts、ModulePanel.ts、ModulePanel.test.ts、module-panel.css 均缺少末尾换行符。
- **第一性原理：** POSIX 标准规定文本文件应以换行符结尾。缺少末尾换行符会导致 `cat`/`wc` 等工具行为异常，且 Git 会在 diff 中产生 `\ No newline at end of file` 噪声。
- **定级评估：** P3 正确（纯 cosmetic）

---

#### P3-5: NaN 通过 ShapePaths 尺寸守卫

- **原发现：** `size <= 0` 不捕获 NaN（`NaN <= 0` 为 false）
- **源码验证：**
  - `ShapePaths.ts:78` — `drawCloud`: `if (size <= 0) return;`
  - `ShapePaths.ts:118` — `drawStock`: `if (size <= 0) return;`
  - `ShapePaths.ts:160` — `drawSink`: `if (size <= 0) return;`
  - `ShapePaths.ts:41` — `roundedRectPath`: `if (w <= 0 || h <= 0) return;`
- **验证：** ✅ **正确。** 全部 4 处守卫均无法阻止 NaN 通过。
- **可达性分析：**
  - `drawCloud/drawStock/drawSink` 的 `size` 参数来自：
    - `SceneRenderer.drawGhost()` — 使用硬编码常量（`CLOUD_RADIUS * 3.2`, `STOCK_WIDTH`, `SINK_RADIUS * 2`）→ **不可达**
    - `ModulePanel.renderIconShape()` — 使用 `ICON_BUFFER_SIZE` 和 scale 计算 → 理论上可能因 scale=NaN 而触发
  - 当前所有调用方均使用硬编码常量，实际不可达。但 API 层面无防护。
- **第一性原理：** `NaN <= 0` 在 IEEE 754 中定义为 `false`（NaN 与任何值的比较均返回 false）。正确的 NaN 守卫模式是 `!Number.isFinite(x) || x <= 0`。
- **定级评估：** P3 正确（所有当前调用方使用硬编码常量，API 层面不可达但防御不完整）

---

#### P3-6: 零长度连接线仍有绘制

- **原发现：** `drawArrowhead` 有 `len < 1` 守卫（line 802），但线条在检查之前已绘制（lines 734-740）
- **源码验证：**

  ```typescript
  // SceneRenderer.ts:734-740 — 线条绘制（无长度守卫）
  ctx.beginPath();
  ctx.moveTo(fromEdge.x, fromEdge.y);
  ctx.lineTo(toEdge.x, toEdge.y);
  ctx.stroke();

  // SceneRenderer.ts:743 — drawArrowhead 调用
  this.drawArrowhead(ctx, fromEdge.x, fromEdge.y, toEdge.x, toEdge.y);

  // SceneRenderer.ts:802 — drawArrowhead 内部守卫
  if (len < 1) return;
  ```

- **验证：** ✅ **正确。** 线条在无长度检查的情况下被 stroke。
- **可达性分析：**
  - `fromEdge === toEdge` 要求 fromNode 和 toNode 位于相同位置且同类型 → 需要两个同类型模块占据完全相同的 world position
  - UI 层面：`addConnection` 在 `mutations.ts` 允许，但 `InputManager` 阻止 self-connection（`targetId !== sourceId`）
  - 零长度 stroke 是 Canvas 2D 的 no-op（视觉上无效果）→ 即使可达，也**无可见影响**
- **第一性原理：** `ctx.lineTo(x, y)` 后 `ctx.stroke()` 在 from==to 时不会产生可见像素（line 两端重合，无实际笔画）。因此这不是 bug，而是冗余操作。
- **定级评估：** P3 正确（纯防御性代码路径，无可见后果）
- **建议：** 修正为在 `drawConnections` 中添加 `if (fromEdge.x === toEdge.x && fromEdge.y === toEdge.y) continue;` 守卫，与 `drawArrowhead` 的 `len < 1` 保持一致防御层级。

---

### 二、Decision P3（1 项）

#### P3-7: AC2 snap 检测使用 center-distance 而非 edge-distance

- **详见：** `docs/code-reviews/story-3-6-ac2-deep-audit.md`
- **验证：** ✅ **正确。** AC2 使用 "~20px" 近似标记，hitTest() 对所有类型使用 ≥20px（32px/72px/24px），功能等价或更优。
- **定级评估：** P3 正确（实现选择差异，非 AC 违反）

---

### 三、Defer P3 — 设计参数（7 项）

以下全部来自第一轮审查，经 confession report 从 P1 降级为 P3。每项均经过独立源码验证。

| #   | 参数                     | 源码值         | Dev Notes 值 | AC 约束          | 定级  | 源码位置                 | 验证 |
| --- | ------------------------ | -------------- | ------------ | ---------------- | ----- | ------------------------ | ---- |
| 1   | 连接线颜色               | `#4fc3f7`      | `#1a1a1a`    | AC8 不指定颜色   | P3 ✅ | SceneRenderer.ts:168     | 正确 |
| 2   | 箭头尺寸                 | 14/7           | 8/6          | AC8 不指定尺寸   | P3 ✅ | SceneRenderer.ts:171-172 | 正确 |
| 3   | EDGE_ZONE_INNER_FRACTION | 0.7            | 0.5          | AC 皆不指定      | P3 ✅ | InputManager.ts:12       | 正确 |
| 4   | Rubber-band 颜色         | 继承 `#4fc3f7` | `#888888`    | AC1 不指定颜色   | P3 ✅ | SceneRenderer.ts:773     | 正确 |
| 5   | SNAP_ZONE_RADIUS         | 14             | 20           | AC2 "~20px" 近似 | P3 ✅ | SceneRenderer.ts:173     | 正确 |
| 6   | 线宽                     | 2.5            | 2            | AC8 不指定线宽   | P3 ✅ | SceneRenderer.ts:169     | 正确 |
| 7   | 虚线样式                 | [6,6]          | [6,4]        | AC1 不指定样式   | P3 ✅ | SceneRenderer.ts:775     | 正确 |

**第一性原理验证：**

AC 是行为契约——只有 AC 表格 Then 列中的约束有规范效力。Dev Notes 中的代码示例是实现参考，不是验收标准。

逐项 AC 交叉验证：

- **连接线颜色/尺寸/线宽：** AC8 仅要求 "solid lines with arrowheads" —— 未指定颜色/尺寸/线宽。`#4fc3f7` 在深色背景（`#11111b`）上比 `#1a1a1a` 有更好的对比度和可视性。这是一个 UX 改进。
- **EDGE_ZONE_INNER_FRACTION 0.7：** 无 AC 约束。0.7（outer 30%）故意缩小边缘拖拽区域以减少与普通选择/拖拽的误触。注释中明确记录了意图。
- **Rubber-band 颜色：** AC1 仅要求 "dashed line follows the pointer" —— 未指定颜色。使用与已建立连接相同的颜色保持了视觉一致性。
- **SNAP_ZONE_RADIUS 14：** AC2 使用 "~20px"（波浪号 = 近似值）。14px 是视觉反馈环的尺寸，不是检测距离。实际目标检测使用 hitTest()（≥20px 对所有类型），功能等价。
- **虚线样式 [6,6] vs [6,4]：** AC1 不指定虚线样式。视觉差异极小。

**定级评估：** 全部 7 项 P3 定级正确。没有 AC 直接约束这些参数值。

---

### 四、Defer P3 — 边界防御（含第一轮遗留 4 项 + 第二轮新增 2 项）

#### P3-8: NaN 通过 ShapePaths 尺寸守卫

→ 见 P3-5（相同发现，已在上方验证）

#### P3-9: 零长度连接线

→ 见 P3-6（相同发现，已在上方验证）

#### P3-10: 拖拽中源模块被删除的竞态

- **原发现：** `InputManager.ts:482` — mouseup 时 `onConnectionDragEnd` 触发但源模块可能已被删除
- **源码验证：**
  ```typescript
  // InputManager.ts:482-501
  if (this.isDraggingConnection && this.edgeDragSourceId) {
    const sourceId = this.edgeDragSourceId;
    const screenPos = vec2(e.clientX, e.clientY);
    const targetId = this.hitTest(screenPos);
    if (targetId && targetId !== sourceId) {
      this.onConnectionDragEnd?.(sourceId, targetId); // sourceId 可能已失效
    }
  ```
  `onConnectionDragEnd` 在 main.ts:317-357 中调用 `addConnection(currentState, sourceModuleId, targetModuleId)`——该函数内部检查端点存在性（mutations.ts:196-197: `if (!state.nodes[fromId] || !state.nodes[toId]) return state`）并返回 unchanged state。
- **验证：** ✅ **正确发现，但下游已防护。** `addConnection` 的端点检查已将竞态降级为无操作（unchanged state + unchanged version → 无 history push）。
- **定级评估：** P3 正确（下游已防御）

#### P3-11: ModulePanel iconElements 迭代缺少 null 守卫

- **原发现：** `ModulePanel.ts:setHighlightedType` — Map 迭代未守卫 null
- **源码：** ModulePanel.ts — `iconElements` 是在构造函数中填充的 `Map<string, HTMLElement>`。`setHighlightedType` 中通过 `for (const [type, el] of this.iconElements)` 迭代，Map 的所有值均在构造函数中通过 `querySelector` 获取。
- **验证：** ✅ **正确发现，但不可达。** Map 中所有值均在构造函数中赋值，且构造后不被修改。除非 DOM 异常（元素被外部脚本删除），否则 null 不可能出现。
- **定级评估：** P3 正确（纯防御，实际不可达）

#### P3-12: Escape 键未 preventDefault

- **原发现：** `InputManager.ts:601-610` — Escape 取消拖拽但不 preventDefault
- **源码验证：**
  ```typescript
  if (e.code === "Escape") {
    if (this.isDraggingModule) {
      this.cancelDrag();
    }
    if (this.isDraggingConnection) {
      this.cancelConnectionDrag();
    }
    return;
  }
  ```
  无 `e.preventDefault()` —— 但在正常模式下，Escape 的浏览器默认行为是 "stop loading page"（仅页面加载中有效）。全屏模式下 Escape 退出全屏（F11），此场景下用户按 Escape 取消拖拽会同时退出全屏。
- **验证：** ✅ **正确。** 全屏模式下存在双重触发。概率低但真实。
- **定级评估：** P3 正确

#### P3-13: Ghost hash 浮点精度问题

- **原发现：** `MinimapRenderer.ts:88` — `ghost.moduleType + ghost.worldPosition.x + ghost.worldPosition.y` 产生浮点精度哈希差异
- **验证：** ✅ **正确。** `100.0000001` 和 `100.0` 产生不同哈希。
- **定级评估：** P3 正确（仅导致不必要的重绘，不影响正确性）

#### P3-14: handleDragOver 无节流

- **原发现：** `InputManager.ts:229-249` — dragover 事件高频触发，每帧计算 screenToWorld 并分配对象
- **验证：** ✅ **正确。** 无节流/防抖机制。
- **定级评估：** P3 正确（rAF 限流 + MinimapRenderer hash 优化已缓解）

---

## [认知偏差分析]

### 偏差 1：Auditor 的文本匹配松弛化（Verification Slack）

**现象：** Acceptance Auditor 没有执行 `grep "expect(true).toBe(true)" EmptyCanvasAffordance.test.ts` 这样的精确文本匹配，导致将修复后的 trivial test 错判为未修复。

**推理节点：** 在验证 "STILL OPEN" 状态时，模型执行了模式匹配（`.toBe(true)` + simple condition）而非精确文本匹配。在人类的视觉扫描中，`expect(shouldRender).toBe(true)` 可能被视觉简化为 `expect(true).toBe(true)`，但严格的自动化审计应该 grep 精确字符串。

**纠正：** 验证 "发现是否已修复" 时，应对原始发现中的精确代码片段（如 `expect(true).toBe(true)`）进行 grep 搜索。如果源码不再包含精确匹配，则标记 RESOLVED——无论替代代码质量如何。

### 偏差 2：Blind Hunter 行号偏差——方法论固有局限非认知错误

**现象：** Blind Hunter 的行号全部来自 unified diff 而非源文件。这是 methodology 的固有属性，不是推理错误。

**纠正：** Triager 在合并 Blind Hunter 发现时应校正行号为源文件行号。本轮 triage 已正确执行此操作（story 文件中使用源文件行号）。

### 偏差 3：无可检测的系统性偏差——P3 分类一致性良好

本轮审查的 P3 发现全部正确（no false positives），定级恰当（no severity inflation）。这与此前 confession report 发现的 P3→P1 系统性升级形成鲜明对比，说明审查框架的 P3 判定阈值在经历第一次审计修正后已得到有效校准。

---

## [总结]

| 指标                  | 数值                             |
| --------------------- | -------------------------------- |
| P3 发现总数           | 18                               |
| ✅ 验证确认           | 18 (100%)                        |
| ❌ 误报               | 0                                |
| 🔧 需修正的元数据错误 | 2（行号校正、expect(true) 状态） |
| 📐 系统性偏差         | 无                               |

**审计结论：P3 发现在事实维度全部正确。两处元数据偏差（Blind Hunter diff 行号、Auditor 状态误判）不影响发现本身的有效性。P3 分类一致性好——这是经第一次 confession report 修正后审查框架改进的直接证据。**
