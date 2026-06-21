# SDONE Story 2-2 代码审查报告

**日期：** 2026-05-22  
**审查范围：** `sdone/src/` (25 个文件，~2,800 行 TypeScript + 测试代码)  
**审查模式：** `no-spec`（未找到 Story 2-2 故事文档，基于代码质量审查）  
**审查层：** Blind Hunter（逻辑/API 错误）、Edge Case Hunter（边界条件）、Acceptance Auditor（需求完整性）

---

## 整体评估：⚠️ 有条件下通过

- **P0 问题：** 0 个（原报告中的 P0 经悔过审计核实为误报，已降级至 P2）

**⚠️ 悔过审计更新（2026-05-22）：** 独立审计发现原报告存在 1 项关键事实错误 — `SceneRenderer.ts` 第 214 行的 `if (!node) continue;` 守卫防止了声称的崩溃。原 P0 已降级为 P2。完整审计报告见 `docs/code-reviews/story-2-2-confession-report.md`。

- **P1 问题：** 3 个（强烈建议修复 — 键盘拦截、事件监听器内存泄漏）
- **P2 问题：** 3 个（建议修复 — 公开可变属性、密集网格、引用语义模糊）
- **已验证正确：** 10 项核心功能
- **推断验收标准：** 7/7 通过

---

## 🔴 P0 — 关键问题

**（无。原报告中的 P0 #1 经悔过审计核实为误报 — 详见 `story-2-2-confession-report.md`）**

---

## 🟡 P1 — 高优先级

### 2. `InputManager` 键盘事件处理程序全局拦截文本输入

- **文件：** `input/InputManager.ts` 第 307-333 行
- **严重级别：** P1
- **描述：** `handleKeyDown` 和 `handleKeyUp` 注册在 `window` 上（第 93-94 行）。Space 键（第 309-318 行）、Delete 和 Backspace（第 321-324 行）总是调用 `e.preventDefault()`，但不检查事件目标是否为 `input`/`textarea`/`contentEditable` 元素。这会导致用户在页面任何文本字段中无法输入空格或使用退格键/删除键。
- **修复方案：** 在 `handleKeyDown` 和 `handleKeyUp` 的顶部添加目标检查：

```typescript
if (
  e.target instanceof HTMLInputElement ||
  e.target instanceof HTMLTextAreaElement ||
  (e.target instanceof HTMLElement && e.target.isContentEditable)
) {
  return;
}
```

### 3. `main.ts` 中的 Ctrl+0 事件监听器从未移除（内存泄漏）

- **文件：** `main.ts` 第 91-96 行
- **严重级别：** P1
- **描述：** 向 `window` 注册了一个匿名箭头函数 `keydown` 监听器。该引用未被存储，因此永远无法调用 `removeEventListener`。第 99-102 行的 HMR `dispose` 钩子只清理 `sceneRenderer.stop()` 和 `inputManager.destroy()`，但未清理此监听器。每次 HMR 重载都会堆积一个新的、无法移除的监听器。
- **修复方案：** 提取为命名函数并存储引用；在 dispose 钩子中移除：

```typescript
const handleResetShortcut = (e: KeyboardEvent) => {
  if (e.ctrlKey && e.key === "0") {
    e.preventDefault();
    viewportManager.reset();
  }
};
window.addEventListener("keydown", handleResetShortcut);

// 在 dispose 钩子中：
window.removeEventListener("keydown", handleResetShortcut);
```

### 4. `CanvasResizer` 实例被丢弃 — 在 HMR 重载时永不销毁

- **文件：** `main.ts` 第 23 行
- **严重级别：** P1
- **描述：** `new CanvasResizer(sceneCanvas, minimapCanvas)` 的结果未被赋值给变量。`CanvasResizer` 构造函数在第 27 行注册了 `window.addEventListener('resize', this.handle)`，但在第 99-102 行的 HMR dispose 钩子中从未调用 `.destroy()`。每次重载都会堆积新的 resize 监听器。
- **修复方案：** 存储引用并在 dispose 钩子中销毁：

```typescript
const canvasResizer = new CanvasResizer(sceneCanvas, minimapCanvas);

// 在 dispose 钩子中：
canvasResizer.destroy();
```

---

## 🟢 P2 — 中优先级

### 5. `ViewportManager.viewport` 是公开可变属性 — 直接赋值 `zoom=0` 导致除零

- **文件：** `canvas/Viewport.ts` 第 38-39 行（public viewport），第 68-69 行（screenToWorld），第 101 行（panByScreenDelta）
- **严重级别：** P2
- **描述：** `viewport` 属性是 `public` 且无 setter 验证。如果外部代码执行 `viewportManager.viewport.zoom = 0`，则 `screenToWorld` 中的除法 (`relX / this.viewport.zoom`) 和 `panByScreenDelta` (`screenDelta.x / this.viewport.zoom`) 产生 `Infinity`/`NaN`。`clampZoom`（第 187-189 行）仅保护 `zoomAtScreenPoint` 路径 — 直接属性赋值完全绕过它。
- **修复方案：** 将 `viewport` 设为 `private` 并暴露一个 `getViewport(): Readonly<Viewport>` 访问器；或在属性上使用 TypeScript setter 在赋值时钳制 zoom。

### 6. `SceneRenderer.drawGrid` 在极小 zoom 值下可能衍生过多网格线

- **文件：** `canvas/SceneRenderer.ts` 第 143-182 行
- **严重级别：** P2
- **描述：** 循环边界为 `worldLeft` 到 `worldRight`，步长 `spacing=100`。zoom = 0.1 时，在 1920px 画布上视口范围约为 `±9600` 世界单位，每轴生成约 192 条线（总计 384 条路径线段）。目前不太可能造成性能问题，但存在无限缩放极限下潜在的性能下降风险。
- **修复方案：** 可选 — 当预期线数超过 ~200 条时，限制网格范围或限制最大缩放范围。

### 7. `bump()` 浅拷贝引用 — 命名模糊可能导致错误使用

- **文件：** `state/mutations.ts` 第 17-24 行
- **严重级别：** P2
- **描述：** `bump()` 返回一个具有 `nodes: state.nodes` 相同引用的新对象（浅共享）。虽然个体 mutation 函数（如 `addModule`）正确地用新引用覆盖了这些属性，但 `bump()` 本身不复制。若未来的 mutation 函数依赖于 `bump()` 来完成浅拷贝，则会破坏不可变性。
- **修复方案：** 将 `bump()` 重命名为 `bumpVersion()` 以明确它只递增版本号；或使其接受覆盖参数以启用原子版本递增 + 字段替换。

---

## ✅ 已验证正确（无需操作）

| #   | 审查层             | 发现                                        | 结论                                                                          |
| --- | ------------------ | ------------------------------------------- | ----------------------------------------------------------------------------- | --- | ----------------- |
| 1   | Blind Hunter       | `applyTransform` 矩阵数学                   | ✅ 正确 — 第 169-181 行的变换矩阵正确应用 `e = center.x - offset.x * zoom`    |
| 2   | Blind Hunter       | `zoomAtScreenPoint` 数学 — "向鼠标缩放"     | ✅ 正确 — 第 123-148 行正确地将缩放前的世界点映射到缩放后的世界点             |
| 3   | Blind Hunter       | Pan 方向（拖动右 = 世界内容向左移动）       | ✅ 正确 — 第 100-107 行从 offset 中减去世界变化量                             |
| 4   | Blind Hunter       | `wheel` passive: false                      | ✅ 正确 — 第 91 行正确使用 `{ passive: false }` 以允许 `preventDefault()`     |
| 5   | Blind Hunter       | rAF 循环停止                                | ✅ `stop()` 正确调用 `cancelAnimationFrame`。`start()` 在第 93 行有幂等性保护 |
| 6   | Edge Case          | `CanvasResizer` clientWidth/Height 零值保护 | ✅ 第 54 行：`if (w === 0                                                     |     | h === 0) return;` |
| 7   | Edge Case          | `Vec2.distance` NaN 保护                    | ✅ 平方运算保证非负输入；不会发生 NaN 传播                                    |
| 8   | Edge Case          | `structuredClone` 可用性                    | ✅ Target 为 ES2022+；自 Node 17+ 和所有现代浏览器起均可用                    |
| 9   | Acceptance Auditor | 全部 7 条推断的验收标准                     | ✅ 全部通过                                                                   |
| 10  | Acceptance Auditor | 跨 Story 2.1/2.3 冲突                       | ✅ 未检测到冲突                                                               |

---

## 推断验收标准评估

| #   | 推断需求                | 判定    | 证据                                                                            |
| --- | ----------------------- | ------- | ------------------------------------------------------------------------------- |
| 1   | 鼠标中键拖动平移        | ✅ 通过 | `InputManager.ts:163-168`，`ViewportManager.panByScreenDelta:100-107`           |
| 2   | 空格+左键拖动平移       | ✅ 通过 | `InputManager.ts:170-176`，space 追踪于 :307-333                                |
| 3   | 鼠标滚轮向光标缩放      | ✅ 通过 | `InputManager.handleWheel:290-301`，`ViewportManager.zoomAtScreenPoint:123-148` |
| 4   | Zoom 钳制 [0.1, 5.0]    | ✅ 通过 | `Viewport.ts:19-22` 常量，`clampZoom:187-189`                                   |
| 5   | 正确的屏幕↔世界坐标变换 | ✅ 通过 | `screenToWorld:63-72`，`worldToScreen:79-84`，往返测试通过                      |
| 6   | Canvas 渲染使用视口变换 | ✅ 通过 | `SceneRenderer.drawFrame:129` 调用 `applyTransform`                             |
| 7   | 单元测试覆盖            | ✅ 通过 | `Viewport.test.ts`（340 行），`InputManager.test.ts`（445 行）                  |

---

## 统计摘要

| 指标         | 数值                                      |
| ------------ | ----------------------------------------- |
| 审查文件数   | 25                                        |
| P0 问题      | 0                                         |
| P1 问题      | 3                                         |
| P2 问题      | 3                                         |
| 已验证正确   | 10                                        |
| 推断 AC 状态 | 7/7 通过                                  |
| **整体评估** | **⚠️ 有条件下通过 — 强烈建议修复所有 P1** |
