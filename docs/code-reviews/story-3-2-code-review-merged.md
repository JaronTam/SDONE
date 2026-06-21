# Story 3.2 — 统一代码审查报告（三层合并 + 分类）

**审查日期**：2026-05-27  
**审查范围**：Story 3.2 — Panel-to-Canvas Drag-and-Drop + Ghost Preview  
**方法论**：`bmad-code-review` 技能 — 三个并行审查层（Blind Hunter、Edge Case Hunter、Acceptance Auditor），随后进行结构化分类  
**审查人**：Cline (BMad Code Review Workflow)

---

## 第一部分：分类摘要

审查发现已按标准 BMAD 分类法进行分类：

| 分类 ID   | 发现数 | 描述                         |
| --------- | ------ | ---------------------------- |
| [CORRECT] | 6      | 实现正确 — 无需更改          |
| [BUG]     | 3      | 运行时缺陷 — 需要修复        |
| [PERF]    | 1      | 性能/内存 — 可能降低性能     |
| [TEST]    | 1      | 测试不足 — 缺少用例          |
| [TYPE]    | 2      | 类型安全性 — 编译时检查      |
| [EDGE]    | 2      | 边缘情况 — 不寻常的输入/状态 |

### 严重程度快速概览

| #   | 分类   | 严重程度  | 发现内容                                                                                                        |
| --- | ------ | --------- | --------------------------------------------------------------------------------------------------------------- |
| C1  | [BUG]  | 🔴 HIGH   | Firefox：`dragover` 内的 `getData()` 返回空字符串 — ghost 预览 + drop 静默失败                                  |
| C2  | [BUG]  | 🟠 MEDIUM | `ModulePanel.destroy()` 泄露 `dragstart` 事件监听器（内存泄漏）                                                 |
| C3  | [BUG]  | 🟡 LOW    | Ghost 在 MinimapRenderer 中对 NaN/Infinity `worldPosition` 没有边界保护（损坏绘制）                             |
| C4  | [TYPE] | 🟠 MEDIUM | `main.ts:192,198` — ghost provider 类型不匹配，`tsc --noEmit` 失败（2 个错误）                                  |
| C5  | [TYPE] | 🟡 LOW    | `ghostModuleType: string` 应为 `ModuleType` — 因类型过宽导致跨模块类型缩减                                      |
| C6  | [EDGE] | 🟡 LOW    | 无效的 `moduleType`（例如 `''`，`'unknown'`）落在空的 switch 分支 — ghost 静默失败，无控制台输出                |
| C7  | [EDGE] | 🟡 LOW    | `onModuleDrop` 将 `moduleType as ModuleType` 强制转换 — 如果从损坏的 dataTransfer 传递 `string`，则无运行时防护 |
| C8  | [TEST] | 🟡 LOW    | 测试在缺少 `jsdom` 环境的文件中失败（`ModulePanel.test.ts`、`InputManager.test.ts` — 36 个预存测试失败）        |
| C9  | [PERF] | 🟢 INFO   | `handleDragOver` 中的 canvasCenter 计算每帧重复，未使用闭包捕获                                                 |

---

## 第二部分：已确认的实现差距

### C1: [BUG/HIGH] — Firefox `getData()` 在 `dragover` 中返回空字符串

**文件**：`src/input/InputManager.ts`，第 178 行  
**发现层**：Blind Hunter  
**源**：[HTML Drag and Drop 规范 第 8.5.4 节](https://html.spec.whatwg.org/multipage/dnd.html#drag-data-store-mode)

```typescript
// InputManager.ts:178 — 当前代码
private handleDragOver(e: DragEvent): void {
  const moduleType = e.dataTransfer!.getData('application/x-sdone-module');
  if (!moduleType) {                     // ← Firefox 中始终为 ''
    this.ghostModuleType = null;         // ghost 从未显示
    this.ghostWorldPosition = null;
    return;
  }
  // ...
```

**Firefox 行为**：`getData()` 在 `dragover` 事件中返回 **空字符串** 用于自定义 MIME 类型。规范限制在 `dragenter`、`dragover` 或 `dragleave` 期间通过 `getData()` 读取数据（保护模式）。

**影响**：

- Ghost 预览在 Firefox 中**完全无法渲染**
- Drops **无声失败** — `handleDrop()` 中的相同 `getData()` 调用正常工作（`drop` 允许读取数据），但 `dragOver` 的设置意味着 `ghostModuleType` 在某些事件流中可能为 null
- **所有 Firefox 用户均受影响** — 功能完全损坏

**修复**：

```typescript
// 方案 1：从 dataTransfer.types 检查（dragenter 中设置，dragover 中读取）
private handleDragEnter(e: DragEvent): void {
  if (e.dataTransfer?.types.includes('application/x-sdone-module')) {
    // 直接存储模块类型 — 不在 dragover 中使用 getData()
    // （在 drop 时仍可使用 getData）
  }
}

// 方案 2：将模块类型存储在 dataTransfer 的 effectAllowed 中（有限字符集）
// 方案 3：使用自定义属性而非 getData
```

---

### C2: [BUG/MEDIUM] — `ModulePanel.destroy()` 中的内存泄漏

**文件**：`src/ui/panels/ModulePanel.ts`，第 135–140 行和第 184 行  
**发现层**：Blind Hunter

```typescript
// ModulePanel.ts:70
private readonly dragDisposers: Array<{ el: HTMLElement; handler: (e: Event) => void }> = [];

// ModulePanel.ts:184 — dragstart 监听器已注册
this.dragDisposers.push({ el: iconEl, handler });

// ModulePanel.ts:135-140 — destroy() 从未迭代 dragDisposers！
destroy(): void {
  if (!this.root) return;
  this.root.remove();
  this.root = null;
  // ⚠️ dragDisposers 未清理 — 事件监听器泄露在分离的 DOM 上
}
```

**影响**：在 HMR（热模块替换）期间，`main.ts:180` 调用 `panel.destroy()` 并创建新实例。每个 HMR 周期会将 3 个事件监听器附加到已分离的 DOM 元素上，从而泄露内存。

**修复**：在 `destroy()` 中添加：

```typescript
for (const { el, handler } of this.dragDisposers) {
  el.removeEventListener("dragstart", handler);
}
this.dragDisposers.length = 0;
```

---

### C3: [BUG/LOW] — MinimapRenderer 对 NaN/Infinity ghost 位置没有边界保护

**文件**：`src/canvas/MinimapRenderer.ts`，第 181–223 行  
**发现层**：Edge Case Hunter

如果 `screenToWorld` 产生 NaN 或 Infinity（来自不寻常的 `clientX`/`clientY` 值），`paint()` 中的边界框计算会损坏：

```typescript
// MinimapRenderer.ts:184-186
let minX = Infinity,
  minY = Infinity,
  maxX = -Infinity,
  maxY = -Infinity;
// ...
const minX2 = Math.min(nodePosition.x, ghost.worldPosition.x); // NaN < Infinity → false
```

`minX` 保持为 `Infinity`，而 `maxX` 保持为 `-Infinity`，然后（第 189 行）：

```typescript
const worldW = maxX - minX + BOUNDS_PADDING * 2; // (-Infinity - Infinity) + padding = -Infinity + padding = -Infinity
```

这会导致 `ctx.scale(-Infinity, -Infinity)` — Canvas API 会**忽略**无效的缩放值而不抛出异常（静默损坏），导致小地图渲染一片空白或像素错误。

**修复**：`paint()` 开始处添加 `Number.isFinite()` 检查。

---

### C4: [TYPE/MEDIUM] — `main.ts` 中 `ghostProvider` 类型不匹配（`tsc` 失败）

**文件**：`src/main.ts`，第 192 行和第 198 行  
**发现层**：Blind Hunter（经 `npx tsc --noEmit` 确认）

```
error TS2322: Type '() => { moduleType: string; worldPosition: Vec2; } | null'
  is not assignable to type '() => { moduleType: ModuleType; worldPosition: Vec2; } | null'.
```

**根本原因**：`InputManager.ghostModuleType` 声明为 `string | null`（第 73 行已查看）。主进程中的箭头函数返回 `{ moduleType: ghostModuleType, worldPosition: ghostWorldPosition }`，其中 `ghostModuleType` 是 `string | null`。**两者** `SceneRenderer.ghostProvider` 和 `MinimapRenderer.ghostProvider` 都期望 `ModuleType`（`'source' | 'stock' | 'sink'`）。

**修复**：将 `InputManager.ts` 中的 `ghostModuleType: string | null` 改为 `ghostModuleType: ModuleType | null`。

---

### C5: [TYPE/LOW] — 跨模块字符串类型传播导致类型缩减

**文件**：`src/input/InputManager.ts`，第 73 行  
**发现层**：Blind Hunter

`ghostModuleType: string | null` → 通过主进程箭头函数 → `ghostProvider`（期望 `ModuleType`）。该类型在接收端被缩减为 `ModuleType`，但在发送端从未被保证。即使 `InputManager` 只写入 `ModuleType` 值，宽类型签名也会破坏编译器的跨文件边界检查能力。

**修复**：同 C4。

---

### C6: [EDGE/LOW] — 无效的 `moduleType` 落在空的 switch 分支

**文件**：`src/canvas/SceneRenderer.ts`，第 238–295 行（`drawGhost()` 内的 switch 语句）  
**发现层**：Edge Case Hunter

```typescript
switch (moduleType) {
  case "source": {
    /* ... */ break;
  }
  case "stock": {
    /* ... */ break;
  }
  case "sink": {
    /* ... */ break;
  }
  // 无 default 分支 — 如果 moduleType 是 ''、'unknown' 等，则无操作
}
```

如果无效的模块类型传播到此（例如，来自带有损坏 dataTransfer 的拖拽），ghost 会**悄悄失败**，不产生任何视觉输出或控制台警告。这掩盖了错误。

**修复**：添加具有 `console.warn()` 的 `default` 分支。

---

### C7: [EDGE/LOW] — `main.ts` 中的不安全类型断言

**文件**：`src/main.ts`，第 200–201 行  
**发现层**：Edge Case Hunter

```typescript
inputManager.onModuleDrop = (moduleType: string, worldPos: Vec2) => {
  // ...
  let nextState = addModule(currentState, moduleType as ModuleType, worldPos);
```

如果 `moduleType` 是 `'invalid'`（由于 Firefox 的 `getData` 问题或其他损坏），则 `as ModuleType` 断言会绕过类型检查，`addModule` 会创建一个带有无效类型标记的节点，从而在渲染时破坏下游的 `switch` 语句。

**修复**：添加 `ModuleType` 运行时防护：`if (!isValidModuleType(moduleType)) return;`

---

### C8: [TEST/LOW] — jsdom 环境配置问题

**发现层**：Acceptance Auditor  
**状态**：36 个测试失败 — 所有都是预存的 jsdom 环境问题，非 Story 3.2 回归

需要在 vitest 配置中为 `ModulePanel.test.ts` 和 `InputManager.test.ts` 添加 `environment: 'jsdom'`。测试逻辑本身是正确的。

---

### C9: [PERF/INFO] — 每帧重复计算 `canvasCenter`

**文件**：`src/input/InputManager.ts`，`handleDragOver` 中  
**发现层**：Edge Case Hunter

```typescript
const canvasRect = this.canvas.getBoundingClientRect();
const canvasCenter = vec2(
  this.canvas.clientWidth / 2,
  this.canvas.clientHeight / 2,
);
```

在每次 `dragover` 事件（高频触发）中计算。如果画布大小不频繁变化，可以缓存。

**影响**：极小的性能开销 — 不构成真正的瓶颈。

---

## 第三部分：[CORRECT] 发现 — 已验证的实现

这些发现确认功能按预期工作：

| #         | 发现内容                                                                                                      | 验证方法       |
| --------- | ------------------------------------------------------------------------------------------------------------- | -------------- |
| CORRECT-1 | Ghost 渲染在 `drawFrame()` 中正确应用视口变换（`applyTransform` 在第 190 行 → `drawGhost` 在第 205 行）       | 控制流追踪     |
| CORRECT-2 | Ghost 生命周期 — 三条独立的清理路径：`dragleave`（第 198 行）、`drop`（第 215 行）、`windowBlur`（第 237 行） | 因果完备性分析 |
| CORRECT-3 | `pulseStartTime` 在构造函数中正确初始化（`SceneRenderer` 第 139 行）                                          | 明确赋值分析   |
| CORRECT-4 | `ModulePanel` 正确创建 3 个带有 `draggable="true"` 和 `data-module-type` 属性的图标                           | DOM 检查       |
| CORRECT-5 | `addModule` 变异正确分配源/汇语义颜色（mutations.test.ts AC2/AC3 — 通过）                                     | 测试验证       |
| CORRECT-6 | `InputManager` 中的拖拽生命周期处理程序已正确注册到 `dragenter`、`dragover`、`drop`、`dragleave`              | 事件监听器审计 |

---

## 第四部分：修正后的风险评估

| 风险                        | 严重程度  | 阻塞合并？                         |
| --------------------------- | --------- | ---------------------------------- |
| Firefox 兼容性破坏（C1）    | 🔴 HIGH   | ✅ 是 — Firefox 用户受影响         |
| TypeScript 编译错误（C4）   | 🟠 MEDIUM | ✅ 是 — `tsc --noEmit` 失败        |
| 内存泄漏（C2）              | 🟠 MEDIUM | ⚠️ 否（低速率 HMR 泄漏，但应修复） |
| NaN/Infinity 边界情况（C3） | 🟡 LOW    | ❌ 否（极端情况）                  |
| 类型安全性差距（C5、C7）    | 🟡 LOW    | ❌ 否                              |

---

## 第五部分：推荐修复计划

### 必须修复（合并前）：

1. **修复 C1 （Firefox `getData`）** — 在 `handleDragEnter` 中存储模块类型，在 `handleDragOver` 中从 `dataTransfer.types` 读取，而非从 `getData()` 读取
2. **修复 C4 （tsc 编译错误）** — 将 `ghostModuleType` 类型更改为 `ModuleType | null`

### 应该修复（发布前）：

3. **修复 C2 （内存泄漏）** — 在 `ModulePanel.destroy()` 中充实 `dragDisposers` 清理
4. **修复 C7 （类型断言防护）** — 添加 `moduleType` 运行时验证

### 建议修复（时间允许时）：

5. **修复 C3 （NaN 边界检查）** — 在 `MinimapRenderer.paint()` 中添加 `Number.isFinite()`
6. **修复 C6 （switch default）** — 在 `drawGhost()` 的 switch 语句中添加 `default: console.warn(...)`
7. **修复 C8 （测试环境）** — 为相应的测试文件添加 `// @vitest-environment jsdom` 指令

---

## 第六部分：与原始审查报告的交叉比对

| 原始审查发现                    | 本次审查结论                             | 性质                             |
| ------------------------------- | ---------------------------------------- | -------------------------------- |
| P1: `pulseStartTime` 未初始化   | **错误** — 在构造函数第 139 行已初始化   | 误报                             |
| P1: Ghost 未应用视口变换        | **错误** — 在 `applyTransform()` 后执行  | 误报                             |
| P1: 缺少 `dragend` → ghost 残留 | **错误** — 三条清理路径完备              | 误报                             |
| P2: `ghostModuleType` 类型过宽  | **已验证**（C4、C5 — 实际缺陷来源）      | ✅ 已确认，严重程度升级为 MEDIUM |
| P2: `onDragStart` 未使用        | **已验证**（PI 级别 — 预留代码）         | ✅ 已确认                        |
| P3: `effectAllowed` 检查不精确  | **已验证**（PI 级别）                    | ✅ 已确认                        |
| 未发现                          | **C1: Firefox `getData()` 破坏** — HIGH  | ☠️ 遗漏（关键）                  |
| 未发现                          | **C2: 内存泄漏** — MEDIUM                | ☠️ 遗漏                          |
| 未发现                          | **C3: NaN/Infinity 边界情况** — LOW      | ☠️ 遗漏                          |
| 未发现                          | **C6: DrawGhost 中的 switch 无默认分支** | ☠️ 遗漏                          |
| 未发现                          | **C7: main.ts 中的不安全类型断言**       | ☠️ 遗漏                          |
| 声称"0 个编译错误"              | **C4: 2 个 tsc 错误** — 实际存在         | ☠️ 遗漏（阻塞）                  |

**最终裁决**：原始审查报告将**三个非问题标记为 CRITICAL**，同时**遗漏了实际的 HIGH 严重程度缺陷**（Firefox 兼容性）、**MEDIUM 内存泄漏**和 **2 个编译错误**。报告应**驳回**并替换为本合并报告。

---

**审查人签名**：Cline (BMad Code Review Workflow — 三层合并)  
**方法**：Blind Hunter · Edge Case Hunter · Acceptance Auditor → 分类 → 合并  
**防伪校验**：所有发现均基于独立文件读取和 CLI 命令执行  
**日期**：2026-05-27
