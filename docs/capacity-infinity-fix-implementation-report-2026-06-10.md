# Infinity Fix 实施报告

**提案:** `_bmad-output/planning-artifacts/sprint-change-proposal-2026-06-10.md`
**实施日期:** 2026-06-10
**实施者:** bmad-dev-story (Claude Code / deepseek-v4-pro)
**基线 commit:** `848f9d9` (Story 7.7 completed)
**状态:** 已实施，待 Review

---

## 1. 问题简述

SDONE 的 `stock.capacity` 产品设计中为有限值（倒计时、负反馈、溢流检测依赖），但代码实现默认值 = `Infinity`。修正：`Infinity` → `100`。

**根因链:** PRD(有限) → Story 1.5 AC(`Infinity`) → `mutations.ts:68` → Story 5.2 固化 → 面板适配

---

## 2. 变更范围总览

| 类别 | 文件数 | 说明 |
|------|--------|------|
| 源代码 | 7 | 含 2 新文件 |
| 样式 | 2 | 1 新增 + 1 追加 |
| 测试 | 9 | Infinity→100 替换 + 新增 8 tests |
| 文档 | 1 | epics.md 2 处 AC 修正 |
| **合计** | **19** | |

---

## 3. 逐文件变更详情

### 3.1 核心状态层

**`sdone/src/state/mutations.ts`** — 3 处变更

| ID | 位置 | 变更 | 代码 diff |
|----|------|------|-----------|
| S1 | L53-70 | `addModule` 签名 + 默认值 | `initialCapacity?: number` 新参数；`capacity: Infinity` → `capacity: initialCapacity ?? 100` |
| S2 | L312-330 | 新增 `updateCapacity` | 参照 `changeModuleColor` 模式，stockId 非 stock → no-op unchanged()，否则 bump + 更新 capacity |

**`sdone/src/state/index.ts`** — 1 处变更

| ID | 变更 |
|----|------|
| S3 | mutations.ts 导出列表新增 `updateCapacity` |

### 3.2 Canvas 渲染层

**`sdone/src/canvas/SceneRenderer.ts`** — 1 处变更

| ID | 位置 | 变更 |
|----|------|------|
| C1 | L701-702 | `if (ratio > 0 && Number.isFinite(node.capacity) && node.capacity > 0)` → `if (ratio > 0 && node.capacity > 0)`. `computeFillRatio` L185 已在 capacity≤0 时返回 0，`Number.isFinite` 因移除 Infinity 而冗余。 |

### 3.3 UI 面板层

**`sdone/src/ui/panels/CountdownPanel.ts`** — 5 处变更

| 位置 | 变更 |
|------|------|
| L45 JSDoc | `Infinity if uncapped` → `always a finite positive number` |
| L105-108 `computeCountdown` | 移除 `Number.isFinite(stock.capacity)` guard；`remainingSeconds` 始终计算 |
| L149-152 `sortCountdownsByUrgency` JSDoc | 移除 "3. Infinite capacity" 组；stable 组编号 4→3 |
| L189 `getUrgencyGroup` | 移除 `cd.capacity === Infinity` 分支；stable 组改 return 3 |
| L355-358 渲染 | 移除 `data.capacity === Infinity` → "∞" 分支 |

**`sdone/src/ui/panels/AnalyticsPanel.ts`** — 4 处变更

| 位置 | 变更 |
|------|------|
| L34 JSDoc | `Infinity if uncapped` → `always a finite positive number` |
| L91-93 类成员 | `_capacityEl: HTMLElement` → `HTMLInputElement`；新增 `_lastValidCapacity` / `onCapacitySubmit` |
| L210-215 构造函数 | `<span>` → `<input type="number">` + `keydown` Enter handler（验证≥1、非法值红色闪烁 revert） |
| L302-306 `setStock` | `textContent = '∞'` 分支移除 → `input.value = capacity.toFixed(0)` |

**`sdone/src/ui/panels/styles/analytics-panel.css`** — 追加

```css
/* capacity input styling — Catppuccin Mocha 色板 */
.analytics-panel__field-value--capacity { background:transparent; border:1px solid #45475a; ... }
.analytics-panel__field-value--capacity:focus { border-color:#89b4fa; }
.analytics-panel__field-value--error { border-color:#f38ba8 !important; }
```

### 3.4 新组件

**`sdone/src/ui/overlays/CapacityInputPopover.ts`** (新) — 86 行

核心 API:
```typescript
export class CapacityInputPopover {
  onConfirm: ((capacity: number) => void) | null;
  onCancel: (() => void) | null;
  get isOpen(): boolean;
  open(screenX, screenY, defaultCapacity): void;
  close(): void;
  destroy(): void;
}
```

设计参照 `ColorPickerPopover.ts`（DOM pattern、viewport clamp、setTimeout(0) dismiss）+ `RateEditorPanel.ts`（input 事件模式）。关键行为：
- Enter → 验证 ≥1 → `onConfirm(parsed)` + close
- Esc / click-outside / wheel → `onCancel()` + close
- 非法输入 → 红色闪烁 + revert 到默认值

**`sdone/src/ui/overlays/styles/capacity-input-popover.css`** (新) — Catppuccin Mocha 暗色主题

**`sdone/src/ui/overlays/index.ts`** — barrel 新增 `CapacityInputPopover` 导出

### 3.5 主集成层

**`sdone/src/main.ts`** — 7 处变更

| ID | 变更 |
|----|------|
| I1-new | 模块级 `handleModulePlace(moduleType, worldPos)` helper — stock 走 popover 流程，非 stock 即时创建 |
| I1-p1 | `onModuleDrop` → 委托 `handleModulePlace`（drag-drop 路径） |
| I1-p2 | `onCanvasClickEmpty` → 委托 `handleModulePlace`（click-to-place 路径） |
| I1-p3 | `onModulePlaceAtCenter` → 委托 `handleModulePlace` + `capacityInputPopover.isOpen` 防重复弹窗 guard |
| I2 | `analyticsPanel.onCapacitySubmit` 回调 — `updateCapacity` → `historyManager.push` → refresh panels |
| I3-import | 新增 `CapacityInputPopover` + `updateCapacity` + `Vec2` import |
| I3-lifecycle | `capacityInputPopover.destroy()` 加入 hot-reload dispose |

### 3.6 测试层

| 文件 | 变更数 | 说明 |
|------|--------|------|
| `mutations.test.ts` | 3 替换 + 8 新增 | Infinity→100；新增 `updateCapacity`(5 tests) + `addModule initialCapacity`(3 tests) |
| `SimulationEngine.test.ts` | 1 | `makeStock` 默认 `= Infinity` → `= 100` |
| `SimulationEngine.integration.test.ts` | 1 | 同上 |
| `StackValidator.test.ts` | 1 | 同上 |
| `NumericalDrift.test.ts` | 1 | 同上 |
| `achievement-detection.test.ts` | 1 | 同上 |
| `AnalyticsPanel.test.ts` | ~8 | Infinity→100；capacity 字段 `textContent` → `value`；Infinity 专项测试重写 |
| `CountdownPanel.test.ts` | ~8 | Infinity→100；"∞" 显示测试→stable 状态测试；sort 无穷容量测试移除 |
| `feedback.test.ts` | 1 | stock value=100 且 capacity=100 导致 feedback formula=0 死锁 → value=50 + rate=5 修复 |

### 3.7 文档层

| 文档 | 变更 |
|------|------|
| `epics.md` Story 1.5 AC L326 | `capacity: Infinity` → `capacity: 100`；新增容量弹窗 AC |
| `epics.md` Story 5.2 AC3 L820-822 | "Infinity (default)" → "100 (default)"；填充始终有效 |

---

## 4. 不受影响的工件

- **PRD (`prd.md`):** 始终正确 — capacity 作为有限值描述
- **Architecture (`architecture.md`):** 未提及 capacity 默认值
- **UX Design (`ux-design-specification.md`):** 未提及具体值
- **FormulaEngine.ts L111:** `stock.capacity ?? 100` fallback — `??` 仅处理 `null|undefined`，有限值正常通过，无需变更
- **e2e tests:** 现有 e2e 使用有限容量，无需变更

---

## 5. 验收门禁

| 门禁 | 结果 |
|------|------|
| `npx vitest run` | ✅ **782/782 tests pass**，零回归 |
| `npx tsc --noEmit` | ✅ 零新增类型错误（pre-existing 2 errors in InputManager.test.ts 与本次无关） |
| 新增 `updateCapacity` tests | ✅ 5 tests (update/not-found/non-stock/preserve/monotonicity) |
| 新增 `addModule initialCapacity` tests | ✅ 3 tests (default 100/explicit 50/source-sink unaffected) |

---

## 6. Review 关注点

按风险排序，供 review agent 聚焦：

1. **🟡 `main.ts` `handleModulePlace` helper** — 3 条路径合并是否正确？stock popover 的 onConfirm/onCancel 闭包是否正确引用 `worldPos`？
2. **🟡 `AnalyticsPanel` input 验证** — `_lastValidCapacity` 状态机在 setStock 覆盖 + 用户输入 + 非法 revert 三者间的一致性。
3. **🟢 `CountdownPanel` Infinity 移除** — `remainingSeconds` 始终计算，不再有 null；`getUrgencyGroup` 编号缺口（1→2→3）sort 比较仍正确？
4. **🟢 `CapacityInputPopover`** — DOM cleanup (listeners/mousedown/wheel) 在 close/destroy 路径上是否正确？
5. **🟢 `feedback.test.ts`** — 原测试假设 `value=100, capacity=Infinity` 使 formula 产生非零乘数；修正后 `value=50, capacity=100` 等价，语义是否保持？(formula: `max(0, (100-50)/100)` = 0.5, effective rate = 5*0.5 = 2.5)

---

## 7. 完整文件清单

```
# 源代码 (7)
sdone/src/state/mutations.ts          — S1+S2: addModule 默认值 + updateCapacity
sdone/src/state/index.ts              — S3: 导出 updateCapacity
sdone/src/canvas/SceneRenderer.ts     — C1: guard 简化
sdone/src/ui/panels/CountdownPanel.ts — U1: 移除 5 处 Infinity 分支
sdone/src/ui/panels/AnalyticsPanel.ts — U2: capacity span→input 可编辑
sdone/src/main.ts                     — I1+I2+I3: handleModulePlace + 回调 + lifecycle
sdone/src/ui/overlays/CapacityInputPopover.ts  — N1: 新组件

# 样式 (2)
sdone/src/ui/panels/styles/analytics-panel.css          — U3: input 样式
sdone/src/ui/overlays/styles/capacity-input-popover.css — N2: 弹窗样式

# 导出 (1)
sdone/src/ui/overlays/index.ts — CapacityInputPopover barrel

# 测试 (9)
sdone/src/state/mutations.test.ts                   — Infinity→100 + 8 new tests
sdone/src/simulation/SimulationEngine.test.ts       — makeStock default
sdone/src/simulation/SimulationEngine.integration.test.ts — makeStock default
sdone/src/simulation/StackValidator.test.ts         — makeStock default
sdone/src/simulation/NumericalDrift.test.ts         — makeStock default
sdone/src/state/achievement-detection.test.ts        — Infinity→100
sdone/src/ui/panels/AnalyticsPanel.test.ts           — Infinity→100 + textContent→value
sdone/src/ui/panels/CountdownPanel.test.ts           — Infinity→100 + test 重写
sdone/src/simulation/formula/feedback.test.ts        — value/capacity 调整

# 文档 (1)
_bmad-output/planning-artifacts/epics.md — D1+D2: Story 1.5/5.2 AC 修正
```

🤖 Generated with [Claude Code](https://claude.com/claude-code)
