# Story 7.3 — Issues Found During Story 7.4 Code Review

**Date**: 2026-06-08  
**Discovery Context**: 本次 Story 7.4 的 `bmad-code-review` 流程中，因 7.3 实现混入 7.4 working copy 一并出现在 git diff 中，附带发现以下与 Story 7.3 相关的问题。  
**严重程度分级**: 🔴 High / 🟡 Med / ⚪ Low  
**整理人**: AI agent (cline)  
**关联 review 报告**: `docs/code-reviews/story-7-4-code-review-2026-06-07.md`

---

## ⚠ 前置声明

**本次 7.4 review 的范围是 Story 7.4**，未对 Story 7.3 的实现质量做完整三层审查（Blind Hunter / Acceptance Auditor / Edge Case Hunter）。下列问题是**流程层 + 治理层**的发现，**不包含 7.3 代码层 AC 完整性审查**。如需对 7.3 做正式代码审查，应单独跑一次 `bmad-code-review`。

7.3 自身的 spec 中已有一次 review（2026-06-07，见 spec 文件 §Review Findings 节，5 项 finding：2 fixed + 3 deferred），那是 7.3 dev 完成后的内置 review，**不在本次发现范围内**。

---

## 📋 本次发现的 7.3 问题清单（5 项）

| ID | 类型 | 严重度 | 标题 | 状态 |
|---|---|---|---|---|
| **I1** | Process | 🔴 High | Sprint status 标 `done` 但 git log 无独立 commit | ✅ 已补救（commit `64830b5` 追溯提交） |
| **I2** | Process | 🟡 Med | 7.3 实现混入 7.4 working copy，跨故事污染 | ✅ 已补救（commit 拆分隔离） |
| **I3** | Process | 🟡 Med | 7.3 完成时间错误归因风险 | ✅ 已补救（commit message 标 `(retroactive)` 显式声明） |
| **I4** | Audit Gap | 🟡 Med | 7.3 的代码实现未在本次 7.4 review 中被独立审查 | 🟡 建议后续补 review |
| **I5** | Test Quality | ⚪ Low | 7.3 测试统计存疑：spec 完成时声明 700 全绿，但实际包含 `checkpoint.test.ts` 的 20 个 mirror tests | ✅ 已被 7.4 F2 间接修复（删除假绿后 707 全绿） |

---

## 🔍 详细分析

### I1 — Sprint Status / Git Log 不一致（🔴 High → ✅ 补救）

**现象**：
- `_bmad-output/planning-artifacts/sprint-status.yaml` 中 Story 7.3 标 `done`
- `git log --oneline` 在本次 review 时（baseline `cc3eaa5 story 7.2 completed`）显示**从未存在过 7.3 的独立 commit**
- 7.3 改动的 8 个源文件（SimulationEngine / SceneRenderer / ControlBar / AnalyticsPanel / analytics-panel.css 等）全部以 unstaged 状态混在 7.4 的 working copy 中

**根因推测**：
- 7.3 dev agent 完成实现后，**未执行 `git commit`** 就切换到 7.4 开始 dev
- sprint-status 被手动/自动改为 done，但 git index 与之脱节
- 或：commit 操作失败/被中断，没有人事后检查

**影响**：
1. `git log` 失去 7.3 的"完成边界"，无法 `git checkout 7.3-completion-point`
2. `git bisect` 在 7.3 范围内无法定位（与 7.4 改动混在一起）
3. CI/CD 若依赖 commit-based 触发，7.3 完成事件丢失
4. 团队/审计层面 "done 但无证据" 的状态不可信

**补救**（本次 7.4 review 已执行）：
```bash
git add sdone/src/simulation/SimulationEngine.ts \
        sdone/src/simulation/SimulationEngine.test.ts \
        sdone/src/ui/panels/ControlBar.ts \
        sdone/src/ui/panels/AnalyticsPanel.ts \
        sdone/src/ui/panels/AnalyticsPanel.test.ts \
        sdone/src/ui/panels/styles/analytics-panel.css \
        sdone/src/canvas/SceneRenderer.ts \
        sdone/src/canvas/__tests__/SceneRenderer.test.ts
git commit -m "Story 7.3 — Stock zero behavior, auto-pause & breathing glow (retroactive)"
# 结果: commit 64830b5, 8 files, +483/-9
```

**后续建议**：
1. **流程改进**：dev agent 完成 story 时必须有"commit gate"。建议在 `bmad-dev-story` skill 末尾加一个"verify git log shows story commit"检查
2. **sprint-status 改进**：将 `done` 状态与一个 `commit_sha` 字段关联，强制对账
3. **回填风险**：64830b5 的 commit 时间戳是 2026-06-08，与实际完成时间（2026-06-07 或更早）不符。**这是 retroactive 的固有副作用，不可消除**，已在 commit message 中显式标记 `(retroactive)`

---

### I2 — 跨故事 Working Copy 污染（🟡 Med → ✅ 补救）

**现象**：
- 本次 `git diff HEAD --name-only` 同时包含 Story 7.4（spec 声明）+ Story 7.3（未提交）+ Story 7.1 deferred（SceneRenderer 部分）三层范围
- 三层混在一个 working tree 里，**Code Review 范围归属判定** 高度模糊

**影响**：
1. Review 作者第一反应误判范围（"为什么 ControlBar.ts 改了这么多？7.4 spec 没说啊"）
2. 任何一层改动出 bug，回滚操作必然牵连其他两层
3. 增加 review cognitive load —— 必须先做"考古"（哪行属于哪个 story）才能开始 review

**根因**：与 I1 同源——7.3 没及时 commit，导致后续故事的 working copy 必然包含上一个故事的所有改动。

**补救**：commit 拆分方案 b 已执行，5 个 atomic commit 把三层完全隔离（见 7.4 review 报告 F1 finding）。

**后续建议**：
1. **每个 story 完成后立即 commit**（即使 review 还没开始）
2. **多个 deferred items 跨故事时**：在 spec 的 Tasks 节明确标注 "deferred from story X.Y"，并要求 commit message 引用来源

---

### I3 — Story 7.3 完成时间错误归因风险（🟡 Med → ✅ 补救）

**现象**：
- 因 I1 的 retroactive commit，git 视角里 7.3 的"完成时刻"被记为 `2026-06-08 00:25`（commit `64830b5` 时间戳）
- 但 spec 内 `Validated: 2026-06-07` 和 sprint-status 的 done 时间可能更早
- 三个时间点（实际完成 / sprint-status 标记 / git commit）不一致

**影响**：
- Retrospective、velocity 计算、cycle time 度量全部失准
- 若有 SLA / 合规审计依赖 commit 时间，会产生错误的"7.3 是 6 月 8 日完成的"结论

**补救**：commit message 显式标 `(retroactive)`，配合本文档作为时间戳异常的官方说明，未来任何 retro/audit 都能溯源到真实情况。

**后续建议**：
1. retro 工具应同时读取 sprint-status 的 done 时间戳（而不是只看 git commit time）
2. 引入 `git commit --date="2026-06-07T..."` 选项做精确时间回填？**不推荐** —— 篡改时间戳本身是更大的诚实性问题，`(retroactive)` 显式标记是更好的方案

---

### I4 — 7.3 实施未经过本次 review 独立审查（🟡 Med → 🟡 建议后续）

**现象**：
- 本次 `bmad-code-review` 的目标是 Story 7.4
- 虽然 7.3 的代码改动出现在同一份 git diff 里，但三层 review（Blind Hunter / Acceptance Auditor / Edge Case Hunter）**全部聚焦在 7.4 的 spec & code**
- 7.3 的 8 个文件改动**未经过独立的 AC 比对 + 边界穷举**

**已有的 7.3 review**（仅供参考，非本次范围）：
- spec 内置 review 节列出 5 项 finding：
  - ✅ COUNTDOWN_ZERO 多股票竞态（fixed）
  - ✅ Infinity 退化（fixed）
  - ⚪ 蓝紫色混合（deferred）
  - ⚪ `_prevCountdownMap` 删除清理（deferred，pre-existing）
  - ⚪ `breathingGlowStockIdsProvider` hot-reload null（deferred）

**未审查领域**（本次未做，列入后续）：
1. **Blind Hunter 视角**：7.3 改动的 5 个 `BREATHING_GLOW_*` 常量、`_cumulativeOverflow` 的命名/语义是否清晰？
2. **Acceptance Auditor 视角**：AC1–AC8 全部 8 条是否每条都有对应 test / code 痕迹？特别 AC5（rAF 不冻结）和 AC8（manual pause 不显示 auto-pause 文字）是否有真实覆盖？
3. **Edge Case Hunter 视角**：
   - 当 stock value 在一个 tick 内既超过 capacity 又跌回 < capacity（数值震荡），`_cumulativeOverflow` 的 max-tracking 是否正确？
   - `breathingGlowStartTime` 在测试中是模块级常量，多个 SceneRenderer 实例共享同一 start time 是否有副作用？
   - `_autoPausedStockIds.add(payload.stockId)` 后立刻 `updateAutoPauseStatus()` 调用两次（spec Task 1.1 模式），是否真的必要？

**建议**：
- 若有人力，对 Story 7.3 单独跑一次 `bmad-code-review` skill
- 否则记录本项为已知技术债，写入 `memory/code-review-triage-checklist.md`

---

### I5 — 7.3 测试统计存疑（⚪ Low → ✅ 被 F2 间接修复）

**现象**：
- Story 7.3 的 Completion Notes 声明 "全绿（700 / 700 测试通过，含本故事新激活的 24 个 7.3 测试）"
- 但本次 7.4 review 在 baseline 跑测试时是 728 个（含 20 个 `checkpoint.test.ts` mirror tests + 1 个 7.4 deferred edge test）
- 728 − 21 (7.4 引入：20 mirror + 1 deferred edge) = 707（7.4 修复 F2 后的实测数）
- 即 7.3 完成时声明的 "700" 与本次 baseline 推算的 "707" 相差 7，差异来源可能是：
  1. 7.3 完成后到本次 review 期间，有其他小改动新增 7 个测试（最可能）
  2. 7.3 statement 中的 "700" 是约数，非精确值（可能性较低）
  3. 7.3 完成后到 baseline 切换期间有非 7.3 的 7 个测试漂移

**影响**：
- 单独看 7.3 的"全绿声明"无法精确复现（无 commit 可 checkout 回去验证）
- 这是 I1 的连带后果——没有 commit 就没有可验证的"7.3 完成快照"

**补救**：
- 7.4 F2 删除 20 个 mirror tests 后，整库恢复到 707 个真测试 0 假绿
- 7.3 实际新增的 24 个测试（已经在 spec 中列出，分布在 4 个测试文件）依然有效，本次 vitest 实测全绿

**后续建议**：
- 未来 dev agent 完成 story 时，Completion Notes 应记录精确测试数 + commit SHA，便于事后审计

---

## 🎯 全局总结

| 维度 | 评估 |
|---|---|
| **7.3 流程合规性** | 🔴 不合规（无 commit / sprint-status 脱节），已通过 retroactive commit + 本文档补救 |
| **7.3 代码质量** | 🟡 未知（本次未独立 review，spec 内置 review 显示 2 fixed + 3 deferred，质量基线尚可） |
| **7.3 功能完整性** | 🟢 spec 标 done + 707 测试全绿（间接证据） |
| **7.3 git 可追溯性** | 🟢 已补救（commit `64830b5`，8 files, +483/-9） |
| **是否影响 7.4 闭环** | 🟢 不影响（7.4 的 5 项 finding 全部 fixed，独立闭环） |
| **是否需要单独的 7.3 review** | 🟡 建议——但优先级低于推进 7.5 |

---

## 📦 建议行动项

| # | 行动 | 优先级 | 责任方 |
|---|---|---|---|
| 1 | 推送 `git push origin main`（含 7.3 的 retroactive commit） | 🔴 立即 | 用户 |
| 2 | 更新 sprint-status.yaml：为 7.3 / 7.4 添加 `commit_sha` 字段 | 🟡 短期 | 用户/工具 |
| 3 | 在 `bmad-dev-story` skill 增加"commit gate"检查 | 🟡 短期 | bmad-customize |
| 4 | 为 Story 7.3 单独跑 `bmad-code-review` 补审 | ⚪ 可选 | 后续 sprint |
| 5 | 在 `memory/code-review-triage-checklist.md` 登记 I4 为已知技术债 | ⚪ 可选 | 本次/后续 |

---

## 🔗 相关文件

| 文件 | 用途 |
|---|---|
| `_bmad-output/implementation-artifacts/7-3-stock-zero-behavior-auto-pause-and-breathing-glow.md` | 7.3 spec + Dev Agent Record + 内置 review |
| `docs/code-reviews/story-7-4-code-review-2026-06-07.md` | 7.4 正式 review 报告（含 F1 commit 拆分策略） |
| `memory/story-7-4-review-2026-06-07.md` | 7.4 review 一阶段记录 |
| `memory/story-7-4-review-AUDIT-2026-06-07.md` | 7.4 review 二阶段深度自审计 |
| **`memory/story-7-3-issues-found-during-7-4-review-2026-06-08.md`** | **本文档** |
