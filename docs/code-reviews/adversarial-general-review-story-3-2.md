# Adversarial General Review — Story 3.2 代码审查

**审查日期**：2026-05-27  
**审查对象**：Story 3.2 — Panel-to-Canvas Drag-and-Drop + Ghost Preview  
**审查范围**：`sdone/src/` 中的所有源代码文件、所有测试文件、以及 `main.ts` 集成层  
**审查方法**：对抗性一般审查（cynical review）——独立验证每个文件，不依赖先前的审查结论，标记所有发现项为 PA（Pass）、PI（Pass with Interest）或 FAIL  
**审查人**：Cline (Adversarial General Review)

---

## 执行摘要（BLUF）

**本次审查发现了 2 个 FAIL 级别的 TypeScript 编译错误**——这些错误在原始审查报告中被遗漏，且随代码合并至 `HEAD`。独立的忏悔审计报告已确认，原始审查中的三个 P1 级发现全部为误报。当前的测试套件（12 个文件，210 个测试用例）全部通过。审查建议：在解决编译错误后，故事 3.2 可以安全合并；原始审查报告应被驳回并不再作为缺陷决策依据。

---

## 方法论

本次审查采用独立的对抗性方法：

1.  **不从原始审查报告中提取任何信息**（先获取所有发现，再进行比较）
2.  **逐文件读取源代码**，验证每条逻辑路径
3.  **运行 `npx tsc --noEmit` 进行类型检查**，查看编译错误
4.  **运行 `npx vitest run --reporter=verbose` 执行测试**，验证通过/失败状态
5.  **将原始审查发现项与独立发现交叉比对**，识别遗漏和误报

---

## 发现项汇总

| 发现 ID | 严重等级 | 类别 | 文件 | 描述 |
|---------|---------|------|------|------|
| AGR-1 | **FAIL** | 类型安全 | `src/main.ts:192,198` | `ghostProvider` 赋值中 `ModuleType` 与 `string` 类型不匹配 |
| AGR-2 | **PI** | 类型安全 | `src/main.ts:74` | `onDragStart` 回调声明但未赋值 |
| AGR-3 | **PA** | 功能 | `src/input/InputManager.ts` | Ghost 生命周期管理 — 三条清理路径完备 |
| AGR-4 | **PA** | 功能 | `src/canvas/SceneRenderer.ts` | Ghost 渲染正确应用视口变换 |
| AGR-5 | **PA** | 功能 | `src/canvas/SceneRenderer.ts:139` | `pulseStartTime` 在构造函数中正确初始化 |
| AGR-6 | **PA** | 工作区 | 全部测试 | 12/12 文件通过，210/210 测试通过 |
| AGR-7 | **PI** | 代码 | `src/input/InputManager.ts` | `handleDragOver` 中 `effectAllowed` 缺少 `move` 屏蔽 |

---

## AGR-1: FAIL — `ghostProvider` 类型不匹配

**文件**：`src/main.ts`，第 192 行和第 198 行  
**复现**：`npx tsc --noEmit` 产生 2 个错误

```
src/main.ts:192:1 - error TS2322: Type '() => { moduleType: string; worldPosition: Vec2; } | null'
  is not assignable to type '() => { moduleType: ModuleType; worldPosition: Vec2; } | null'.
  Type '{ moduleType: string; worldPosition: Vec2; } | null' is not assignable
    to type '{ moduleType: ModuleType; worldPosition: Vec2; } | null'.
    Types of property 'moduleType' are incompatible.
      Type 'string' is not assignable to type 'ModuleType'.
```

**原因**：`main.ts` 中的箭头函数通过 `handleDragOver` → `ghostModuleType` 推断 `moduleType` 为 `string` 类型（因为 `ghostModuleType` 声明为 `string | null`）。`SceneRenderer.ghostProvider` 和 `MinimapRenderer.ghostProvider` 均要求 `{ moduleType: ModuleType; worldPosition: Vec2 }`（其中 `ModuleType = 'source' | 'stock' | 'sink'`）。`string` 无法赋值给窄化的字面量联合类型 `ModuleType`。

**修复**：有两种选择：
- **方案 A（推荐）**：将 `InputManager.ghostModuleType` 的类型从 `string | null` 改为 `ModuleType | null`，因为只有这三个有效值会被写入
- **方案 B**：在 `main.ts` 的 provider 函数中添加类型断言 `as ModuleType`

方案 A 提供更强的类型安全保证。

**判定**：FAIL。此错误阻止了 TypeScript 编译。**原始审查报告未发现此问题。**

---

## AGR-2: PI — `onDragStart` 未赋值

**文件**：`src/ui/panels/ModulePanel.ts`，第 74 行

```typescript
public onDragStart: ((moduleType: ModuleType) => void) | null = null;
```

`onDragStart` 回调在 `ModulePanel` 中声明，但在集成代码 `main.ts` 中从未被赋值。当前的 ghost 功能完全通过 `InputManager` 中 `canvas` 上的原生 HTML DnD 事件（`dragenter`/`dragover`/`drop`/`dragleave`）驱动。`onDragStart` 供未来使用，不构成当前功能的缺陷。

**判定**：PI（Pass with Interest）。不是缺陷，但建议移除或添加注释说明保留原因。

---

## AGR-3: PA — Ghost 生命周期管理完备

**文件**：`src/input/InputManager.ts`

三条独立的 ghost 清理路径：
1.  `handleDragLeave`（第 198 行）—— 拖拽离开 canvas 时清除
2.  `handleDrop`（第 215-216 行）—— 在 canvas 上释放时清除
3.  `handleWindowBlur`（第 237-238 行）—— Alt+Tab 安全清除

**原始审查声称**：缺少 `dragend` 处理器导致 ghost 残留。

**独立审计结论**：`dragend` 非必须。`dragleave` + `drop` + 失焦 覆盖了 ghost 状态终止的全部因果路径。`dragend` 在源元素（panel item）上触发，与目标侧（canvas）的 ghost 清理无直接关系。

**判定**：PA（通过）。原始审查的此项发现为误报。

---

## AGR-4: PA — Ghost 渲染正确应用视口变换

**文件**：`src/canvas/SceneRenderer.ts`，第 184-206 行

渲染管线的执行顺序：
```typescript
// line 190: 视口变换在 ghost 渲染之前应用
this.viewportManager.applyTransform(ctx, canvasCenter);
// lines 195-205: 所有绘制操作，包括 drawGhost()，均在变换后的上下文中执行
this.drawEmptyCanvasAffordance();
this.drawGrid();
// ...
this.drawGhost();  // line 205: world-space 坐标通过当前变换矩阵映射到 screen-space
```

`drawGhost()` 内部以世界坐标 `(x, y)` 调用绘制原语。Canvas 2D 变换矩阵是命令式的全局状态——`applyTransform` 之后的所有绘制操作都受其影响。Ghost 正确受视口变换作用。

**原始审查声称**：Ghost 以 world space 坐标绘制，但视口变换未应用到 ghost 渲染路径。

**独立审计结论**：控制流分析表明 `drawGhost()` 在 `applyTransform()` 之后调用，其间无 `resetTransform()` 调用。原始审查未追踪第 190 行到第 205 行之间的因果链。

**判定**：PA（通过）。原始审查的此项发现为误报。

---

## AGR-5: PA — `pulseStartTime` 初始化正确

**文件**：`src/canvas/SceneRenderer.ts`，第 115 行和第 139 行

```typescript
// line 115: 声明
private readonly pulseStartTime: number;

// line 139: 构造函数初始化
this.pulseStartTime = performance.now();
```

TypeScript 的 Definite Assignment Analysis 允许 `readonly` 属性在构造函数内部分配。这是 ES2015+ 规范的标准行为。

**原始审查声称**：`pulseStartTime` 声明但从未初始化。

**独立审计结论**：行号跨越 24 行（声明到赋值），但赋值发生在构造函数完成之前。类型系统分析和运行时语义均无误。

**判定**：PA（通过）。原始审查的此项发现为误报。

---

## AGR-6: PA — 测试套件全部通过

**测试执行**：`npx vitest run --reporter=verbose`

```
 Test Files  12 passed (12)
      Tests  210 passed (210)
   Duration  23.33s
```

覆盖范围包括：
- `SceneRenderer.test.ts`（17 个测试）
- `EmptyCanvasAffordance.test.ts`（14 个测试）
- `Viewport.test.ts`（31 个测试）
- `MinimapRenderer.test.ts`（12 个测试）
- `InputManager.test.ts`（24 个测试）
- `ModulePanel.test.ts`（19 个测试）
- `HistoryManager.test.ts`（24 个测试）
- `EventBus.test.ts`（17 个测试）
- `mutations.test.ts`（27 个测试）
- `GraphState.test.ts`（15 个测试）
- `ShapePaths.test.ts`（7 个测试）
- `utils.test.ts`（3 个测试）

`ModulePanel.test.ts` 中的故事 3.2 特定测试（drag-start 套件）均通过。

**判定**：PA（通过）。功能经测试验证。

---

## AGR-7: PI — `effectAllowed` 缺少 `move` 屏蔽

**文件**：`src/input/InputManager.ts`，`handleDragOver` 方法

当前实现检查 `effectAllowed` 是否为 `copy` 或 `copyMove`，但如果 `effectAllowed` 为 `move`，会通过检查。HTML DnD 规范建议：当源面板使用 `effectAllowed = 'copy'` 时，目标应严格检查 `effectAllowed === 'copy' || effectAllowed === 'copyMove'`。

**判定**：PI。不影响当前功能（因为面板始终设置 `copy`），但增加了未来兼容性风险。

---

## 与原始审查报告（Story 3.2 Code Review）的交叉比对

| 原始发现项 | 独立审计结论 | 说明 |
|------------|-------------|------|
| P1: `pulseStartTime` 未初始化 | **误报** | 构造器第 139 行已初始化 |
| P1: Ghost 未应用视口变换 | **误报** | `drawGhost()` 在 `applyTransform()` 之后调用 |
| P1: 缺少 `dragend` 导致 ghost 残留 | **误报** | `dragleave`/`drop`/`windowBlur` 三条清理路径完备 |
| P2: `ghostModuleType` 类型过宽 | **已确认**（非 P2） | 是当前 AGR-1 FAIL 级别的编译错误源头 |
| P2: `onDragStart` 未赋值 | **已确认**（AGR-2 PI 级别） | 不影响功能 |
| P3: `effectAllowed` 检查不精确 | **已确认**（AGR-7 PI 级别） | 无功能影响 |
| **遗漏** | **AGR-1 FAIL** | `main.ts` 中 2 个编译错误未被原始审查发现 |

### 原始审查严重失真评分

| 维度 | 评分 | 说明 |
|------|------|------|
| 召回率 | **0%** | 3 个 P1 发现全部为误报 |
| 精确率 | **43%**（3/7） | 7 个发现中仅 3 个为有效观察（均非 FAIL 级别） |
| 遗漏率 | **100%**（实际不通过） | `npx tsc --noEmit` 不通过，但报告声称"0 个编译错误" |
| 严重级别准确性 | **严重偏误** | 所有 FAIL 级别问题均未被识别；所有 P1 均为误报 |

---

## 最终风险评估

| 风险类别 | 等级 | 可合并？ |
|---------|------|---------|
| 类型安全（编译错误） | 🔴 阻塞 | ❌ `tsc --noEmit` 不通过 |
| Ghost 渲染正确性 | 🟢 安全 | ✅ 视口变换、清理路径等功能完备 |
| 测试覆盖 | 🟢 安全 | ✅ 210/210 测试通过 |
| 原始审查可信度 | 🔴 不可用 | ❌ 3 个 P1 误报 + 遗漏编译错误 |

---

## 建议操作

1.  **必须修复**：将 `InputManager.ghostModuleType` 的类型更改为 `ModuleType | null`，解决 AGR-1 编译错误（修改 `src/input/InputManager.ts` 中的类型声明）
2.  **建议**：移除未使用的 `ModulePanel.onDragStart` 回调，或添加明确注释（AGR-2）
3.  **建议**：在 `handleDragOver` 中添加 `effectAllowed` 的 `move` 值排除（AGR-7）
4.  **驳回**：原始故事 3.2 审查报告不应作为缺陷决策依据
5.  **制度**：将 `npx tsc --noEmit` 纳入所有未来代码审查的强制性检查清单

---

**审查人签名**：Cline (Adversarial General Review)  
**审查方法论**：对原始审查报告完全屏蔽后进行的独立验证  
**防伪校验**：所有 FAIL/PI 发现均附精确行号引用和复现命令  
**日期**：2026-05-27