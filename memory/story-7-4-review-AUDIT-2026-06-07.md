# Story 7.4 Review — 深度自审计报告（2026-06-07）

> **审计动因**：用户要求开启独立审计空间，对前一份 review 报告（`memory/story-7-4-review-2026-06-07.md` + `attempt_completion` 总结）做事实/逻辑校验。本报告**不**为维持一致性而辩护，**仅**对照源码、git、spec 重新校验每一个论断。

---

## [审计核心结论]

**严重偏差等级：🟡 中度（minor-to-moderate）**

| 维度            | 评级            | 说明                                                                                                                                                                                                             |
| --------------- | --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **事实准确性**  | 🟢 大部分成立   | 5 个 Patch/Decision 类发现（F1-F5）经源码二次校验后**事实层面全部成立**。dismiss 类（HMR/rewind-history/ControlBar）经第一性原理回溯**结论成立但理由表述偏简**。                                                 |
| **量化精度**    | 🟡 有偏差       | "8 个未声明文件" → 实际未声明 **7 个 sdone 源文件 + test-output.txt** = 8 项改动，**勉强对**；但分类含糊（把 modified 与 untracked 混算）。                                                                      |
| **范围完整性**  | 🔴 **重大遗漏** | 前一份 review **完全没提到** `.agents/skills/*`、`.claude/skills/*`、`_bmad/*` 这三类大批配置文件改动也混在 working copy。这是**第三层污染源**，与 Story 7.3/7.4 都无关，属于工具链/IDE 副产物，应单独隔离。     |
| **F5 措辞精度** | 🟡 有遗漏       | "复用 Ctrl+Z handler 的 cancelDrag" 措辞正确，但**没说明**："只调 cancelDrag、**不要复用 `historyManager.push`**"——因为 spec 明文禁止 rewind 推 history。前文忽略了此细节，会误导 dev 把整段 Ctrl+Z 模板搬过来。 |
| **F4 严重度**   | 🟡 低估         | 实际入 git 的不是 1 个 `test-output.txt`，而是 **4 个** (`test-output.txt`/`test-output2.txt`/`test-output3.txt`/`test-output4.txt`)。前文只写 1 个。                                                            |

**总判定**：前文**没有事实性虚构**，但存在 (a) 范围统计不完整、(b) 修复方案细节缺失、(c) 量化数字微偏 三类瑕疵。不构成"完全偏离事实"，但达不到"审计级精度"。

---

## [偏差明细清单]

### 偏差 #1 — 范围遗漏（重大）

**前文表述**（attempt_completion）：

> "F1 — diff 跨 3 story：Story 7.3 标 done 但从未独立 commit，与 7.4 + 7.1 deferred 混合，File List 缺 8 个文件"

**事实核验**（`git diff HEAD --name-only`）：

- diff 包含 **3 个范围**：
  1. `sdone/` 源文件 + test-output.\* （Story 7.1/7.3/7.4 混合）
  2. `.agents/skills/*` 与 `.claude/skills/*`（BMAD 工具配置）
  3. `_bmad/_config/*`、`_bmad/bmm/*`、`_bmad/core/*`、`_bmad/tea/*`（BMAD 框架文件）

**偏差描述**：前文**只**审查了第 1 类，**完全没提**第 2、3 类。这两类虽与 Story 7.4 无关，但都在同一份 commit 的 staging 候选范围内，会被一并提交。一个完整的 review 应至少**声明**它们存在并归类（"out-of-scope, pre-existing tooling drift"），而非默认忽略。

**影响**：用户若按 F1 决策做 commit，可能无意中把 BMAD 工具的脏改动一并提交进项目历史。

---

### 偏差 #2 — F4 数量低估

**前文表述**：

> "F4 — `test-output.txt` 入 git（应 `.gitignore` + `git rm --cached`）"

**事实核验**（`git ls-files | findstr test-output`）：

```
test-output.txt
test-output2.txt
test-output3.txt
test-output4.txt
```

**偏差描述**：4 个文件，不是 1 个。`.gitignore` 应加 `test-output*.txt` 通配符，`git rm --cached` 需对所有 4 个执行。

---

### 偏差 #3 — F5 修复方案不完整

**前文表述**（spec Review Findings 与 memory 中）：

> "Ctrl+Z handler 已有 `inputManager.cancelDrag()`，rewind 应复用。一行修复。"

**事实核验**（`main.ts:617-642` Ctrl+Z handler 原样）：

```typescript
if (inputManager.isDragging) {
  inputManager.cancelDrag();
  historyManager.push(currentState); // ← 此行 rewind 不应复用
}
```

**偏差描述**：前文说"复用"，但 Ctrl+Z handler 在 `cancelDrag()` 之后**还 push history**（line 624-625）。如果 dev 把整段照搬到 rewind，违反 spec 明文"Rewind does NOT push to history"（spec line 128/306/336）。**正确措辞**应为：

> "rewind 应**仅**借鉴 `if (inputManager.isDragging) inputManager.cancelDrag();` 部分，**不要**复用 `historyManager.push(currentState)` —— 这与 Ctrl+Z 不同，rewind 设计上丢弃 partial-drag state。"

---

### 偏差 #4 — Dismiss 类发现的理由表述偏简

**前文表述**（memory L4 节）：

> "HMR `replaceWith(cloneNode(true))` → 项目一致模式，事件监听器随旧节点 GC 回收，**有效，dismiss**"

**事实核验**：

- MDN: `Node.cloneNode(deep)` 不复制 listeners ✅
- `replaceWith()` 把旧节点从 DOM 移除 ✅
- 但 **旧节点何时被 GC** 取决于 JS 引用：`const btnSaveCheckpoint = ...` 在模块作用域**持有引用**
- Vite HMR 调用 `import.meta.hot.dispose` 后，整个模块被替换 → 旧模块的 const 失去引用 → 旧节点 + listener 才被 GC
- **生产环境**中 `import.meta.hot` 不存在，整段 hot.dispose 代码 dead-code，不执行 → 不构成泄漏

**偏差描述**：前文一句"随节点 GC"略过了 **"由 HMR 模块替换驱动 GC"** 的关键中介机制。dismiss 结论成立，但理由表述**没有抵达第一性原理**。

---

### 偏差 #5 — 字段使用不准确（小）

**前文表述**：

> "ControlBar.ts 改动违反 "DO NOT modify" 反模式 → 实为 Story 7.3 改动"

**事实核验**（`git diff HEAD sdone/src/ui/panels/ControlBar.ts`）：

```typescript
/**
 * Story 7.3: When `statusOverride` is provided, the custom text replaces
 * the default status (e.g., "PAUSED — [stock] 已达阈值" for auto-pause).
 */
setRunState(state: 'idle' | 'running' | 'paused', statusOverride?: string): void {
```

**偏差描述**：判定**完全正确**（注释明写 Story 7.3），dismiss 成立。无偏差。✅

---

### 偏差 #6 — 未盘点 mojibake 是否真为 false positive

**前文表述**（memory L5）：

> "工具输出层编码错觉。Acceptance Auditor 报告 mojibake 实为终端输出层 UTF-8/GBK 误码。"

**事实核验**（`Get-Content -TotalCount 60` 的输出）：

```
* Story 7.4 鈥?Checkpoint Save/Rewind Integration Tests (RED PHASE)
...
* TDD Phase: 馃敶 RED 鈥?all tests use test()
```

`鈥?` 与 `馃敶` 是经典的 UTF-8 字节序列被按 GBK 解码后的乱码模式（U+2014 EM DASH → `0xE2 0x80 0x94` 被当作 GBK 双字节 → `鈥` + 单字节孤儿）。

**偏差描述**：判定**完全正确**。源文件本身是合法 UTF-8，乱码来自 PowerShell 默认 console 编码。dismiss 成立。✅

---

## [修正与原点溯源]

### 修正 #1：补全 commit 范围归类

**应改写为**（替换 F1 当前表述）：

> **F1 [Decision Needed]** —— 当前 working copy 包含三层污染：
>
> **层 A：源码（用户决策范围）** — 12 个 sdone 文件
>
> - Story 7.4 范围（spec 声明）：5 个 — `index.html`, `main.ts`, `control-bar.css`, `ControlBar.test.ts`, `checkpoint.test.ts`(新)
> - **Story 7.3 范围（spec 未声明但 commit 应归属 7.3）**：6 个 — `ControlBar.ts`, `SimulationEngine.ts`, `SimulationEngine.test.ts`, `AnalyticsPanel.ts`, `AnalyticsPanel.test.ts`, `analytics-panel.css`
> - Story 7.1 deferred 范围：1-2 个 — `SceneRenderer.ts`, `SceneRenderer.test.ts`（待 dev 确认）
>
> **层 B：测试产物（应在 commit 前清理）** — 5 个 — `test-output.txt`, `test-output2.txt`, `test-output3.txt`, `test-output4.txt`（已入 git），`tsc-output.txt`（未跟踪）
>
> **层 C：工具链 drift（与 story 无关）** — `.agents/skills/*`、`.claude/skills/*`、`_bmad/*` 大量配置 — 应**分离到独立 commit**或 stash。
>
> **请用户决策**：(a) 三层全部合并到一个"Story 7.3+7.4 mega-commit"，(b) 按层拆 3 个 commit，(c) revert 7.3 后只 commit 7.4 + 工具链 drift 隔离。

**第一性原理溯源**：

- **原理**：commit 是版本控制最小可回滚单元；一个 commit 的 scope 应**等于**其 commit message 声明的语义边界。
- **此前为何偏离**：我把焦点放在"7.3 没独立 commit"的事实陈述上，未追问"那这次 commit 应当如何分层"。本质是 _陈述事实但未给出可执行的决策树_。

---

### 修正 #2：F4 范围扩展

**应改写为**：

> **F4 [Patch]** —— **4 个** `test-output*.txt` 文件已被 git 跟踪（`ls-files` 确认）。需要：
>
> 1. `.gitignore` 添加 `sdone/test-output*.txt` 与 `sdone/tsc-output.txt`
> 2. `git rm --cached test-output.txt test-output2.txt test-output3.txt test-output4.txt`
> 3. 验证：`git ls-files | findstr test-output` 应为空

**第一性原理溯源**：

- **原理**：`.gitignore` 只阻止 _未跟踪_ 文件；已跟踪文件必须 `git rm --cached` 才能从 index 移除（而工作树保留）。
- **此前为何偏离**：我用一个具体文件名 `test-output.txt` 做了"代表性陈述"，未运行 `git ls-files` 通配检查同名兄弟。这是 _样本偏差_（用 1 个观测代表整族）。

---

### 修正 #3：F5 措辞精确化

**应改写为**：

> **F5 [Patch]** —— Rewind handler (`main.ts:575-604`) 未取消活跃拖拽。在 `if (!_checkpoint) return;` 之后插入：
>
> ```typescript
> if (inputManager.isDragging) {
>   inputManager.cancelDrag();
>   // 注意：与 Ctrl+Z handler 不同，**不要** push history —— rewind 设计上丢弃所有未保存改动
> }
> ```
>
> 不要照搬 `main.ts:617-642` 整段，因为它包含 `historyManager.push(currentState)`，违反 spec line 128/306/336 的 "Rewind does NOT push to history" 约定。

**第一性原理溯源**：

- **原理**：两个相似 handler 共享一个工具函数（cancelDrag）≠ 共享全部逻辑。Spec 的状态机定义比代码模板更高优先级。
- **此前为何偏离**：我看到"Ctrl+Z 有 cancelDrag 模式"就推荐"复用"，未对比两个 handler 的 _完整语义_（Ctrl+Z 保留历史、Rewind 丢弃）。这是 _模式匹配优先于语义对比_ 的偏差。

---

### 修正 #4：HMR 论据完整化

**应改写为**（替换 dismiss 表述）：

> **HMR `replaceWith(cloneNode(true))` dismiss 理由（完整版）**：
>
> 1. `cloneNode(true)` 不复制 `addEventListener` 注册的 listener（MDN 规范）
> 2. `replaceWith(newNode)` 把旧节点从 DOM 树移除
> 3. 旧节点 + listener 暂时仍被模块作用域的 `const btnSaveCheckpoint` 引用 → **不会立即 GC**
> 4. 但 Vite HMR 触发 `import.meta.hot.dispose` 即将替换整个模块 → 旧模块的 const 失去引用 → 旧节点链 + listener 被 GC
> 5. 生产环境 `import.meta.hot` 为 `undefined`，整段 dispose 代码不执行 —— 不构成生产泄漏
>
> **结论**：HMR 场景安全；生产场景代码不路径执行。dismiss 成立。

**第一性原理溯源**：

- **原理**：GC 触发条件 = 不可达性；listener 生命周期 = host node 生命周期 = 引用链生命周期。三段必须串联推理。
- **此前为何偏离**：我用"随节点 GC"做了 _因果省略_，跳过了中间环节"模块替换 → const 失引用"。这是 _单步因果近似多步因果_ 的偏差。

---

## [认知偏差分析]

本次 review 生成过程中，模型在以下推理节点受**概率预测干扰**而偏离事实轨道：

### 偏差节点 1：**"焦点收敛偏差"**

在 F1（diff 跨 story）问题被识别后，模型对 commit 范围的注意力被**锁定**在 sdone 源文件上，自动忽略了 working copy 中其他大批改动（.agents/.claude/\_bmad）。

- **概率机制**：训练数据中"story commit scope discussion" 高频共现 `src/*` 路径，低频共现 `.agents/`、`_bmad/` 这类工具配置路径。模型在文本生成时按"story review 典型范围"先验做了**隐式过滤**。
- **修正方法**：在 review 流程中**强制** `git diff HEAD --name-only` 全输出枚举并分组，而非依赖采样观察。

### 偏差节点 2：**"代表性样本陷阱"**

在 F4 提到 `test-output.txt` 时，模型直接用单个文件名作为"该类问题的代表"，没有触发"是否存在同模式兄弟文件"的查询。

- **概率机制**：训练数据中"问题报告 + 具体文件名"模式非常高频，"问题报告 + 通配符 + 兄弟枚举"模式相对低频。模型选择了高频路径。
- **修正方法**：任何 "X 文件" 类发现，必须配套一个 `ls-files | filter` 验证。

### 偏差节点 3：**"模式套用越界"**

在 F5 建议"复用 Ctrl+Z 的 cancelDrag"时，模型把 Ctrl+Z handler 当作**模板**而非**参考点**，未做完整语义 diff。

- **概率机制**：训练数据中"复用现有 handler"是常见的工程建议，其文本模式倾向于"借用整段代码"，而非"借用半段 + 排除半段"。模型生成时按高频建议路径走，忽略了 spec 的禁止条款。
- **修正方法**：任何"复用 X"建议必须配套一个"但不复用 Y（理由）"反向约束。

### 偏差节点 4：**"因果链截断"**

在 HMR 论据中，模型用"随节点 GC"一句话压缩了"node→reference→module dispose→GC" 四步因果链。

- **概率机制**：模型在 dismiss 类发现的表述上倾向于**最小化解释**（dismiss = 不重要 = 短解释），但用户的"防伪审计"要求恰恰相反：**所有结论都需可溯源**。
- **修正方法**：dismiss 类发现也必须达到 patch 类发现的论证密度，因为 false dismiss 比 false patch 危害更隐蔽。

---

## [后续 Action 校准]

基于本审计，**前一份 review 报告**需要做以下修订（按优先级）：

1. **🔴 P0 — 修订 F1**：补全三层 commit 范围归类，提供更精确的决策树（见修正 #1）
2. **🔴 P0 — 修订 F4**：把数量从 1 扩到 4，给出完整 `git rm --cached` 命令（见修正 #2）
3. **🟡 P1 — 修订 F5**：在 spec Review Findings 中补充"不要复用 historyManager.push"的反向约束（见修正 #3）
4. **🟢 P2 — 修订 HMR dismiss 理由**：在 memory 中补全四步因果链（见修正 #4）
5. **🟢 P2 — 流程改进**：将"偏差节点 1/2/3/4"四条认知偏差登记为 review 流程改进 backlog

---

## 审计员声明

本报告**不**为维持前文一致性辩护。在源码、git history、spec 三方证据交叉校验后：

- **前文事实层面**：5 个核心发现 (F1-F5) **全部成立**，dismiss 类 (3 个) **全部成立**，defer 类 (2 个) **成立**。**没有虚构发现**。
- **前文精度层面**：存在范围遗漏（漏报 .agents/\_bmad 改动）、量化偏差（F4 数量低估 75%）、表述简略（F5 修复方案残缺、HMR dismiss 论据缺中间环节）。
- **总评级**：🟡 **中度偏差**，**不构成认知崩塌**，但**不达审计级精度**。建议按"后续 Action"修订原报告。
