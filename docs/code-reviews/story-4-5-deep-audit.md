# 深度审计报告 — Story 4.5 Code Review

**审计日期**: 2026-05-31
**审计对象**: Story 4.5 代码审查（bmad-code-review 三层并行）
**审计方法**: 逐项回溯验证所有发现，对照源码核实事实陈述

---

## [审计核心结论]

**此前审查的严重偏差等级：中等偏高。**

三层审查共产生 29 条原始发现。经逐项回溯验证：
- **5 条发现的事实陈述完全错误**（含 2 条被标记为 P0/P1），需彻底否定
- **3 条严重性被显著夸大**（P0→P2, P0→无效, P1→P3）
- **3 条被错误归因到 Story 4.5**（实际来自 Story 3.4/3.7 的既存代码）
- **1 条关键发现被遗漏**（TypeScript `number` 类型下 `input.value = ''` 与 `input.step = 'any'` 存在 `valueAsNumber` 竞态）

经修正后，**Story 4.5 的有效缺陷共计 8 项**（1 P0, 4 P1, 3 P2），无阻塞性安全问题。

---

## [偏差明细清单]

### ❌ 完全错误的事实陈述

#### BH-#4 (P1): "setRate() does not update _lastValidRate"

**Blind Hunter 原文**：
> "The field `_lastValidRate` is only set in `setConnection()` (once, when the connection is selected) and never updated by `setRate()`."

**事实**：`RateEditorPanel.ts:170` 明确写有：
```typescript
this._lastValidRate = value;
```

此行存在于 `setRate()` 方法体中。Blind Hunter 声称为空——**完全失实**。

**严重性**：此为 P1 级别的事实错误。该结论影响了 4 个发现（BH-#4、EH-#1 及其变体），且在被 Edge Case Hunter 和我本人在 Triage 阶段采纳并重复。

---

#### BH-#1 (P0): "onConnectionDelete pushes state AFTER mutation, making undo pointless — data-loss bug"

**Blind Hunter 原文**：
> "In `onConnectionDelete`, the pre-deletion state is never saved. When the user hits undo, it restores the post-deletion state — a no-op."

**事实**：经阅读 `HistoryManager.ts:89-112`，`undo()` 的语义为：
1. 弹出栈顶（最新条目）→ 移入 redoStack
2. 返回栈中新栈顶（前一个条目）的 `structuredClone`

**具体追踪**：
```
# push-AFTER 模式（onConnectionDelete 实际使用）：
栈前: [S0, S1, S2]                     # S2 = 当前状态（含连接）
删除: currentState = S3（无连接）
push: [S0, S1, S2, S3]                # push S3
undo: pop S3→redo, return clone(S2)    # 返回含连接的状态S2 ✓
```

undo 正确恢复了删除前的状态。**该发现完全无效**。

**认知根源**：Blind Hunter 隐式假设了 `undo()` 返回"被弹出的值"（即栈顶），而非"弹出后的新栈顶"。这是对 HistoryManager 数据结构的错误心智模型。

**⚠️ 附注**：`onConnectionDelete` 和 `onModuleDelete` 的 handler 整体是 Story 3.4/3.7 的代码，非 Story 4.5 引入。Story 4.5 仅在其中添加了 `rateEditorPanel.setConnection(null)` 行。

---

#### BH-#13 (P2): "TYPE_DISPLAY_NAMES may silently miss future ModuleType variants; no exhaustiveness guard"

**Blind Hunter 原文**：
> "If ModuleType includes 'flow' or 'converter' or any future type... TypeScript would not raise a compile error."

**事实**：`RateEditorPanel.ts:36` 声明为：
```typescript
const TYPE_DISPLAY_NAMES: Record<ModuleType, string> = { source: '源', stock: '存量', sink: '汇' };
```

TypeScript 的 `Record<K, V>` 要求 K 的所有成员必须作为 key 存在。若 `ModuleType` 添加第四个变体，**编译器必然报错**（`Property 'newType' is missing in type...`）。Blind Hunter 对 TypeScript 类型系统的断言完全错误。

---

#### BH-#3 (P0): "TOCTOU race in SNAPSHOT_EMITTED handler — can miss updates"

**Blind Hunter 原文**：
> "Snapshot captured at time T... User selects connection Y at T+1... Handler runs at T+2: selectedConnId = 'Y'... but payload.state.connections['Y'] does not exist"

**事实分析**：`payload.state` 是 `structuredClone(state)` 的完整克隆，包含 **所有** connections（不只是 selected 的）。连接 Y 在用户选择它之前必然已存在（通过 `addConnection` 创建），因此 `payload.state.connections['Y']` 在快照中一定存在。

**实际行为**：
1. 快照时刻 T：连接 Z 被选中，rate = 5
2. T+1：用户点击连接 Y。`currentState.selectedConnectionIds = ['Y']`
3. 处理器执行：读取 `currentState` 的 selected = 'Y'，查找 `payload.state.connections['Y']` → 存在（因 Y 在 T 时刻已存在）→ 显示 Y 的 rate

不存在"payload 中找不到连接"的场景。唯一的竞态窗口是 **rate 值可能滞后 0-100ms**（快照中的 rate 是旧值），但下一次 tick 自动纠正。

**结论**：TOCTOU 存在，但实际影响仅限「短暂的 rate 数值滞后 1 tick」，**非 P0，应为 P3**。

---

#### AA-#4 (P2): "Number.isNaN validation path is unreachable in normal browser UX"

**Acceptance Auditor 原文**：
> "The `Number.isNaN` branch is only reachable through programmatic assignment"

**部分事实**：在 Chrome/Edge 中确实如此（`type="number"` 过滤非数字字符，`.value` 为空字符串）。但在 **Firefox** 和某些移动浏览器中，`type="number"` 允许输入非数字文本，`.value` 可能是 `"abc"`。Edge Case Hunter 的 EH-#10 正确指出了此浏览器差异。

`Number.isNaN` 分支在 Firefox 中是可达的，因此是有效的防御性代码，不是死代码。**该发现过度简化了跨浏览器行为。**

---

### ⚠️ 严重性被显著夸大

#### BH-#2 (P0→P2): "EventBus subscription leak on hot-reload — handlers accumulate"

**夸大原因**：
1. `EventBus.on()` 返回 `unsubscribe` 函数（`EventBus.ts:30`）
2. `EventBus.clear()` 方法存在（`EventBus.ts:70-72`）
3. 修复方案简单：在 HMR dispose 中调用 `eventBus.clear()` 或保存 unsubscribe 句柄
4. 仅影响开发环境（HMR），生产环境不触发
5. SNAPSHOT_EMITTED handler 的 `activeElement` 守卫会自动跳过重复调用

**正确分级应为 P2**（开发体验问题，非生产缺陷）。

---

#### EH-#5 (P2→P0): "Undo after rate change leaves panel showing stale rate"

Edge Case Hunter 标记为 P2，但 Acceptance Auditor 正确识别为 P0（违反 AC5/AC7）。此发现**严重性被低估**。

---

#### EH-#4 (P2→P2 确认): "No input validation guard against infinite rates"

**评估正确**：`Number("Infinity")` 通过 `isNaN` 检查，`updateRate` 无防护。严重性确认 P2。

---

### 📋 错误归因

| 发现 | 标记来源 | 实际来源 |
|------|---------|---------|
| onConnectionDelete history 顺序 | Story 4.5 | Story 3.7（既存） |
| onModuleDelete history 顺序 | Story 4.5 | Story 3.4（既存） |
| onModuleDelete 缺少 markDirty | Story 4.5 | Story 3.4（既存） |
| EventBus RUN/PAUSE/RESET 处理器 | Story 4.5 | Story 4.2（既存） |

这些发现本身可能有效，但**与 Story 4.5 的实现无关**。Story 4.5 仅在上述 handler 中添加了 `rateEditorPanel.setConnection(null)` 行。

---

### 🔍 审查遗漏

#### 遗漏 #1: `input.type = 'number'` 的 `valueAsNumber` 与空字符串竞态

`RateEditorPanel.ts:108` 设置 `type='number'`，但 `setConnection(null)` 在 line 142 设置 `this._rateInput.value = ''`。在 `type='number'` 输入上，空字符串的 `valueAsNumber` 为 `NaN`。如果其他代码路径读取 `valueAsNumber` 而非 `value`，将获得不可预期的结果。

同时，`step = 'any'` 与 `type = 'number'` 组合在某些浏览器中允许科学计数法输入（如 `1e5`），这些值通过 `Number()` 解析正确，但 UX 上可能令人困惑。

#### 遗漏 #2: 测试中的无效 canvas mock

`RateEditorPanel.test.ts:24-53` mock 了 `HTMLCanvasElement.prototype.getContext`，但 `RateEditorPanel` **完全不使用 canvas**。该 mock 是 ModulePanel 测试模式的遗留——无功能影响，但表明测试未针对目标组件做针对性设计。

---

## [修正与原点溯源]

### 修正后的 Story 4.5 缺陷清单

#### 🔴 P0 — 必须修复

| # | 发现 | 位置 | 违反 |
|---|------|------|------|
| **1** | **Undo/Redo 后面板显示过期数据** — Ctrl+Z 恢复旧 state 后，`rateEditorPanel` 不更新。模拟PAUSED/IDLE 时面板永久不同步。 | `main.ts:314-343` | AC5, AC7 |

**修正方案**：在 undo/redo 处理器中，恢复 state 后调用 `rateEditorPanel.setConnection(...)`：
```typescript
// After currentState = prevState/nextState:
const connId = currentState.selectedConnectionIds[0];
if (connId) {
  const conn = currentState.connections[connId];
  if (conn) {
    const fromNode = currentState.nodes[conn.fromId];
    const toNode = currentState.nodes[conn.toId];
    rateEditorPanel.setConnection({
      id: connId, fromId: conn.fromId, toId: conn.toId,
      rate: conn.rate, fromType: fromNode?.type, toType: toNode?.type,
    });
  }
} else {
  rateEditorPanel.setConnection(null);
}
```

**第一性原理**：UI 层（RateEditorPanel）是低频只读层，不订阅 EventBus 事件。其状态完全由 `main.ts` 中的命令式调用驱动。Undo/Redo 处理器未发送更新信号→UI 层停留在旧状态。此前所有三层都正确识别了此问题。

---

#### 🟡 P1 — 应该修复

| # | 发现 | 位置 | 违反 |
|---|------|------|------|
| **2** | **`_lastValidRate` 在 `onRateSubmit` 后不同步** — 提交 rate=10 后 `_lastValidRate` 仍为 5，用户再输入 5 被误判为"未修改"。 | `RateEditorPanel.ts:243-246` | 用户交互正确性 |
| **3** | **RESET 不清除面板** — 清除 `selectedConnectionIds` 但不调用 `rateEditorPanel.setConnection(null)`。 | `main.ts:396-397` | AC4 |
| **4** | **RESET 直接 mutate node 对象** — `(node as StockNode).value = ...` 违反不可变状态架构约定。 | `main.ts:392` | 架构一致性 |
| **5** | **`RATE_UPDATED` 事件零订阅者** — 违反 spec 反模式"No new EventBus events"。 | `main.ts:479`, `EventMap.ts:40` | Spec 合规 |

**修正方案**：

**#2** — 在 `_handleKeydown` 成功调用 `onRateSubmit` 后更新 `_lastValidRate`：
```typescript
if (this.onRateSubmit) {
  this.onRateSubmit(parsed);
  this._lastValidRate = parsed;  // ADD: sync after successful submit
}
```

**第一性原理**：`_lastValidRate` 存在三个职责：(a) error-revert 目标值，(b) "未修改"检测基准值，(c) 面板显示的权威值。在当前实现中, `setRate()`（快照更新）和 `setConnection()`（选择切换）都维护了 (a)(c)，但 `onRateSubmit` 之后 (b) 被遗漏。Edge Case Hunter 正确识别了此窗口，但此前 BH 错误地声称 `setRate()` 也缺失此更新——该错误已被证伪。

**#3** — 在 RESET handler `currentState.selectedConnectionIds = []` 后添加：
```typescript
rateEditorPanel.setConnection(null);
```

**第一性原理**：RESET 是 state 的硬重置路径，必须与常规取消选择路径保持相同的不变式——state 变更必须伴随 UI 层同步。

**#4** — 改为不可变模式：
```typescript
const updatedNodes = { ...currentState.nodes };
for (const [id, node] of Object.entries(updatedNodes)) {
  if (node.type === 'stock') {
    updatedNodes[id] = { ...node, value: (node as StockNode).initialValue };
  }
}
currentState = { ...currentState, nodes: updatedNodes };
```

**#5** — 移除 `EventMap.ts:40` 的 `RATE_UPDATED` 定义和 `main.ts:479` 的 emit 调用。如果 Story 4.6 需要，届时再加。

---

#### 🟢 P2 — 建议修复

| # | 发现 | 位置 |
|---|------|------|
| **6** | `onConnectionSelect(null)` 和 `onModuleSelect(null)` 缺少 `minimapRenderer.markDirty()` — cancel选择后 minimap 不高亮清除 | `main.ts:90, :113` |
| **7** | `setRate()` 无 `Number.isNaN(value)` 守卫 — 模拟引擎若产出 NaN 则面板静默传播 | `RateEditorPanel.ts:166-172` |
| **8** | 无 `!Number.isFinite(parsed)` 守卫 — 用户可提交 `Infinity` 速率 | `RateEditorPanel.ts:234-239` |

---

### 确认有效但非 Story 4.5 专属的发现（延后）

| 发现 | 实际来源 | 
|------|---------|
| `onConnectionDelete`/`onModuleDelete` 的 history push 顺序（经分析后确认与 HistoryManager.undo() 语义兼容，非 bug） | Story 3.4/3.7 |
| EventBus 热重载订阅泄漏（HMR 专用，修复简单） | Story 4.2 |
| `structuredClone(state)` 每 tick 性能（非 Story 4.5 引入） | Story 4.3 |

---

## [认知偏差分析]

本次三层审查中，模型在以下推理节点受概率预测干扰而偏离事实轨道：

### 偏差 #1：HistoryManager 的心智模型错误（BH-#1）

**偏离节点**：Blind Hunter 在看到 `historyManager.push(currentState)` 后于 `deleteConnection` 时，**隐式假设**了 `undo()` 返回「被弹出的值」（栈顶）→推理链：push 的是 POST-deletion state → undo 返回 POST-deletion state → no-op。

**实际语义**：`HistoryManager.undo()` 返回的是「弹出后的新栈顶」（前一个条目）。这是 Memento 模式的常见变体。

**偏差根因**：模型在看到代码片段时，未阅读 `HistoryManager.ts` 的 `undo()` 实现就假设了其语义。这是「函数契约推断偏差」——在没有充分信息的情况下，用常见模式填充了空白。`undo()` 返回 previous 而非 popped 是一种合法但非最普遍的设计选择。

**教训**：对关键数据结构的语义假设必须在审查前通过阅读实际实现来验证。

### 偏差 #2：`setRate()` 的代码漏读（BH-#4）

**偏离节点**：Blind Hunter 在阅读 `RateEditorPanel.ts` 时，**漏读**了第 170 行 `this._lastValidRate = value;`。

**偏差根因**：`setRate()` 方法仅有 5 行代码（166-172）。漏读一行在如此短的方法中是注意力分配失误。可能原因：
- 代理接收到的是精简后的 diff 文本，不是完整文件
- `document.activeElement` 守卫吸引了过多注意力，导致跳过后续赋值行

**教训**：审查代理应在关键声明前后逐行交叉验证，而非依赖文本摘要。

### 偏差 #3：`Record<ModuleType, string>` 的类型系统误判（BH-#13）

**偏离节点**：Blind Hunter 声称 `Record<ModuleType, string>` 不会在 ModuleType 添加新成员时报错。

**实际**：`Record<K, V>` 映射类型要求所有 K 的成员作为 key 存在。这是 TypeScript 的基础知识。

**偏差根因**：模型混淆了 `Record<K, V>` 和 `Partial<Record<K, V>>` 的语义。前者穷尽检查，后者允许缺失。这是「类型系统概念混淆」。

### 偏差 #4：TOCTOU 的场景放大（BH-#3）

**偏离节点**：Blind Hunter 构造了 `payload.state.connections['Y']` 不存在的场景。

**实际**：因 `payload.state` 是完整状态克隆（包含所有 connections），且用户无法选择不存在的连接，该场景在物理上不可能。

**偏差根因**：「对抗性思维」过度激活。Blind Hunter 被指示"assume every line could be wrong"，导致其构造了概率极低甚至不可能的场景。这是「过度对抗偏差」——在缺乏领域约束知识的情况下，假设所有理论上的竞态都会物化。

### 偏差 #5：审查层间的发现传染（EH-#1 继承 BH-#4）

**偏离节点**：Edge Case Hunter 的 EH-#1 "Stale `_lastValidRate` silently discards valid rate rollback" 部分继承了 Blind Hunter BH-#4 的错误前提（即 `setRate()` 不更新 `_lastValidRate`）。

**Edge Case Hunter 的独立分析**：EH 正确识别了 `_lastValidRate` 在 `setRate()` 中被更新，但在 exploit scenario 中构造了 `_lastValidRate` 在 onRateSubmit 后不同步的问题。这个 scenario 本身是正确的（P1），但其严重性陈述受 BH 发现的影响而被放大。

**三阶段 Triage 的问题**：我在整理阶段合并了 BH-#4 和 EH-#1，但在合并时保留了 BH 的错误陈述而未逐行验证。这是「审查员确认偏差」——假定子代理的输出已经过独立验证。

---

## [总结]

| 指标 | 值 |
|------|---|
| 原始发现总数 | 29 |
| 事实错误 | 5 |
| 严重性夸大 | 3 |
| 错误归因 | 4 |
| 遗漏 | 2 |
| **有效缺陷（Story 4.5 专属）** | **8** |
| P0 有效缺陷 | 1（Undo/Redo 面板不同步） |
| P1 有效缺陷 | 4 |
| P2 有效缺陷 | 3 |
| **审查净准确率** | **约 65%**（有效且无偏差的发现占总发现比例） |
