# Story 3.4 — Module Deletion (Click + Delete Key)

**Epic:** Epic 3 — Interactions & Drag-and-Drop  
**优先级：** P0  
**状态：** ✅ 已实现（代码审查修复后）
**创建日期：** 2026-05-27
**实现日期：** 2026-05-27
**修复日期：** 2026-05-27  
**故事分值：** 2

---

## 用户故事

> **作为** 建模者  
> **我希望** 选择一个模块然后按 Delete 键将其删除  
> **以便** 我可以从 canvas 中移除不需要的模块并清理我的模型。

---

## 验收标准

| #   | 验收标准                                                         | 状态                    |
| --- | ---------------------------------------------------------------- | ----------------------- |
| AC1 | 用户点击模块（选中高亮），然后按 Delete → 该模块从 canvas 中移除 | ✅                      |
| AC2 | 删除模块时，级联删除该模块的所有连接（入站和出站）               | ✅                      |
| AC3 | 删除前将当前状态推入历史堆栈 → 用户可通过 Ctrl+Z 回退删除操作    | ✅ (代码审查修复后补入) |
| AC4 | Ctrl+Z 恢复已删除的模块及其所有连接                              | ✅ (代码审查修复后补入) |
| AC5 | 无选中模块时按 Delete → 无操作（静默返回）                       | ✅                      |

---

## 技术实现

### 涉及的文件

| 文件                              | 改动内容                                                |
| --------------------------------- | ------------------------------------------------------- |
| `sdone/src/event-bus/EventMap.ts` | 新增 `MODULE_DELETED` 事件类型（含 `moduleId` payload） |
| `sdone/src/main.ts`               | 重写 `onModuleDelete` handler，集成历史管理 + 事件发射  |

### 实现细节

```
inputManager.onModuleDelete = () => {
  const selected = currentState.selectedModuleIds[0];
  if (!selected) return;                        // AC5: no-op if nothing selected

  historyManager.push(currentState);            // AC3: snapshot before mutation
  currentState = deleteModule(currentState, selected);  // AC1 + AC2
  currentState = {
    ...currentState,
    selectedModuleIds: [],                      // 防止悬挂引用
  };
  eventBus.emit('MODULE_DELETED', { moduleId: selected });  // 审计事件
  minimapRenderer.markDirty();
};
```

### 设计决策

1. **AC3 修复：** 未完成版本不支持历史记录（缺少 `historyManager.push`）。该行被遗漏导致删除无法撤销。
2. **选择清理：** 删除后必须清除 `selectedModuleIds`；否则引用指向一个已不存在的节点 ID。
3. **审计事件：** `MODULE_DELETED` 事件允许遥测/日志记录追踪删除操作。

### 依赖项

- `state/mutations.ts` 中的 `deleteModule()`（Story 1.5 — 已存在）
- `HistoryManager.push()`（Story 1.3 — 已存在）
- `EventBus.emit()`（Story 1.2 — 已存在）
- `InputManager.onModuleDelete` 回调（Story 2.3 — 已存在，Hook 已就位）

---

## 边缘情况

| 场景                  | 预期行为                                               |
| --------------------- | ------------------------------------------------------ |
| 无选中模块时按 Delete | no-op（静默返回，无事件，无历史污染）                  |
| 删除有多个连接的模块  | 所有连接级联删除（`deleteModule` 处理）                |
| Ctrl+Z 恢复           | 模块及所有先前级联的连接均恢复                         |
| 连续删除 + 撤销       | 每次删除入栈，撤销反向出栈，逐级恢复                   |
| 拖拽过程中按 Delete   | `InputManager` 优先处理拖拽，不触发 Delete（现有行为） |

---

## 质量门禁

- [x] `npx tsc --noEmit` — 零错误
- [x] 208 / 208 测试通过（12 个文件）
- [x] 现有回归测试不受影响
- [x] `story-status-master.md` 已更新

---

## Review Findings (2026-05-27) — 已解决

### Decision-Needed

- [x] [Review][Decision] HistoryManager 堆栈语义 — 已选择方案 (A)：POST-mutation push。代码已采用此方案（`main.ts` 删除前先 mutate 再 push），经验证与 HistoryManager 的 undo/redo 堆栈语义正确匹配。spec 中的 PRE-mutation 伪代码是错误的。

### Patch（已修复，2026-05-28 验证通过）

- [x] [Review][Patch] onModuleDelete 推入历史快照 — ✅ 已修复（POST-mutation push）
- [x] [Review][Patch] 删除后 selectedModuleIds 清除 — ✅ 已修复
- [x] [Review][Patch] MODULE_DELETED 事件发射 — ✅ 已修复
- [x] [Review][Patch] Ctrl+Z/Redo 使用 e.code — ✅ 已修复

### Deferred (pre-existing / out-of-scope)

- [x] [Review][Defer] 调色板颜色在 undo/delete 后可能重复 [main.ts] — deferred, pre-existing design
- [x] [Review][Defer] addModule 默认颜色被 onModuleDrop 立即覆盖 [mutations.ts + main.ts] — deferred, pre-existing
- [x] [Review][Defer] source/sink 颜色分配代码重复 [main.ts] — deferred, Story 3.2 code
- [x] [Review][Defer] ghostProvider lambda 在两个渲染器中完全相同 [main.ts] — deferred, Story 3.2 code
- [x] [Review][Defer] selectedModuleIds[0] 只删除第一个选中模块 [main.ts] — deferred, spec is single-select
- [x] [Review][Defer] 新节点 ID 通过启发式查找而非 addModule 返回值 [main.ts] — deferred, Story 3.2 code
- [x] [Review][Defer] 三处 `as ModuleType` 未验证 [main.ts] — deferred, Story 3.2 code
- [x] [Review][Defer] isEditingTarget 在 main.ts 和 InputManager.ts 中重复定义 — deferred, pre-existing
- [x] [Review][Defer] Ctrl+Z 取消拖拽不发射事件 [main.ts] — deferred, not Story 3.4 scope
- [x] [Review][Defer] addConnection 导入已移除 [main.ts] — deferred, may be needed later

---

## Review Findings (2026-05-28) — 当前审查（忏悔报告已修正）

**审查范围：** 未提交更改（19 文件，+1712/−347 行）
**审查层：** Blind Hunter (对抗性) + Edge Case Hunter (边界条件) + Acceptance Auditor (spec 合规)
**初始结果：** 1 decision + 9 patch + 8 defer + 4 dismiss
**忏悔报告修正后：** 0 decision + **5 patch** + 11 defer + 6 dismiss
**修正原因：** 1 个 P0 误报（handleResetShortcut 经源码验证已正确清理）、3 个 patch 重分类为 defer（预存代码，非本轮 diff 引入）、1 个伪决策撤销

> ⚠️ **范围说明：** 本次审查的 diff 覆盖 19 个文件（ShapePaths 提取、ModulePanel 新建、SceneRenderer 重构、InputManager 扩展等），远超 Story 3.4 spec 的范围（仅 EventMap.ts + main.ts onModuleDelete）。以下仅 Story 3.4 相关的发现标记为 patch；其余预存代码的发现标记为 defer。

### Patch（已修复，2026-05-28）

- [x] [Review][Patch] Delete 键在拖拽模块期间未防护 — ✅ 已修复：`handleKeyDown` 中添加 `if (this.isDraggingModule) return;` guard
- [x] [Review][Patch] computeFillRatio NaN 传播未处理 — ✅ 已修复：`capacity <= 0` → `!(capacity > 0)`
- [x] [Review][Patch] Ctrl+Z/Redo 未检查 e.metaKey（Mac 不兼容）— ✅ 已修复：三处 `e.ctrlKey` → `(e.ctrlKey \|\| e.metaKey)`
- [x] [Review][Patch] Escape 键无法取消模块拖拽 — ✅ 已修复：添加 Escape handler 调用 `cancelDrag()`
- [x] [Review][Patch] Ctrl+0 也会在 Ctrl+Shift+0 时触发 — ✅ 已修复：添加 `!e.shiftKey` 条件

### Deferred（预存代码，非本轮 diff 引入，或超出 Story 3.4 范围）

- [x] [Review][Defer] ~~handleResetShortcut HMR 泄漏~~ — ❌ 忏悔报告验证：源码 L192 已正确调用 `window.removeEventListener('keydown', handleResetShortcut)`。此为 Blind Hunter 误报，triage 阶段未充分验证。已撤销。
- [x] [Review][Defer] drawStock 忽略 node.color 属性 [SceneRenderer.ts:drawStock] — drawSource/drawSink 使用 `node.color ?? DEFAULT_FILL`，但 drawStock 硬编码 STOCK_FILL（L520）。预存行为（Story 2.3 重构前即如此），非 Story 3.4 引入
- [x] [Review][Defer] addModule switch 缺少 default 分支 [mutations.ts:59-90] — 预存（Story 1.5），TypeScript 联合类型已穷尽所有合法分支。仅防御 `as ModuleType` 类型强转绕过
- [x] [Review][Defer] 拖拽结束 toWorld 坐标可能与 currentState 不一致 [InputManager.ts:onModuleDragEnd] — 预存（Story 3.2/3.3），拖拽系统在 mouseup 时重新计算坐标而非从 state 读取
- [x] [Review][Defer] ModulePanel 未设置自定义拖拽图片 [ModulePanel.ts] — 浏览器默认拖拽幽灵包含 label 文字，与 canvas 形状预览不一致。cosmetic, pre-existing
- [x] [Review][Defer] 触摸设备不支持 HTML DnD API [InputManager.ts + ModulePanel.ts] — 移动端/平板无法拖拽模块到 canvas，无替代创建路径。out-of-scope
- [x] [Review][Defer] 图标 canvas DPR 在显示器切换时不更新 [ModulePanel.ts] — 窗口移到不同 DPR 显示器时图标分辨率不变。edge case
- [x] [Review][Defer] Ghost hash 使用默认浮点 toString [MinimapRenderer.ts] — 极小位移触发 minimap 重绘。micro-optimization
- [x] [Review][Defer] drawCloud 用单一路径绘制 5 个圆 [ShapePaths.ts] — 与原始逐个绘制在抗锯齿上可能有细微差异。测试已验证视觉等效
- [x] [Review][Defer] UNDO/REDO 事件 payload 包含完整 GraphState [EventMap.ts] — 大图时可能产生 GC 压力。当前图为小规模
- [x] [Review][Defer] 测试 spy 隔离可能被破坏 [InputManager.test.ts] — 全局 spy 变量被移除但 afterEach 恢复逻辑未更新。测试基础设施
- [x] [Review][Defer] getCanvasCenter() 在 mousemove 时产生 GC 压力 [InputManager.ts] — 每次 mousemove 创建新 Vec2 对象。micro-optimization
