# Story 7.7 审查深度审计报告

**Date**: 2026-06-09  
**Auditor**: Cline (独立审计层)  
**审查对象**: `docs/code-reviews/story-7-7-review-2026-06-09.md`  
**审计方法**: 逐条对照源代码验证事实准确性、遗漏扫描、triage 门禁复核

---

## [审计核心结论]

**严重偏差等级：中等（1项事实性错误 + 2项遗漏 + 1项过度陈述）**

此前审查报告的 7 项 Patch 发现中，6 项在逻辑和事实上均无误，1 项（P3）存在**事实性错误**——严重度被错误抬高。此外，审查遗漏了 2 项应发现的问题，并有 1 项过度陈述。

**声明**：P1、P2、P4、P5、P6、P7 及全部 6 项 Dismissed 发现经逐条验证，逻辑与事实均无误。以下仅列出存在偏差的部分。

---

## [偏差明细清单]

### 偏差 A：P3 事实性错误 — "测试将无限挂起" [严重度：高]

**原审查声称**（P3）：

> "If `engine.start()` fails to fire `onTick` (e.g., due to a regression), the test will hang indefinitely rather than failing fast."

**事实**：Vitest 框架对异步测试有默认 5000ms 超时机制。若 Promise 永不 resolve，Vitest 会在 5 秒后抛出超时错误并 fail 该测试，**不会无限挂起**。

**证据**：

- Vitest 默认 `testTimeout = 5000`（Vitest 配置文档）
- 项目 `vitest.config.ts` 未覆盖此默认值
- 因此最坏情况是测试在 5 秒后失败，而非"无限挂起"

**严重度修正**：Medium → **Low**（添加显式 timeout 是最佳实践，可加速失败反馈，但非紧急修复项）

**第一性原理溯源**：

- **逻辑原点**：异步测试的健壮性分析必须考虑测试框架自身的超时机制
- **偏离节点**：审查者在推理时采用了"裸 Promise = 无限挂起"的直觉判断，忽略了 Vitest 框架层的安全网。这是**可用性启发式偏差**——大脑用"裸 await = 危险"的简化模型替代了对框架行为的精确分析
- **正确表述**：缺少显式 timeout 会导致测试在回归时等待 5 秒才失败（而非立即失败），降低了失败反馈速度，但不会无限挂起

---

### 偏差 B：遗漏 — Story Spec Dev Notes 仍描述测试为 RED/skipped [严重度：中]

**遗漏内容**：Story 文件 `_bmad-output/implementation-artifacts/7-7-nfr-compliance-verification.md` 的 Dev Notes §ATDD Artifacts（第 460-465 行）仍描述：

```
- NumericalDrift.test.ts — AC1: 3 drift scenarios (RED, it.skip())
- e2e/smoke.test.ts — AC6: 4 smoke scenarios (RED, test.skip())
- TDD Phase: RED (14 tests, all skipped — activate per task during implementation)
```

但实际实现中所有 `.skip()` 已移除，测试全部活跃并通过。P1 仅捕获了测试文件头部的过时注释，**未发现 Story Spec 本身的文档过时**。

**第一性原理溯源**：

- **逻辑原点**：代码审查应覆盖所有与实现状态不一致的文档，包括 spec 文件自身
- **偏离节点**：审查者将注意力集中在源代码文件上，将 Story Spec 视为"输入"而非"被审查对象"。这是**框架效应偏差**——将 spec 固化为审查的参照系，忽略了 spec 本身也可能是过时的

---

### 偏差 C：遗漏 — Feedback "Step 1 隔离"测试未真正测试隔离 [严重度：中]

**遗漏内容**：`SimulationEngine.integration.test.ts` 第 520-538 行的测试：

```typescript
it('non-feedback connections are NOT affected by feedback eval (Step 1 isolation)', () => {
    // ... 只有非反馈连接，没有反馈连接
    state.connections = {
      c0: { id: 'c0', fromId: 'src1', toId: 's0', rate: 10, formulaStr: '10' },
      // NO feedback connection — this is pure forward flow
    };
```

**问题**：该测试名为"Step 1 isolation"但测试状态中**完全没有反馈连接**。它只验证了"没有反馈时，非反馈连接正常工作"——这已被 NumericalDrift 测试覆盖。真正的隔离测试应包含**反馈和非反馈连接共存**的状态，验证非反馈连接的 rate 不被 Step 3 的乘法操作修改。

**应有的测试设计**：

```
source1 → stock (rate=10, 非反馈)
stock → source2 (feedback, formula="0.5")
source2 → stock (rate=5, 反馈目标)
→ 验证 source1→stock 的 rate 仍为 10（未被 0.5 乘）
```

**第一性原理溯源**：

- **逻辑原点**："隔离"测试的定义是验证 A 在 B 存在时不受影响，而非验证 A 在 B 不存在时正常工作
- **偏离节点**：审查者读取了测试名称"Step 1 isolation"后，用名称的语义填充了对测试内容的预期，未逐行验证测试是否真正实现了其声称的隔离场景。这是**标签效应偏差**——将测试的命名等同于测试的行为

---

### 偏差 D：P6 过度陈述 — "degradation indicator 不可观察" [严重度：低]

**原审查声称**（P6）：

> "there is no visible degradation indicator in the UI... it's not surfaced to the user"

**事实修正**：degradation mode 通过粒子渲染密度间接可观察：

- "full" → 全部粒子渲染
- "sparse" → 隔一跳一（粒子明显减少）
- "off" → 无粒子

**正确表述**：degradation indicator **间接可观察**（通过粒子密度变化），但验证文档未解释**如何观察**——这是文档不完整，而非 indicator 不可观察。

**第一性原理溯源**：

- **逻辑原点**：可观察性分析应区分"直接可观察"（文本标签）和"间接可观察"（视觉行为变化）
- **偏离节点**：审查者将"没有文本标签"等同于"不可观察"，忽略了行为层面的可观察性。这是**二元思维偏差**——将可观察性视为有/无的二值判断，而非连续光谱

---

## [修正与原点溯源汇总]

| 偏差 | 原审查表述                      | 修正后表述                                            | 严重度变化           |
| ---- | ------------------------------- | ----------------------------------------------------- | -------------------- |
| A    | P3: 测试将无限挂起 [Medium]     | P3: 测试将在 5s 后超时失败 [Low]                      | Medium → Low         |
| B    | (遗漏)                          | Story Spec Dev Notes 仍描述 RED/skipped [Low]         | 新增                 |
| C    | (遗漏)                          | Step 1 隔离测试未真正测试隔离 [Medium]                | 新增                 |
| D    | P6: indicator 不可观察 [Medium] | P6: indicator 间接可观察但文档未解释如何观察 [Medium] | 严重度不变，表述修正 |

---

## [认知偏差分析]

| 偏差 | 推理节点                        | 偏差类型     | 机制                                     |
| ---- | ------------------------------- | ------------ | ---------------------------------------- |
| A    | "裸 await Promise = 无限挂起"   | 可用性启发式 | 用直觉简化模型替代框架行为精确分析       |
| B    | "Spec 是审查输入，不是审查对象" | 框架效应     | 将 spec 固化为参照系，忽略其自身可能过时 |
| C    | "测试名=隔离 → 测试内容=隔离"   | 标签效应     | 用命名语义填充对测试行为的预期           |
| D    | "无文本标签 = 不可观察"         | 二元思维     | 将可观察性视为有/无二值判断              |

---

## 修正后总体评估

### 严重度分布修正

| 严重度 | 原数量 | 修正后数量 | 变化说明                     |
| ------ | ------ | ---------- | ---------------------------- |
| Medium | 3      | 3          | P3 降级，偏差 C 新增，净不变 |
| Low    | 4      | 5          | P3 降级加入，偏差 B 新增     |

### 修正后 Medium 项

1. **P2** — 延迟阈值偏离 spec（110ms → 120ms），spec 未同步更新
2. **偏差 C** — Step 1 隔离测试未真正测试隔离（测试状态缺少反馈连接）
3. **P6**（修正表述）— degradation indicator 间接可观察但验证文档未解释如何观察

### 修正后 Low 项

1. **P1** — 测试文件残留 ATDD RED PHASE 注释
2. **P3**（降级）— 异步测试缺少显式 timeout，回归时 5s 延迟失败（非无限挂起）
3. **P4** — `check-bundle-size.mjs` 存在未使用的 `statSync` 导入
4. **P5** — `check-bundle-size.mjs` 未处理 dist/ 目录不存在
5. **P7** — 延迟测试注释不一致
6. **偏差 B** — Story Spec Dev Notes 仍描述 RED/skipped

### 最终评估：**PASS with conditions**

合并前建议修复的 Medium 项：P2、偏差 C、P6。
