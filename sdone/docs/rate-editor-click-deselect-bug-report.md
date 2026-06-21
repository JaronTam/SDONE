# SDONE 速率编辑器点击跳出故障修复报告

**日期**: 2026-06-10  
**发现者**: 手动测试  
**范围**: 速率编辑器面板（右侧栏 RateEditorPanel）交互

---

## 1. 问题描述

用户在右侧栏的速率编辑器中点击输入框时：

- ✗ 点击输入框后编辑表单立即消失（跳回空状态）
- ✗ 无法在输入框中修改速率值
- ✗ 表现如同点击了空白画布触发了取消选中

## 2. 涉及的代码位置

| 文件                                       | 函数/字段                                   | 作用                                                  |
| ------------------------------------------ | ------------------------------------------- | ----------------------------------------------------- |
| `src/input/InputManager.ts:116-121`        | `mouseDownModuleId`, `mouseDownInEdgeZone`  | 点击-拖拽区分状态                                     |
| `src/input/InputManager.ts:286`            | `canvas.addEventListener('mousedown', ...)` | 仅在 canvas 上注册                                    |
| `src/input/InputManager.ts:288`            | `window.addEventListener('mouseup', ...)`   | **在 window 上注册**                                  |
| `src/input/InputManager.ts:962-1055`       | `handleMouseUp` (button 0 分支)             | 点击/拖拽释放逻辑                                     |
| `src/main.ts:173-202`                      | `inputManager.onModuleSelect`               | 反选回调 → 调用 `rateEditorPanel.setConnection(null)` |
| `src/ui/panels/RateEditorPanel.ts:188-226` | `setConnection(null)`                       | 隐藏编辑表单，显示空状态                              |

## 3. 根本原因分析

### 3.1 事件传播路径

`InputManager` 的 `mousedown` 仅在 canvas 上注册，但 `mouseup` 注册在全局 `window` 上。当用户在右侧栏点击输入框时：

```
用户点击速率编辑器输入框
  → mousedown 在右侧栏 input 上（InputManager.handleMouseDown 未触发）
    → _mouseDownOnCanvas: 未设置
    → mouseDownModuleId: null (未变)
  → mouseup 在右侧栏 input 上 → 冒泡到 window
    → InputManager.handleMouseUp 触发
    → e.button === 0 ✓
    → isDraggingModule === false ✓
    → mouseDownModuleId === null ✓（进入 else 分支）
    → hitTestConnection(screenPos) → null（鼠标在右侧栏，不命中任何连线）
    → hitTest(screenPos) → null（鼠标在右侧栏，不命中任何模块）
    → this.onModuleSelect?.(null) ← 误判为"点击空白画布"！
```

### 3.2 连锁反应

```
onModuleSelect(null)
  → rateEditorPanel.setConnection(null)
    → this._formEl.style.display = 'none'  // 编辑表单隐藏
    → this._emptyEl.style.display = ''     // 空状态显示
  → 输入框随表单一起消失，用户无法编辑
```

### 3.3 为什么只影响速率编辑器

其他 UI 元素（模块面板 button、控制栏 button、小地图等）不会因为 `onModuleSelect(null)` 调用而受到影响——它们不依赖选中状态。速率编辑器是唯一依赖连线选中状态来显示/隐藏的面板。

## 4. 修复方案

在 `InputManager` 中添加 `_mouseDownOnCanvas` 标记位，确保 `handleMouseUp` 只处理**源于 canvas 的点击**。

```typescript
// 新增字段
private _mouseDownOnCanvas = false;

// handleMouseDown: 设置标记
if (e.button === 0) {
  this._mouseDownOnCanvas = true;
  // ...
}

// handleMouseUp: 守卫 — 跳过非 canvas 发起的点击
if (e.button === 0) {
  if (!this._mouseDownOnCanvas) return;  // ← 此处阻止
  this._mouseDownOnCanvas = false;
  // ... 原有点击/拖拽逻辑
}

// handleWindowBlur / cancelDrag: 重置标记
this._mouseDownOnCanvas = false;
```

## 5. 测试结果

### 自动化测试

| 测试集                                | 结果                |
| ------------------------------------- | ------------------- |
| Vitest 单元测试 (34 files, 774 tests) | ✅ 774 passed       |
| InputManager.test.ts 回归测试         | ✅ 2 passed（新增） |

### 新增回归测试

| 测试用例                                                   | 位置                   | 说明                             |
| ---------------------------------------------------------- | ---------------------- | -------------------------------- |
| mouseup without canvas mousedown → no onModuleSelect(null) | `InputManager.test.ts` | 模拟右侧栏点击不触发反选         |
| mouseup without canvas mousedown → no onCanvasClickEmpty   | `InputManager.test.ts` | 模拟右侧栏点击不触发点击空白回调 |

## 6. 修复范围

| 文件                             | 改动                                                                                                                               |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `src/input/InputManager.ts`      | +1 字段 `_mouseDownOnCanvas`，+1 行设置（handleMouseDown），+3 行守卫（handleMouseUp），+2 行重置（handleWindowBlur / cancelDrag） |
| `src/input/InputManager.test.ts` | +2 回归测试用例                                                                                                                    |

**总改动量**: 核心逻辑 4 行，测试 2 个用例。零 blast radius——仅影响 mouseup 入口的条件守卫，所有已有交互路径不变。

---

_此 bug 属于输入事件传播架构的边界条件。修复遵循最小侵入原则：添加一个标记位 + 一处守卫，不改变任何已有事件处理逻辑。_
