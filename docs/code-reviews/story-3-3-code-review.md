# SDONE Story 3.3 代码审查报告

**日期：** 2026-05-26  
**审查范围：** Story 3.3 — Module Re-positioning (Drag to Move) on Canvas，聚焦 `InputManager.ts`、`InputManager.test.ts`、`main.ts` 中的 `onModuleDragStart`、undo/redo 快捷键、window blur 安全变更  
**审查层：** Blind Hunter（逻辑/API 错误）、Edge Case Hunter（边界条件）、Acceptance Auditor（需求完整性）  
**编译状态：** `npx tsc --noEmit` → **3 个错误**（全部在 Story 3.3 范围内）

---

## 整体评估：🔴 需修复后合并

- **P0 问题：** 4 个（3 个编译错误 + 1 个数据丢失 bug）
- **P1 问题：** 1 个（并发状态交互 — Ctrl+Z 与活动拖拽）
- **P2 问题：** 2 个（参数命名不一致、测试覆盖缺口）
- **已验证正确：** 7 项核心功能

---

## 🔴 P0 — 关键问题

### 1. `MODULE_MOVED` 不在 EventMap 中（编译错误）

- **文件：** `src/main.ts:110`
- **严重级别：** P0（阻止编译）
- **描述：** `eventBus.emit('MODULE_MOVED', ...)` 使用了未在 `EventMap` 接口中定义的键名。现有事件是 `DRAG_END: { moduleId: string; fromPosition: Vec2; toPosition: Vec2 }`，但 payload 结构不匹配（代码使用 `from` 而非 `fromPosition`，且多了一个 `type` 字段）。
- **修复方案：** 在 `src/event-bus/EventMap.ts` 中添加：
```typescript
MODULE_MOVED: { type: string; moduleId: string; from: Vec2; to: Vec2 };
```
或改用现有的 `DRAG_END` 事件（需调整 payload 结构以匹配）。

### 2. `UNDO` 不在 EventMap 中（编译错误）

- **文件：** `src/main.ts:146`
- **严重级别：** P0（阻止编译）
- **描述：** `eventBus.emit('UNDO', ...)` 使用了未定义的键名。
- **修复方案：** 在 `EventMap` 中添加：
```typescript
UNDO: { fromState: GraphState; toState: GraphState };
```

### 3. `REDO` 不在 EventMap 中（编译错误）

- **文件：** `src/main.ts:162`
- **严重级别：** P0（阻止编译）
- **描述：** `eventBus.emit('REDO', ...)` 使用了未定义的键名。
- **修复方案：** 在 `EventMap` 中添加：
```typescript
REDO: { fromState: GraphState; toState: GraphState };
```

### 4. `HistoryManager.push()` 在 `onModuleDragStart` 中过早调用 — 无状态变更时销毁 redo 历史

- **文件：** `src/main.ts:94`（`onModuleDragStart` handler）
- **严重级别：** P0（数据丢失）
- **描述：** `onModuleDragStart` 在用户移动 ≥4px 时触发，此时 `currentState` 尚未发生任何变更（`onModuleMove` 在同一帧内但 `push` 先执行）。`push()` 的副作用是 `redoStack.length = 0`——无条件清空所有 redo 历史。用户仅仅"尝试拖动"就永久丢失了 redo 能力。

  **可重现路径：**
  ```
  1. 添加模块 A → push(s0 → s1)          // undoStack: [s0, s1]
  2. 添加模块 B → push(s0 → s1 → s2)     // undoStack: [s0, s1, s2]
  3. Ctrl+Z    → undo(): s2→redoStack     // undoStack: [s0, s1], redoStack: [s2]
  4. 点击模块 A，拖拽 5px                 // onModuleDragStart → push(s1)
                                            // → redoStack.length = 0 → s2 永久丢失
  5. 释放鼠标（未实际移动）                // 模块位置不变，但 redo 已不可恢复
  ```

- **根因：** `push()` 的"new branch"语义要求仅在实际发生状态变更时调用。拖拽起始是一个 gesture 意图，不是变更。所有可观测的状态修改发生在 `onModuleMove` 中。
- **修复方案：** 将 `historyManager.push()` 从 `onModuleDragStart` 移至 `onModuleDragEnd`，并仅在 `fromWorld ≠ toWorld` 时调用 `push()`（即确认模块确实被移动了）。

---

## 🟡 P1 — 高优先级

### 5. Ctrl+Z 在活动拖拽期间导致状态不一致

- **文件：** `src/main.ts:144-150`（undo handler）× `src/input/InputManager.ts:332-335`（mousemove handler）
- **严重级别：** P1
- **描述：** 当用户正在拖拽模块（`isDraggingModule === true`）时按下 Ctrl+Z：
  1. `currentState` 被替换为 `prevState`（undo 后的状态）
  2. 但 `InputManager.dragModuleId` 和 `dragModuleWorldStart` 仍然持旧状态的引用
  3. 下一次 `mousemove` 事件中，`moveModule` 内部会因 `if (!nodes[moduleId])` 守卫静默返回（不崩溃），但 `dragModuleWorldStart` 是过时的坐标
  4. `mouseup` 时 `onModuleDragEnd` 的 `fromWorld` 参数是过时坐标

  **不崩溃**（`moveModule` 有守卫），但 event payload 数据不一致。
- **修复方案：** 在 undo/redo handler 中，执行状态替换后检查并取消活动拖拽：
```typescript
if (inputManager.isDraggingModule) {
  // 需要 InputManager 添加 cancelDrag() 方法
  // 重置 isDraggingModule、dragModuleId、dragModuleWorldStart
}
```

---

## 🔵 P2 — 建议修复

### 6. `onModuleDragEnd` 参数命名不一致

- **文件：** `src/main.ts:108`
- **严重级别：** P2
- **描述：** 参数以 `_` 前缀命名（TypeScript 约定表示"有意未使用"），但 `_moduleId` 实际被使用了：
```typescript
inputManager.onModuleDragEnd = (_moduleId: string, _fromWorld: ..., _toWorld: ...) => {
  eventBus.emit('MODULE_MOVED', { type: 'move', moduleId: _moduleId, from: _fromWorld, to: _toWorld });
};
```
- **修复方案：** 移除前缀下划线，改为 `moduleId`、`fromWorld`、`toWorld`。

### 7. 测试未覆盖关键边缘场景

- **文件：** `src/input/InputManager.test.ts`
- **严重级别：** P2
- **描述：** 新增的 `onModuleDragStart` 测试（第 415-490 行）未覆盖：
  - `nodesProvider` 返回 `null` 时的 `onModuleDragStart` 行为（`dragModuleWorldStart` 为 null → 静默无操作）
  - `onModuleDragEnd` 的坐标精度（`fromWorld` 缓存值 vs `toWorld` 实时转换，viewport 变化时可能产生微小偏差）
  - 快速连续拖拽（释放后立即再次拖拽同一模块）——状态清理的时序竞争

---

## ✅ 已验证正确

| 审查点 | 结论 |
|---|---|
| `onModuleDragStart` 阈值交叉逻辑 (`dist >= 4px`) | 只在首次超过阈值时点燃，后续移动不再触发 ✅ |
| `nodesProvider` 为空时防护 | `dragModuleId` 仅在 node lookup 成功时赋值 ✅ |
| 点击非模块 → 不触发拖拽起始 | `mouseDownModuleId` 为 `null` 时跳过整个逻辑 ✅ |
| 指针抬起后 `dragModuleId = null` 清理 | ✅ |
| `HistoryManager.undo()` 返回深拷贝 | 调用方安全 ✅ |
| `HistoryManager.redo()` 返回深拷贝 | 调用方安全 ✅ |
| `isEditingTarget` 守卫（Ctrl+Z 时跳过文本输入） | ✅ |

---

## 总结

| 优先级 | 数量 | 描述 |
|---|---|---|
| P0 | 4 | 3 个编译错误（EventMap 缺失事件类型）+ 1 个数据丢失（push 过早清空 redo） |
| P1 | 1 | Ctrl+Z 与活动拖拽的并发状态不一致 |
| P2 | 2 | 参数命名 + 测试覆盖缺口 |

**核心修复路径：**
1. 在 `EventMap.ts` 中添加 `MODULE_MOVED`、`UNDO`、`REDO` 三个事件类型（恢复编译）
2. 将 `historyManager.push()` 从 `onModuleDragStart` 移至 `onModuleDragEnd`，加位移判断守卫
3. 在 undo/redo handler 中添加活动拖拽取消逻辑