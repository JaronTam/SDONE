---
name: code-review-triage-checklist
description: Mandatory validation gates for every candidate patch finding during code review triage — prevents classification errors
metadata:
  type: reference
---

# 代码审查 Triage 校验清单

**来源**: Epic 6 Story 6.6/6.7 代码审查中重复出现的分类错误模式分析
**生效范围**: 所有 bmad-code-review 流程的 Step 3 (Triage) 阶段

## 背景

Epic 6 的 Story 6.6 和 6.7 代码审查中，审查者在 Triage 阶段使用启发式快速分拣（"代码不一致→patch"、"测试不完整→patch"、"缺少测试→patch"），导致分类错误率高达 50%。根因是跳过了三项关键校验。

## 强制校验门禁

每个候选 Patch 发现必须通过以下 **全部 3 项** 校验后才能进入 Patch 桶。任一失败则重分类：

### Gate 1: Spec 一致性检查

**问题**: 代码与 spec 原文是否一致？
**方法**: 回溯 spec 文件中对应的 Task/AC，逐字比对代码实现与 spec 规定。
**规则**:

- 代码 = spec → **Dismiss**（"不一致"不等于"错误"——相邻代码的风格差异不是 bug）
- 代码 ≠ spec → 继续 Gate 2
  **典型案例**: Story 6.7 CSS padding `6px` vs `4px`。Edge Case Hunter 发现与相邻按钮不一致，但 spec Task 1.2 明确规定 `6px`。代码与 spec 一致 → Dismiss。

### Gate 2: 测试职责边界检查

**问题**: 该测试验证的是被测单元的特有行为还是通用契约？
**方法**: 检查被质疑的测试覆盖的行为，是否已在更早/更通用的测试层中覆盖。
**规则**:

- 通用契约（如"点击按钮触发回调"）→ **Dismiss**（不应在配置级测试中重复验证）
- 特有行为（如"清除画布的中文文本为'清除确认'"）→ 继续 Gate 3
  **典型案例**: Story 6.7 ModalDialog 测试被要求验证 confirm/cancel 点击。但点击→回调是 ModalDialog 的通用契约，已在 Story 6.1 测试中覆盖。新测试正确覆盖了特有行为（中文文本配置）→ Dismiss。

### Gate 3: 测试可实现性检查

**问题**: 该测试在当前测试架构下是否可实现？
**方法**: 检查被测代码所在的架构层。编排层（main.ts）的模块级变量在组件隔离的单元测试环境中不可访问。
**规则**:

- 单元测试层可实现 → **Patch**
- 需要集成测试基础设施 → **Defer**（解锁条件：建立集成测试框架或提取纯函数）
  **典型案例**: Story 6.7 guard 路径测试。Guard 在 main.ts 编排层，依赖模块级 `currentState` 和 `modalDialog`。当前 jsdom 隔离环境无法访问 → Defer（解锁条件：提取 `isCanvasEmpty(state)` 纯函数）。

## 使用方式

在 bmad-code-review Step 3 (Triage) 中，对每个候选 Patch 发现执行：

```
1. 阅读原始发现描述
2. 执行 Gate 1 (spec 回溯) → 如失败，重分类为 Dismiss
3. 执行 Gate 2 (职责边界) → 如失败，重分类为 Dismiss
4. 执行 Gate 3 (可实现性) → 如失败，重分类为 Defer
5. 全部通过 → 确认为 Patch
```

## 关联记忆

- [[story-6-6-review-audit-2026-06-04]] — 首次观察到分类精度问题
- [[story-6-7-audit-2026-06-05]] — 确认模式并提取此 checklist
