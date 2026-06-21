# SDONE Story 3.2 代码审查报告（修订版）

**日期：** 2026-05-26（修订于同日）  
**审查范围：** Story 3.2 — Panel-to-Canvas Drag-and-Drop Module Placement  
**审查层：** Blind Hunter（逻辑/API 错误）、Edge Case Hunter（边界条件）、Acceptance Auditor（需求完整性）  
**编译状态：** `npx tsc --noEmit` → **0 个错误**

> **修订说明：** 原始审查中的三项 P1 发现被独立审计确认为误报（参见
> [confession-report-story-3-2.md](./confession-report-story-3-2.md)）。
> 本修订版已合并审计结论，保留所有有效的 P2/P3 改进建议，并新增第二轮
> 对抗性审查的发现项。

---

## 整体评估：🟢 通过 — 建议合并

| 等级           | 数量 | 描述                                                            |
| -------------- | ---- | --------------------------------------------------------------- |
| P0（阻断）     | 0    | —                                                               |
| P1（高优先级） | 0    | —                                                               |
| P2（中优先级） | 3    | 死代码回调解耦、effectAllowed 防御缺失、类型窄化不足            |
| P3（低优先级） | 2    | `getHitRadius` default 分支无告警、ghost 形状与 ShapePaths 重复 |

---

## 已验证正确的核心功能（12 项）

| #   | 审查点                                                                                | 结论                                                           |
| --- | ------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| 1   | `handleDragOver` 在更新 ghost 状态前验证模块类型（`'source'`、`'stock'`、`'sink'`）   | ✅ 第 181–182 行守卫阻止任意字符串                             |
| 2   | `handleDragLeave` 清除 ghost（`ghostModuleType = null`，`ghostWorldPosition = null`） | ✅ 第 198–201 行                                               |
| 3   | `handleDrop` 清除 ghost、转换坐标并触发 `onModuleDrop`                                | ✅ 第 207–224 行                                               |
| 4   | `drawGhost()` 在 `applyTransform()` 之后调用 — ghost 渲染在视口变换后的空间中         | ✅ `drawFrame()` 第 190 行（变换）→ 第 205 行（`drawGhost()`） |
| 5   | Ghost 使用 `ctx.save()`/`ctx.restore()` 隔离 `globalAlpha`                            | ✅ `drawGhost()` 第 233–297 行                                 |
| 6   | 三条独立清理路径覆盖所有 ghost 生命周期（`dragleave`、`drop`、`windowBlur`）          | ✅ 第 198、215–216、237–238 行                                 |
| 7   | `ModulePanel` 将 `effectAllowed` 设置为 `'copy'`，`draggable` 设置为 `'true'`         | ✅ `ModulePanel.ts`                                            |
| 8   | `main.ts` 中的 `onModuleDrop` 在突变前调用 `historyManager.push()`（撤销锚点）        | ✅ `main.ts`                                                   |
| 9   | source/sink 语义调色板循环 — 以模数方式分配颜色                                       | ✅ `main.ts`                                                   |
| 10  | Drop 事件发出 `MODULE_PLACED` 及 `{ type, position }` payload                         | ✅ `main.ts`；在 `EventMap` 中声明                             |
| 11  | `addModule` 使用 `crypto.randomUUID()` 生成唯一 ID — 无碰撞风险                       | ✅ `mutations.ts`                                              |
| 12  | `ghostProvider` 在 `SceneRenderer` 和 `MinimapRenderer` 均已接入                      | ✅ `main.ts`                                                   |

---

## 🟠 P2 — 建议修复（3 项）

### P2-1. `ModulePanel.onDragStart` 回调为死代码 — 从未被 main.ts 赋值

- **文件：** `src/ui/panels/ModulePanel.ts:74` × `src/main.ts`
- **描述：** `ModulePanel.onDragStart` 回调声明但因 HTML DnD `setData` + `dragover`/`drop` 通信已全覆盖，`main.ts` 从未设置该回调。它在 `dragstart` handler 中被调用（`ModulePanel.ts`），调用处检查了 `if (this.onDragStart)`，因此此代码无害但为死代码。
- **修复方案：** 从 `ModulePanel` 移除 `onDragStart` 属性及 `dragstart` handler 中的 `if` 块。若打算保留供将来使用，添加注释说明其用途。

### P2-2. `handleDragOver` 未验证 `effectAllowed` 是否包含 `'copy'`

- **文件：** `src/input/InputManager.ts:184`
- **描述：** `handleDragOver` 无条件设置 `e.dataTransfer.dropEffect = 'copy'`，未检查 `e.dataTransfer.effectAllowed`。虽然 `ModulePanel` 将 `effectAllowed` 设置为 `'copy'`（浏览器默认允许），但若源元素在未来被误配置，`dropEffect` 赋值可能被浏览器静默忽略。当前无功能影响。
- **修复方案：** 可选添加防御性守卫：
  ```typescript
  if (
    e.dataTransfer.effectAllowed !== "none" &&
    (e.dataTransfer.effectAllowed === "all" ||
      e.dataTransfer.effectAllowed.includes("copy"))
  ) {
    e.dataTransfer.dropEffect = "copy";
  }
  ```

### P2-3. `ghostModuleType` 类型过宽 — 应为 `ModuleType` 而非 `string`

- **文件：** `src/input/InputManager.ts:99`、`src/canvas/SceneRenderer.ts:124`
- **描述：** `InputManager.ghostModuleType` 声明为 `string | null`。由于 `handleDragOver` 第 181 行有白名单守卫，运行时值始终是 `'source' | 'stock' | 'sink' | null`。窄化为 `ModuleType | null` 可提升类型安全性。
- **修复方案：**
  1. 将 `InputManager.ghostModuleType` 的类型改为 `ModuleType | null`
  2. 同步更新 `handleDrop` 中 `onModuleDrop` 的参数类型
  3. `SceneRenderer.ghostProvider` 返回类型已经是 `ModuleType`，无需改动

---

## 🔵 P3 — 可选改进（2 项）

### P3-1. `getHitRadius` default 分支静默返回 `SINK_HIT_RADIUS`

- **文件：** `src/canvas/SceneRenderer.ts:44-45`
- **描述：** 当 `moduleType` 不是 `'source'`、`'stock'` 或 `'sink'` 时，default 分支返回 `SINK_HIT_RADIUS`，无任何告警。若因未来变更引入未知类型，此行为会静默失败、难以调试。
- **修复方案：** 添加 `console.warn` 或在 default 分支中抛出错误，使失效可见。

### P3-2. Ghost 形状绘制与 `ShapePaths` 存在代码重复

- **文件：** `src/canvas/SceneRenderer.ts:238-295`
- **描述：** `drawGhost()` 对 source（5 圆圈）、sink（2 圆圈 + 腰线）的形状绘制逻辑与主渲染管线（`drawSource`、`drawSink`）中的路径定义重复。若未来形状规范变更，两处需同步修改。
- **修复方案：** 抽取出共享的形状绘制函数（如在 `ShapePaths.ts` 中），主渲染和 ghost 渲染共用同一形状定义，仅通过 `globalAlpha` 区分。

---

## 验收标准对照

| AC  | 描述                                   | 状态                               |
| --- | -------------------------------------- | ---------------------------------- |
| AC1 | `draggable="true"` 在 icon 上          | ✅ 已实现                          |
| AC2 | `dragstart` 设置 dataTransfer          | ✅ 已实现                          |
| AC3 | 模块创建时带语义颜色                   | ✅ 已实现                          |
| AC4 | Ghost 预览在画布上渲染                 | ✅ SceneRenderer.drawGhost()       |
| AC5 | Ghost 预览在 minimap 上渲染            | ✅ MinimapRenderer.paint()         |
| AC6 | `dropEffect='copy'`                    | ✅ InputManager.handleDragOver:184 |
| AC7 | Ghost 平滑跟随光标                     | ✅ handleDragOver 每帧触发         |
| AC8 | 不破坏现有交互（pan/zoom/module drag） | ✅ 寄存器互斥，独立监听器          |

---

## 误报回顾

原始审查中的以下三项 P1 发现已被独立审计确认为误报，本修订版已移除：

| 原始声称                             | 驳回原因                                                        |
| ------------------------------------ | --------------------------------------------------------------- |
| `pulseStartTime` 声明但未初始化      | 构造函数第 139 行存在 `this.pulseStartTime = performance.now()` |
| Ghost 渲染未应用视口变换             | `drawGhost()` 在 `applyTransform()` 之后调用（第 190 → 205 行） |
| 缺少 `dragend` 处理器导致 ghost 残留 | 三条独立清理路径（`dragleave` / `drop` / `windowBlur`）全覆盖   |

详见 [confession-report-story-3-2.md](./confession-report-story-3-2.md)。

---

## 总结

Story 3.2 实现质量良好。拖放流程从 `ModulePanel` → `InputManager` → `SceneRenderer`/`MinimapRenderer` 完整且逻辑清晰。类型验证通过白名单正确防护。所有验收标准均已满足。

**推荐合并前可处理：**

1. 移除 `ModulePanel.onDragStart` 死代码（P2-1）
2. 窄化 `ghostModuleType` 类型为 `ModuleType`（P2-3）
3. 可选：添加 `effectAllowed` 防御守卫（P2-2）

**结论：** ✅ **通过审查，无需阻塞合并。**
