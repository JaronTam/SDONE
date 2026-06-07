# Story 7.4 Review Memory — 2026-06-07

## 评审结论
- 模式: `bmad-code-review` full
- 状态: review（保持，待用户决定 commit 范围后处理 patch）
- 评级（按 triage）: **decision_needed × 1, patch × 4, defer × 2, dismiss × 3**

## Key Decisions
- **三层评审分工**：Blind Hunter（截断/部分）+ Acceptance Auditor + Edge Case Hunter（subagent 失败→手动）
- **mojibake 报警** → 二次验证为工具输出编码问题，**dismiss**（源文件 UTF-8 正常）
- **HMR `replaceWith(cloneNode(true))`** → 项目一致模式，事件监听器随旧节点 GC 回收，**有效，dismiss**
- **rewind 不推 history** → spec 明文设计意图，与 RESET 一致，**dismiss**
- **ControlBar.ts 改动违反"DO NOT modify"反模式** → 实为 Story 7.3 改动，反模式针对 7.4 上下文，**dismiss**

## 关键发现

### Decision Needed
- **F1 — diff 跨 3 story**：Story 7.3 标 done 但从未独立 commit，与 7.4 + 7.1 deferred items 混合，File List 缺 8 个文件。用户决定：(a) 接受混合、(b) 拆分 commit、(c) revert 7.3

### Patch
- **F2 — `checkpoint.test.ts` 是 mirror test**：20 个测试重新定义 `updateButtonsForState` helper，从未调用 main.ts 真实代码。测试通过 ≠ AC 正确。
- **F3 — `checkpoint.test.ts` 未 git add**（untracked，提交丢失）
- **F4 — `test-output.txt` 入 git**（应 .gitignore + `git rm --cached`）
- **F5 — Rewind 未取消活跃拖拽**：Ctrl+Z handler 已有 `inputManager.cancelDrag()`，rewind 应复用。一行修复。

### Defer
- **D1 — `structuredClone` 缺 try/catch** → 新 Story "序列化健壮性"
- **D2 — Story 7.3 提交流程问题** → 流程层决策后追溯

## Lessons Learned

### L1: Mirror Test 反模式 — 高风险
重新定义被测函数的 inline helper 是"安心剧场"。修复路径：导入真实代码 OR 改 E2E。**未来 ATDD 阶段应强制要求 `import { fn } from 'real-path'`**。

### L2: 跨 story diff 污染审查范围
sprint-status 上的 status 字段与 git log 中的 commit 必须 1:1 对应。状态标 `done` 但无 commit 的 story 会污染下一次 story 的 review 范围。**需在 sprint-status 中加 `commit_hash` 字段强制绑定。**

### L3: 未跟踪文件提交陷阱
新增的测试文件如未 `git add` 会被遗忘。**预提交 hook 应检查 `git status` 中带 `?? *.test.ts` 的文件并警告**。

### L4: Subagent 工具失败的降级路径
Edge Case Hunter subagent 多次返回空结果。降级方案：triage agent 手动执行第三层评审。本次手动执行发现 F5（rewind 活跃拖拽）。**未来应在工作流模板中显式记录 "subagent 失败 → fallback 到主 agent 手动" 的指令**。

### L5: 工具输出层编码错觉
Acceptance Auditor 报告"mojibake"实为终端输出层 UTF-8/GBK 误码。**核查路径：用 `Get-Content -Encoding UTF8` 验证源文件，而非依赖工具默认输出**。

## Files Touched (评审产物)
- 更新: `_bmad-output/implementation-artifacts/7-4-single-slot-save-point-and-time-rewind.md`（新增 `### Review Findings` 章节）
- 更新: `_bmad-output/implementation-artifacts/deferred-work.md`（追加 Story 7.4 defer 块）
- 新建: `memory/story-7-4-review-2026-06-07.md`（本文件）
- 未变更: `_bmad-output/implementation-artifacts/sprint-status.yaml`（仍为 `review`，等待 patch 后再 → done）

## 后续 Action（按优先级）
1. **用户决定 F1（commit 范围）** — 阻塞 7.5 启动
2. **修复 F2-F5** — 阻塞 7.4 转 done
3. **将 L2 (sprint-status 加 commit_hash) 升级为流程改进 story**