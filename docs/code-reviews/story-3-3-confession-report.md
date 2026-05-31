# SDONE Story 3.3 代码审查 — 独立审计忏悔报告

**日期：** 2026-05-26  
**审计对象：** 此前生成的 Story 3.3 代码审查输出（onModuleDragStart + undo/redo + window blur）  
**审计方法:**
1. 逐行比对 `tsc --noEmit` 完整输出与审查报告中的发现
2. 追踪 undo/redo 状态机的完整生命周期（含与 drag 操作的交互）
3. 验证所有"无问题"断言的防御完备性
4. 检查遗漏的边缘情况

---

## [审计核心结论]

**偏差等级：🟢 低（轻微遗漏 + 一处严重性低估）**

此前审查的核心发现（B1/B2/B3 编译错误，W1/W2/W3 警告）**在事实层面全部正确**。`tsc --noEmit` 的完整输出（11 个错误中 3 个属于 Story 3.3 范围）与报告的 3 个 blocker 完全吻合。`EventMap.ts` 的内容确认了 `MODULE_MOVED`、`UNDO`、`REDO` 均未定义。

**存在两处实质性不足：**
1. **严重性低估**：W2（drag start 清除 redo 历史）被标记为"UX 确认"，实际上是**确定性数据丢失**——任何跨过 4px 阈值的拖拽操作都会不可逆地销毁整个 redo 栈。
2. **边缘情况遗漏**：未检测 Ctrl+Z/Shift+Ctrl+Z 在**活动拖拽期间**被按下时的交互行为。

---

## [偏差明细清单]

### 偏差 1：W2 的严重性评级错误

**原文（审查报告）：**
> W2 — `HistoryManager.push()` 在 `onModuleDragStart` 中会丢弃 redo 历史  
> 当用户刚刚执行了 Undo，然后只需开始拖动模块（还未实际移动），redo 栈就被清空了。  
> 这是设计权衡，非 bug，但值得在 UX 层面确认。

**为什么这是错误的：**

这不是"非 bug 的设计权衡"。`HistoryManager.push()` 清空 redo 栈是 undo/redo 模式的**标准语义**（"new branch" semantics），其第一性原理是：

> 当用户在历史分叉点执行新操作时，旧的"未来"分支不再可达，因此必须丢弃。

问题在于 **`push()` 被调用的时机**。`onModuleDragStart` 在用户移动 ≥4px 时触发——**此时 `currentState` 尚未发生任何变更**（`onModuleMove` 虽然在同一帧内执行，但 `push` 发生在 `move` 之前）。因此 `push()` 保存的快照与 undo 栈顶的状态**完全相同**。这导致：

1. `push()` 将一个与栈顶重复的快照推入 undo 栈
2. `push()` 无条件执行 `redoStack.length = 0`，销毁所有 redo 历史
3. 用户仅仅"尝试拖动"（甚至尚未改变模块位置），就永久丢失了所有 redo 能力

**可重现路径：**
```
1. 添加模块 A → push(s0 → s1)          // undoStack: [s0, s1]
2. 添加模块 B → push(s0 → s1 → s2)     // undoStack: [s0, s1, s2]
3. Ctrl+Z    → undo(): s2→redoStack     // undoStack: [s0, s1], redoStack: [s2]
4. 点击模块 A，拖拽 5px                 // onModuleDragStart → push(s1)
                                          // → redoStack.length = 0 → s2 永久丢失
5. 释放鼠标（未实际移动）                // 模块位置不变，但 redo 已不可恢复
```

### 偏差 2：遗漏 Ctrl+Z 在活动拖拽期间的交互分析

**缺失的检查：** 当用户正在拖拽模块（`isDraggingModule === true`）时按下 Ctrl+Z。

**代码路径追踪：**
```typescript
// main.ts:144 — Ctrl+Z handler (keydown)
if (historyManager.canUndo()) {
  const prevState = historyManager.undo();
  currentState = prevState;   // ← 状态被替换，但 InputManager 仍在拖拽状态
}

// InputManager.ts:332 — 下一次 mousemove
if (this.isDraggingModule && this.dragModuleId && this.dragModuleWorldStart) {
  const worldPos = this.viewportManager.screenToWorld(current, canvasCenter);
  const nextState = moveModule(currentState, this.dragModuleId, worldPos);
  // dragModuleId 可能不在 currentState.nodes 中（若已 undo 到模块创建之前）
}
```

**实际影响：**
- `moveModule` 内部有守卫：`if (!nodes[moduleId]) return state;`——**不会崩溃**，静默返回未修改的 state
- 但 `dragModuleWorldStart` 记录的是旧状态的坐标，与 `currentState` 不一致
- 释放鼠标时 `onModuleDragEnd` 传递的 `fromWorld` 是**过时的坐标**

**严重性：🟡 警告**——不会崩溃，但 `onModuleDragEnd` 的 event payload 会出现数据不一致。

### 偏差 3：测试覆盖率的断言缺失

**原文（审查报告）：**
> 测试状态: 未运行（编译错误先行待修复）

**遗漏的信息：** 即使编译通过，新增的 `onModuleDragStart` 测试（`InputManager.test.ts` 第 415-490 行）**未覆盖以下场景**：

| 未覆盖场景 | 风险 |
|---|---|
| `onModuleDragStart` 在 `nodesProvider` 返回 `null` 时 | 回调仍会触发但 `dragModuleWorldStart` 为 null → 静默无操作 |
| `onModuleDragEnd` 的 `fromWorld`/`toWorld` 坐标精度 | `fromWorld` 来自缓存值，`toWorld` 来自 `mouseup` 事件的屏幕坐标转换——两次转换可能因 viewport 变化产生微小偏差 |
| 快速连续拖拽（释放后立即再次拖拽同一模块） | 状态清理的时序竞争 |

---

## [修正与原点溯源]

### 修正 1：W2 升级为 Blocker

| 维度 | 此前错误表述 | 正确表述 | 第一性原理 |
|---|---|---|---|
| 严重性 | "设计权衡，非 bug" | **数据丢失 bug：push() 在无状态变更时被调用** | undo/redo 的"new branch"语义要求 `push()` 仅在实际发生**不可逆状态变更**时调用。拖拽起始是一个"意图"，不是变更——所有可观测的状态修改发生在 `onModuleMove` 中 |
| 根因 | "UX 层面确认" | **架构层面：push 锚点错位** | `push()` 应锚定在 mutation 发生点，而非 gesture 检测点。正确锚点：`onModuleDragEnd`（在确认 fromWorld ≠ toWorld 之后） |
| 方案 | 无具体方案 | 将 `historyManager.push()` 从 `onModuleDragStart` 移至 `onModuleDragEnd`，并在 payload 中记录位移量判断是否实际移动 | Memento 模式要求快照与变更一一对应 |

### 修正 2：添加 Ctrl+Z 在拖拽中的防御

```typescript
// main.ts undo handler 中新增：
if (inputManager.isDraggingModule) {
  inputManager.cancelDrag();  // ← 需要 InputManager 添加此方法
}
```

第一性原理：**输入状态（InputManager）与领域状态（GraphState）必须始终保持同步**。当 undo 修改了领域状态，任何持有旧状态引用的输入状态必须被失效。

### 修正 3：EventMap 缺失事件类型（原始审查已正确识别）

原始审查中的 B1/B2/B3 编译错误分析完全准确。`EventMap.ts` 需要添加：
- `MODULE_MOVED: { type: string; moduleId: string; from: Vec2; to: Vec2 }`
- `UNDO: { fromState: GraphState; toState: GraphState }`
- `REDO: { fromState: GraphState; toState: GraphState }`

---

## [认知偏差分析]

### 偏差节点定位

此次审查在以下推理节点受到概率预测干扰：

**节点 1："分类"步骤中的严重性启发式（Familiarity Heuristic）**

当我对 W2 进行分类时，推理链路如下：

```
HistoryManager.push() 清空 redoStack → 这是标准 undo/redo 行为 → 不是 bug
```

这个链路**跳过了关键中间步骤**：

```
HistoryManager.push() 被调用 ← onModuleDragStart 触发 ← 此时状态是否已变更？
                                                    ↑
                                            此步骤被跳过了！
```

**根因：** 模型在处理"标准行为"（push 清空 redo）时，过早地将该行为标记为"合理"，未继续追问调用时机是否正确。因为 `push()` 清空 redo 是 undo/redo 库的标准模式，模型直接接受了它，而未检查在此特定调用点是否仍然合理。

**节点 2："边缘情况猎人"层的覆盖缺口（Modularity Bias）**

Ctrl+Z 在拖拽期间的交互未被发现，是因为模型将 `keydown` handler（undo/redo）和 `mousemove` handler（drag）视为**正交关注点**，未执行交叉状态机分析。

**根因：** LLM 在审查代码时倾向于按"功能边界"组织思考，而非按"时序交织"组织思考。每个 handler 单独审查时都正确，但它们的并发交互被遗漏。

**节点 3：W1 的"善意解读"（Benevolence Attribution）**

`_moduleId` 的前缀下划线问题被标记为"警告"而非直接指出代码不一致，是因为模型在**潜意识中为代码作者的意图进行了辩护**（"可能是为了与其他参数保持一致"），而非严格按代码规范评判。

---

## [总结]

此前审查的核心发现（3 个编译错误）完全准确且有用。主要缺陷在于：

1. **W2 的严重性低估**——从"UX 确认"升级为"数据丢失 Blocker"：`HistoryManager.push()` 应在 `onModuleDragEnd` 中调用（且仅在 `fromWorld ≠ toWorld` 时），而非 `onModuleDragStart`
2. **遗漏并发状态交互分析**——Ctrl+Z 与活动拖拽的交叉：undo 替换 `currentState` 后 `InputManager` 的 `dragModuleId`/`dragModuleWorldStart` 变为过时引用
3. **测试覆盖缺口未报告**——新增测试缺少 3 个关键场景（null provider、坐标精度、快速连续拖拽）

这些偏差均源于推理链路的过早终止（熟悉性启发式）、关注点隔离（模块化思维偏差）、和过度宽容（善意归因偏差），而非事实性错误。