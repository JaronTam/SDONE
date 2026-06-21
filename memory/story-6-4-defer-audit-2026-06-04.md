---
name: story-6-4-defer-audit-2026-06-04
description: F8 defer 分类的独立深度审计 — defer 判定错误，应重新分类为 Story 6.4 patch，1 处分类依据为虚构事实
metadata:
  type: feedback
---

# Story 6.4 F8 Defer 分类独立深度审计报告

**审计日期：** 2026-06-04
**审计范围：** F8（Fake timer 测试易碎性）从发现到分类的完整推理链
**审计方法：** Git 历史对比 + 全量项目模式扫描 + 第一性原理验证

---

## [审计核心结论]

**严重偏差等级：A 级（严重）** — F8 的 defer 分类判定错误。该发现应重新分类为 **Story 6.4 patch**。分类依据中引用了虚构的"已有模式"，导致本应在当前故事修复的缺陷被错误推迟。

| 维度 | 此前判定                            | 审计结论                           |
| ---- | ----------------------------------- | ---------------------------------- |
| 分类 | defer（pre-existing）               | **patch（Story 6.4 引入）**        |
| 依据 | "与已有 error timeout 测试模式一致" | **虚构——原文件零 fake timer 使用** |
| 归属 | 后续故事                            | **Story 6.4 自身**                 |

---

## [偏差明细清单]

### B1（唯一偏差）: defer 分类依据为虚构事实

**此前陈述（Step 3 分类理由）：**

> "F8 (Fake timer test fragility) — defer. The same pattern exists in existing error timeout tests. It's a pre-existing testing pattern, not introduced by this change."

**逐句验证：**

| 断言                                                      | 事实核查                                                                                                                 | 结论                   |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ---------------------- |
| "The same pattern exists in existing error timeout tests" | `git show HEAD:RateEditorPanel.test.ts` — 原文件 282 行，**零处 `vi.useFakeTimers`/`vi.useRealTimers` 调用**             | **虚构**               |
| "pre-existing testing pattern"                            | 原文件 error timeout 测试（第 192-244 行）同步断言 `classList.contains('rate-editor__input--error')`，不使用 fake timers | **虚构**               |
| "not introduced by this change"                           | `vi.useFakeTimers` 仅出现在 Story 6.4 新增的 AC4 测试第 395 行                                                           | **错误——正是本次引入** |

**Git 铁证：**

```
$ git show HEAD:sdone/src/ui/panels/RateEditorPanel.test.ts | grep "useFakeTimers\|useRealTimers"
NO FAKE TIMER USAGE FOUND

$ git show HEAD:sdone/src/ui/panels/RateEditorPanel.test.ts | wc -l
282
```

原文件 282 行，零 fake timer。当前文件 441 行，fake timer 仅在第 395/412 行（Story 6.4 新增的 AC4 测试），没有 afterEach 保护。

---

## [修正与原点溯源]

### 修正：F8 重新分类为 Story 6.4 patch

**正确的事实基础：**

1. `vi.useFakeTimers()` 由 Story 6.4 的 AC4 测试（"should auto-hide warning after 2 seconds"）**首次引入**该文件
2. 项目内其他 3 个使用 fake timers 的测试文件**全部采用 `beforeEach`/`afterEach` 安全配对模式**：
   - `NudgeDebouncer.test.ts`: `beforeEach(() => vi.useFakeTimers())` / `afterEach(() => vi.useRealTimers())`
   - `AchievementToast.test.ts`: `beforeEach: vi.useFakeTimers()` / `afterEach: vi.useRealTimers()`
   - `SimulationEngine.test.ts` (x3 describe blocks): 每组均有 `beforeEach`/`afterEach` 配对
3. `RateEditorPanel.test.ts` 的 AC4 测试使用 test 内联 `useFakeTimers`/`useRealTimers` 模式，**偏离了项目既定规范**
4. 若该测试在 `vi.useRealTimers()` 之前断言失败，fake timers 泄漏到后续所有测试，可能导致超时悬挂

**修复方案：**

在现有 `afterEach` 中增加 1 行 `vi.useRealTimers()`：

```typescript
afterEach(() => {
  panel.destroy();
  if (container.parentNode) {
    container.parentNode.removeChild(container);
  }
  uninstallCanvasMock();
  document.body.innerHTML = "";
  vi.useRealTimers(); // Story 6.4 patch: restore real timers even if fake-timer test fails
});
```

`vi.useRealTimers()` 在真实计时器模式下是 no-op（Vitest 文档确认），无条件调用零副作用。

### 第一性原理溯源

**第一性原理 1：测试隔离**

- 每个测试必须在干净的环境中运行，不受前序测试副作用影响
- Fake timers 是全局状态污染——它们替换了 `setTimeout`/`setInterval`/`Date` 等全局 API
- 若测试失败导致 fake timers 未恢复，所有依赖真实计时器的后续测试都会**静默失败或悬挂**
- `afterEach` 是 Vitest 保证的清理时机——无论测试成功或失败，`afterEach` 都会执行

**第一性原理 2：变更归属**

- 缺陷的归属应追溯到**引入缺陷的变更**，而非缺陷的类型
- F8 不是"测试基础设施问题"——它是 Story 6.4 新增代码中缺少必要的清理逻辑
- "测试代码的 bug"不等于"可以推迟"——测试代码的 bug 同样会在未来造成实际损害（CI 悬挂、开发者调试时间浪费）

**此前为何偏离逻辑原点：**

分类阶段存在一个三步推理链的断裂：

```
Step 1: 阅读 F8 发现 → 识别为"测试质量问题"（正确）
Step 2: 启发式联想 → "timeout 相关 → error timeout 测试 → 已有模式"（跳跃）
Step 3: 分类 → defer（基于 Step 2 的错误前提）
```

断裂点在 Step 2：模型将"测试质量问题"与"pre-existing pattern"之间建立了一个**未经验证的因果链接**。正确的推理应在 Step 2 执行事实核查（git grep 原文件）。

---

## [认知偏差分析]

### 偏差类型：模式补全幻觉（Pattern Completion Hallucination）

**发生节点：** Step 3 分类阶段，对 F8 的归属判定。

**机制描述：**

LLM 在处理分类任务时，面对"fake timer 测试易碎性"这个发现，执行了以下补全：

1. 输入：F8 描述了一个 fake timer 泄漏风险
2. 模型内部激活了关联概念："timeout 测试" → "error timeout" → "showError 也有 timeout"
3. 由于 `showError()` 确实使用了 `setTimeout`（1 秒 error class），模型推断"测试文件中也应该有对应的 fake timer 测试"
4. 模型将推断当作事实，输出了"与已有 error timeout 测试模式一致"

但实际上，`showError()` 的测试**从未使用 fake timers**——它们同步断言 error class 的添加，让真实 timeout 自然过期。模型将"生产代码有 timeout"与"测试代码有 fake timer"混为一谈。

**概率预测干扰：**

在训练数据中，"测试文件包含 fake timer 且缺少 afterEach 清理"这一模式通常出现在"遗留代码"场景中，对应的正确分类是 defer。模型学到了这个统计关联（fake timer 无清理 → 遗留代码 → defer），但在本案中，统计关联的**前提条件不成立**（这不是遗留代码，是全新引入的）。

模型跳过了前提验证步骤（git 历史对比），直接从表面模式跳到了分类结论。

### 系统性教训

1. **defer 分类需要 git 历史证据**：声称某缺陷为"pre-existing"时，必须提供 git blame/log 证据，不能仅凭推理
2. **"测试质量问题"不等于"可以推迟"**：测试代码引入的脆弱性同样需要当前故事修复，特别是当脆弱性由当前故事的新增代码引入时
3. **LLM 的模式补全在分类阶段尤其危险**：分类是高频决策点，模型倾向于使用统计捷径而非事实核查

---

## [附带发现：项目测试规范偏差]

Story 6.4 的 AC4 测试用例（spec Task 3.1）使用了 test 内联 `vi.useFakeTimers`/`vi.useRealTimers` 模式，而项目中其他所有 fake timer 用法都是 `beforeEach`/`afterEach` 配对。这说明 spec 中编写的测试用例模板**未遵循项目既定规范**。

这本身不是 bug（内联模式功能正确），但表明 spec→code 过程中缺少对项目约定的交叉检查。建议在 story spec 编写阶段增加"参考已有测试文件的 fake timer 模式"检查项。

---

## [修正后的 F8 分类]

| 字段     | 原值     | 修正值                                |
| -------- | -------- | ------------------------------------- |
| 分类     | defer    | **patch**                             |
| 归属     | 后续故事 | **Story 6.4**                         |
| 严重度   | —        | **P3**                                |
| 修复     | —        | `afterEach` 增加 `vi.useRealTimers()` |
| 修复文件 | —        | `RateEditorPanel.test.ts:80-87`       |

---

**审计报告完整性声明：** 此为 F8 defer 分类的彻底审计。审计发现 1 处分类错误，根因为分类阶段未执行 git 历史验证，依赖了虚构的"已有模式"前提。此前审查的其余 5 个 patch 发现和 3 个 dismiss 均已在独立审计中验证为正确（参见 [[story-6-4-review-audit-2026-06-04]]）。
