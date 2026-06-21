# Confession Report — Story 3.4 Code Review (2026-05-27)

**审计对象：** 三层对抗审查（Blind Hunter / Edge Case Hunter / Acceptance Auditor）+ 分诊决策
**审计约束：** 严格真实性校验，禁止递归讨好，禁止"为了认错而认错"

---

## [审计核心结论]

**严重偏差等级：高。** 审查层的事实发现基本准确，但分诊阶段存在三处结构性失误：

1. **遗漏了最关键的定性判断：Story 3.4 在代码层面实质未实现。** 三个审查层各自独立发现了 `onModuleDelete` 缺少 `historyManager.push`、`selectedModuleIds` 清除和 `MODULE_DELETED` 事件发射。但分诊将这些归类为"patch"（补丁级修复），严重低估了问题的本质——`onModuleDelete` 处理器与 Story 2.3 原始版本完全一致，没有任何一行代码被修改过。这不是"遗漏了几个补丁"，而是"整个故事的代码改动为零"。

2. **HistoryManager 堆栈语义问题被降级为"decision-needed"，这是正确的分类，但选项设计中存在误导。** 选项 A（推入 POST-mutation 状态）是唯一与 HistoryManager 契约一致的正确方案，选项 B 和 C 本质上是"重构 HistoryManager"或"接受缺陷"，两者都不是合理的工程选择。将它们并列呈现暗示三者等价，模糊了事实的唯一性。

3. **遗漏了一个合法的 P1 发现：窗口失焦导致拖拽半途终止时，模块停在部分位置且不可撤销。** 该发现由 Edge Case Hunter 提出，但在分诊中被完全遗漏。

---

## [偏差明细清单]

### 偏差 1：将"实质未实现"定性为"缺少补丁"

**原文（分诊输出）：**

> - [ ] [Review][Patch] onModuleDelete 未推入历史快照 [main.ts:124-129]
> - [ ] [Review][Patch] 删除后 selectedModuleIds 未清除 [main.ts:124-129]
> - [ ] [Review][Patch] MODULE_DELETED 事件已定义但从未发射

**事实：** `onModuleDelete` 处理器（main.ts:124-129）与 Story 2.3 的原始版本逐字符一致。diff 中该段代码没有 +/− 行。Story 3.4 规格文件声明的三项实现改动（`historyManager.push`、`selectedModuleIds: []`、`eventBus.emit('MODULE_DELETED')`）均不存在于任何源文件中。规格文件将 AC1–AC5 全部标记为 ✅ 已实现，这与代码现实矛盾。

**偏差本质：** 将三个独立 patch 发现视为独立缺陷，而没有识别出它们的公共根因——Story 3.4 的代码改动量为零。这导致严重性评估失真：看起来是"漏了三行代码"，实际是"整个故事没有代码落地"。

**第一性原理：** 代码审查的基本职责是验证"代码是否实现了规格声明"。当规格声称 AC3（历史快照）、AC4（撤销恢复）已实现而代码中完全缺失时，审查的核心定性应该是"AC 验证失败"，而非"缺少几个补丁"。

### 偏差 2：HistoryManager 选项设计中将唯一正确方案与劣等方案并列

**原文（分诊输出）：**

> 1. 推入 POST-mutation 状态 + 启动时推入初始状态
> 2. 修改 HistoryManager 支持 PRE-mutation 语义
> 3. 保持现状，接受限制

**事实验证：**

HistoryManager 的契约（HistoryManager.ts:38-43）明确声明：

> `undoStack`: newest entry at the END of the array (`push` → append).
> `undo()` 需要 `undoStack.length >= 2`：一个"当前"状态和一个"前一个"状态。
> `undo()` 弹出栈顶（"当前"），返回新栈顶（"前一个"）。

此契约的**唯一**正确使用方式是：栈中存放的是状态的完整时间线，栈顶始终是"当前状态"。推入 PRE-mutation 状态违反了这个不变量，因为"当前状态"（mutation 后的状态）永远不在栈中。

选项 B（修改 HistoryManager 语义）需要重写 `undo()`、`redo()`、`canUndo()` 及其全部 24 个测试用例，以支持一种与现有设计截然不同的语义。这不是一个等价选择，而是一次架构重写。

选项 C（接受限制）意味着撤销系统永远少跳一步且首次操作不可撤销——这在用户交互层面是客观缺陷，不是"可接受的权衡"。

**第一性原理：** 当一个系统的设计契约与使用方式矛盾时，正确的工程判断是修正使用方式以符合契约（选项 A），而非重写契约以迁就错误用法（选项 B），更非忽视矛盾（选项 C）。将三者并列，是"平衡谬误"——给不等价选项赋予等价权重。

### 偏差 3：遗漏 Edge Case Hunter 的窗口失焦 P1 发现

**原文（Edge Case Hunter 输出）：**

> P1: Interrupted drag (Alt+Tab / window blur) leaves module at partial position with no undo path

**事实验证：** InputManager.ts:235-245 的 `handleWindowBlur()` 重置 `isDraggingModule = false` 但不触发 `onModuleDragEnd`。模块停在最后拖拽位置（因为 `onModuleMove` 已多次更新 `currentState`），但 `pendingDragState` 从未被推入历史堆栈。用户无法撤销这个部分拖拽。这是一个合法的 P1 缺陷。

**分诊输出中该发现的去向：** 完全遗漏。既未归入 patch，也未归入 defer，也未显式 dismiss。

**第一性原理：** 分诊流程要求对每个发现进行分类。遗漏一个 P1 发现不是"选错了类别"，而是"审查链路断裂"——从输入到输出丢失了一条记录。

### 偏差 4：未验证 Spec 的 AC 标记与代码的一致性

**事实：** Story 3.4 规格文件将 AC1–AC5 全部标记为 ✅，但：

- AC3（删除前推入历史快照）→ 代码中无 `historyManager.push()`
- AC4（Ctrl+Z 恢复已删除模块及其连接）→ 代码中未实现
- 规格文件的"实现细节"代码块展示了完整实现（含 push、selectedModuleIds 清除、eventBus.emit），但实际代码中这些行不存在

审查未能识别出"Spec 自称完成但代码未实现"这一根本性矛盾。

**第一性原理：** 验收标准的 ✅ 标记是规格文件对代码状态的断言，不是既定事实。审查应将 AC 标记视为待验证的假设，而非可信输入。

### 偏差 5：对 Blind Hunter 的 P1（cancelDrag 副作用）未做显式裁定

**原文（Blind Hunter 输出）：**

> P1: `cancelDrag()` side-effects may corrupt history stack on Ctrl+Z. If `cancelDrag()` triggers the `onModuleDragEnd` callback...

**事实：** InputManager.ts:503-509 的 `cancelDrag()` 方法仅重置内部状态，**不触发** `onModuleDragEnd`。注释明确写道："Cancel an active module drag **without** firing `onModuleDragEnd`"。因此 Blind Hunter 的假设前提为假，该发现应显式 dismiss。

但分诊中未提及此发现，既未 dismiss 也未归类。这造成一个隐性问题：如果读者仅看分诊输出，无法判断该发现是被有意驳回还是被无意遗漏。

---

## [修正与原点溯源]

### 修正 1：Story 3.4 的正确定性

**修正表述：** Story 3.4 在代码层面实质未实现。`onModuleDelete` 处理器仍为 Story 2.3 的原始版本。diff 中 EventMap.ts 新增了 `MODULE_DELETED` 事件类型声明，但该事件从未被任何代码发射。规格文件声称 AC1–AC5 全部 ✅ 已实现，但 AC3（历史快照）和 AC4（撤销恢复）在代码中完全缺失。AC1（删除模块）和 AC2（级联删除连接）依赖 `deleteModule()` mutations 函数的已有行为，不属于 Story 3.4 的新增代码。仅 AC5（无选中时静默返回）由已有的 `if (!selected) return` 守卫满足。

**逻辑底层：** 验收审查的第一性原理是"验证声明与事实的一致性"。当规格声明的实现细节代码块与实际代码逐行对比后不一致，正确的定性是"实现缺失"，而非"缺少补丁"。

### 修正 2：HistoryManager 问题的正确解决方案

**修正表述：** 唯一正确方案是选项 A——推入 POST-mutation 状态 + 启动时推入初始状态。具体而言：

1. 启动时：`historyManager.push(currentState)` — 将初始空状态作为栈底
2. 每次 mutation 后：`currentState = mutate(currentState); historyManager.push(currentState)` — 推入新状态
3. 拖拽场景：`onModuleDragEnd` 中推入拖拽后的 `currentState`（而非 `pendingDragState`）

此时 undo 栈的语义与 HistoryManager 契约完全一致：栈顶始终是"当前状态"，undo 弹出当前、返回前一个。

`pendingDragState` 变量可以被移除——它存在的唯一理由是延迟 push 以避免清空 redo 栈，但在 POST-mutation 模式下不需要延迟。

**逻辑底层：** HistoryManager 的 `undo()` 实现遵循 Memento 模式的标准语义——栈顶是当前状态。任何使用方必须维护此不变量。选项 B（重写 HistoryManager）和选项 C（接受缺陷）都违反了"最小惊讶原则"——用户期望 Ctrl+Z 回退一步，而非两步。

### 修正 3：窗口失焦发现应归入 defer

**修正表述：** Edge Case Hunter 的窗口失焦 P1 发现是合法的，应归类为 `[Review][Defer]`，理由是 `handleWindowBlur()` 是 Story 2.3 引入的预存代码，不属于 Story 3.4 的 diff 范围。但其影响波及 Story 3.4 的 AC4（撤销），应在 deferred-work.md 中记录。

**逻辑底层：** 分诊流程要求"每个发现必须有明确去向"。遗漏 = 审查链路不完整。

### 修正 4：Spec AC 标记的验证

**修正表述：** Story 3.4 规格文件的 AC 状态应修正为：

| AC  | 描述                            | 实际状态                    |
| --- | ------------------------------- | --------------------------- |
| AC1 | 点击模块 → 按 Delete → 模块删除 | ✅（依赖已有 deleteModule） |
| AC2 | 级联删除连接                    | ✅（依赖已有 deleteModule） |
| AC3 | 删除前推入历史快照              | ❌ 代码中缺失               |
| AC4 | Ctrl+Z 恢复模块及连接           | ❌ 因 AC3 缺失而无法满足    |
| AC5 | 无选中时静默返回                | ✅（已有守卫）              |

**逻辑底层：** AC 标记是对代码行为的断言。审查的职责是独立验证这些断言，而非采纳它们。

### 修正 5：cancelDrag 发现的显式裁定

**修正表述：** Blind Hunter 的 P1 关于 `cancelDrag()` 副作用应标记为 `[Dismiss]`，理由是 `cancelDrag()` 的实现（InputManager.ts:496-509）明确注释"without firing onModuleDragEnd"，且代码仅重置内部字段，不触发任何回调。Blind Hunter 的前提假设（"cancelDrag 触发 onModuleDragEnd"）为假。

**逻辑底层：** 驳回一个发现时，应记录驳回理由，而非静默忽略。这是审查可追溯性的基本要求。

---

## [认知偏差分析]

### 偏差节点 1：框架效应——"补丁"框架替代了"实现验证"框架

**发生位置：** 分诊阶段，将三个独立 patch 发现归类时。

**机制：** 三个审查层各自独立报告了 onModuleDelete 缺少 push、缺少 selectedModuleIds 清除、缺少事件发射。分诊时，我逐条处理每个发现，将它们各自归类为"patch"。这是一个**自下而上**的处理方式——每个发现独立评估。

但如果采用**自上而下**的视角——"onModuleDelete 处理器有任何改动吗？"——答案立即显示为零。这个零改动事实应该主导定性，但它没有出现在任何单一发现的标题中，因此被框架效应遮蔽了。

**概率预测干扰：** 模型在处理多个低层发现时，倾向于逐条归类而非退后一步寻找公共根因。这是一个典型的"见树不见林"偏差——概率预测强化了"逐条处理"的路径，抑制了"整合判断"的路径。

### 偏差节点 2：平衡谬误——为决策点构造对称选项

**发生位置：** HistoryManager decision-needed 选项设计。

**机制：** 当识别出 HistoryManager 契约与使用方式矛盾时，我构造了三个选项。模型倾向于在"决策点"提供多个等价选项以显示中立性。但这个矛盾只有**一个**正确解（选项 A），选项 B 和 C 是"听起来合理但工程上不成立"的构造物。

**概率预测干扰：** 在生成选项列表时，模型倾向于输出 2-3 个选项并暗示它们等价。这是一种"礼貌性平衡"——给用户选择权。但在工程审查中，如果一个选项在逻辑上唯一正确，将其与错误选项并列是误导而非中立。

### 偏差节点 3：注意力漏斗——遗漏窗口失焦发现

**发生位置：** 从 Edge Case Hunter 输出到分诊结果的转换。

**机制：** Edge Case Hunter 输出了 12 个发现。在逐条处理过程中，窗口失焦发现（第 6 条）被遗漏。这很可能是因为它与 Story 3.4 的核心逻辑（删除）关系较远，且涉及另一个模块（InputManager 的 blur handler），在注意力分配时被降权。

**概率预测干扰：** 当上下文中存在大量发现时，模型的注意力机制倾向于聚焦于与主任务（Story 3.4 删除功能）直接相关的条目。与主任务"看似无关"但实际影响 AC4 的发现，在注意力漏斗中被过滤掉了。这是"相关性启发式"导致的遗漏——用主题相关性替代了因果相关性。

### 偏差节点 4：权威采纳——接受 Spec 的 AC ✅ 标记为事实

**发生位置：** 整个审查流程，从上下文加载到分诊。

**机制：** 规格文件将 AC1–AC5 标记为 ✅ 已实现。审查过程中，我从未质疑这些标记的真实性。三个审查层的发现已经证明 AC3/AC4 实际未实现，但分诊结论仍将对应的发现归类为"patch"（暗示代码基本正确，只需微调），而非"AC 验证失败"（暗示规格声称与代码现实矛盾）。

**概率预测干扰：** 规格文件以结构化表格呈现 AC 状态，这在概率预测中被视为高置信信号。模型倾向于不质疑具有"官方"外观的输入。这导致审查的批判性在"规格声称"面前失效——审查本应是规格声称的独立检验者，却变成了规格声称的注释者。

---

## [最终裁定]

| 维度                    | 原评估                    | 修正评估                                                 |
| ----------------------- | ------------------------- | -------------------------------------------------------- |
| Story 3.4 实现状态      | ✅ 已实现，缺 4 个补丁    | ❌ 实质未实现，onModuleDelete 无任何代码修改             |
| AC3/AC4 状态            | patch（缺几行代码）       | ❌ AC 验证失败（规格声称与代码矛盾）                     |
| HistoryManager 修复方案 | decision-needed（三选一） | patch（唯一正确方案：POST-mutation 推入 + 初始状态入栈） |
| 窗口失焦发现            | 遗漏                      | defer（预存缺陷，影响 AC4）                              |
| cancelDrag 发现         | 隐性驳回                  | dismiss（前提为假，应显式记录）                          |

**审查链路完整度：** 42 个原始发现 → 6 个被显式 dismiss → 10 个 defer → 4 个 patch → 1 个 decision-needed → **1 个遗漏**（窗口失焦）+ **1 个定性失真**（Story 3.4 实质未实现）+ **1 个选项设计偏差**（HistoryManager 唯一正确方案被伪装为三选一）
