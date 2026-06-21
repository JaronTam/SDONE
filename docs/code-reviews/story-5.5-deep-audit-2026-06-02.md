# Story 5.5 深度审计报告

**审计日期**: 2026-06-02
**审计对象**: `_bmad-output/implementation-artifacts/5-5-achievement-toast-system-great-and-gongxi.md`
**审计方法**: 逐句逐段交叉比对 epics.md、ux-design-specification.md、architecture.md 以及实际代码库 (`sdone/src/`)
**审计原则**: 第一性原理校准——不维持前文一致性，诚实披露所有偏差；不产生"为认错而认错"的递归讨好行为

---

## 一、审计核心结论

**严重偏差等级: LOW**

Story 5.5 文档在宏观层面正确地捕获了所有 5 条 Acceptance Criteria，架构决策与现有代码库模式一致，文件清单和"请勿触碰"清单均准确。文档的实质性偏差集中分布在**类型定义、CSS 动画实现细节、import 声明完整性**三个微观层面，共 4 处实际偏差，无阻塞性错误。

前文（story 创建过程 + 后续 review）在逻辑和事实上基本正确，不存在需要推翻的结论。以下偏差均为具体实现细节层面的补充修正。

---

## 二、偏差明细清单

### 偏差 1 [MEDIUM] — `ConfettiParticle` 类型在两处重复定义，无权威来源

**位置**: Task 2.2 (第 115-135 行) 和 Task 5.1 (第 314-321 行)

**偏差描述**:

- Task 2.2 要求将 `ConfettiParticle` interface 定义在 `SceneRenderer.ts` 或 shared types 文件中
- Task 5.1 在 `ConfettiEngine.ts` 的 Public API 中再次定义了**同一个** interface
- 两处定义结构相同但 JSDoc 不一致，且 story 未指定哪一处是权威来源
- Task 5.1 要求 `export { ConfettiEngine, ConfettiParticle }` 从 `canvas/index.ts` 导出，暗示 `ConfettiEngine.ts` 拥有此类型。但 Task 2.2 的替代方案（"加到 SceneRenderer.ts"）与之冲突

**后果**: dev agent 可能将同一类型定义在两个文件中，导致 TypeScript 报 duplicate identifier 错误，或产生两个结构相同但导入路径不同的类型。

**实际代码库证据**: `canvas/index.ts` (第 15 行) 当前导出模式为集中式 barrel export:

```typescript
export { ParticleEngine, type ParticleState } from "./ParticleEngine.js";
```

`ParticleState` 类型定义在 `ParticleEngine.ts` 中，通过 barrel 导出。`ConfettiParticle` 应遵循相同模式。

---

### 偏差 2 [LOW] — `ConfettiParticle.x` 的 JSDoc 注释错误

**位置**: Task 2.2, 第 117-118 行

**偏差描述**:

```typescript
/** World-space center of the burst. */
x: number;
y: number;
```

`x` 和 `y` 是**每个粒子的当前世界空间位置**，不是"爆发中心"。爆发中心是 `ConfettiEngine.burst(worldX, worldY)` 的参数，值仅在粒子初始化时使用一次，后续粒子独立运动。

**正确 JSDoc**:

```typescript
/** Current world-space position of this particle. */
x: number;
y: number;
```

**后果**: dev agent 如果信任此 JSDoc，可能在渲染逻辑中错误地将所有粒子绘制在爆发中心而非各自的当前位置。

---

### 偏差 3 [MEDIUM] — CSS slide-in 动画缺少关键的实现细节

**位置**: Task 1.1, 第 48 行

**偏差描述**:

> "Slide-in animation: CSS transition `transform: translateX(120%)` → `translateX(0)` over 300ms ease-out"

CSS transition 的核心机制是**在状态变化之间插值**，而非从 CSS class 的初始值动画到最终值。如果元素创建时直接以 `transform: translateX(0)` 渲染，transition 不会触发——因为没有"从 A 到 B"的状态变化。

**缺失的关键步骤**:

1. 创建元素时添加 `--entering` class（`transform: translateX(120%)`）
2. 将元素 append 到 DOM（此时元素在屏幕外）
3. 在**下一个动画帧**（`requestAnimationFrame`）中移除 `--entering` class
4. 浏览器检测到 `transform` 从 `translateX(120%)` 变为 `translateX(0)`，触发 300ms transition

**实际代码库证据**: `ColorPickerPopover.ts` 不使用 CSS transition 做入场动画——它直接在 `open()` 中设置 `left`/`top` 并添加 mousedown listener，没有 slide-in 效果。Story 5.5 的 toast 是该代码库中**第一个**需要入场动画的 DOM 组件，因此没有现成模式可参照。

**补充**: 相同的两阶段模式也适用于 dismiss——先添加 `--exiting` class，在 `transitionend` 事件后 `remove()`:

```typescript
dismiss(toastId: string): void {
  const el = this.activeToasts.get(toastId);
  if (!el) return;
  el.classList.add('achievement-toast--exiting');
  el.addEventListener('transitionend', () => {
    el.remove();
    this.activeToasts.delete(toastId);
    this.repositionToasts();
  }, { once: true });
  clearTimeout(this.timers.get(toastId));
}
```

---

### 偏差 4 [LOW] — main.ts 缺少 `ConfettiParticle` 类型的 import 声明

**位置**: Task 5.2, 第 348 行

**偏差描述**:

```typescript
let confettiParticles: ConfettiParticle[] | null = null;
```

此行代码使用了 `ConfettiParticle` 类型，但 story 未提及需要在 main.ts 中添加对应的 import。

**实际代码库证据**: main.ts 第 15 行当前导入:

```typescript
import {
  CanvasResizer,
  ViewportManager,
  SceneRenderer,
  MinimapRenderer,
  getEdgePoint,
  ParticleEngine,
} from "./canvas/index.js";
```

需要追加 `ConfettiParticle`（或 `type ConfettiParticle`）到此 import。

**注意**: `ConfettiParticle` 仅在类型位置使用（`let confettiParticles: ConfettiParticle[] | null`），应使用 `type` 导入以避免运行时依赖:

```typescript
import { ..., type ConfettiParticle } from './canvas/index.js';
```

---

## 三、修正与原点溯源

### 修正 1: `ConfettiParticle` 类型定位

**修正方案**: 在 Task 2.2 中明确指定类型定义在 `ConfettiEngine.ts` 中，`SceneRenderer.ts` 通过 `canvas/index.ts` barrel 导入。删除 Task 2.2 中"or a shared types file"的模糊表述。

**第一性原理溯源**:

- **原点**: Architecture Decision 6 规定的 barrel export 模式——`canvas/` 目录下的模块通过 `index.ts` 集中导出，消费者不直接跨文件 import。
- **偏离原因**: 生成时未严格遵循"类型所有者 = 行为所有者"原则。`ConfettiParticle` 的生命周期由 `ConfettiEngine` 管理（`burst()` 创建、`update()` 驱逐、`reset()` 销毁），因此 `ConfettiEngine.ts` 是类型的自然所有者。此前 Task 2.2 写出"or a shared types file"是因为在尚未完全确定 ConfettiEngine 架构时过早定义了类型——属于"先生成渲染侧代码，后生成引擎侧代码"的顺序偏差。
- **正确模式**: `ParticleEngine.ts` → 定义 `Particle` + `ParticleState` → 由 `canvas/index.ts` 导出 → `SceneRenderer.ts` 通过 barrel 导入。ConfettiParticle 类推。

### 修正 2: JSDoc 注释

**修正方案**: 将 `ConfettiParticle.x` / `ConfettiParticle.y` 的 JSDoc 改为 `Current world-space position of this particle.`

**第一性原理溯源**:

- **原点**: Canvas 渲染中，粒子系统的每个粒子是独立实体，拥有各自的位置、速度和生命周期。`x`/`y` 是瞬时状态，不是初始化参数。
- **偏离原因**: 生成此 JSDoc 时，思维在描述 `ConfettiEngine.burst(worldX, worldY)` 的语义——那个坐标确实代表"爆发中心"。在编写 `ConfettiParticle` interface 时，这个语义被**错误传递**到了粒子自身的 `x`/`y` 字段上。这是典型的上下文污染——函数参数语义渗透到了数据结构字段语义。
- **认知锚点**: `ParticleEngine.ts` 中 `Particle` interface 的 `t` 字段注释为 "Normalized position along the connection path"——描述的是**粒子自身的状态**，而非粒子所属连接的属性。这是正确模式。

### 修正 3: CSS 入场动画

**修正方案**: 在 Task 1.1 中补充两阶段动画实现细节（见偏差 3 的补充代码）。

**第一性原理溯源**:

- **原点**: CSS transition 的本质是"检测 computed style 变化，在当前值和目标值之间插值"。如果元素插入 DOM 时 computed style 已经是目标值，则没有变化可插值，transition 不触发。
- **偏离原因**: 生成文档时使用了"声明式思维"——直接描述了"从 X 到 Y 的动画"的**视觉效果**，而省略了实现该效果所需的**命令式步骤**。这源自概率模型在描述 UI 动画时的常见模式：倾向于输出视觉规范（"slide in from right"）而跳过浏览器渲染管线的实现约束（"must start off-screen, then change class on next frame"）。
- **补救**: 参照 Web Animations API 规范——任何 CSS transition 的触发需要 (a) 初始 computed style ≠ 目标 computed style, (b) 样式变化发生在渲染管线的同一帧内。两阶段 `requestAnimationFrame` 模式是该约束的标准解法。

### 修正 4: import 声明

**修正方案**: 在 Task 5.2 中增加导入 `ConfettiParticle` 类型的步骤。

**第一性原理溯源**:

- **原点**: TypeScript 的类型系统需要类型在声明位置可见。`ConfettiParticle` 定义在 `canvas/ConfettiEngine.ts`，使用方 `main.ts` 需要通过 barrel export 导入。
- **偏离原因**: 功能关注点偏差——生成 wiring 代码时注意力集中在"数据如何流动"（provider → SceneRenderer），忽略了"类型如何可见"（import → declaration）。
- **认知锚点**: Story 5.3 的 `colorPickerPopover` 不需要类型导入（它的类型 `OpenOptions` 仅在 `ColorPickerPopover.ts` 内部使用，不暴露给 main.ts）。Story 5.5 的 `confettiParticles` 不同——它是 main.ts 闭包变量，需要显式类型声明，因此 import 是必需的。

---

## 四、认知偏差分析

### 本阶段生成过程中的推理节点偏离

**生成阶段回顾**:

1. ✅ 读取 epics.md → 正确提取 5 条 AC
2. ✅ 读取 architecture.md → 正确识别 `ACHIEVEMENT_UNLOCKED` 事件已存在
3. ✅ 读取 main.ts → 正确找到 `onConnectionDragEnd`、RESET handler、dispose 插入点
4. ✅ 读取 ColorPickerPopover.ts → 正确提取 DOM overlay 模式
5. ✅ 读取 SceneRenderer.ts → 正确识别 provider pattern 和 drawFrame 调用顺序
6. ⚠️ 编写 Task 2.2 (ConfettiParticle 类型) → **此处发生偏差 #1 和 #2**
7. ⚠️ 编写 Task 1.1 (CSS 动画) → **此处发生偏差 #3**
8. ⚠️ 编写 Task 5.2 (main.ts wiring) → **此处发生偏差 #4**
9. ✅ Review 阶段 → 修正了 editorial cruft、drawFrame 代码、destroy task —— 但未检测到偏差 #1-#4

### 节点 6 的偏差机制

**偏离节点**: 从"理解 ParticleEngine 模式"到"为 ConfettiEngine 设计类型"的推理跳跃。

**机制**: 模型同时持有两个知识片段：

- (A) `Particle` interface 在 `ParticleEngine.ts` 中定义——类型在行为所有者处
- (B) `SceneRenderer` 需要通过 provider 消费 confetti 粒子数据

在生成 Task 2.2 时，模型优先处理 (B)——"SceneRenderer 需要渲染 confetti，所以 ConfettiParticle 类型应该可以在 SceneRenderer.ts 中定义"。然后在 Task 5.1 处理 (A) 时，再次定义了相同的类型。模型未能在这两个任务之间建立"单一权威来源"的约束。

**概率解释**: 在 transformer 的自回归生成中，Task 2.2 和 Task 5.1 之间有大量中间 token（约 180 行）。当到达 Task 5.1 时，Task 2.2 的具体内容已退出有效的注意力窗口，导致模型"重新发明"了同一个类型而不自知。

### 节点 7 的偏差机制

**偏离节点**: 描述 CSS transition 视觉效果 → 生成实现细节。

**机制**: CSS transition 的"声明式描述"和"命令式实现"之间的语义鸿沟是 LLM 在 UI 代码生成中的已知弱点。模型倾向于将"translateX(120%) → translateX(0)"这种视觉描述直接当作实现方案输出，而省略了 requiredAnimationFrame 的两阶段模式。这是训练数据中 UI 教程和实际代码的比例失衡导致的——教程更多描述"做什么"，实际代码包含"怎么做"。

### 节点 8 的偏差机制

**偏离节点**: 编写 main.ts wiring 代码 → 类型声明完整性检查。

**机制**: 这是一个注意力聚焦偏差——模型在编写 confetti 数据流（`confettiEngine.update()` → `confettiParticles` → `sceneRenderer.confettiProvider()`）时，全部注意力在**值流**上。TypeScript 类型导入属于基础设施细节，在生成复杂的 wiring 代码时被注意力机制边缘化。

### Review 阶段的漏检分析

前述 review（用户请求 "Review the comprehensive story" 之后）修正了 6 处问题，但未检测到偏差 #1-#4。原因：

- Review 侧重于**宏观一致性**（AC 是否完整、架构决策是否正确、与 source artifact 是否冲突）
- 偏差 #1-#4 属于**微观实现细节**级别的错误（类型定义位置、JSDoc 一句话、CSS 动画触发机制、一个 import 声明）
- Review 的注意力跨度不足以对每个代码块进行编译器级别的类型追踪

### 系统性改进建议

1. **类型定义审查规则**: 对于任何在多处被引用的 interface/type，验证其只在一个文件中定义，并通过 barrel export 传播。
2. **CSS 动画审查规则**: 对于任何声明了 CSS transition 的组件，验证文档中是否包含触发该 transition 的命令式步骤（初始 class → DOM append → rAF 移除 class）。
3. **TypeScript import 完整性**: 对于在 wiring 代码中使用的每个类型标注，验证使用方文件的 import 列表是否包含该类型。

---

## 五、结论

Story 5.5 文档在核心架构决策、AC 覆盖、文件边界、反模式预防方面均正确。4 处偏差均为微观实现细节级别，不影响 dev agent 理解整体任务，但若不修正可能导致：

- **偏差 #1**: TypeScript 编译错误（重复类型定义）
- **偏差 #3**: Toast 无 slide-in 动画（功能正确但视觉不符合 AC1 规范）
- **偏差 #2, #4**: 极低概率触发问题（JSDoc 误导 + import 缺失）

**建议**: 在接受此审计报告后，对 story 文档应用偏差 #1-#4 的修正，然后再启动 `dev-story` 实施。

---

## 六、实施后代码审查（2026-06-03）

**审查方式**: 3 层并行对抗性审查（Blind Hunter + Edge Case Hunter + Acceptance Auditor）
**审查范围**: 4 个修改文件 + 7 个新增文件，~660 行代码

### 6.1 原始发现（去重后 10 项）

| #   | 严重度 | 发现                                                          | 来源       |
| --- | :----: | ------------------------------------------------------------- | ---------- |
| 1   |   —    | Toast z-index:100 低于 ColorPicker z-index:1000，comment 矛盾 | blind+edge |
| 2   |   P1   | Border flash `Math.sin(t*8)` = 1.27 Hz，非 spec 的 8 Hz       | auditor    |
| 3   |   P2   | transitionend `{once:true}` 未过滤 propertyName               | edge       |
| 4   |   P3   | drawConfetti 外层 save/restore 冗余（审计校正：内层必需）     | blind      |
| 5   |   P2   | drawBorderFlash 每帧 shadowBlur 性能开销                      | blind      |
| 6   |   P3   | dismissAll() 遗留未追踪的 400ms safety timeout                | edge       |
| 7   |   P2   | ConfettiEngine.update() 直接返回内部数组引用                  | edge       |
| 8   |   P2   | Border flash 用 .find() 仅收集首个 source/sink                | edge       |
| 9   |   P2   | dismiss() 无重复调用守卫                                      | edge       |
| 10  |   P2   | Slide-out transform 用 ease-out 而非 spec 的 ease-in          | auditor    |

### 6.2 驳回（1 项）

- Blind Hunter #4 "两阶段动画缺少 forced reflow" — `requestAnimationFrame` 在 style recalc 后、paint 前触发，两阶段模式是 Web 标准惯用法，无需 `void el.offsetHeight`。

### 6.3 审计中的自我校正

本次审查执行了二次独立审计，对上一轮（3 层审查）的发现进行了逐条真实性校验。结果：

- **严重度高估 2 处**: transitionend 风险（P1→P2，实际触发概率极低）、safety timeout（P2→P3，回调有守卫检查无副作用）
- **根因反转 1 处**: save/restore 冗余定位从"内层冗余"纠正为"外层冗余"
- **0 处虚假发现**: 所有 10 项发现事实正确

### 6.4 10 项全部修复完成

| 文件                       | 修改                                                     |
| -------------------------- | -------------------------------------------------------- |
| `achievement-toast.css`    | z-index 100→1001 + comment 修正 + --exiting ease-in 覆盖 |
| `SceneRenderer.ts`         | 8 Hz 公式 + 移除外层 save/restore + 移除 shadowBlur      |
| `AchievementToast.ts`      | propertyName 过滤 + dismissed 守卫 + safetyTimerId 追踪  |
| `AchievementToast.test.ts` | Event → TransitionEvent 适配 propertyName                |
| `ConfettiEngine.ts`        | `[...this.particles]` 防御性拷贝                         |
| `main.ts`                  | `.filter()` + `Set` 收集所有 source/sink                 |

### 6.5 验证

- `npx tsc --noEmit` ✅ 零错误
- `npx vitest run` ✅ 514/514 通过

### 6.6 偏差 #1-#4 实施验证

原始审计（2026-06-02）标记的 4 处 spec 偏差，在实施中得到正确处理：

| 偏差 | 原始定位                      | 实施结果                                                                |
| :--: | ----------------------------- | ----------------------------------------------------------------------- |
|  #1  | ConfettiParticle 类型两处定义 | ✅ `ConfettiEngine.ts` 为单一权威来源，SceneRenderer 通过 barrel import |
|  #2  | x/y JSDoc 错误                | ✅ 修正为 "Current world-space position of this particle"               |
|  #3  | CSS 动画缺少两阶段细节        | ✅ 实施代码包含 `requestAnimationFrame` 两阶段模式                      |
|  #4  | main.ts 缺少 import           | ✅ `type ConfettiParticle` 通过 barrel import                           |

### 6.7 最终结论

Story 5.5 从 spec 到实施到审查的完整链路质量评估：**高**。4 处 spec 偏差在实施前全部修正，10 处代码发现在审查后全部修复，零阻塞性 bug。
