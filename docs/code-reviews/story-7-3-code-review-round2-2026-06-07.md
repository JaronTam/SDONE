# Story 7.3 — Code Review Round 2 + Meta-Audit Report

**Story**: 7.3 Stock Zero Behavior: Auto-Pause & Breathing Glow
**Spec**: `_bmad-output/implementation-artifacts/7-3-stock-zero-behavior-auto-pause-and-breathing-glow.md`
**Review run**: 2026-06-07（round 2 三层 review + 主代理元审计）
**Skill**: `bmad-code-review` (mode=full, 3 layers)
**Reviewer**: AI subagents (Blind Hunter / Edge Case Hunter / Acceptance Auditor) + 主代理元审计
**Trigger**: Story 7.4 review 发现 7.3 retroactive commit `64830b5` 未单独跑过 `bmad-code-review`，决定补审
**Final status**: 🟢 **代码层 Clean — 0 patch / 0 decision / 2 defer / 5 dismiss（含元审计修正 3 条）**

---

## 1. 背景与触发

Story 7.3 的实际代码改动分布在两个 commit 中：
- `2133278` (Story 7.4 commit) — 包含 7.3 的 main.ts 改动（COUNTDOWN_ZERO handler / `_autoPausedStockIds` / `_cumulativeOverflow` / `updateAutoPauseStatus` / `breathingGlowStockIdsProvider`）
- `64830b5` (retroactive commit) — 仅 8 个非 main.ts 文件（SceneRenderer / ControlBar / AnalyticsPanel / SimulationEngine + tests + CSS）

由于 commit 边界泄漏（AA3），Story 7.4 review 仅覆盖了 7.4 行为。本次补审针对 7.3 完整范围执行三层 adversarial review。

---

## 2. Round 2 三层 Review 原始输出

### 2.1 Blind Hunter 层

| ID | Severity | 位置 | 发现 |
|---|---|---|---|
| BH1 | 🟡 Medium | `ControlBar.ts:108-117` | 自动暂停状态缺少独立 CSS 类，未来差异化样式扩展性差 |
| BH2 | 🔴 High | `main.ts:678-686` | `_cumulativeOverflow` 跨次运行不清零，与新 capacity 不一致 |
| BH3 | 🟢 Low | `SceneRenderer.ts:654-677` | 呼吸光效为纯蓝色，spec 提及 "blue/white pulsing" |
| BH4 | 🟡 Medium | `main.ts:853` | hot-reload dispose 未置 null `breathingGlowStockIdsProvider`（重复条目，round 1 已 defer） |

### 2.2 Edge Case Hunter 层

| ID | Severity | 位置 | 发现 |
|---|---|---|---|
| EC1 | 🔴 High | `main.ts:690-701` | 手动 PAUSE 后下一 SNAPSHOT 触发 stale COUNTDOWN_ZERO → 污染状态文本 |
| EC2 | 🔴 High | `main.ts:434-451` | `_prevCountdownMap` 在 RUN 时未清零 → 二次归零不触发 COUNTDOWN_ZERO |
| EC3 | 🟢 Low | `main.ts:678-686` | 同 tick 多次溢出触发 `refreshAnalyticsPanel` 冗余调用 |
| EC4 | 🟡 Medium | `SceneRenderer.ts:654-677` | 蓝色辉光 + 红色 overflow fill = 紫色混合（重复条目，round 1 已 defer） |

### 2.3 Acceptance Auditor 层

| ID | Severity | 位置 | 发现 |
|---|---|---|---|
| AA1 | 🟡 Medium | `main.ts:678-686` / Spec AC4 | AC4 "cumulative" 字面义 vs 实现 "max overflow" 语义分歧 |
| AA2 | 🟢 Low | `ControlBar.ts` / Spec AC2 | 状态文案 "PAUSED — X 已达阈值" vs spec "PAUSED — 存量已达阈值" 微差异 |
| AA3 | 🟡 Medium | git log | commit 边界泄漏 — 7.3 main.ts 改动归入 7.4 commit |

---

## 3. 主代理 Triage（修正前）

| 桶 | 数量 | 条目 |
|---|---:|---|
| patch | 1 | EC2 |
| decision | 2 | EC1, BH2 |
| defer | 2 | BH1, AA3 |
| dismiss | 6 | BH3, BH4*, EC3, EC4*, AA1, AA2 |

\* round 1 重复条目

---

## 4. 元审计（Meta-Audit）— Jaron 主动请求

### 4.1 触发原因

Jaron 提出："review 流程驱动太强，subagent 输出经 triage 后是否经得起源码事实校验？"

主代理对 round 2 的 5 条 high/decision/patch 级 finding 逐条执行 `read_file` 源码校验。

### 4.2 元审计裁决明细

#### EC1（手动 PAUSE 污染） → ❌ Dismiss

- **原断言**：手动 Pause → 下一 SNAPSHOT 触发 stale COUNTDOWN_ZERO → 污染 status text
- **源码事实**（`main.ts:53-55` / `:737` / `SimulationEngine.pause`）：
  - `SNAPSHOT_EMITTED` 仅在 `simEngine.onTick` 内触发
  - `pause()` 调用 `clearInterval`，onTick **立即停止**
  - paused 状态下不再有新 SNAPSHOT ∴ 不会有 stale COUNTDOWN_ZERO
- **第一性原理**：subagent 混淆「静态代码顺序」与「动态事件可达性」
- **结论**：因果链不成立

#### EC2（_prevCountdownMap 残留） → ❌ Dismiss

- **原断言**：auto-pause 至 0 → 恢复 RUN → 旧 prevRemaining=0 残留 → 再次归零时不触发 COUNTDOWN_ZERO
- **源码事实**（`main.ts:434-451`）：
  ```ts
  if (prevRemaining === undefined || prevRemaining > 0) { /* emit */ }
  if (cd.remainingSeconds !== null) {
    _prevCountdownMap.set(cd.stockId, cd.remainingSeconds);  // 每次都覆盖
  }
  ```
- **关键事实**：恢复 RUN 后 stock 值上升 → `remainingSeconds` 变正数 → **line 449 立即覆盖为正数** → 后续再次归零时 `prevRemaining > 0` 正确为真 → COUNTDOWN_ZERO 正确二次触发
- **第一性原理**：subagent 只读了 prev 判定一行，**漏读了 line 449 的覆盖写**
- **结论**：因果链不成立

#### BH2（_cumulativeOverflow 不清零） → ❌ Dismiss

- **原断言**：跨次运行保留累计溢出 → 用户改 capacity 后旧值误导
- **Spec 事实**（本 spec line 297-302 Dev Note "Overflow Tracking Design"）：
  > "cumulative overflow is a **monotonic** accumulator — it never decreases during a simulation session. The max approach gives the worst overshoot which is more useful for understanding system behavior."
- **关键事实**：跨次运行保留是**显式设计**而非缺陷；"与新 capacity 不一致" 是用户心智模型分歧（"会话最大溢出" vs "当前 capacity 下溢出"），spec 选择前者
- **第一性原理**：Blind Hunter 角色按设计不读 spec，但**主代理 triage 时漏做 spec 交叉验证**
- **结论**：误读 spec 设计意图

#### BH3 / AA1 / AA2 → Dismiss（spec 自评已认可 + 设计取舍）

#### BH4 / EC3 / EC4 → Dismiss（重复条目 + 已有实现守卫）

### 4.3 修正后 Triage

| 桶 | 数量 | 条目 |
|---|---:|---|
| patch | **0** | — |
| decision | **0** | — |
| defer | **2** | BH1, AA3 |
| dismiss | **5** | BH3, EC1, EC2, BH2, AA1/AA2 |
| failed_layers | **∅** | 三层均无遗漏阻塞性问题 |

---

## 5. 元审计核心结论

### 5.1 严重偏差等级

🟠 **中等偏严重（4/10）** — 5 条 dismissed finding 中 **3 条来自因果推理错误**而非真噪声

### 5.2 根本原因（4 类认知偏差）

| 偏差类型 | 表现 | 修正动作 |
|---|---|---|
| **Subagent 输出权威化** | 主代理把 subagent 报告当"权威结论"，未独立校验 | 每条 🔴 High finding 主代理亲自 `read_file` 验证因果链 |
| **格式驱动思考** | step-03 triage 只分桶不质疑真假 | triage 前增加 "factual gate" — 高严重度必须附源码引用 |
| **输出长度压力** | subagent 截断 → 让其"一句话总结" → 进一步压缩证据链 | 高严重度 finding 禁止压缩，必须保留 quoted code |
| **流程合规性 > 真相** | bmad-code-review 流程驱动产出，缺乏真实性 gate | skill 应增加 "finding 真实性验证" step |

### 5.3 Story 7.3 代码层最终结论

✅ **Clean review**
- Round 1 修复的 2 个 patch（COUNTDOWN_ZERO 守卫顺序 / Infinity 防御）已落地
- Round 2 经元审计修正后无新 patch 缺陷
- 2 条 defer 均已明确归属（见第 6 节）

---

## 6. Defer 归属决策

### 6.1 Round 2 新增 defer

| 条目 | 归属 | 原因 |
|---|---|---|
| **BH1** 自动暂停状态缺独立 CSS 类（ControlBar.ts:108-117） | **Epic 8 polish** | 纯 UX 增强，与 Epic 7 剩余 stories (7.5 perf/7.6 test/7.7 NFR/7.8 deploy) 范围不符；可与 round 1 紫色辉光叠色合并处理 |
| **AA3** commit 边界泄漏（git history） | **Epic 7 retrospective lessons-learned** | 流程教训非代码 defer，已发生不可逆，修复成本=0；将"retroactive split commit 必须按文件归属严格分块"写入 retro |

### 6.2 Round 1 defer 归属修正（旧 → 新）

| 条目 | 旧归属 | 新归属 | 原因 |
|---|---|---|---|
| 紫色辉光叠色（SceneRenderer.ts:654-677） | 建议 Story 7.7 (NFR) | **Epic 8 polish** | 纯 UX 非 NFR |
| `_prevCountdownMap` 删除清理（main.ts:417） | 建议 Story 7.4 | **✅ 已在 Story 7.4 修复**（main.ts:270） | 实施完成 |
| `breathingGlowStockIdsProvider` hot-reload 未置 null（main.ts:853） | 建议 Story 7.7 (NFR) | **Epic 8 polish** | HMR-only 无生产影响 |

---

## 7. Round 1 修复回顾（供完整性参考）

Round 1 (2026-06-07 早些时候) 已修复的 2 条 patch（不属于 round 2 范围，此处仅列出便于追溯）：

| 条目 | 位置 | 修复 |
|---|---|---|
| **COUNTDOWN_ZERO 多股票同 tick 竞态** | `main.ts:690-701` | `simEngine.state !== 'running'` 守卫前置到 `_autoPausedStockIds.add()` 之后，确保 AC7 多股票同 tick 全部入集合 |
| **Infinity stock.value 溢出退化** | `main.ts:671-686` | 在 `value > capacity` 判定前增加 `Number.isFinite(stock.value)` guard |

---

## 8. 文件改动汇总（本次 round 2 元审计闭环）

| 文件 | 改动类型 | 说明 |
|---|---|---|
| `_bmad-output/implementation-artifacts/7-3-stock-zero-behavior-auto-pause-and-breathing-glow.md` | 更新 | 替换 `### Review Findings — 补审 2026-06-07 (Round 2)` 整节为元审计修正版，每条 dismissed finding 附"元审计裁决"段（源码事实+第一性原理） |
| `_bmad-output/implementation-artifacts/deferred-work.md` | 更新 | Round 1 三条 7.3 defer 归属修正；新增 Round 2 两条 defer 归属（Epic 8 polish / Epic 7 retro） |
| `docs/code-reviews/story-7-3-code-review-round2-2026-06-07.md` | 新建 | 本报告 |

**无源代码改动**（元审计确认 round 2 报告的 patch finding 因果链不成立）

---

## 9. 流程教训（写入 Epic 7 retro 候选）

### L1: Subagent 输出必须经主代理事实验证

🔴 **High severity finding 不可被 triage 直接采信**。本次 EC1/EC2/BH2 三条 high finding 全部因果不成立，若直接执行 patch 将引入 dead code 与逻辑混淆。

**强制 gate**：每条 🔴 High → 主代理 `read_file` 完整源码 → 复述因果链 → 通过后才能进 patch/decision 桶。

### L2: bmad-code-review skill 缺乏真实性 step

当前 skill 流程：
1. subagent 三层并行 review
2. 主代理 triage 分桶
3. 写入 spec Review Findings

**缺失 step**：subagent 输出后、triage 前的"事实校验"step。建议向 skill 维护者反馈。

### L3: retroactive split commit 必须按文件归属严格分块

Story 7.3 改动跨 commit `2133278` (7.4) 和 `64830b5` (retroactive) 导致 review 范围失焦。

**约束**：每次 split commit 必须按 story 边界一次性完成，不可跨 commit 拆 main.ts vs 其他文件。

### L4: spec 自评要点必须进 triage 上下文

BH2 误读 spec 的 "monotonic by design" 段落直接说明该行为是显式设计。**Blind Hunter 不读 spec 是按设计，但主代理 triage 必须做 spec 交叉验证**。

---

## 10. 最终验收

| 验收项 | 结果 |
|---|---|
| Round 2 三层 review 已执行 | ✅ |
| 主代理元审计已完成（5 条高严重度 finding 全部源码校验） | ✅ |
| Spec Review Findings 节已更新为元审计修正版 | ✅ |
| deferred-work.md 归属已明确（5 条全部有 owner） | ✅ |
| 流程教训已记录（4 条 L1-L4） | ✅ |
| 源代码改动 | **0**（无新缺陷） |
| 测试套件 | ✅ 700/700 通过（round 1 后验证） |
| Story 7.3 最终状态 | 🟢 **done — 永久归档** |

---

**报告生成**: 2026-06-07
**下一步**: 继续 Epic 7 backlog（推荐 Story 7.5 perf monitor）
