# Story 4.1 代码审查深度审计报告

**审计日期:** 2026-05-30
**审计对象:** bmad-code-review 4.1 的审查发现（Blind Hunter + Edge Case Hunter + Acceptance Auditor + Triage）
**审计方法:** 第一性原理逐项复验，原始代码逐行比对

---

## [审计核心结论]

### 严重偏差等级：**中度偏差 (Moderate Deviation)**

此前审查中，Acceptance Auditor 的结论是**正确的**：这是一个干净的实现，忠实遵循规格，所有 4 个 AC 通过，12 个约束全部满足——零 Critical/Medium 发现。

然而，Blind Hunter 和 Edge Case Hunter 产生了大量**严重度膨胀的发现**（5 个 🔴 Critical、5 个 🟡 Medium），其中：

- **2 项发现直接违背规格中的显式设计决策**（FABRICATED）
- **4 项发现在数学上成立但在项目约束下不可能触发**（IMPOSSIBLE）
- **3 项发现将防御性编程实践错误标记为 Critical 缺陷**（INFLATED）
- **1 项发现包含对 TypeScript 类型系统的事实性错误陈述**（FACTUAL ERROR）

Triage 阶段未能有效过滤这些噪音，将 7 个 🟢 Low 级别的防御性改进作为"patch"写入故事文件，使代码看起来比实际情况显著更差。

---

## [偏差明细清单]

### 类别 A：FABRICATED — 直接违背规格的发现

#### A1. ECH Finding #11: "reset() leaves stock values at current position" — 🟡 Medium

**ECH 原文:**

> After reset(), engine.t is 0 but all stock values remain at their last-ticked values, not their initialValue. This means calling tick() after reset() resumes from arbitrary values with the clock at zero -- an inconsistent model state.

**事实:**
规格明确声明（Dev Notes Anti-pattern #4, 代码第 86-91 行 JSDoc）:

> Does NOT modify GraphState — state reset (restoring initialValue on stocks) is handled by the RESET event handler in Story 4.2.

这不是一个缺陷——这是**架构级别的有意识设计决策**。`SimulationEngine.reset()` 只重置引擎内部时钟。状态重置由 Story 4.2 的 RESET 事件处理器负责，它会调用 mutation 函数恢复 `initialValue`。将职责分离到不同故事中是有意为之。

**偏差性质:** ECH 未读取或选择忽略规格和代码中的设计文档。

---

#### A2. ECH Finding #16: "dt = 0 causes version drift without value change" — 🟢 Low

**ECH 原文:**

> When dt = 0, no stock values change but state.version and this.t still advance. This can cause unnecessary re-renders... it is wasteful. Recommendation: Early-return from tick when dt === 0.

**事实:**
规格 Anti-pattern #2 明确声明（原文大写强调）:

> **[P0] Do NOT skip version increment on no-op ticks.** Even if no stocks exist, state.version++ should still fire — it signals "a tick happened" to any polling renderer.

`dt=0` 被设计为 Story 4.2 的暂停状态，**必须递增 version** 以告知所有消费者"tick 发生了"。

**偏差性质:** ECH 的建议如果被采纳，将引入一个回归缺陷——暂停/恢复循环后渲染器将无法检测状态变化。

---

#### A3. Blind Hunter Finding #9: Test description "no-op" contradiction — 🟢 Low

**BH 原文:**

> Test is titled "tick on empty GraphState is a no-op (version still increments)". A no-op by definition produces no side effects... the description would mislead someone skimming failures.

**事实:**
该测试标题完整内容为：`'tick on empty GraphState is a no-op (version still increments)'`。括号中的限定语精确说明了其含义：对 stocks 而言是 no-op（没有 stocks 需要更新），但 version 仍然递增。这不是矛盾——这是精确的自然语言描述。

**偏差性质:** BH 过度解读测试描述措辞。Non-actionable cosmetic nit.

---

### 类别 B：IMPOSSIBLE — 数学正确但项目约束下不可能触发

#### B1. ECH Finding #7: "this.t loses precision over very long simulations" — 🟡 Medium

**ECH 原文:**

> This happens after roughly 1e12 / 0.0167 ≈ 6e13 ticks (about 110,000 years of simulation at 60 FPS).

**事实:**
ECH 自身计算表明需要 **110,000 年**的连续模拟才会触发。这是一个建模工具——用户不会运行超过几小时的模拟。将此标记为 🟡 Medium 是严重度膨胀。

**正确分类:** Dismiss / 🟢 Low（学术界兴趣，工程上无关）

---

#### B2. ECH Finding #6: "Catastrophic cancellation from very large opposite-sign net flows" — 🟡 Medium

**ECH 原文:**

> If a stock has thousands of inbound connections summing to ~1e308 and thousands of outbound connections also summing to ~1e308, both inflow and outflow round to Infinity individually...

**事实:**
项目规格明确声明 **≤15 模块限制**（Dev Notes Critical Implementation Details #1: "Under ≤15 module ceiling, this is negligible"）。需要"数千个连接"才能触发的场景在项目中不可能存在。

**正确分类:** Dismiss

---

#### B3. ECH Finding #10: "Stock value overflow to Infinity" — 🟡 Medium

**ECH 原文:**

> If stock.value is within ~1e308 of Number.MAX_VALUE, adding a positive net flow can overflow to Infinity.

**事实:**
要使一个 stock value 达到 ~1e308，即使用极端速率 1e10 units/sec，也需要 ~1e298 秒——远超宇宙年龄。

**正确分类:** Dismiss

---

#### B4. ECH Finding #12: "Floating-point underflow with very small dt" — 🟢 Low

**ECH 原文:**

> If dt is very small (e.g., 1e-200) and netFlow is moderate (e.g., 5), the product 5e-200 is below Number.MIN_VALUE...

**事实:**
dt 设计值是 1/60（~0.0167）。1e-200 的 dt 值在实际使用中不可能出现。已在 triage 中 dismiss，正确。

---

### 类别 C：INFLATED — 有效担忧但严重度严重膨胀

#### C1. ECH Finding #1 + Blind Hunter #4: "Unsafe as StockNode cast" — 🔴 Critical (ECH) / 🟡 Medium (BH)

**ECH 原文:**

> This is especially dangerous if GraphState is loaded from JSON (user data or persistence) where no runtime type guarantees exist.

**事实核查 — TypeScript 类型系统:**
`GraphState.nodes` 的类型为 `Record<string, ModuleNode>`，其中 `ModuleNode` 是一个 **interface**，而非 discriminated union type。TypeScript 对 interface 层级结构**不会**基于 discriminant property 进行控制流窄化（control-flow narrowing）。`if (node.type !== 'stock') continue` 会窄化 `node.type` 到 `'stock'`，但**不会**窄化 `node` 到 `StockNode`。因此 `as StockNode` 强制转换是**类型系统必需的**，而非"绕过类型安全"。

**ECH Finding #13 的事实性错误:**

> The `as StockNode` cast should be unnecessary. If state.nodes were typed as a union... TypeScript's narrow-on-discriminant would work automatically.

这**乍看合理但实际错误**。将 `GraphState.nodes` 改为 union type (`Record<string, StockNode | SourceNode | SinkNode>`) 将影响整个 `GraphState.ts` 中所有消费 `state.nodes` 的代码路径——包括 `mutations.ts`、所有 canvas 渲染器、InputManager、main.ts 等数十个文件。这不是一个简单的类型修改，而是一个**架构级重构**。ECH 将其描述为一个小改动是对代码库耦合度的误判。

**运行时安全:**
ECH 关于 JSON 反序列化风险的担忧在理论上成立，但在此项目中不适用：

- 此项目是客户端单页应用，无服务端数据注入
- 所有 state 通过 `makeStock()` 等受控工厂函数创建
- 无持久化/反持久化机制

**正确分类:** 🟢 Low（理论性防御深度问题，非实际缺陷）

---

#### C2. ECH Finding #2 + Blind Hunter #3: "NaN rates poison values" — 🔴 Critical (ECH)

**事实:**
`Connection.rate` 的类型是 `number`。NaN/Infinity 是 IEEE 754 中有效的 `number` 值。引擎正确执行数学运算——`x + NaN = NaN` 是 IEEE 754 规定的正确行为，不是 bug。

真正的问题是：**调用方是否会在 rate 中传入 NaN？**

输入路径：用户在 sidebar rate editor 中输入 → `parseFloat()` → `mutations.updateRate()` → 写入 `Connection.rate`。UI 层没有验证吗？这是 UI 层的责任，不是 Euler 积分引擎的。

添加 `Number.isFinite()` 守卫是合理的防御性编程，但将"内核正确执行数学运算"标记为 🔴 Critical 是对职责边界的误判。

**正确分类:** 🟢 Low / 🟡 Medium（防御深度建议）

---

#### C3. ECH Finding #3: "Negative dt silently reverses time" — 🔴 Critical (ECH)

**事实:**
dt 参数由 Story 4.2 的 setInterval 循环传入。在正常操作中，dt 始终为正值。负 dt 只能通过调用方的编程错误产生——这不是引擎的缺陷。

**正确分类:** 🟢 Low（防御性断言，非 Critical bug）

---

#### C4. ECH Finding #4: "state.version can become NaN" — 🔴 Critical (ECH)

**事实:**
`state.version` 初始化为 0，仅通过 `state.version++`（引擎）或 mutation 函数的 `version + 1` 递增。在正常操作中不可能变成 NaN 或 undefined。

**正确分类:** 🟢 Low（超防御性）

---

#### C5. ECH Finding #5: "Infinity rates cascading failure" — 🔴 Critical (ECH)

**事实:**
与 NaN 问题相同。`Infinity + finite = Infinity` 是 IEEE 754 正确行为。输入验证是调用方的职责。

**正确分类:** 🟢 Low（与 C2 合并）

---

### 类别 D：FACTUAL ERROR — 事实性错误陈述

#### D1. ECH Finding #13: "as StockNode cast is redundant (code smell) and masks type-narrowing failure"

**错误陈述:**

> The `as StockNode` cast should be unnecessary.

**事实:**
如 C1 所述，在 interface-based hierarchy 中，TypeScript 不会基于 discriminant property 窄化对象类型。`as StockNode` 强制转换是**必需的**。ECH 的建议（改为 union type）虽然技术可行，但会引入跨数十个文件的破坏性变更——将其描述为简单修改是误导性的。

**根源:** ECH 混淆了 discriminated union type（`type A = B | C | D`）和 interface extension hierarchy（`interface A { ... } interface B extends A { ... }`）在 TypeScript 类型窄化行为上的根本差异。

---

### 类别 E：TRIAGE FAILURE — Triage 分类错误

此前 triage 将 7 个发现标记为 PATCH（可修复缺陷），但逐项审计后：

| Patch # | 原标题                               | 正确分类 | 理由                               |
| ------- | ------------------------------------ | -------- | ---------------------------------- |
| P1      | Guard NaN/Infinity in computeNetFlow | 🟢 Defer | 防御深度，当前调用方不会传入非法值 |
| P2      | Negative dt guard                    | 🟢 Defer | dt 由受控调用方传入，负值不会出现  |
| P3      | Null state guard                     | 🟢 Defer | state 由受控工厂创建，不会为 null  |
| P4      | Make t readonly/private              | 🟢 Defer | 有效封装改进，但无安全影响         |
| P5      | StockNode runtime value guard        | 🟢 Defer | 超防御性，无实际攻击面             |
| P6      | Consistent drift test pattern        | 🟢 Defer | 纯 cosmetic，无功能影响            |
| P7      | Integer-safe version increment       | 🟢 Defer | version 由受控路径递增，不会损坏   |

**结论:** 7 个"patch"全部应为 Defer 或 Dismiss。零个是实际需要修复的缺陷。

---

## [修正与原点溯源]

### 正确评估

Story 4.1 的 Euler 积分引擎实现是**干净的、正确的、规格完备的**：

1. **4/4 AC 通过**（AC1-AC4），测试覆盖完整
2. **12/12 实施约束满足**（rate 使用、version 递增、in-place mutation、dt 参数、t 追踪、reset 语义、import 隔离等）
3. **5/5 Anti-patterns 全部避免**
4. **零回归**（284 tests pass）

### 第一性原理溯源

**为何之前偏离了逻辑原点？**

1. **"对抗性"框架的语义漂移：** "Adversarial review" 的本意是"从攻击者视角审视代码，寻找可利用的缺陷"。但在执行中，模型将"adversarial"曲解为"假定代码有罪，将一切理论可能性视为现实缺陷"——这是一种范畴错误。

2. **IEEE 754 与"bug"的混淆：** `NaN + x = NaN` 和 `Infinity + x = Infinity` 是 IEEE 754 浮点标准的**规定行为**，不是数学错误。引擎正确执行了浮点运算。将"输入包含 NaN"与"引擎计算错误"混淆，是将**调用方契约违反**错误归因于**被调用方实现**。

   **第一性原理:** 在分层架构中，每层有明确的职责边界。SimulationEngine 的契约是"给定有效的 GraphState 和非负 dt，正确执行 Euler 积分"。它不负责验证输入的语义有效性——那是调用方（Story 4.2 的 setInterval 循环和 input validation layer）的职责。

3. **防御深度 ≠ 缺陷:** 防御性编程实践（输入验证、null guard、类型守卫）是有价值的工程实践，但缺失它们不构成"缺陷"——尤其当攻击面不存在时。将"可以更防御性"等同于"有 bug"是一种逻辑跳跃。

4. **规格即真理：** 代码审查的首要参考是规格文件。当审查者的建议与规格冲突时，规格优先。`reset()` 不修改 state、`dt=0` 时仍递增 version、不跳过 no-op tick 的 version increment——这些都是规格中的显式决策，不是实现错误。

---

## [认知偏差分析]

### 偏差产生的推理节点

**Node 1: 框架效应 (Framing Effect)**
审查指令中的"Be adversarial. Assume nothing works. Every line is guilty until proven innocent."创建了一个**预设结论框架**。在这个框架下，模型不是在寻找"是否存在缺陷"，而是在寻找"哪里可能有问题"——这是两种根本不同的认知模式。

**Node 2: 确认偏误 (Confirmation Bias)**
一旦模型确定了"有问题"的预设，就会主动寻找支持该预设的证据。IEEE 754 的 `NaN` 传播行为在此框架下被重新解释为"poison"和"corruption"，而非"正确的数学语义"。

**Node 3: 严重度校准失效 (Severity Calibration Failure)**
当审查框架提供 🔴 Critical 标签且鼓励 adversarial stance 时，模型倾向于使用更严重的标签。这是**锚定效应**——审查指令中的情绪基调"锚定"了模型对严重度的判断。

**Node 4: 规模感知缺失 (Scale Insensitivity)**
IEEE 754 的精度损失和溢出特性在数学上是真实的，但模型未能评估这些特性在**具体项目约束**（≤15 模块、秒级模拟时长）下的实际触发概率。110,000 年的精度损失和 1e308 的溢出——这些数字本身揭示了它们的非现实性，但模型将其视为等价的"edge case"。

**Node 5: 规格忽视 (Spec Neglect)**
Edge Case Hunter 有项目读取权限但没有被明确要求阅读规格文件。它在"edge case hunting"模式下，优先寻找代码层面的理论边界条件，而非对照规格验证实现。这导致它产生了两项直接违背规格设计决策的发现。

**Node 6: Triage 阶段的锚定效应**
Triage 阶段接收到的输入已经是"严重度膨胀"的发现列表。在分类为 patch/defer/dismiss 时，模型受已有严重度标签的锚定影响，倾向于保留而非降级。

---

## [修正后的完整发现矩阵]

| #   | 来源       | 标题                        | 原严重度    | 修正严重度 | 修正分类                 |
| --- | ---------- | --------------------------- | ----------- | ---------- | ------------------------ |
| 1   | BH+ECH     | NaN/Infinity 速率无防护     | 🔴 Critical | 🟢 Low     | Defer                    |
| 2   | BH+ECH     | 负 dt 无防护                | 🔴 Critical | 🟢 Low     | Defer                    |
| 3   | ECH        | state.version 类型安全      | 🔴 Critical | 🟢 Low     | Defer                    |
| 4   | ECH        | as StockNode 运行时安全     | 🔴 Critical | 🟢 Low     | Defer                    |
| 5   | ECH        | Infinity 速率级联失效       | 🔴 Critical | 🟢 Low     | Defer (合并到 #1)        |
| 6   | ECH        | reset() 未恢复 stock 值     | 🟡 Medium   | —          | **Dismiss** (违背规格)   |
| 7   | ECH        | this.t 长期精度损失         | 🟡 Medium   | —          | **Dismiss** (不可能触发) |
| 8   | ECH        | 灾难性抵消                  | 🟡 Medium   | —          | **Dismiss** (不可能触发) |
| 9   | ECH        | state 空值抛出异常          | 🟡 Medium   | 🟢 Low     | Defer                    |
| 10  | ECH        | Stock 值溢出                | 🟡 Medium   | —          | **Dismiss** (不可能触发) |
| 11  | BH         | computeNetFlow O(S\*C) 文档 | 🟢 Low      | 🟢 Low     | Defer                    |
| 12  | ECH        | as StockNode 强制转换"冗余" | 🟢 Low      | —          | **Dismiss** (事实性错误) |
| 13  | ECH        | t 公开可写                  | 🟢 Low      | 🟢 Low     | Defer                    |
| 14  | ECH        | dt=0 版本漂移               | 🟢 Low      | —          | **Dismiss** (违背规格)   |
| 15  | ECH        | 缺少对抗性测试              | 🟢 Low      | —          | Defer (原分类正确)       |
| 16  | ECH        | 双引擎共享状态              | 🟢 Low      | —          | Dismiss (API 设计)       |
| 17  | ECH        | SimulationConfig 未使用     | 🟢 Low      | —          | Defer (Story 4.2 脚手架) |
| 18  | BH+Auditor | 测试漂移模式不一致          | 🟢 Low      | 🟢 Low     | Defer (cosmetic)         |
| 19  | BH         | Capacity 字段忽略           | 🟡 Medium   | 🟢 Low     | Defer                    |
| 20  | BH         | 浮点下溢                    | 🟢 Low      | —          | Dismiss (不可能触发)     |

**修正后统计:**

- 🔴 Critical: **0**
- 🟡 Medium: **0**
- 🟢 Low (Defer): **10**（均为防御深度/cosmetic/脚手架项）
- Dismiss (FABRICATED/IMPOSSIBLE): **10**

---

## [最终裁定]

**此前 Triage 的 Patch 列表应全部撤销。** Story 4.1 的实现没有需要修复的缺陷。10 个 🟢 Low Defer 项可以在未来 Story 中作为防御性改进纳入，但没有任何一项构成当前的正确性或安全性风险。

**Acceptance Auditor 的原结论完全正确，被 Blind Hunter 和 Edge Case Hunter 的噪音所淹没。**

---

_审计完成。本报告可被独立验证——所有引用代码行号和规格文本均可回溯确认。_
