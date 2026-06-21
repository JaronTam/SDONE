# Story 7.6 代码审查深度审计报告

**审计日期:** 2026-06-08
**审计对象:** Story 7.6 代码审查（三层审查 + 分诊）
**审计方法:** 第一性原理回溯 + 逐项事实校验

---

## [审计核心结论]

**偏差等级：🟢 低（无严重偏差）**

此前的三层审查和分诊在逻辑和事实上**基本无误**。发现 1 个遗漏项（`afterEach` 清理不完整），1 个分诊分类可商榷项（`afterEach` 问题应升级为 patch 而非忽略），以及 0 个错误分类。

**严禁递归讨好声明：** 以下偏差是真实存在的逻辑遗漏，非"为了认错而认错"。此前审查中正确判断的部分（6 项 dismiss、4 项 defer、1 项 patch）经逐项复核均站得住脚。

---

## [偏差明细清单]

### 偏差 #1：遗漏 `afterEach` 清理不完整问题

**此前判断：** 未提及（完全遗漏）

**事实：** `SimulationEngine.integration.test.ts` 的 `afterEach` 仅调用 `vi.useRealTimers()`，未调用 `engine.reset()` 或 `engine.pause()`。如果测试结束时引擎处于 `running` 状态：

1. `setInterval` 创建于 fake timers 期间，`vi.useRealTimers()` 会清除 fake 定时器（Vitest 行为），但不会调用 `clearInterval()` — 引擎内部的 `_intervalId` 仍持有引用
2. `visibilitychange` 事件监听器未被移除（`document.removeEventListener` 未调用）
3. `onTick` 回调未被置空

**实际影响：** 🟢 Low — Vitest 的 `vi.useRealTimers()` 确实会清除所有 pending fake timers，因此不会造成测试间干扰。750/750 测试全部通过证实了这一点。但这是一个**测试卫生问题**：如果未来 Vitest 改变 `useRealTimers` 的清理行为，或者测试文件被复制为模板，可能引入 flaky test。

**修正分类：** 应新增为 `patch`（修复明确：在 `afterEach` 中 `vi.useRealTimers()` 前添加 `engine.reset()`）

**第一性原理溯源：** 此前遗漏的原因是三层审查均未将"测试清理完整性"作为独立审查维度。Blind Hunter 关注 diff 内容的正确性，Edge Case Hunter 关注源代码分支覆盖，Acceptance Auditor 关注 AC 合规性——三者都没有"测试自身质量"的检查清单。

---

### 偏差 #2：`makeSink` 死代码发现来源标注不精确

**此前判断：** 来源标注为 `blind+edge`

**事实：** Blind Hunter 的输出中未提及 `makeSink`。Edge Case Hunter 的输出也未直接提及。此发现是我在汇总阶段自行补充的（基于阅读完整测试文件时注意到 `makeSink` 未被使用）。

**修正：** 来源应标注为 `audit`（审查者自行发现），而非 `blind+edge`。

**第一性原理溯源：** 汇总时倾向于将发现归因于某个正式审查层，而非审查者自身判断。这是"权威归属偏差"——认为正式流程产出的发现比个人判断更可信。

---

## [逐项复核：此前判断的正确性]

| #   | 发现                           | 此前分类 | 复核结果                  | 理由                                                               |
| --- | ------------------------------ | -------- | ------------------------- | ------------------------------------------------------------------ |
| 1   | `expect.any(String) as string` | dismiss  | ✅ 正确                   | Gate 1 通过：运行时行为正确，`as string` 是 TS 编译期样式          |
| 2   | `toMatchObject` 部分匹配       | dismiss  | ✅ 正确                   | Gate 1 通过：Spec 明确要求 `toMatchObject()`，非脆弱快照的正确选择 |
| 3   | Acceptance Auditor: 测试失败   | dismiss  | ✅ 正确                   | 实测 750/750 通过，Auditor 的推理基于假设环境而非实际验证          |
| 4   | 缺少 no-op 状态机测试          | dismiss  | ✅ 正确                   | Gate 1 通过：AC2 仅要求 RUN/PAUSE/snapshot 事件测试                |
| 5   | `as StockNode` 无运行时守卫    | defer    | ✅ 正确                   | 预存模式，非 Story 7.6 引入                                        |
| 6   | `addFeedbackConnection` 零覆盖 | defer    | ✅ 正确                   | 预存问题，Story 7.6 scope 不包含                                   |
| 7   | `updateFormula` 零覆盖         | defer    | ✅ 正确                   | 同上                                                               |
| 8   | 反馈集成路径未测试             | defer    | ✅ 正确                   | 同上                                                               |
| 9   | `makeSink` 死代码              | patch    | ✅ 正确（来源标注需修正） | 确实未使用，应删除                                                 |

---

## [修正与原点溯源]

### 修正 1：新增 Patch — `afterEach` 清理不完整

**文件：** `SimulationEngine.integration.test.ts:104-106`

**当前代码：**

```typescript
afterEach(() => {
  vi.useRealTimers();
});
```

**应修改为：**

```typescript
afterEach(() => {
  engine.reset();
  vi.useRealTimers();
});
```

**逻辑底层依据：** 测试清理的第一性原理是"不留副作用"。每个测试应将系统恢复到测试前状态。`engine.reset()` 调用 `pause()` → `clearInterval()` + 移除 `visibilitychange` 监听器 → 重置状态。这是最小完整清理。

### 修正 2：Patch P1 来源标注

**当前：** `blind+edge`
**修正为：** `audit`

---

## [认知偏差分析]

### 偏差 #1 的认知根源：维度盲区

三层审查架构（Blind Hunter / Edge Case Hunter / Acceptance Auditor）各自有明确的职责边界，但**"测试自身质量"**（cleanup、isolation、determinism）不在任何一层的核心职责中：

- Blind Hunter 审查 diff 内容的正确性
- Edge Case Hunter 审查源代码分支覆盖
- Acceptance Auditor 审查 AC 合规性

"测试清理完整性"是一个**横切关注点**，需要专门的检查维度。此前的审查流程缺少"Test Quality"审查层。

**改进建议：** 在未来的代码审查中，对测试文件 diff 额外检查：

1. `afterEach`/`afterAll` 是否完整清理所有副作用
2. 测试间是否存在隐式依赖（通过共享可变状态）
3. fake timers/mocks 是否在 cleanup 中正确恢复

### 偏差 #2 的认知根源：权威归属偏差

将自行发现的 `makeSink` 死代码归因于 `blind+edge`，是因为潜意识认为"正式流程产出的发现比个人判断更有分量"。这导致来源追踪不准确。

**改进建议：** 严格标注发现来源。如果是审查者在汇总/分析阶段自行发现，标注为 `audit`，不借用正式层名称。

---

## [最终修正后的发现清单]

| #   | 来源  | 标题                                                                           | 分类  | 严重度    |
| --- | ----- | ------------------------------------------------------------------------------ | ----- | --------- |
| P1  | audit | Dead code: unused `makeSink` function and `SinkNode` import                    | patch | 🟢 Low    |
| P2  | audit | `afterEach` cleanup incomplete — engine not reset before restoring real timers | patch | 🟡 Medium |
| D1  | edge  | `addFeedbackConnection` 零测试覆盖                                             | defer | 🟠 High   |
| D2  | edge  | `updateFormula` 零测试覆盖                                                     | defer | 🟡 Medium |
| D3  | edge  | 反馈连接集成路径未测试                                                         | defer | 🟠 High   |
| D4  | blind | 不安全的 `as StockNode` 类型断言无运行时守卫                                   | defer | 🟢 Low    |

**Dismiss: 6 项**（与此前一致，无变化）
