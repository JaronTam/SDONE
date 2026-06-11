---
name: story-8-1-deep-audit-2026-06-12
description: Story 8.1 Schema Extension & Pure Mutations — 深度审计报告
metadata:
  type: project
  sources:
    - sdone/src/state/GraphState.ts
    - sdone/src/state/mutations.ts
    - sdone/src/state/mutations.test.ts
    - sdone/src/state/index.ts
    - sdone/src/canvas/SceneRenderer.ts
    - sdone/src/canvas/InputManager.ts
---

# Story 8.1 深度审计报告

**审计日期:** 2026-06-12
**审计对象:** 此前 Story 8.1 代码审查报告 (`docs/code-reviews/story-8-1-code-review-2026-06-12.md`) 及其修复
**审计方法:** 第一性原理校准 + 全代码库交叉验证
**审计约束:** 诚实披露所有问题，严禁递归讨好，如前文无误则明确声明

---

## 🔴 审计核心结论

**此前审查存在 1 处 P1 级严重遗漏和 1 处 P2 级事实错误。**

此前审查在 mutation 层内部逻辑分析上基本正确（PATCH-1/2 修复方向无误），但犯了**孤岛审查**错误——仅审查 mutation 层自身，未交叉验证 schema 扩展的消费者集成状态。这导致：

1. **遗漏了最关键的集成风险**：`node.width`/`node.height` 在整个代码库中是**死写入**——mutation 层写入但零消费者读取
2. **虚构了渲染层影响**：声称 "NaN 坐标导致模块消失"，但渲染层根本不读取 `node.width`/`node.height`

---

## 📋 偏差明细清单

### 🔴 偏差-1 (P1): 遗漏死写入集成风险

**此前审查声明:** 无（完全遗漏）

**事实:**

对整个 `sdone/src/` 目录的交叉搜索证实：

| 搜索模式 | 匹配数 | 位置 |
|---------|--------|------|
| `node.width` / `node.height` | **0** | 无 |
| `\.width` / `\.height` (canvas/DOM 属性) | 60+ | Canvas API, DOM 元素 |

**SceneRenderer 使用硬编码常量，不读取 `node.width`/`node.height`：**

```typescript
// SceneRenderer.ts — drawStock 使用全局常量
const hw = STOCK_WIDTH / 2;   // ← 硬编码常量，非 node.width
const hh = STOCK_HEIGHT / 2;  // ← 硬编码常量，非 node.height

// getModuleBoundingRadius — 使用全局常量
case 'stock':
  return Math.sqrt(STOCK_WIDTH ** 2 + STOCK_HEIGHT ** 2) / 2 + SELECTION_RING_OFFSET;
  // ← STOCK_WIDTH/STOCK_HEIGHT，非 node.width/node.height

// getEdgePoint — 使用全局常量
case 'stock': {
  const hw = STOCK_WIDTH / 2;   // ← 硬编码常量
  const hh = STOCK_HEIGHT / 2;  // ← 硬编码常量
```

**InputManager 同样使用硬编码常量：** 搜索 `InputManager.ts` 中 `width|height` 匹配数为 0。

**结论:** `updateModuleSize` 写入的 `node.width`/`node.height` 是**死写入**——存入状态但从未被任何消费者读取。Story 8.1 的 schema 扩展是**半成品**——只完成了写入端，未完成读取端集成。

**第一性原理溯源:**

审查方法论要求"交叉验证 schema 变更的消费者影响"。此前审查在分析 `updateModuleSize` 时，仅验证了 mutation 层内部的逻辑正确性（纯函数、版本单调性、no-op 语义），但未回答一个更基本的问题：**谁读取这些值？**

这是**孤岛审查**认知偏差——将审查范围限定在变更文件本身，未追踪数据流到消费者。模型在推理时将"mutation 层代码审查"等同于"Story 8.1 审查"，但 Story 8.1 的核心价值主张是"schema 扩展"，schema 扩展的完整性必须包含消费者集成验证。

---

### 🔴 偏差-2 (P2): 虚构渲染层影响

**此前审查声明:**

> NaN/Infinity 可穿透 `Math.max()` 钳位存入状态
> 
> | 输入 | `Math.max(60, x)` 结果 | 存入状态 | 后果 |
> |------|------------------------|---------|------|
> | `NaN` | `NaN` | `width: NaN` | 渲染层 `NaN` 坐标导致模块消失 |
> | `Infinity` | `Infinity` | `width: Infinity` | 渲染层无限尺寸导致 canvas 溢出/OOM |

**事实:**

渲染层（SceneRenderer）**不读取 `node.width`/`node.height`**。它使用硬编码常量 `STOCK_WIDTH`/`STOCK_HEIGHT`。因此：

- `width: NaN` 存入状态 → **当前渲染影响：零**（渲染层不读取此值）
- `width: Infinity` 存入状态 → **当前渲染影响：零**（同上）

此前审查声称的"模块消失"和"canvas 溢出/OOM"是**虚构的影响**——基于一个错误假设：渲染层消费 `node.width`/`node.height`。

**第一性原理溯源:**

模型在推理 PATCH-1 的影响时，执行了**隐式假设注入**——假设 `width`/`height` 字段会被渲染层消费，因为这是"合理的预期"。但代码库的事实是：渲染层使用硬编码常量。

这是**概率预测干扰**——模型基于"width/height 通常被渲染层消费"的统计先验，生成了看似合理但与代码库事实不符的影响分析。模型未执行"验证假设"步骤——搜索渲染层是否实际读取 `node.width`/`node.height`。

**修正:**

PATCH-1 的修复方向仍然正确（mutation 层应防御性验证输入），但严重度应从 P2 降级为 P3：

| 维度 | 此前评估 | 修正评估 | 理由 |
|------|---------|---------|------|
| 当前影响 | P2 (渲染崩溃) | **P3 (死写入污染)** | 无消费者读取 |
| 未来影响 | 未评估 | **P2 (消费者集成时崩溃)** | 当渲染层开始读取时，NaN/Infinity 将导致崩溃 |
| 修复必要性 | 必须 | 仍然推荐 | 防御性编程原则不变 |

---

### 🟡 偏差-3 (P3): 遗漏 `updateModuleSize` 类型守卫缺失

**此前审查声明:** 无（完全遗漏）

**事实:**

```typescript
// updateCapacity — 有类型守卫
export function updateCapacity(state, stockId, capacity) {
  const node = state.nodes[stockId];
  if (!node || node.type !== 'stock') return unchanged(state);  // ← 类型守卫
  // ...
}

// updateModuleSize — 无类型守卫
export function updateModuleSize(state, moduleId, width, height) {
  const existing = state.nodes[moduleId];
  if (!existing) return unchanged(state);  // ← 仅存在性检查，无类型检查
  // ...
}
```

`updateModuleSize` 接受任何模块类型（source/stock/sink），但：

- **Source 的渲染形状是云朵**（5 个重叠圆），由 `CLOUD_RADIUS` 定义——`width`/`height` 没有清晰的语义映射
- **Sink 的渲染形状是漏斗**（2 个重叠圆 + 连接线），由 `SINK_RADIUS` 定义——`width`/`height` 没有清晰的语义映射
- **Stock 的渲染形状是矩形**，由 `STOCK_WIDTH`/`STOCK_HEIGHT` 定义——`width`/`height` 有直接语义映射

当未来渲染层开始消费 `node.width`/`node.height` 时，source/sink 上的 `width`/`height` 将需要复杂的映射逻辑（如何将 width/height 映射到云朵半径？），或者需要添加类型守卫限制只有 stock 可以调整尺寸。

**第一性原理溯源:**

此前审查将 `updateModuleSize` 与 `updateCapacity` 进行了"防御模式一致性"对比（NaN/Infinity 验证），但遗漏了更根本的不一致性——**类型守卫**。模型在对比两个函数时，聚焦于数值验证模式（`Number.isFinite`），忽略了函数签名层面的设计差异（是否有 `type` 守卫）。

这是**锚定偏差**——模型被 NaN/Infinity 问题锚定，导致对比分析范围收窄到数值验证维度，未能扩展到函数设计维度。

---

### ✅ 确认无误的声明

以下此前审查的声明经交叉验证确认无误：

1. **`Math.max()` 不防御 NaN/Infinity** — 事实正确：`Math.max(60, NaN) === NaN`，`Math.max(60, Infinity) === Infinity`
2. **`updateCapacity` 有 `Number.isFinite()` 防御** — 事实正确：L342
3. **PATCH-1 修复方向正确** — mutation 层应防御性验证输入，即使当前无消费者
4. **PATCH-2 测试补充正确** — NaN/Infinity 边界测试是必要的
5. **DISMISS-1~4 分类正确** — 常量无程序化链接、非整数尺寸、Unicode 截断、label 默认名版本递增——均正确 DISMISS
6. **纯函数契约、版本单调性、no-op 语义分析正确** — mutation 层内部逻辑无偏差
7. **测试覆盖分析基本正确** — 69/69 测试通过

---

## 🔧 修正与原点溯源

### 修正-1: 死写入风险应升级为审查首要发现

**原点:** Schema 扩展的完整性 = 写入端 + 读取端。只验证写入端是半成品验证。

**修正方案:**

在审查报告中添加集成风险章节：

> **INTEGRATION-1 (P1): `node.width`/`node.height` 死写入**
> 
> Story 8.1 扩展了 `ModuleNode` schema 添加 `width?`/`height?`，并提供了 `updateModuleSize` mutation 写入这些值。但整个代码库中**零消费者**读取 `node.width`/`node.height`：
> - SceneRenderer 使用硬编码常量 `STOCK_WIDTH`/`STOCK_HEIGHT`
> - InputManager 使用硬编码常量
> - MinimapRenderer 使用硬编码常量
> 
> 这意味着 `updateModuleSize` 当前是**死写入**——值存入状态但无任何效果。
> 
> **风险:** 当未来 story 集成 `node.width`/`node.height` 到渲染层时：
> 1. 需要修改 SceneRenderer 的 `drawStock`/`getModuleBoundingRadius`/`getEdgePoint`/`getHitRadius`/`getVisualEdgeDistance` 等函数
> 2. 需要决定 source/sink 的 width/height 语义（云朵/漏斗形状如何映射？）
> 3. 需要处理 `undefined`（旧状态无此字段）的回退逻辑
> 
> **建议:** 在 Story 8.1 的 story 文件或架构文档中明确标注"渲染集成待后续 story 完成"，避免未来集成时遗漏。

### 修正-2: PATCH-1 严重度降级

**原点:** 缺陷严重度应基于当前实际影响，而非假设的未来影响。

**修正:**

| 项目 | 此前 | 修正 |
|------|------|------|
| PATCH-1 严重度 | P2 | **P3** (当前无消费者) |
| PATCH-1 影响描述 | "渲染层 NaN 坐标导致模块消失" | "死写入污染——当前无渲染影响，未来消费者集成时将导致崩溃" |
| 修复必要性 | 必须 | 推荐（防御性编程） |

### 修正-3: 添加类型守卫缺失发现

**原点:** 函数设计一致性对比应覆盖所有维度，不仅是数值验证。

**修正:**

添加新发现：

> **GUARD-1 (P3): `updateModuleSize` 缺少类型守卫**
> 
> `updateCapacity` 限制只有 stock 节点可以更新容量，但 `updateModuleSize` 接受任何模块类型。Source（云朵形状）和 Sink（漏斗形状）的 width/height 语义不清晰，未来集成时可能需要类型守卫或特殊映射逻辑。
> 
> **建议:** 当前可保持现状（ModuleNode 基类定义了 width/height，所有子类型继承），但在渲染集成 story 中必须解决此设计问题。

---

## 🧠 认知偏差分析

### 偏差-1: 孤岛审查 (Island Review)

**推理节点:** 审查范围界定

**偏差机制:** 模型将"Story 8.1 代码审查"等同于"mutations.ts 代码审查"，将审查范围限定在变更文件本身。未执行数据流追踪——从 schema 变更追踪到消费者。

**概率预测干扰:** 代码审查的统计先验是"审查变更文件"，模型高概率预测审查范围 = 变更文件列表。但 schema 扩展类变更的审查范围应 = 变更文件 + 所有消费者，因为 schema 变更的影响面不仅限于写入端。

**修正策略:** 对 schema 扩展类变更，审查清单必须包含"消费者集成验证"步骤：搜索所有读取新字段的代码路径。

### 偏差-2: 隐式假设注入 (Implicit Assumption Injection)

**推理节点:** PATCH-1 影响分析

**偏差机制:** 模型在分析 NaN/Infinity 的影响时，隐式假设渲染层消费 `node.width`/`node.height`，因为这是"width/height 字段的合理用途"。未验证此假设。

**概率预测干扰:** "width/height 被渲染层消费"在 Web 开发中是高概率事件。模型基于此先验生成了看似合理的影响分析（"模块消失"、"canvas 溢出"），但未执行"搜索渲染层是否读取 node.width"的验证步骤。

**修正策略:** 对影响分析中的每个因果链，必须验证中间假设。特别是当影响描述涉及其他模块时，必须搜索该模块是否实际存在所述依赖关系。

### 偏差-3: 锚定偏差 (Anchoring Bias)

**推理节点:** `updateModuleSize` vs `updateCapacity` 对比分析

**偏差机制:** 模型被 NaN/Infinity 问题锚定，将对比分析范围收窄到数值验证维度，未能扩展到函数设计维度（类型守卫、语义适用性）。

**概率预测干扰:** NaN/Infinity 是 JavaScript 中著名的陷阱，模型高概率识别此问题。一旦识别，模型的注意力资源被此问题占据，降低了对其他维度（类型守卫）的搜索力度。

**修正策略:** 对比分析应使用结构化检查清单，而非自由探索。清单应包含：签名一致性、守卫一致性、语义一致性、消费者一致性等维度。

---

## 📊 修正后评分

| 维度 | 原评分 | 修正评分 | 理由 |
|------|--------|---------|------|
| 功能正确性 | 18/20 | 16/20 | 死写入降低功能价值 |
| 防御性验证 | 14/20 | 14/20 | 不变（PATCH-1 方向正确） |
| 测试覆盖 | 17/20 | 15/20 | 缺少消费者集成测试（虽然当前无消费者可测） |
| 架构对齐 | 19/20 | 15/20 | schema 扩展半成品，读取端未集成 |
| 代码质量 | 19/20 | 19/20 | 不变 |
| **总分** | **87/100** | **79/100** | **B+ 级** |

---

## 📝 修正后修复清单

| # | 优先级 | 修复项 | 文件 | 状态 |
|---|--------|-------|------|------|
| PATCH-1 | P3↓ | 添加 `Number.isFinite()` 验证 | `mutations.ts` | ✅ 已修复 |
| PATCH-2 | P3 | 添加 NaN/Infinity 测试用例 | `mutations.test.ts` | ✅ 已修复 |
| INTEGRATION-1 | P1↑ | 标注死写入风险，明确渲染集成待后续 story | 架构文档/story 文件 | ❌ 待处理 |
| GUARD-1 | P3 | 评估 `updateModuleSize` 类型守卫需求 | `mutations.ts` | ❌ 待评估 |

---

## 📝 关联

- 被审计报告: `docs/code-reviews/story-8-1-code-review-2026-06-12.md`
- 前序审计: `memory/story-8-1-audit-2026-06-12.md`
- 死写入证据: `sdone/src/canvas/SceneRenderer.ts` — 所有渲染函数使用 `STOCK_WIDTH`/`STOCK_HEIGHT` 硬编码常量
- Schema 定义: `sdone/src/state/GraphState.ts` L46-49 — `width?: number; height?: number`