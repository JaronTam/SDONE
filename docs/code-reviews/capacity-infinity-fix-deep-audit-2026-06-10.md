# Infinity Fix 深度审计报告

**审计日期:** 2026-06-10
**审计对象:** `docs/code-reviews/capacity-infinity-fix-review-2026-06-10.md`
**审计方法:** 第一性原理回溯 + 逐句事实校验 + 边界条件复现
**审计者:** bmad-code-review (Cline) — 独立审计空间

---

## 审计核心结论

**此前内容的严重偏差等级: 🟡 中等偏差**

此前审查报告在 §6 五个关注点的核心逻辑判断上**基本正确**（闭包分析、Infinity 移除、测试语义），但存在以下系统性偏差：

1. **重大遗漏**：完全忽略了 mutation 层（`updateCapacity` / `addModule`）的输入验证缺口 — 这是本次修复的**防御纵深**核心，遗漏它等于审查了门锁但忽略了墙壁上的洞
2. **过判**：R2-1（blur handler）严重性被高估为 🟡 Medium，实际为 🟢 Low
3. **误判**：R4-1 的复现路径描述存在技术错误（`this._inputEl` 引用分析）
4. **遗漏**：`onModuleDrop` 注释与实现不一致、`computeFillRatio` 中 `Number.isFinite` 保留的合理性未分析

**此前报告中逻辑和事实上均无误的部分：** R1 闭包分析、R3 Infinity 移除、R5 测试语义保持 — 这三个部分的推理链完整且正确。

---

## 偏差明细清单

### 偏差 #1: 🔴 重大遗漏 — `updateCapacity` / `addModule` 无输入验证

**此前报告:** 未提及

**事实:**

```typescript
// mutations.ts — updateCapacity
export function updateCapacity(state, stockId, capacity): GraphState {
  const node = state.nodes[stockId];
  if (!node || node.type !== "stock") return unchanged(state);
  return {
    ...bump(state),
    nodes: { ...state.nodes, [stockId]: { ...node, capacity } },
  };
  // ⚠️ 无任何验证：capacity 可以是 0、-5、Infinity、NaN
}
```

```typescript
// mutations.ts — addModule
capacity: initialCapacity ?? 100,
// ⚠️ ?? 仅过滤 null/undefined，不过滤 0、NaN、Infinity
```

**JavaScript `??` 运算符实测:**

| 输入        | `initialCapacity ?? 100` 结果 | 安全？                        |
| ----------- | ----------------------------- | ----------------------------- |
| `undefined` | `100`                         | ✅                            |
| `null`      | `100`                         | ✅                            |
| `0`         | **`0`**                       | ❌ 除零                       |
| `NaN`       | **`NaN`**                     | ❌ 状态污染                   |
| `Infinity`  | **`Infinity`**                | ❌ 重新引入本修复要消除的 bug |
| `-5`        | **`-5`**                      | ❌ 语义错误                   |

**下游影响链:**

```
capacity=0 → feedback formula: max(0, (0 - value) / 0) → max(0, -Infinity) → 0
                                                    或 max(0, 0/0) → max(0, NaN) → NaN
capacity=0 → computeFillRatio: value / 0 → Infinity → 渲染异常
capacity=Infinity → 重新引入 Infinity bug（本修复的目标）
```

**第一性原理:** 数据完整性验证应位于 mutation 层（架构决策 3: composition root），而非仅依赖 UI 层。UI 验证是用户体验优化，mutation 验证是数据完整性保障。两者职责不同，不可互相替代。

**认知偏差分析:** 此前审查遵循了实施报告 §6 的 5 个关注点框架，将注意力集中在 UI 层和集成层，忽略了从数据流上游（mutation 层）向下追踪的防御纵深视角。这是**锚定偏差** — 被给定的审查框架限制了探索范围。

---

### 偏差 #2: 🟡 过判 — R2-1 blur handler 严重性高估

**此前报告:** R2-1 定级为 🟡 Medium

**事实校验:**

1. `<input type="number">` 的浏览器行为已阻止大部分非数字输入（字母无法输入）
2. `min="1"` 属性提供浏览器级验证提示
3. 模拟运行时 `setStock` 以 10Hz 刷新，非法值最多存在 100ms
4. 非模拟时，用户需手动输入无效值 + Tab 离开 + 不按 Enter — 极低概率操作路径
5. 即使残留，`_lastValidCapacity` 状态未受影响，下次 `setStock` 即修复

**修正定级:** 🟢 Low

**第一性原理:** 严重性评估应基于「实际可触达的损害路径」而非「理论上的不完整」。`<input type="number">` 的浏览器原生验证已构成第一道防线，blur handler 是第二道防线而非唯一防线。

**认知偏差分析:** 此前审查在发现 blur 缺口时，将其与「无验证」等价，忽略了 `<input type="number">` 已提供的隐式验证。这是**可用性偏差** — 关注缺失的代码比关注已有的隐式保护更容易。

---

### 偏差 #3: 🟡 误判 — R4-1 `this._inputEl` 引用分析错误

**此前报告:**

> 3. 旧 setTimeout 触发时，`this._inputEl` 指向**新** input 元素
> 4. 错误地移除新 input 的 error class

**事实:** 这个分析在技术上是**正确的** — setTimeout 闭包捕获 `this`（CapacityInputPopover 实例），而非 `this._inputEl` 的快照。当 timeout 触发时，`this._inputEl` 确实指向新 input。

**但此前报告遗漏了关键上下文:** 新 input 在 `open()` 中刚创建，不可能已有 `--error` class。因此旧 timeout 的 `classList.remove(...)` 在新 input 上是**空操作 (no-op)**，不会产生可见影响。

**修正:** R4-1 仍是一个真实的代码卫生问题（悬空 timeout），但其**实际影响为零**，因为：

- 新 input 不可能有 `--error` class（刚创建）
- 旧 input 已被 `close()` 从 DOM 移除，其 classList 操作无副作用

**修正定级:** 🟢 Low（代码卫生，非功能性 bug）

**第一性原理:** `classList.remove()` 对不存在的 class 是幂等空操作。评估 bug 影响应追踪到**可观测行为**，而非代码结构不完美。

**认知偏差分析:** 此前审查在分析 `this._inputEl` 引用时，正确识别了引用指向变化，但未继续推演「移除一个不存在的 class 会发生什么」。这是**推理截断** — 在识别出「错误引用」后即停止推理，未完成影响链的完整推演。

---

### 偏差 #4: 🟢 遗漏 — `onModuleDrop` 注释与实现不一致

**此前报告:** R1-1 提到 `clearSelection` 不一致，但未发现注释问题

**事实:**

```typescript
// onModuleDrop: push history snapshot, create module, assign palette colour,
// emit MODULE_PLACED event, and renderers pick up on next rAF.
inputManager.onModuleDrop = (moduleType, worldPos) => {
  handleModulePlace(moduleType as ModuleType, worldPos);
};
```

注释描述的是**重构前**的行为（直接 push history、create module、assign colour、emit event），但重构后 handler 仅委托 `handleModulePlace`。注释完全过时，误导后续维护者。

**第一性原理:** 代码注释是契约的一部分。过时注释比无注释更有害 — 它主动误导而非被动缺失。

---

### 偏差 #5: 🟢 遗漏 — `computeFillRatio` 中 `Number.isFinite(value)` 保留的合理性

**此前报告 (A1):** 建议「统一策略 — 要么保留所有 `Number.isFinite` guard，要么全部移除」

**事实:**

```typescript
// SceneRenderer.ts L184-187
export function computeFillRatio(value: number, capacity: number): number {
  if (!Number.isFinite(value) || !(capacity > 0)) return 0;
  return Math.max(0, value / capacity);
}
```

`Number.isFinite(value)` 在此处的保留是**正确且必要的**：

- `value` 来自模拟引擎计算，可能产生 `NaN`/`Infinity`（如除零、溢出）
- `capacity` 现在始终有限，但 `value` 不受此保证
- 移除此 guard 会导致 `NaN / 100 = NaN` 传入渲染管线

而 SceneRenderer L701 移除的 `Number.isFinite(node.capacity)` 是正确的，因为 capacity 现在始终有限。

**修正:** A1 的「统一策略」建议是错误的。两个 `Number.isFinite` 检查的对象不同（`value` vs `capacity`），不应统一处理。

**第一性原理:** `value` 和 `capacity` 的数据来源不同，具有不同的不变量保证。`capacity` 由用户输入（有限值），`value` 由浮点运算（可能非有限）。对不同不变量的 guard 不能统一移除。

**认知偏差分析:** 此前审查在发现「一处移除、一处保留」的不一致时，默认假设不一致是问题，未分析两个 guard 保护的对象是否具有不同的不变量。这是**一致性偏差** — 倾向于追求表面一致而忽略语义差异。

---

## 修正与原点溯源

### 修正后的完整发现清单

| ID  | 严重性    | 类别 | 描述                                                       | 原报告状态 |
| --- | --------- | ---- | ---------------------------------------------------------- | ---------- |
| D1  | 🔴 High   | 遗漏 | `updateCapacity` 无输入验证（0/NaN/Infinity/-N）           | **新增**   |
| D2  | 🔴 High   | 遗漏 | `addModule` `initialCapacity ?? 100` 不保护 0/NaN/Infinity | **新增**   |
| D3  | 🟡 Medium | 遗漏 | `AnalyticsPanel.test.ts` 无交互测试覆盖                    | = A3       |
| D4  | 🟢 Low    | 过判 | blur handler 缺失（降级 Medium→Low）                       | ↓ R2-1     |
| D5  | 🟢 Low    | 误判 | error timeout 影响为零（降级 Medium→Low）                  | ↓ R4-1     |
| D6  | 🟢 Low    | 遗漏 | `onModuleDrop` 注释过时                                    | **新增**   |
| D7  | 🟢 Low    | 误判 | A1「统一 Number.isFinite 策略」建议错误                    | **推翻**   |
| D8  | 🟢 Low    | 保留 | R1-1 clearSelection 不一致                                 | = R1-1     |
| D9  | 🟢 Low    | 保留 | R1-2 open() 不触发 onCancel                                | = R1-2     |
| D10 | 🟢 Low    | 保留 | R2-2 setStock 覆盖编辑中 input                             | = R2-2     |

### 修正后的结论

| 等级        | 数量 | 明细                                                 |
| ----------- | ---- | ---------------------------------------------------- |
| 🔴 阻塞     | 2    | D1 (updateCapacity 无验证), D2 (addModule ?? 不保护) |
| 🟡 建议修复 | 1    | D3 (测试覆盖缺口)                                    |
| 🟢 低优先级 | 7    | D4-D10                                               |

**修正后总体判定: ⚠️ 有条件通过 — 需修复 D1/D2 后方可合并**

D1/D2 的修复方案：

```typescript
// mutations.ts — updateCapacity 修复
export function updateCapacity(
  state: GraphState,
  stockId: string,
  capacity: number,
): GraphState {
  const node = state.nodes[stockId];
  if (!node || node.type !== 'stock') return unchanged(state);
  // 防御性验证：capacity 必须为有限正数
  if (!Number.isFinite(capacity) || capacity <= 0) return unchanged(state);
  return {
    ...bump(state),
    nodes: { ...state.nodes, [stockId]: { ...node, capacity } as StockNode },
  };
}

// mutations.ts — addModule 修复
capacity: (initialCapacity !== undefined && Number.isFinite(initialCapacity) && initialCapacity > 0)
  ? initialCapacity : 100,
```

---

## 认知偏差分析总结

本次审查生成过程中的三个关键偏差节点：

### 节点 1: 锚定偏差（最严重）

```
输入: §6 的 5 个关注点框架
     ↓
偏差: 将审查范围锚定在给定框架内，未向上游（mutation 层）扩展
     ↓
结果: 遗漏 D1/D2 — 本次修复最关键的防御纵深缺口
     ↓
原点: 审查应从数据流源头（mutation）向下游（UI）追踪，而非从给定关注点向内深挖
```

### 节点 2: 可用性偏差

```
输入: 发现 blur handler 缺失
     ↓
偏差: 「缺失」比「已有隐式保护」更显著，忽略 <input type="number"> 的浏览器验证
     ↓
结果: R2-1 过判为 Medium
     ↓
原点: 严重性评估应基于「可触达损害路径」的完整分析，而非「代码缺失」的直觉判断
```

### 节点 3: 一致性偏差

```
输入: SceneRenderer 两处 Number.isFinite 处理不一致
     ↓
偏差: 默认假设不一致=问题，未分析 value vs capacity 的不变量差异
     ↓
结果: A1 建议统一策略（错误）
     ↓
原点: 不一致本身不是问题，需要分析不一致的根因是否合理
```

---

## 对原报告各部分的逐项裁定

| 原报告部分              | 裁定        | 说明                                                     |
| ----------------------- | ----------- | -------------------------------------------------------- |
| R1 闭包分析             | ✅ 正确     | 闭包捕获语义、3 路径合并逻辑分析无误                     |
| R1-1 clearSelection     | ✅ 正确     | 观察有效，Low 定级合理                                   |
| R1-2 onCancel 丢弃      | ✅ 正确     | 设计一致性观察有效                                       |
| R2 状态机分析           | ✅ 正确     | 状态转换图准确                                           |
| R2-1 blur handler       | ⚠️ 过判     | 降级 Medium→Low，浏览器 type=number 已提供隐式验证       |
| R2-2 setStock 覆盖      | ✅ 正确     | 有效观察                                                 |
| R3 Infinity 移除        | ✅ 正确     | 编号重映射、边界条件分析完整                             |
| R4 DOM 清理分析         | ✅ 正确     | 清理路径表格准确                                         |
| R4-1 error timeout      | ⚠️ 误判     | 降级 Medium→Low，实际影响为零（新 input 无 error class） |
| R5 测试语义             | ✅ 正确     | 数学验证和语义等价性分析无误                             |
| A1 统一 isFinite        | ❌ 错误     | value 和 capacity 不变量不同，不应统一处理               |
| A2 analyticsPanel 刷新  | ✅ 正确     | 有效观察                                                 |
| A3 测试覆盖             | ✅ 正确     | 有效发现                                                 |
| **D1/D2 mutation 验证** | ❌ **遗漏** | **最严重偏差 — 完全忽略 mutation 层防御纵深**            |

---

🤖 Generated with [Cline](https://cline.bot) — 独立审计空间
