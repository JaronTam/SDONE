# 存量容量上限：从 PRD 现实参数到 `Infinity` 的错位追踪报告

**日期:** 2026-06-10
**状态:** 待修复
**影响范围:** 类型层 / 状态层 / 模拟引擎层 / UI 层 / 测试层

---

## 1. 执行摘要

SDONE 的存量容量上限（`stock.capacity`）在产品设计中是**现实参数**（用于倒计时、负反馈、溢流检测），但在代码实现中默认值为 `Infinity`（无限大）。这一错位发生在 **Epic 1 Story 1.5（Pure Mutation Functions）**——项目最早的基础设施层。自此之后，所有下游模块（Canvas 渲染、Analytics 面板、Countdown 面板、模拟引擎反馈回路）都围绕 `Infinity` 默认值构建了防御性分支。

**核心矛盾**：PRD 的语义假设（容量是现实有限值）与代码的类型契约（容量可以是 `Infinity` 且为默认值）之间存在结构性偏差。

---

## 2. 逐层追踪

### 2.1 产品层：现实参数设定

| 文档         | 位置 | 内容                                         | 语义                       |
| ------------ | ---- | -------------------------------------------- | -------------------------- |
| **idea.md**  | L26  | "显示到达和超过当前**存量最大值**的倒计时"   | 存在"最大值"——有限         |
| **产品简报** | §7.3 | "存量达到**上限**时触发临界提示动画"         | 上限 = 有限阈值            |
| **产品简报** | §8   | "**存量上限**临界提示 \| P0"                 | P0 优先级——上限是核心功能  |
| **PRD FR29** | L477 | "满则降速"（存量状态反作用于流入速率）       | "满"意味着存在一个有限容量 |
| **PRD FR31** | L479 | `Remaining = (Capacity - Current) / NetRate` | 公式假设 Capacity 是有限值 |

**结论**: 产品层从 idea → 简报 → PRD，一致将**容量作为现实有限参数**设计。

### 2.2 架构/Epic 层：`Infinity` 首次出现

**唯一引入点: Epic 文档 — Story 1.5 AC**

文件: `_bmad-output/planning-artifacts/epics.md`，第 326 行：

```
**And** the `StockNode` has `value: 0`, `capacity: Infinity`, `initialValue: 0`
```

这是在 `Story 1.5: Implement Pure Mutation Functions` 的验收标准中。Story 1.3（类型定义）仅定义了 `capacity: number`（类型系统未排除 Infinity），Story 1.5 是**第一次将 Infinity 指定为默认值**。

**说明**: 架构文档 (`_bmad-output/planning-artifacts/architecture.md`) 和 UX 设计规范 (`ux-design-specification.md`) 均未提及 `capacity: Infinity`——这是一个在 Story 1.5 层级独立做出的细化决策，未回传到上游文档。

### 2.3 代码层：从第一行就固化

文件: `sdone/src/state/mutations.ts:68`

```typescript
capacity: Infinity,
```

该值从项目首次同步（commit `07b1448`, 2026-05-23）就存在，后续仅增加 JSDoc 注释（commit `b5bfdb5`）。代码实现忠实执行了 Story 1.5 的 AC。

### 2.4 下游故事层：`Infinity` 作为既成事实被强化

| 故事              | 文件                       | 如何固化                                                                                        |
| ----------------- | -------------------------- | ----------------------------------------------------------------------------------------------- |
| **Story 5.2 AC3** | epics.md L820              | `Given capacity is Infinity (default for new stocks)` — 将 Infinity 认定为预期默认值            |
| **Story 7.2**     | CountdownPanel.ts L105-108 | `if (Number.isFinite(stock.capacity)) ... else null` — 无限容量不计算倒计时                     |
| **Story 7.1**     | SimulationEngine.ts        | 反馈公式 `max(0, (capacity - value) / capacity)` 在 `capacity=∞` 时退化为恒等于 1（无反馈效果） |
| **Story 7.3 AC4** | SceneRenderer.ts L701-702  | `if (Number.isFinite(node.capacity) && node.capacity > 0)` — 无限容量不绘制填充                 |

**累积效应**: 7 个 Epic 中，Epic 1 的 Story 1.5 决定 → Epic 5 Story 5.2 明确确认 → Epic 6/7 的 Countdown/Analytics/Feedback 全部被动适配。

---

## 3. 受影响的代码点

### 3.1 核心默认值（1 处需改）

| 文件                           | 行  | 当前                 | 应改为                 |
| ------------------------------ | --- | -------------------- | ---------------------- |
| `sdone/src/state/mutations.ts` | 68  | `capacity: Infinity` | 有限默认值（如 `100`） |

### 3.2 UI 防御性分支（5 处可移除或简化）

| 文件                                    | 行      | 当前行为                                                     |
| --------------------------------------- | ------- | ------------------------------------------------------------ |
| `sdone/src/canvas/SceneRenderer.ts`     | 701-702 | `Number.isFinite(node.capacity) && node.capacity > 0` guard  |
| `sdone/src/ui/panels/AnalyticsPanel.ts` | 303-306 | `Number.isFinite` → 显示 "∞" vs 整数                         |
| `sdone/src/ui/panels/CountdownPanel.ts` | 105-108 | `Number.isFinite(stock.capacity)` → `remainingSeconds: null` |
| `sdone/src/ui/panels/CountdownPanel.ts` | 154     | Sort group 3: infinite capacity 分组逻辑                     |
| `sdone/src/ui/panels/CountdownPanel.ts` | 189     | `capacity === Infinity` sort key                             |
| `sdone/src/ui/panels/CountdownPanel.ts` | 355     | `capacity === Infinity` 渲染分支                             |

### 3.3 模拟引擎（1 处需审查）

| 文件                                            | 行  | 当前行为                                                                       |
| ----------------------------------------------- | --- | ------------------------------------------------------------------------------ |
| `sdone/src/simulation/formula/FormulaEngine.ts` | 111 | `capacity: stock.capacity ?? 100` — 已经 fallback 到 100，说明引擎侧预期有限值 |

### 3.4 测试文件（约 25 处 `capacity: Infinity` 需更新）

| 文件                                                        | 估计影响                           |
| ----------------------------------------------------------- | ---------------------------------- |
| `sdone/src/state/mutations.test.ts`                         | 3 处                               |
| `sdone/src/ui/panels/CountdownPanel.test.ts`                | ~8 处（含 Infinity 专项测试）      |
| `sdone/src/ui/panels/AnalyticsPanel.test.ts`                | ~10 处（含 "displays ∞" 专项测试） |
| `sdone/src/simulation/SimulationEngine.test.ts`             | 1 处（makeStock 默认值）           |
| `sdone/src/simulation/SimulationEngine.integration.test.ts` | 1 处（makeStock 默认值）           |
| `sdone/src/simulation/StackValidator.test.ts`               | 1 处（makeStock 默认值）           |
| `sdone/src/simulation/NumericalDrift.test.ts`               | 1 处（makeStock 默认值）           |
| `sdone/src/state/achievement-detection.test.ts`             | 1 处                               |
| `sdone/src/canvas/__tests__/SceneRenderer.test.ts`          | 0 处（已使用有限值测试）           |

---

## 4. 需要额外考虑的问题

### 4.1 默认值应设为什么？

PRD 没有指定具体数值。需要决定：

- **方案 A**: 固定默认值（如 `100`）——简单但可能不适用于所有场景
- **方案 B**: 新建存量时弹出容量设置（增加交互步骤，与零引导哲学冲突）
- **方案 C**: 默认值 `100` + 在 Analytics 面板中允许编辑容量字段（当前仅展示，不可编辑）

### 4.2 存量是否应该保留"无限容量"的能力？

从 PRD 语义来看，倒计时（FR31）、负反馈（FR29）、溢流检测都依赖有限容量。"无限容量"意味着：

- 倒计时永远为 ∞（失去方远的"揭示"时刻）
- 负反馈回路退化（`(capacity-value)/capacity` → 1）
- 溢流从不发生

**建议**: 移除 `Infinity` 作为合法容量值，将 `capacity` 语义改为 `number`（有限正数）。如果未来需要"无上限"语义，通过 UI 的复选框/开关显式表达，而非类型系统隐式允许。

### 4.3 存量初始值是否也存在同样问题？

PRD/prompt 中 `initialValue: 0` 是合理的——存量从零开始是直觉默认。这与容量问题不同，不需要修改。

---

## 5. 修改工作量评估

### 5.1 影响面统计

| 层级               | 文件数                                       | 改动点数               | 风险等级                    |
| ------------------ | -------------------------------------------- | ---------------------- | --------------------------- |
| **类型/状态层**    | 1 (`mutations.ts`)                           | 1 行                   | 🟢 低                       |
| **Canvas 渲染**    | 1 (`SceneRenderer.ts`)                       | 1 guard 移除/简化      | 🟢 低                       |
| **UI 面板**        | 2 (`AnalyticsPanel.ts`, `CountdownPanel.ts`) | ~8 处分支移除/简化     | 🟡 中                       |
| **模拟引擎**       | 1 (`FormulaEngine.ts`)                       | 审查 `?? 100` 是否正确 | 🟢 低                       |
| **单元测试**       | ~6 文件                                      | ~25 处替换             | 🟡 中（需仔细重写测试语义） |
| **故事/Epic 文档** | 2 (`epics.md`, Story 1.5/5.2 AC)             | 若干处文本修正         | 🟢 低                       |

### 5.2 工时估算

| 阶段            | 工作内容                                                                        | 估计时间  |
| --------------- | ------------------------------------------------------------------------------- | --------- |
| **1. 设计拍板** | 确定默认容量值 + UI 是否可编辑                                                  | 0.5h      |
| **2. 核心修改** | `mutations.ts` + `SceneRenderer.ts` + `AnalyticsPanel.ts` + `CountdownPanel.ts` | 1h        |
| **3. 测试更新** | 6 个测试文件 ~25 处，从 `Infinity` 改为有限值 + 重写 Infinity 专项测试语义      | 2h        |
| **4. 文档修正** | `epics.md` Story 1.5 AC + Story 5.2 AC3                                         | 0.5h      |
| **5. 回归验证** | `npx vitest run` + 手动冒烟（倒计时/反馈/填充动画）                             | 0.5h      |
| **合计**        |                                                                                 | **~4.5h** |

**评级**: 中等偏小改动——核心逻辑变更一行，但测试覆盖面广，需仔细核对。

---

## 6. 推荐 BMAD 工作流

修复此问题的合适 BMAD 工作流：

### 首选: `bmad-correct-course`

该工作流专门用于"当实现偏离规范时的路线纠正"。适用理由：

- 问题根源是 Story 1.5 的实现决策反向传播固化
- 需要回链到 PRD FR29/FR31 作为纠正依据
- 工作流会自动处理：偏差分析 → 影响范围评估 → 修正计划 → 执行

### 备选: `bmad-create-story`

如果倾向于将修复作为独立 Story 管理（类似 Story 7.9），用 `bmad-create-story` 创建修复故事，然后在新的 Sprint 中执行 `bmad-dev-story`。

### 不推荐

- `bmad-edit-prd`: PRD 本身是正确的，不需要编辑
- `bmad-investigate`: 偏差已定位，不需要进一步调查

---

## 7. 附录：偏差链图

```
┌─────────────────────────────────────────────────────────────┐
│ 产品层（正确）                                               │
│ idea.md → 产品简报 → PRD                                    │
│ "存量最大值" "存量上限临界提示" "满则降速"                   │
│ capacity = 现实有限参数                                      │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│ Epic 层（错位发生点）★                                       │
│ Story 1.5 (Epic 1) AC: "capacity: Infinity"                 │
│ 2026-05-18 创建 epics.md                                    │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│ 代码层（忠实实现错位）                                       │
│ mutations.ts:68  capacity: Infinity                          │
│ commit 07b1448 (2026-05-23)                                 │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│ 下游故事层（被动适应）                                       │
│ Story 5.2 AC3  "capacity is Infinity (default)"  ← 固化     │
│ Story 7.1     反馈公式退化                                  │
│ Story 7.2     倒计时 Infinity 分支                          │
│ Story 7.3     SceneRenderer Infinity guard                  │
└─────────────────────────────────────────────────────────────┘
```

---

_本报告基于对 `prd.md`、`product-brief.md`、`idea.md`、`epics.md`、`architecture.md`、`ux-design-specification.md`、`mutations.ts`、`SceneRenderer.ts`、`CountdownPanel.ts`、`AnalyticsPanel.ts`、`SimulationEngine.ts`、`FormulaEngine.ts` 及 6 个测试文件的交叉验证生成。_
