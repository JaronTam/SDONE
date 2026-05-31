# SDONE Story 3-1 代码审查报告

**日期：** 2026-05-27
**审查范围：** ModulePanel.ts (244行) + module-panel.css + main.ts 第182-187行
**审查模式：** no-spec（未找到 Story 3-1 故事文档，基于代码质量审查）
**审查层：** Blind Hunter（逻辑/API 错误）、Edge Case Hunter（边界条件）、Acceptance Auditor（需求完整性）

---

## 整体评估：通过

- **P0 问题：** 0 个
- **P1 问题：** 1 个（dragstart 事件回调未在 destroy 中移除）
- **P2 问题：** 1 个（destroy 检查 parentNode === this.container 可能跳过移除）
- **P3 问题：** 1 个（getContext 失败时静默返回）
- **已验证正确：** 6 项核心功能

---

## P0 - 关键问题

（无）

---

## P1 - 高优先级

### 1. dragstart 事件监听器在 destroy() 中未移除

- **文件：** ModulePanel.ts 第 136-140 行
- **严重级别：** P1
- **描述：** destroy() 方法移除了 pinBtn 的点击监听器（第 136 行），并移除了 DOM 根节点（第 137-139 行），但它没有调用 removeEventListener 来移除每个 dragDisposers 条目。虽然 dragDisposers 数组在第 185 行记录了 { el, handler }，但在 destroy() 中该数组从未被遍历以调用 el.removeEventListener('dragstart', handler)。由于 rootEl 从 DOM 中移除，浏览器可能会对被移除元素上的事件监听器进行垃圾回收，但依赖浏览器 GC 来销毁事件监听器不是最佳实践，且在旧版浏览器中可能导致内存泄漏。
- **修复方案：** 在 destroy() 中遍历 dragDisposers：

在 destroy() 中添加：
for (const { el, handler } of this.dragDisposers) {
  el.removeEventListener('dragstart', handler);
}
this.dragDisposers.length = 0;

---

## P2 - 中优先级

### 2. destroy() 检查 parentNode === this.container - 若父节点已变则跳过移除

- **文件：** ModulePanel.ts 第 137-139 行
- **严重级别：** P2
- **描述：** destroy() 在执行 this.container.removeChild(this.rootEl) 之前检查 parentNode === this.container。设计意图良好（防止重复 destroy 调用），但如果外部代码在构建后将 rootEl 移动到不同的父节点，此条件将静默失败，从而导致 DOM 泄漏。一个更健壮的检查是通用的 if (this.rootEl.parentNode)。
- **修复方案：**

if (this.rootEl.parentNode) {
  this.rootEl.parentNode.removeChild(this.rootEl);
}

---

## P3 - 低优先级

### 3. getContext 失败时静默返回 - 无 fallback 报告

- **文件：** ModulePanel.ts 第 200-201 行
- **严重级别：** P3
- **描述：** 如果 canvas.getContext('2d') 返回 null（例如在 Canvas 上下文耗尽的极端场景中），renderIconShape() 静默返回且不绘制任何内容。用户将看到空白的面板图标，且不会收到任何关于绘制失败的指示。
- **修复方案：** 添加 console.warn 或在图标项目中渲染一个文本占位符作为降级方案。

---

## 已验证正确

| # | 功能 | 验证要点 |
|---|------|----------|
| 1 | DOM 结构：header + iconList | 清晰的层级结构，带有语义化 CSS 类名和 ARIA 标签 |
| 2 | handlePinClick 正确绑定并存储 | this.boundPinClick = this.handlePinClick.bind(this) 第 97 行 |
| 3 | HiDPI 画布渲染 (renderIconShape) | DPR 缩放计算正确（第 203-214 行），与 ICON_BUFFER_SIZE 比较 |
| 4 | 通过 ShapePaths 实现视觉一致性 | 导入并使用 drawCloud/drawStock/drawSink |
| 5 | setHidden() 使用 CSS 类切换 | 干净地添加/移除 module-panel--hidden，无内联样式冗余 |
| 6 | dragstart 数据设置正确 | application/x-sdone-module MIME 类型 + effectAllowed = 'copy' |

---

## 推断验收标准

| # | 标准 | 状态 |
|---|------|------|
| AC1 | 左侧面板显示 3 个可拖拽模块图标（源、存量、汇） | 通过 - ICON_DEFINITIONS 数组 + createIconItem() 循环 |
| AC2 | 图标使用与主画布相同的 ShapePaths 绘制函数 | 通过 - 导入 drawCloud/drawStock/drawSink |
| AC3 | 每个图标渲染在 canvas 上以实现 HiDPI 清晰度 | 通过 - renderIconShape() 使用 DPR 缩放 |
| AC4 | Pin 按钮存在且可点击 | 通过 - handlePinClick() 第 242 行 console.log |
| AC5 | destroy() 清理所有事件监听器并移除 DOM | 部分通过 - pinBtn 已清理，dragstart 未清理（见 P1 #1） |
| AC6 | setHidden() 切换面板可见性 | 通过 - 第 123-129 行 |

5/6 验收标准完全通过。AC5 存在已知问题（P1 #1）。

---

## 审查文件清单

sdone/src/ui/panels/ModulePanel.ts         - 面板组件（主文件）
sdone/src/ui/panels/index.ts              - 桶导出
sdone/src/ui/panels/styles/module-panel.css - 面板样式
sdone/src/shared/ShapePaths.ts            - 共享形状绘制函数
sdone/src/main.ts (L182-L187)             - 面板实例化

---

## 结论

Story 3-1 审查通过 - 有条件下通过。有一个 P1 项必须修复（dragstart 监听器在 destroy 中未清理），这是一个真实的内存/事件泄漏问题。除此之外，代码结构良好、文档完善、HiDPI 处理得当。与同模块中的 Story 3.2 drag-drop 线配合良好，ICON_DEFINITIONS 元数据表整齐清晰。

推荐：在合并前修复 P1 #1（在 destroy() 中移除 dragstart 监听器）。P2 和 P3 项为非阻塞项，可作为质量改进跟踪。
