# SDONE Story 2-1 代码审查报告

**日期：** 2026-05-27  
**审查范围：** `CanvasResizer.ts` (59行) + `main.ts` 双画布线部分 (第39–47行) + `layout.css` (138行)  
**审查模式：** `no-spec`（未找到 Story 2-1 故事文档，基于代码质量审查）  
**审查层：** Blind Hunter（逻辑/API 错误）、Edge Case Hunter（边界条件）、Acceptance Auditor（需求完整性）

---

## 整体评估：✅ 通过

- **P0 问题：** 0 个
- **P1 问题：** 0 个
- **P2 问题：** 1 个（devicePixelRatio 变化未处理）
- **P3 问题：** 1 个（零尺寸守卫后无恢复机制）
- **已验证正确：** 5 项核心功能

---

## 🔴 P0 — 关键问题

**（无）**

---

## 🟡 P1 — 高优先级

**（无）**

---

## 🔵 P2 — 中优先级

### 1. window resize 事件不捕获 devicePixelRatio 变化

- **文件：** `CanvasResizer.ts` 第 18–21 行
- **严重级别：** P2
- **描述：** `handle` 监听的是 `window.resize` 事件。当用户将窗口拖到不同 DPR 的显示器（HiDPI → 普通显示器或反之），`resize` 事件可能触发，但如果画布已经使用 `clientWidth/clientHeight` 进行尺寸同步，且未考虑 `devicePixelRatio` 缩放，则画布的缓冲区分辨率（`canvas.width/height`）将不会更新以反映新的 devicePixelRatio。相比之下，`ModulePanel.renderIconShape()` (第 204 行) 正确处理了 DPR 变化。结果可能导致在跨 DPR 显示器场景中，主场景画布和 minimap 画布的分辨率不正确。
- **修复方案：** 在 `sync()` 方法中添加可选的 DPR 缩放，或添加 `matchMedia('(resolution: …)')` 监听器。

```typescript
private sync(canvas: HTMLCanvasElement): void {
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  if (w === 0 || h === 0) return;
  const dpr = window.devicePixelRatio || 1;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
}
```

**注意：** 此修复可能需要同时更新 `SceneRenderer` 中的画布变换逻辑，以考虑 DPR 缩放。建议作为独立改进项处理。

---

## 🟢 P3 — 低优先级

### 2. 零尺寸画布守卫静默返回 — 无后续恢复机制

- **文件：** `CanvasResizer.ts` 第 54 行
- **严重级别：** P3
- **描述：** `sync()` 中当 `clientWidth === 0 || clientHeight === 0` 时静默返回。这在初始化期间元素尚未布局时会触发。一旦布局完成，画布尺寸不会自动恢复 — 必须等待下一次 `resize` 事件。在大多数浏览器中，布局完成后会触发 `resize`，因此这在实践中通常能正常工作，但在某些边缘场景（如 display:none 切换）中，画布尺寸可能保持为 0。
- **修复方案：** 考虑使用 `ResizeObserver` 替代 `window.resize`，或添加 `requestAnimationFrame` 轮询以确保在首次布局后同步。

---

## ✅ 已验证正确

| #   | 功能                                         | 验证要点                                                                       |
| --- | -------------------------------------------- | ------------------------------------------------------------------------------ |
| 1   | `CanvasResizer` 构造函数存储绑定引用         | `this.handle = this.resize.bind(this)` 存储为字段，确保 `destroy()` 可正确移除 |
| 2   | `destroy()` 正确清理监听器                   | 第 38 行精确移除 `resize` 监听器，无泄漏                                       |
| 3   | 双画布同步 (`sceneCanvas` + `minimapCanvas`) | 第 32–33 行对两个画布调用 `resize()`                                           |
| 4   | HMR dispose 集成                             | `main.ts` 第 175 行 `canvasResizer.destroy()`                                  |
| 5   | CSS 层级架构 (`layout.css`)                  | z-index 层清晰分离：canvas(0) < panel(1) < control-bar(2) < minimap(3)         |

---

## 📋 推断验收标准

| #   | 标准                                              | 状态                                       |
| --- | ------------------------------------------------- | ------------------------------------------ |
| AC1 | 应用启动时获取 `#scene` 和 `#minimap` canvas 元素 | ✅ `main.ts` 第 40–45 行，含不存在时抛异常 |
| AC2 | Canvas 元素在窗口 resize 时自动同步宽高           | ✅ `CanvasResizer.handle` → `sync()`       |
| AC3 | CSS 布局使 canvas 填满容器（100% 宽高）           | ✅ `layout.css` 第 53–54 行                |
| AC4 | HMR 热重载时正确清理 resize 监听器                | ✅ `destroy()` + `main.ts` dispose 钩子    |
| AC5 | Minimap 叠在主画布之上（z-index 正确）            | ✅ z-index: 0 (canvas) vs 3 (minimap)      |

**5/5 验收标准通过。**

---

## 📊 审查文件清单

```
sdone/src/canvas/CanvasResizer.ts       — 双画布 resize 管理器
sdone/src/main.ts (L39–L47)             — 画布获取 + 实例化
sdone/src/main.ts (L172–L180)           — HMR 清理
sdone/src/ui/styles/layout.css          — 全页 z-index 层级
sdone/src/canvas/index.ts              — 桶导出
```

---

## 🏁 结论

**Story 2-1 审查通过。** 代码干净、结构清晰，无 P0/P1 阻塞项。`CanvasResizer` 实现简洁且正确，`destroy()` 路径完整。与 Story 2.2 (`InputManager` 键盘拦截) 或 Story 2.3 (缺少测试) 不同，Story 2-1 的核心代码没有引入任何实质性逻辑错误或资源泄漏。唯一需要注意的 P2 改进项（DPR 变化未处理）影响有限，可作为技术债务跟踪。
