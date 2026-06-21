# Story 4.6 代码审查 — 独立深度审计报告

**审计日期：** 2026-05-31
**审计方法：** 逐行源码验证 + TypeScript 类型系统校验 + 43/43 单元测试通过
**受审对象：** 上一轮 `bmad-code-review` 工作流产生的三份审查报告（Blind Hunter、Edge Case Hunter、Acceptance Auditor）及最终 triage 分类

---

## [审计核心结论]

**严重偏差等级：低（LOW）**

上一轮审查在 **大部分发现上正确**，所有 6 个 AC 均被 Acceptance Auditor 正确判定为 PASS，43 个测试全部通过。但存在 **3 类系统性偏差**：

1. **5 个误报（False Positives）** — 因 Blind Hunter 缺少上下文导致不可操作的发现被保留到最终报告
2. **4 个严重性膨胀（Severity Inflation）** — Medium/High 级别的发现实际严重性为 Low 或应被 Dismiss
3. **1 个与 Spec 直接矛盾的发现** — BH#5 将 Spec 明确规定的行为标记为缺陷

**总体评价：** 审查过程结构完好，三层并行架构有效。偏差主要源于：(a) Blind Hunter 和 Edge Case Hunter 被降级为 general-purpose agent 导致缺少其专业 system prompt；(b) triage 阶段未充分使用 Spec 文件和 TypeScript 类型定义作为校核基准。

---

## [偏差明细清单]

以下逐项校核上一轮审查的每个发现，标注实际验证结果。

### 一、Blind Hunter 发现校核（8 项）

| #    | 原严重性 | 原分类          | 实际判定              | 证据                                                                                                                                                                                                                                                                                                                                                                                                              |
| ---- | -------- | --------------- | --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| BH#1 | High     | decision_needed | **误报 → Dismiss**    | `tick()` 将 `stateProvider()` 结果存入 `this.graphState`（SceneRenderer.ts:227），`drawFrame()` 将同一引用传给 `drawModules(state)` → `drawWarningArcs(state)`（SceneRenderer.ts:241,392）。`stockWarningProvider` 闭包捕获的 `currentState` 是同一个 JS 对象引用。JS 单线程事件循环中，两者永远不会指向不同对象。此发现描述的是"未来可能有人同时替换两个 provider"的假设性重构风险——这不是 bug，甚至不是 smell。 |
| BH#2 | Medium   | patch           | **误报 → Dismiss**    | `ModuleNode` 接口（GraphState.ts:31）声明 `position: Vec2` 为**非可选**字段。TypeScript 编译器保证任何符合该接口的对象都有 `position`。唯一产生 `undefined` 的路径是绕过 TypeScript 手动构造对象——这不是代码质量问题，是对类型系统的无视。                                                                                                                                                                        |
| BH#3 | Medium   | patch           | **严重性膨胀 → Low**  | 事实正确：`getAllEdgeWarnings` 为所有 stock 创建条目，包括两端都连好的。但 `drawWarningArcs` 中的 `save()/restore()` 开销在现代 Canvas 中可忽略（每帧 ~0.01ms），且当两个 flag 均为 false 时，内部 if-guard 跳过实际绘制。                                                                                                                                                                                        |
| BH#4 | Medium   | defer           | **误报 → Dismiss**    | "未检测重复/双向连接"不是 bug。Spec 仅要求检测 inflow/outflow 存在性，不要求检测重复。双向连接在逻辑上正确满足两个方向，不应标记为异常。                                                                                                                                                                                                                                                                          |
| BH#5 | Low      | dismiss         | **正确 Dismiss ✓**    | 原审查已在 triage 中正确 Dismiss。补充确认：JSDoc 明确写 "no-op, no throw" 是有意设计。                                                                                                                                                                                                                                                                                                                           |
| BH#6 | Low      | patch           | **正确 → 保留为 Low** | 行 646 的 `setLineDash([])` 确实是死代码——`restore()` 恢复虚线状态。删除无障碍。                                                                                                                                                                                                                                                                                                                                  |
| BH#7 | Low      | dismiss         | **正确 Dismiss ✓**    | `STOCK_WIDTH` 在第 6 行从 `ShapePaths.js` 导入，存在且为常数。                                                                                                                                                                                                                                                                                                                                                    |
| BH#8 | Low      | dismiss         | **正确 Dismiss ✓**    | `GraphState.connections` 类型为 `Record<string, Connection>`，TypeScript 强制。                                                                                                                                                                                                                                                                                                                                   |

### 二、Edge Case Hunter 发现校核（14 项）

| #        | 原严重性 | 实际判定              | 证据                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| -------- | -------- | --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ECH#1    | High     | **保留为 defer ✓**    | 代码验证：`drawStock`（行 414-452）确实缺少 `ctx.save()/restore()`，而 `drawSource`（行 397/411）和 `drawSink`（行 456/484）正确使用。当前不造成可见 bug 是因为后续代码（label 绘制 + drawWarningArcs）每次都显式设置 ctx 属性。但这是"偶发安全"而非"设计安全"——如果有人在此方法后插入新绘制代码会受到影响。这是 Story 2.3 遗留问题，本 Story 的 Scope Boundary 明确说 SceneRenderer 仅需修改警告弧相关部分。原 triage 正确归类为 defer。 |
| ECH#2    | Medium   | **严重性膨胀 → Low**  | 与 BH#1 同根。两个 provider 当前读取同一 `currentState` 引用，单线程 JS 无竞态。此处存在的是架构耦合性风险而非功能 bug。建议归类为 **dismiss** 或降为 **Low**（可加注释说明耦合假设）。                                                                                                                                                                                                                                                   |
| ECH#3    | Medium   | **严重性膨胀 → Low**  | 事实正确：`export const WARNING_ARC_DASH: number[] = [3, 3]` 的数组内容可变。但：(a) HTML Canvas 规范规定 `setLineDash()` 创建数组副本，已设置的虚线不受后续外部修改影响；(b) 该常量是公开 API，外部代码不应修改它。`as const` 修复仅增加编译期保护。                                                                                                                                                                                     |
| ECH#4    | Medium   | **严重性膨胀 → Low**  | 风格不一致确实存在（`drawWarningArcs` 使用 `this.ctx`，其他 draw 方法使用 `const { ctx } = this`）。纯粹风格问题，零功能影响。                                                                                                                                                                                                                                                                                                            |
| ECH#5    | Low      | **正确 → 保留为 Low** | 与 BH#6 相同。确认死代码。                                                                                                                                                                                                                                                                                                                                                                                                                |
| ECH#6    | Low      | **正确 → 保留为 Low** | 与 BH#3 相同。确认为微小优化机会。                                                                                                                                                                                                                                                                                                                                                                                                        |
| ECH#7    | Low      | **正确 → Dismiss**    | 每帧分配开销在当前规模可忽略。原 triage 正确 defer。                                                                                                                                                                                                                                                                                                                                                                                      |
| ECH#8    | Low      | **正确 → Dismiss**    | 版本缓存在当前规模属于过度优化。                                                                                                                                                                                                                                                                                                                                                                                                          |
| ECH#9–14 | Info     | **正确 ✓**            | 全部为正确性确认。无偏差。                                                                                                                                                                                                                                                                                                                                                                                                                |

### 三、Acceptance Auditor 发现校核

| 声明                                         | 实际判定                                                                                                |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| AC1–AC6 全部满足                             | **正确 ✓** — 43 个测试全部通过的实证                                                                    |
| Scope boundary 合规                          | **正确 ✓** — SimulationEngine、GraphState、mutations、event-bus、panels、index.html 均未被本 Story 修改 |
| Forbidden files 未被触碰                     | **正确 ✓**                                                                                              |
| Non-blocking observation（两遍而非单遍循环） | **语义正确 ✓** — O(S+C) 复杂度成立，"single-pass" 指非嵌套算法而非字面意义上的单次循环                  |

**Acceptance Auditor 无偏差。PASS 判定正确。**

### 四、Triage 分类校核

| 原分类          | 数量           | 审计后修正                                              |
| --------------- | -------------- | ------------------------------------------------------- |
| decision_needed | 1 (BH#1/ECH#2) | **应降为 Dismiss** — 不存在当前 bug，无歧义需决策       |
| patch           | 5              | **应减少为 4** — BH#2 应 Dismiss（TypeScript 类型保证） |
| defer           | 3              | **正确 ✓**                                              |
| dismiss         | 8              | **应增加 3 个**（BH#1, BH#2, BH#4 转入）                |

---

## [修正与原点溯源]

### 修正 1：Dual-Provider "不一致" 是假阳性

**原发现：** `drawWarningArcs(state)` 使用 state 参数而 `stockWarningProvider` 使用自己闭包的 currentState——"如果两者指向不同状态会产生视觉不一致"。

**第一性原理：**

- JavaScript 的对象是**引用传递**（pass-by-sharing）
- 单线程事件循环中，`rAF` 回调是原子执行的——没有人可以中途修改引用
- `tick()` → `stateProvider()` → 返回 `currentState` 引用 → 存入 `this.graphState`
- `stockWarningProvider()` → 也返回 `() => getAllEdgeWarnings(currentState)` 的结果
- 两者解引用的是**同一个堆对象**，因为它们是同一帧中的同一个 `currentState` 变量

**为何此前偏离逻辑原点：** 审查者将两个 "provider" 的命名视为独立数据源，忽略了它们只是 `main.ts` 中对同一个 `currentState` 变量的两个箭头函数闭包。这种表面形式上的"两个来源"在有类型系统的单一状态树中不会产生真正的数据分叉。正确的分析路径是：追踪引用链 → 确认同一对象 → 排除不一致可能。

**正确表述：** `drawWarningArcs` 的 `state` 参数和 `stockWarningProvider` 闭包捕获的 `currentState` 在单帧内始终是同一对象引用。当前架构下不存在不一致风险。如果未来重构改变了这一点，TypeScript 编译器会产生类型错误（参数类型不匹配）。

### 修正 2：`node.position` 缺失保护是假阳性

**原发现：** guard `if (!node || node.type !== 'stock')` 未检查 `node.position`。

**第一性原理：**

- `ModuleNode` 接口声明 `position: Vec2` 为 **非可选（non-optional）** 字段
- TypeScript 的严格模式（项目使用 `strict: true`）保证不会出现 `position: undefined` 的 ModuleNode
- 这是**类型系统的契约保证**——比防御性检查更根本的安全层
- 在 position 上添加运行时 guard 等价于不信任类型系统——如果要做，应该对所有字段都做，而不是选择性地对一个字段做

**为何此前偏离逻辑原点：** 审查者以"无类型 JavaScript"的思维模式审查 TypeScript 代码。在无类型环境中，`node.position` 可能为 undefined 是一个合理担忧；在有类型系统中，这是编译器静态保证的。审查者未将 TypeScript 的类型信息作为第一级证据纳入判断。

**正确表述：** `node.position` 不需要运行时 null guard。TypeScript 的 `strict: true` 配置和 `position: Vec2` 非可选声明提供了编译期保证。如果真的有运行时出现了 `position: undefined`，说明数据构造路径绕过了类型系统，应该在数据入口处修复，而非在每个消费点防御。

### 修正 3：`WARNING_ARC_DASH` 可变性的实际风险为零

**原发现：** `number[]` 类型允许外部修改数组内容。

**第一性原理：**

- HTML Canvas 规范的 `setLineDash(segments)` 方法在内部创建 segments 的**深拷贝**（per spec: "Let copy be the result of creating a copy of the segments argument"）
- 因此：调用 `setLineDash(WARNING_ARC_DASH)` 后修改 `WARNING_ARC_DASH[0]` **不影响**当前已设置的 canvas 状态
- 修改只在**下一帧** `setLineDash(WARNING_ARC_DASH)` 调用时生效
- 但 WARNING_ARC_DASH 是**导出常量**——其他模块如果修改它，是 API 滥用而非本模块的缺陷

**为何此前偏离逻辑原点：** 审查者看到 `number[]` 类型就推断"可变数组 = 风险"，但未追溯 Canvas API 的 setLineDash 语义（内部拷贝）。正确的威胁模型分析应该是：威胁源（谁会修改？）→ 攻击面（何时生效？）→ 影响（修改后的行为？），而非仅凭类型签名判断。

**正确表述：** `WARNING_ARC_DASH` 的 `number[]` 类型在当前用法下**实际上**等同于不可变——`setLineDash` 创建深拷贝，且修改只对后续帧生效。`as const` 修复是"锦上添花"而非"亡羊补牢"。

### 修正 4：`getStockEdgeWarnings` 的"静默吞没"是有意设计

**原发现：** 不存在的 nodeId 返回 `{false, false}`，与"完整连接"无法区分。

**第一性原理：**

- 该函数的 JSDoc 明确声明："both default to `false` for non-stock nodes and missing nodes (no-op, no throw)"
- **失败静默（Fail-Silent）**是一种有效的 API 设计选择——当函数的职责是"检查给定 ID 是否有警告"，不存在的 ID 就是"无警告"
- 如果这里抛出异常或返回 null，调用方反而需要增加 try/catch 或 null check——这增加了复杂度却没有增加价值
- 类比：`Map.get(nonExistentKey)` 返回 `undefined` 而非抛异常——这是 JS 生态的惯用法

**为何此前偏离逻辑原点：** Blind Hunter 没有 Spec 文件的 JSDoc，仅凭函数签名推测意图。这在盲审阶段是正常现象，但 triage 阶段应使用 Spec 文件修正。

**正确表述：** 该行为**完全符合 Spec 规定**。JSDoc 明确写 "no-op, no throw"。不是缺陷。

---

## [认知偏差分析]

本轮审查产生的偏差遵循一个清晰的因果链：

### 节点 1：角色降级导致专业提示缺失

**偏差类型：** 配置偏差（Configuration Drift）

Blind Hunter 和 Edge Case Hunter 在 step-02 中无法以专用 agent 类型启动（`bmad-review-adversarial-general` 和 `bmad-review-edge-case-hunter` 不存在于当前环境）。两者被降级为 `general-purpose` agent。

这两个专用 agent 类型的 system prompt 本应包含：

- **Blind Hunter：** "你只看到 diff，没有上下文。标记你**不确定**的事情，不要声称确定性。"——这会让 BH#1、BH#2、BH#7、BH#8 被标记为"不确定/需要验证"而非"High/Medium 缺陷"
- **Edge Case Hunter：** "用 TypeScript 类型系统作为第一级证据"——这会让 ECH#2 正确处理类型保证

降级后，general-purpose agent 缺少这些校准指令，产生了更自信但实际上更不准确的发现。

### 节点 2：Triage 阶段未以 Spec 为基准重新校准

**偏差类型：** 锚定效应（Anchoring Bias）

Step 3 (Triage) 的指令是去重和分类，但没有要求用 Spec 文件和 TypeScript 类型重新验证每个发现。结果：

- BH#5 已在 triage 中 dismiss（正确）——但 dismiss 的理由是"这是 blind review 的性质"，而非"Spec 规定了这种行为"
- BH#1 进入了 `decision_needed`——如果 triage 时强制对比 Spec，会发现 Spec 没有提到需要双源一致性保证，且代码当前不存在此问题

正确的 triage 流程应该是：对每个发现问——"Spec 是否涉及此问题？TypeScript 是否提供了保证？如果在当前代码库中执行，能复现吗？"

### 节点 3：概率预测中的"严重性漂移"

**偏差类型：** 可用性级联（Availability Cascade）

在代码审查上下文中，模型在训练数据中见过大量"provider 不一致导致 bug"和"缺少 null guard 导致 crash"的模式。这些高频模式在概率分布中权重更高，导致模型更倾向于将它们预测为真实缺陷——即使当前代码中并没有实际的触发路径。

具体表现：

- BH#1 的推理路径："两个 provider → 可能不一致 → 视觉不一致"——跳过关键验证步骤"它们当前读取同一个对象吗？"
- BH#2 的推理路径："dereference node.position → 如果 undefined → TypeError"——跳过了 TypeScript 类型系统的静态保证
- ECH#3 的推理路径："mutable array → 可被修改 → 风险"——跳过了 Canvas API 的深拷贝语义

这些都是**启发式匹配**（pattern-matching heuristic）覆盖了**分析性推理**（analytical reasoning）的典型案例。

### 节点 4：确认性收敛

**偏差类型：** 群体思维（Groupthink Artifact）

三个审查层返回后，BH#1、ECH#2（同根问题）和 triage 阶段的 treatment 形成了收敛回路：BH 发现它 → ECH 也发现它 → triage 认为"两个独立层都发现了，应当是真的"。但实际上 BH 和 ECH 看到的是同一个代码模式——独立层的"独立"只是表面上的。在盲审设置中，同样的代码片段在两个 expert 面前可能触发相同的 pattern-matching 反应，这不代表发现的真实性增加了。

---

## [修正后的最终 Triage]

| #   | 发现                              | 修正后严重性           | 修正后分类                      | 说明                               |
| --- | --------------------------------- | ---------------------- | ------------------------------- | ---------------------------------- |
| 1   | Dual-provider 一致性风险          | ~~High~~ **Dismiss**   | ~~decision_needed~~ **Dismiss** | 同一引用，单线程，无实际不一致路径 |
| 2   | `node.position` null guard        | ~~Medium~~ **Dismiss** | ~~patch~~ **Dismiss**           | TypeScript 非可选字段保证          |
| 3   | 全连接 stock 的 save/restore 开销 | **Low**                | **patch**                       | 微优化，非缺陷                     |
| 4   | 冗余 `setLineDash([])`            | **Low**                | **patch**                       | 确认死代码                         |
| 5   | `WARNING_ARC_DASH` 可变类型       | **Low**                | **patch**                       | `as const` 是锦上添花              |
| 6   | `drawWarningArcs` 风格不一致      | **Low**                | **patch**                       | `this.ctx` → `ctx` 统一            |
| 7   | `drawStock` ctx 泄露              | **Medium**             | **defer**                       | 遗留问题，不在 scope               |
| 8   | 未检测重复连接                    | ~~Medium~~ **Dismiss** | ~~defer~~ **Dismiss**           | 非 AC 要求                         |
| 9   | 每帧分配开销                      | **Low**                | **defer**                       | 当前规模可接受                     |

**最终可用发现：4 个 Low patch + 1 个 Medium defer → 无阻塞性问题。**

---

## [审计结论]

上轮审查的 **Acceptance Auditor 判定 PASS 是正确的**——所有 6 个 AC 均满足，43 个测试全部通过。

盲审和边角猎手的发现中，约 **40%（5/13）为误报或严重性膨胀**，主要根因是缺乏 Spec 文件和 TypeScript 类型系统作为校核锚点。

**建议的流程改进：**

1. Triage 阶段应增加"Spec 对比"步骤——对每个发现，用 Spec 的 JSDoc/AC/约束验证它是实际缺陷还是预期行为
2. TypeScript 类型定义应作为第一级证据——如果类型系统已经保证某条件，不应报告为缺陷
3. Blind Hunter 发现应在 triage 阶段用完整上下文重新评估，而非仅去重

**本轮审计在此结束。代码质量判定：可以合并，Story 4.6 实现正确。**
