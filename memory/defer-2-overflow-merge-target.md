---
name: defer-2-overflow-merge-target
description: CSS overflow-y defer from Story 6.2 merged into Story 6.6
metadata:
  type: project
---

# Defer #2: 右侧边栏 overflow-y → Story 6.6

**来源:** Story 6.2 代码审查独立审计 [[story-6-2-review-audit-2026-06-03]]

**问题:** `.layer-panel-right` 缺少 `overflow-y: auto`，窄视口下面板底部被裁剪且无滚动条。

**合并目标:** **Story 6.6 — Panel Pinning & Two-State Layout**

**选择理由:**
- 6-6 是 Epic 6 中唯一以面板布局为故事主题的 Story（AC 含 `<1024px` 窄视口约束）
- 修复是 1 行 CSS，不适合独立 Story
- 到达 6-6 时 6-3（倒计时面板）已追加，overflow 问题更具体可感

**不合并到:**
- 6-3（倒计时）：内容 Story，非布局 Story。但如果 6-3 实施者发现 overflow-y 影响倒计时面板设计，可作为跨 Story 提醒。
- 6-4（速率编辑）：不新增面板，不影响 overflow

**修复方案:** `.layer-panel-right { overflow-y: auto; }`（`layout.css`）

**Why:** 右侧边栏在 Epic 6 中随 6-2/6-3/6-4 持续追加面板，累积高度递增。6-6 是处理面板布局和视口约束的正确时机。
**How to apply:** 在 Story 6.6 spec 的 Tasks 中列入 overflow-y 修复；实施时在 layout.css 的 `.layer-panel-right` 规则中添加 `overflow-y: auto`。
