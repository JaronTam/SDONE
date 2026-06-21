---
name: story-8-1-code-review-2026-06-12
description: Story 8.1 Schema Extension & Pure Mutations — 三层对抗性代码审查报告
metadata:
  type: project
  sources:
    - sdone/src/state/GraphState.ts
    - sdone/src/state/mutations.ts
    - sdone/src/state/mutations.test.ts
    - sdone/src/state/index.ts
    - sdone/src/canvas/SceneRenderer.ts
    - sdone/src/shared/ShapePaths.ts
---

# Story 8.1 代码审查报告

**审查日期:** 2026-06-12
**审查对象:** Story 8.1 Schema Extension & Pure Mutations
**审查方法:** 三层对抗性审查 (Blind Hunter / Edge Case Hunter / Acceptance Auditor) + Triage 分类
**测试状态:** 66/66 mutations 测试通过

---

## 🔴 审查核心结论

**总体评级: A- 级（实现质量高，1 处 P2 防御性验证缺失）**

Story 8.1 的核心逻辑（`updateModuleLabel` / `updateModuleSize`）实现正确，纯函数契约、版本单调性、no-op 语义均符合架构规范。但 `updateModuleSize` 缺少 `Number.isFinite()` 防御性验证，与同文件 `updateCapacity` 的防御模式不一致，NaN/Infinity 可穿透 `Math.max()` 钳位存入状态。

---

## 📋 发现清单

### 🔴 PATCH-1 (P2): `updateModuleSize` 缺少 NaN/Infinity 防御性验证

**文件:** `sdone/src/state/mutations.ts` L598-599

**问题描述:**

`updateModuleSize` 使用 `Math.max(MIN_MODULE_WIDTH, width)` 进行下限钳位，但 `Math.max()` **不防御 NaN 和 Infinity**：

```typescript
// 当前代码 (L598-599)
const clampedW = Math.max(MIN_MODULE_WIDTH, width);
const clampedH = Math.max(MIN_MODULE_HEIGHT, height);
```

**穿透路径:**

| 输入        | `Math.max(60, x)` 结果 | 存入状态          | 后果                               |
| ----------- | ---------------------- | ----------------- | ---------------------------------- |
| `NaN`       | `NaN`                  | `width: NaN`      | 渲染层 `NaN` 坐标导致模块消失      |
| `Infinity`  | `Infinity`             | `width: Infinity` | 渲染层无限尺寸导致 canvas 溢出/OOM |
| `-Infinity` | `60`                   | 正常钳位          | 无影响                             |

**不一致性:**

同文件 `updateCapacity` (L342) 有显式防御：

```typescript
if (!Number.isFinite(capacity) || capacity <= 0) return unchanged(state);
```

但 `updateModuleSize` 完全缺失此验证。这是 **防御模式不一致**——同一 mutation 层的两个数值验证函数使用了不同的防御策略。

**根因分析:**

`updateCapacity` 是在 Infinity Fix (Story 7.7) 之后添加的，当时已建立了 `Number.isFinite()` 防御范式。`updateModuleSize` 是 Story 8.1 新增的，开发者依赖 `Math.max()` 钳位作为唯一验证手段，未考虑 NaN/Infinity 穿透问题。这是 **范式迁移遗漏**——新代码未遵循已建立的防御范式。

**修复方案:**

在钳位之前添加 `Number.isFinite()` 验证：

```typescript
export function updateModuleSize(
  state: GraphState,
  moduleId: string,
  width: number,
  height: number,
): GraphState {
  const existing = state.nodes[moduleId];
  if (!existing) {
    return unchanged(state);
  }

  // Defensive validation: reject NaN and Infinity (consistent with updateCapacity)
  if (!Number.isFinite(width) || !Number.isFinite(height)) {
    return unchanged(state);
  }

  // Clamp first, then compare with stored values
  const clampedW = Math.max(MIN_MODULE_WIDTH, width);
  const clampedH = Math.max(MIN_MODULE_HEIGHT, height);
  // ... rest unchanged
}
```

**Triage 校验:**

- Gate 1 (Spec 一致性): FR-7 规定 "min 60×40 px"，NaN/Infinity 不是有效像素值。代码 ≠ spec → 继续
- Gate 2 (职责边界): 这是 mutation 自身的验证职责，与 `updateCapacity` 的 `Number.isFinite()` 守卫同层 → 继续
- Gate 3 (可实现性): 单元测试可直接实现 → **确认 PATCH**

---

### 🟡 PATCH-2 (P3): `updateModuleSize` 缺少 NaN/Infinity 测试用例

**文件:** `sdone/src/state/mutations.test.ts`

**问题描述:**

`updateModuleLabel` 和 `updateModuleSize` 的测试套件缺少对 NaN/Infinity 输入的测试。对比 `updateCapacity` 的测试覆盖：

| 测试场景      | `updateCapacity` | `updateModuleSize`      |
| ------------- | ---------------- | ----------------------- |
| NaN 输入      | ✅ 有 (L666-671) | ❌ 缺失                 |
| Infinity 输入 | ✅ 有 (L672-678) | ❌ 缺失                 |
| 负数输入      | ✅ 有 (L659-664) | ✅ 有 (通过 clamp 覆盖) |
| 零值输入      | ✅ 有 (L652-657) | ✅ 有 (通过 clamp 覆盖) |

**修复方案:**

在 `updateModuleSize` describe 块中添加：

```typescript
it("no-op if width is NaN", () => {
  const state = emptyState();
  withStock(state, "st1");
  const result = updateModuleSize(state, "st1", NaN, 100);
  expect(result.version).toBe(state.version);
});

it("no-op if height is Infinity", () => {
  const state = emptyState();
  withStock(state, "st1");
  const result = updateModuleSize(state, "st1", 100, Infinity);
  expect(result.version).toBe(state.version);
});

it("no-op if both dimensions are NaN", () => {
  const state = emptyState();
  withStock(state, "st1");
  const result = updateModuleSize(state, "st1", NaN, NaN);
  expect(result.version).toBe(state.version);
});
```

**Triage 校验:**

- 依赖 PATCH-1 的修复 — 如果不修复 PATCH-1，这些测试会失败（NaN 穿透存入状态而非 no-op）
- **确认 PATCH** (与 PATCH-1 配套)

---

### ✅ DISMISS-1: `DEFAULT_MODULE_WIDTH/HEIGHT` 与 `ShapePaths.ts` 常量无程序化链接

**观察:**

`GraphState.ts` 中 `DEFAULT_MODULE_WIDTH = 120` 和 `ShapePaths.ts` 中 `SHAPE_STOCK_WIDTH = 120` 是相同值但独立定义。仅通过注释 "Matches V1.0 ShapePaths.ts SHAPE_STOCK_WIDTH" 关联。

**Dismiss 理由 (Gate 1):**

- 当前值一致 (120/80)，代码 = spec
- 跨层依赖 (state → shared) 会违反架构分层原则
- SceneRenderer 已直接使用 `SHAPE_STOCK_WIDTH`，不依赖 `DEFAULT_MODULE_WIDTH`
- 注释契约是此架构上下文下的正确做法
- 未来漂移风险通过代码审查流程控制

**分类: DISMISS**

---

### ✅ DISMISS-2: `updateModuleSize` 允许非整数尺寸

**观察:**

`updateModuleSize(state, 'st1', 60.5, 40.3)` 会被接受，存入 `width: 60.5, height: 40.3`。

**Dismiss 理由 (Gate 1):**

- FR-7 仅规定 "min 60×40 px"，未限制整数
- Canvas API 原生支持亚像素渲染
- 非整数尺寸在 resize 交互中是自然结果（拖拽产生浮点坐标）

**分类: DISMISS**

---

### ✅ DISMISS-3: `updateModuleLabel` 截断可能拆分 Unicode 代理对

**观察:**

`'🎉'.repeat(26)` 为 52 个 UTF-16 码元。`slice(0, 50)` 会在码元 50 处截断，可能拆分代理对产生无效字符。

**Dismiss 理由 (Gate 1):**

- FR-3 规定 "最大 50 字符"，JavaScript 的 `String.prototype.slice` 按码元操作是语言默认行为
- 26 个 emoji 超过 50 码元的场景极其罕见
- 修复需要引入 `[...str]` 或 `Array.from` 按码点截断，性能代价不匹配收益

**分类: DISMISS** (可记为未来改进项)

---

### ✅ DISMISS-4: 设置 label 为类型默认名时版本递增

**观察:**

`updateModuleLabel(state, 'st1', 'Stock')` 对 `label: undefined` 的模块会设置 `label: 'Stock'` 并递增版本，尽管视觉上无变化。

**Dismiss 理由 (Gate 1):**

- 这是 B1 审计修正后的显式设计决策：mutation 层不做语义等价判断
- `undefined !== 'Stock'` 是纯值比较，遵循 "值变更 = 版本递增" 原则
- 测试已显式覆盖此行为 (L843-857)

**分类: DISMISS**

---

## 📊 三层审查结果汇总

### Blind Hunter (对抗性 — 寻找 bug/逻辑错误)

| #   | 发现                                          | 严重度 | 分类               |
| --- | --------------------------------------------- | ------ | ------------------ |
| 1   | `updateModuleSize` NaN 穿透 `Math.max()`      | P2     | PATCH              |
| 2   | `updateModuleSize` Infinity 穿透 `Math.max()` | P2     | PATCH (与 #1 合并) |
| 3   | 防御模式与 `updateCapacity` 不一致            | P2     | PATCH (根因)       |

### Edge Case Hunter (穷尽边界分析)

| #   | 边界条件                | 结果                 | 分类    |
| --- | ----------------------- | -------------------- | ------- |
| 4   | `width = NaN`           | NaN 存入状态         | PATCH   |
| 5   | `width = Infinity`      | Infinity 存入状态    | PATCH   |
| 6   | `width = 0`             | 正确钳位到 60        | PASS    |
| 7   | `width = -0`            | 正确钳位到 60        | PASS    |
| 8   | `width = 60.5` (非整数) | 接受                 | DISMISS |
| 9   | `label` 恰好 50 字符    | 无截断               | PASS    |
| 10  | 50 字符全空格           | 正确回退默认         | PASS    |
| 11  | Unicode 代理对截断      | 可能拆分             | DISMISS |
| 12  | 设置 label 为类型默认名 | 版本递增 (by design) | DISMISS |

### Acceptance Auditor (AC 合规性)

| AC      | 描述                             | 状态 | 备注                                                      |
| ------- | -------------------------------- | ---- | --------------------------------------------------------- |
| AC1     | Schema 扩展 (label/width/height) | ✅   |                                                           |
| AC2     | 默认常量导出                     | ✅   |                                                           |
| AC3-6   | `updateModuleLabel` 纯函数       | ✅   | 缺 NaN 防御但 label 是 string 类型，TypeScript 编译期保护 |
| AC7-9   | `updateModuleSize` 纯函数        | 🟡   | 缺 NaN/Infinity 防御 (PATCH-1)                            |
| AC10    | Barrel exports                   | ✅   |                                                           |
| AC11-12 | 测试覆盖                         | 🟡   | 缺 NaN/Infinity 测试 (PATCH-2)                            |

---

## 🔧 修复清单

| #       | 优先级 | 修复项                        | 文件                | 依赖    |
| ------- | ------ | ----------------------------- | ------------------- | ------- |
| PATCH-1 | P2     | 添加 `Number.isFinite()` 验证 | `mutations.ts`      | 无      |
| PATCH-2 | P3     | 添加 NaN/Infinity 测试用例    | `mutations.test.ts` | PATCH-1 |

---

## 📈 质量评分

| 维度       | 分数       | 说明                                                                                          |
| ---------- | ---------- | --------------------------------------------------------------------------------------------- |
| 功能正确性 | 18/20      | 核心逻辑正确，扣 2 分因 NaN/Infinity 穿透                                                     |
| 防御性验证 | 14/20      | `updateModuleLabel` 有隐式 TS 保护，`updateModuleSize` 缺显式验证，与 `updateCapacity` 不一致 |
| 测试覆盖   | 17/20      | 17 个新测试覆盖主要路径，缺 NaN/Infinity 边界                                                 |
| 架构对齐   | 19/20      | 纯函数契约、版本单调性、no-op 模式全部对齐                                                    |
| 代码质量   | 19/20      | 注释精确、命名清晰、JSDoc 完整                                                                |
| **总分**   | **87/100** | **A- 级**                                                                                     |

---

## 📝 关联

- 前序审计: [[story-8-1-audit-2026-06-12]] (A 级 95/100 — 侧重 spec 准确性)
- 防御范式参考: `updateCapacity` (mutations.ts L337-347) — `Number.isFinite()` + 正数验证
- Infinity Fix 根因: [[capacity-infinity-fix-implementation-report-2026-06-10]]
- Triage 校验清单: [[code-review-triage-checklist]]
