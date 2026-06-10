# Infinity Fix 代码审查报告

**审查日期:** 2026-06-10
**审查范围:** `capacity-infinity-fix-implementation-report-2026-06-10.md` §6 的 5 个 Review 关注点
**基线 commit:** `848f9d9`
**审查者:** bmad-code-review (Cline)
**审查方法:** 逐文件源码审读 + 闭包/状态机推演 + 边界条件分析

---

## 审查总览

| 关注点 | 风险 | 判定 | 发现数 |
|--------|------|------|--------|
| R1: `handleModulePlace` 闭包正确性 | 🟡 | ✅ 通过 (附注) | 2 |
| R2: `_lastValidCapacity` 状态机一致性 | 🟡 | ⚠️ 有条件通过 | 2 |
| R3: `CountdownPanel` Infinity 移除 | 🟢 | ✅ 通过 | 0 |
| R4: `CapacityInputPopover` DOM 清理 | 🟢 | ⚠️ 有条件通过 | 1 |
| R5: `feedback.test.ts` 语义保持 | 🟢 | ✅ 通过 | 0 |

**总发现数:** 7 (2 🟡 Medium, 5 🟢 Low) — 含 2 个附加发现

---

## R1: 🟡 `handleModulePlace` 闭包正确性

### 审查对象

`main.ts` L377-411 — `handleModulePlace(moduleType, worldPos)` 及其 3 条调用路径：

| 路径 | 调用点 | 代码位置 |
|------|--------|----------|
| I1-p1 drag-drop | `inputManager.onModuleDrop` | ~L1130 |
| I1-p2 click-to-place | `inputManager.onCanvasClickEmpty` | L580-586 |
| I1-p3 center-place | `inputManager.onModulePlaceAtCenter` | L561-577 |

### 闭包分析

```typescript
capacityInputPopover.onConfirm = (capacity: number) => {
  currentState = addModule(currentState, 'stock', worldPos, capacity);
  // ...
};
```

- `worldPos` 是函数参数（`Vec2` = `{x, y}`），每次调用 `handleModulePlace` 创建新闭包，捕获独立的 `worldPos` 引用。✅ **闭包正确**。
- `currentState` 是模块级 `let` 变量，回调执行时读取最新值。✅ **无陈旧状态风险**。
- `capacityInputPopover.open()` 内部先调用 `this.close()`，会清除旧监听器但**不触发**旧 `onCancel`。新回调立即覆盖旧回调，行为正确。

### 发现

**R1-1 🟢 Low — `onModuleDrop` 路径缺少 `clearSelection`（非 stock 类型）**

`onCanvasClickEmpty` 在非 stock 类型时调用 `modulePanel.clearSelection()`，但 `onModuleDrop` 和 `onModulePlaceAtCenter` 均未调用。这可能是**有意设计**（拖放/Enter 允许连续放置同类型模块），但与 click-to-place 行为不一致。

**建议:** 在 `handleModulePlace` 的非 stock 路径注释中明确说明 `clearSelection` 由调用方负责，或统一行为。

**R1-2 🟢 Low — 重复 `open()` 静默丢弃旧 `onCancel`**

当 popover 已打开时再次调用 `handleModulePlace`（如快速连续点击空画布），`capacityInputPopover.open()` → `close()` 不触发旧 `onCancel`。当前 `onCancel` 仅调用 `modulePanel.clearSelection()`，跳过无副作用。但若未来 `onCancel` 增加清理逻辑，可能产生泄漏。

**建议:** 在 `CapacityInputPopover.open()` 中，`close()` 前显式调用 `this.onCancel?.()` ，或文档注明 `open()` 不触发 `onCancel`。

### 判定: ✅ 通过

闭包捕获语义正确，3 条路径合并逻辑无误。发现项均为低风险设计一致性问题。

---

## R2: 🟡 `_lastValidCapacity` 状态机一致性

### 审查对象

`AnalyticsPanel.ts` L92, L220-234, L327-328 — `_lastValidCapacity` 在以下 3 个场景的交互：

1. **setStock 覆盖** (L327): `_lastValidCapacity = data.capacity`
2. **用户输入** (L232): `_lastValidCapacity = parsed`
3. **非法 revert** (L225-226): `capacityValue.value = _lastValidCapacity ?? '100'`

### 状态转换图

```
[null] ──setStock──→ [data.capacity]
   │                     │
   │    ┌────────────────┘
   │    ↓
   │  [用户输入 parsed] ──Enter──→ [parsed] (if valid & ≠ last)
   │    │
   │    ↓
   │  [非法输入] ──Enter──→ revert to [_lastValidCapacity] or '100'
   │
   └──[非法输入 + null] ──Enter──→ revert to '100' (硬编码 fallback)
```

### 发现

**R2-1 🟡 Medium — 缺少 `blur` 事件处理**

当前仅在 `keydown Enter` 时验证输入。若用户输入非法值后直接 Tab/点击其他元素离开（blur），非法值会残留在 input 中，直到下次 `setStock` 调用才被覆盖。

**复现路径:**
1. 选中 stock → 容量 input 显示 "100"
2. 用户输入 "abc" → Tab 离开（无 Enter）
3. input 显示 "abc"，`_lastValidCapacity` 仍为 100
4. 若此时无模拟 tick 刷新面板，非法值持续可见

**建议:** 添加 `blur` 事件监听，revert 到 `_lastValidCapacity`：

```typescript
capacityValue.addEventListener('blur', () => {
  const parsed = Number(capacityValue.value.trim());
  if (!Number.isFinite(parsed) || parsed <= 0) {
    capacityValue.value = this._lastValidCapacity !== null
      ? String(this._lastValidCapacity) : '100';
  }
});
```

**R2-2 🟢 Low — 模拟运行时 `setStock` 覆盖用户正在编辑的值**

`refreshAnalyticsPanel` 在模拟运行时以 10Hz 调用 `setStock`，每次都覆盖 `_capacityEl.value`。若用户正在编辑容量值，输入会被实时数据覆盖。

**建议:** 在 `setStock` 中检查 `this._capacityEl === document.activeElement`，若 input 获得焦点则跳过容量值覆盖（仅更新 `_lastValidCapacity`）。

### 判定: ⚠️ 有条件通过

状态机核心逻辑正确（setStock → 用户输入 → revert 三路一致），但缺少 `blur` 处理是功能性缺陷。建议在后续迭代中修复 R2-1。

---

## R3: 🟢 `CountdownPanel` Infinity 移除

### 审查对象

`CountdownPanel.ts` — `computeStockCountdown` (L80-125), `getUrgencyGroup` (L179-190), 渲染逻辑 (L285-394)

### 分析

**`computeCountdown` 变更:**

```typescript
// 旧: if (Number.isFinite(stock.capacity)) { remainingSeconds = ... } else { remainingSeconds = null; }
// 新: remainingSeconds = (stock.capacity - stock.value) / netRate;  // 始终计算
```

- capacity 始终有限值 → `remainingSeconds` 始终为有限数（netRate > 0 时）✅
- 不再产生 `null`（除 stable 状态 netRate === 0）✅

**`getUrgencyGroup` 编号:**

| 旧编号 | 旧含义 | 新编号 | 新含义 |
|--------|--------|--------|--------|
| 1 | terminal | 1 | terminal |
| 2 | active | 2 | active |
| 3 | infinite capacity | **移除** | — |
| 4 | stable | **3** | stable |
| — | — | 4 | catch-all / NaN |

- 编号连续无缺口（1→2→3→4）✅
- `sortCountdownsByUrgency` 的 `groupA - groupB` 比较器不受影响 ✅
- 旧 "infinite capacity" 组（原 group 3）已移除，stable 从 4→3，catch-all 从隐含变为显式 group 4 ✅

**边界条件:**
- `value > capacity`（溢出）→ `remainingSeconds < 0` → group 1 (terminal) ✅
- `netRate` 极小 → `remainingSeconds` 极大 → group 2 (active) ✅
- `remainingSeconds` 为 NaN → group 4 (catch-all) ✅

### 判定: ✅ 通过

Infinity 移除干净，编号重映射正确，无遗漏边界条件。

---

## R4: 🟢 `CapacityInputPopover` DOM 清理

### 审查对象

`CapacityInputPopover.ts` — `open()` (L62-172), `close()` (L178-198), `destroy()` (L201-203), `_onConfirm()` (L207-227)

### 清理路径分析

| 路径 | mousedown | wheel | keydown | DOM 移除 | 引用置空 |
|------|-----------|-------|---------|----------|----------|
| `close()` | ✅ removeEventListener | ✅ removeEventListener | ✅ removeEventListener | ✅ el.remove() | ✅ 全部 null |
| `destroy()` | ✅ 委托 close() | ✅ | ✅ | ✅ | ✅ |
| `open()` 内部 | ✅ 先 close() | ✅ | ✅ | ✅ | ✅ |

**`setTimeout(0)` mousedown 延迟注册:**
- `close()` 将 `_boundDocClick` 置 null ✅
- setTimeout 回调检查 `if (this._boundDocClick)` → 若已 close 则跳过 ✅

### 发现

**R4-1 🟡 Medium — `_onConfirm` 错误闪烁 `setTimeout` 未在 `close()` 中取消**

```typescript
// _onConfirm 中:
this._inputEl.classList.add(`${INPUT_CLASS}--error`);
setTimeout(() => {
  if (this._inputEl) {
    this._inputEl.classList.remove(`${INPUT_CLASS}--error`);
  }
}, 800);
```

若 popover 在 800ms 内被 close/reopen：
1. `close()` 将 `_inputEl` 置 null
2. `open()` 创建新 `_inputEl`
3. 旧 setTimeout 触发时，`this._inputEl` 指向**新** input 元素
4. 错误地移除新 input 的 error class

**复现路径:**
1. 打开 popover → 输入非法值 → Enter → 红色闪烁
2. 800ms 内 Esc 关闭 → 立即重新打开 popover
3. 旧 timeout 触发，移除新 input 的 error class（若新 input 恰好有 error 状态）

**建议:** 追踪 timeout ID，在 `close()` 中 `clearTimeout`：

```typescript
private _errorTimeoutId: ReturnType<typeof setTimeout> | null = null;

// _onConfirm 中:
this._errorTimeoutId = setTimeout(() => { ... }, 800);

// close() 中:
if (this._errorTimeoutId !== null) {
  clearTimeout(this._errorTimeoutId);
  this._errorTimeoutId = null;
}
```

### 判定: ⚠️ 有条件通过

核心清理逻辑正确，但 error timeout 泄漏是真实 bug（低概率触发）。建议修复 R4-1。

---

## R5: 🟢 `feedback.test.ts` 语义保持

### 审查对象

`sdone/src/simulation/formula/feedback.test.ts` — value/capacity 参数调整

### 数学验证

**旧值:** `value=100, capacity=Infinity`
```
max(0, (Infinity - 100) / Infinity) = max(0, NaN) = NaN  ❌
```
IEEE 754: `Infinity / Infinity = NaN`。旧测试在数学上是**错误的**。

**新值:** `value=50, capacity=100`
```
max(0, (100 - 50) / 100) = max(0, 0.5) = 0.5  ✅
```

### 测试用例验证

| 测试 | value | capacity | 公式结果 | 判定 |
|------|-------|----------|----------|------|
| L187-199 | 50 | 100 | 0.5 | ✅ |
| L258-280 | 0 | 100 | 1.0 | ✅ |
| L283-334 (sim tick) | 50 | 100 | multiplier=0.5, effective=2.5 | ✅ |

**语义等价性:** 旧测试本意是验证"stock 未满时 feedback 乘数 > 0"，但 `Infinity/Infinity = NaN` 使其从未真正验证这一点。新测试用有限值正确验证了同一语义。

### 判定: ✅ 通过

测试修正不仅保持了语义，还修复了原有的数学错误。

---

## 附加发现

### A1: `SNAPSHOT_EMITTED` 中 `Number.isFinite(stock.capacity)` guard 仍保留

`main.ts` L792:
```typescript
if (Number.isFinite(stock.capacity) && Number.isFinite(stock.value) && stock.value > stock.capacity)
```

capacity 现在始终有限，`Number.isFinite(stock.capacity)` 检查已冗余。这不是 bug（冗余 guard 无害），但与 `SceneRenderer.ts` C1 变更（移除 `Number.isFinite` guard）不一致。

**建议:** 统一策略 — 要么保留所有 `Number.isFinite` guard 作为防御性编程，要么全部移除。当前混合状态可能造成后续维护困惑。

### A2: `handleModulePlace` stock 路径缺少 `analyticsPanel` 刷新

`onConfirm` 回调中调用了 `refreshCountdownPanels()` 但未调用 `refreshAnalyticsPanel()`。由于新放置的 stock 不会被自动选中，analytics panel 无需刷新，这是正确的。但若未来放置后自动选中新 stock，需补充此调用。

### A3: 🟡 `AnalyticsPanel.test.ts` 缺少 `onCapacitySubmit` / `_lastValidCapacity` / blur 测试

经审查 `AnalyticsPanel.test.ts`，发现新增的交互逻辑**完全没有单元测试覆盖**：

| 未覆盖行为 | 风险 |
|------------|------|
| `onCapacitySubmit` 回调触发 | 🟡 用户提交有效容量值后回调是否正确触发 |
| `_lastValidCapacity` 状态更新 | 🟡 连续提交不同值时状态是否正确演进 |
| 非法输入 Enter → revert | 🟡 输入 "abc" + Enter 是否 revert 到 `_lastValidCapacity` |
| 非法输入 blur → 残留 | 🟡 输入 "abc" + Tab 是否残留非法值（R2-1 的根因） |
| 重复值提交跳过 | 🟡 输入与 `_lastValidCapacity` 相同值时是否跳过回调 |

现有测试仅验证 `setStock` 后 input 显示值正确（capacity 100 → "100"，capacity 500 → "500"），未覆盖用户交互路径。

**建议:** 为 `AnalyticsPanel` 新增至少以下测试用例：
1. 有效输入 + Enter → `onCapacitySubmit` 被调用，参数正确
2. 非法输入 + Enter → input revert，`onCapacitySubmit` 未被调用
3. 重复值 + Enter → `onCapacitySubmit` 未被调用
4. `setStock` 后 `_lastValidCapacity` 正确更新

---

## 审查结论

| 等级 | 数量 | 明细 |
|------|------|------|
| 🔴 阻塞 | 0 | — |
| 🟡 建议修复 | 3 | R2-1 (blur handler), R4-1 (error timeout), A3 (测试覆盖缺口) |
| 🟢 低优先级 | 4 | R1-1, R1-2, R2-2, A1 |

**总体判定: ✅ 通过（附建议）**

核心变更逻辑正确，闭包语义无误，状态机基本一致，DOM 清理路径完整。3 个 🟡 建议修复项均为边缘场景，不阻塞合并，但建议在下一个迭代中处理：

1. **R2-1**: 为 `AnalyticsPanel._capacityEl` 添加 `blur` 事件处理，防止非法值残留
2. **R4-1**: 为 `CapacityInputPopover._onConfirm` 的 error timeout 添加 `clearTimeout` 清理
3. **A3**: 为 `AnalyticsPanel` 新增 `onCapacitySubmit` / `_lastValidCapacity` / blur 交互测试

---

🤖 Generated with [Cline](https://cline.bot)