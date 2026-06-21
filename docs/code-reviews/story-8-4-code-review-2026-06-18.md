# Story 8.4 代码审查报告 — ToolbarController DOM Lifecycle

**审查日期:** 2026-06-18
**审查对象:** Story 8.4 (ToolbarController DOM Lifecycle)
**审查方法:** 对抗性多层审查（Blind Hunter / Edge Case Hunter / Acceptance Auditor）+ 源文档交叉验证
**审查人:** Claude (bmad-code-review)

---

## 审查范围

| 文件                                              | 操作 | 行数                        |
| ------------------------------------------------- | ---- | --------------------------- |
| `sdone/src/ui/overlays/ToolbarController.ts`      | 新建 | 387                         |
| `sdone/src/ui/overlays/styles/toolbar.css`        | 新建 | 80                          |
| `sdone/src/ui/styles/layout.css`                  | 修改 | +1 行 (`--z-toolbar: 100;`) |
| `sdone/src/ui/overlays/index.ts`                  | 修改 | +2 行 (导出)                |
| `sdone/src/ui/overlays/ToolbarController.test.ts` | 新建 | 594                         |

---

## 总体结论

**评级: B+ (良好，有 2 处 P2 缺陷 + 3 处 P3 缺陷需修复)**

实现整体忠实于 Story 8.4 spec，30 项 AC 中 28 项完全满足。代码遵循 ColorPickerPopover 的 DOM 生命周期模式，BEM 命名规范，回调注入架构正确。26 个单元测试全部通过。

但存在 2 处 P2 缺陷（影响健壮性/类型安全）和 3 处 P3 缺陷（影响代码质量），需在 Story 8.6 集成前修复。

---

## 缺陷清单

### 🔴 P2 缺陷（影响健壮性/类型安全，Story 8.6 前必须修复）

#### P2-1: `destroy()` 中 `_options` 赋值为 null 的类型转换是反模式

**文件:** `ToolbarController.ts:207`
**严重度:** P2

```typescript
destroy(): void {
  this.hide();
  // Nullify callback references (prevent post-destroy calls)
  (this._options as ToolbarControllerOptions | null) = null;
}
```

**问题:**

1. **类型转换赋值是反模式:** `(this._options as ToolbarControllerOptions | null) = null` 这种写法依赖 TypeScript 的类型断言绕过字段声明类型。虽然 `tsc --noEmit` 通过（因为断言允许左侧为联合类型），但这是脆弱的 — 未来 TypeScript 严格模式升级可能破坏此写法。
2. **字段声明与实际行为不一致:** 字段声明为 `private _options: ToolbarControllerOptions;`（非可空），但 `destroy()` 后实际为 null。所有回调调用处都有 `if (this._options)` 守卫（L229, L290, L368, L383），说明开发者意识到这个不一致，但未在类型层面表达。
3. **与 ColorPickerPopover 模式不一致:** 参考实现 `ColorPickerPopover.ts` 的 `destroy()` 只调用 `close()`，不 nullify 回调引用（因为其回调是公开字段 `onColorPicked`，生命周期由调用方管理）。

**修复方案:**

```typescript
// 方案 A（推荐）: 将字段声明为可空
private _options: ToolbarControllerOptions | null;

destroy(): void {
  this.hide();
  this._options = null;
}

// 方案 B: 不 nullify，依赖 hide() 移除所有事件监听器即可
destroy(): void {
  this.hide();
}
```

方案 A 更安全 — 显式表达"destroy 后回调不可用"的契约，且消除类型断言。

---

#### P2-2: 测试文件 TC-25 导入审计使用 `node:fs` 导致 `tsc --noEmit` 失败

**文件:** `ToolbarController.test.ts:539-560`
**严重度:** P2

```typescript
it("TC-25: ToolbarController.ts imports nothing from state/, canvas/, simulation/, event-bus/ (AC24)", async () => {
  const { readFileSync } = await import("node:fs");
  const { resolve, dirname } = await import("node:path");
  const { fileURLToPath } = await import("node:url");
  // ...
});
```

**问题:**

1. **TypeScript 编译失败:** `npx tsc --noEmit` 报 3 个错误：
   - `TS2591: Cannot find name 'node:fs'`
   - `TS2591: Cannot find name 'node:path'`
   - `TS2591: Cannot find name 'node:url'`

   原因：`tsconfig.json` 的 `types` 字段只包含 `["vite/client"]`，未包含 `@types/node`。动态 `import('node:fs')` 在类型检查时无法解析。

2. **项目无先例:** 搜索整个 `sdone/src/**/*.test.ts`，这是唯一使用 `node:fs`/`node:path`/`node:url` 的测试文件。其他测试文件不进行文件系统读取。

3. **测试虽通过但 CI 可能失败:** Vitest 运行时能通过（因为 Node.js 运行时支持 `node:fs`），但如果 CI 流水线包含 `tsc --noEmit` 步骤，将失败。

4. **未使用的变量:** 同文件 L343 `pressEscape` 函数声明但从未使用（`TS6133`），进一步表明测试文件未经 `tsc` 验证。

**修复方案:**

```typescript
// 方案 A（推荐）: 用静态字符串常量替代文件读取
it("TC-25: ToolbarController.ts imports nothing from state/, canvas/, simulation/, event-bus/ (AC24)", () => {
  // 静态断言：ToolbarController.ts 的唯一 import 是 Vec2
  // 如果未来添加了禁止的导入，此测试需手动更新
  const expectedImport = "import type { Vec2 } from '../../shared/Vec2.js';";
  // 通过 require.context 或构建时内联验证
  // ...
});

// 方案 B: 在 tsconfig.json 中添加 @types/node
// "types": ["vite/client", "node"]
// 但这会影响整个项目，需评估副作用

// 方案 C（最小改动）: 删除 TC-25，改为在 CI 中用 grep 脚本验证
// scripts/check-imports.sh:
// grep -E "from '(state|canvas|simulation|event-bus)/" src/ui/overlays/ToolbarController.ts && exit 1
```

同时删除未使用的 `pressEscape` 函数（L343-353）。

---

### 🟡 P3 缺陷（影响代码质量，建议修复）

#### P3-1: `_restoreNameSpan()` 重新绑定 click 监听器但未通过 `_bindListeners()` 统一管理

**文件:** `ToolbarController.ts:317-339`

```typescript
private _restoreNameSpan(displayText: string): void {
  // ...
  const clickHandler = (e: MouseEvent) => {
    e.stopPropagation();
    this._enterEditMode();
  };
  nameSpan.addEventListener('click', clickHandler);
  this._boundNameClick = clickHandler;
  // ...
}
```

**问题:**

- `_bindListeners()` 在 `show()` 时绑定初始 click 监听器。`_restoreNameSpan()` 在编辑退出时创建新的 span 元素并绑定新的 click 监听器。这导致监听器绑定逻辑分散在两处，违反单一职责。
- 虽然功能正确（`_boundNameClick` 被更新，`_unbindListeners()` 能正确移除），但增加了维护成本。

**建议:** 可接受现状，但在注释中说明"click 监听器在 `_restoreNameSpan` 中重新绑定是因为 span 元素被替换"。

---

#### P3-2: `updateData()` 在编辑模式下更新 input.value 可能丢失用户光标位置

**文件:** `ToolbarController.ts:161-168`

```typescript
if (this._isEditing) {
  // Update input value to reflect tick changes
  const input = this._el!.querySelector(
    `.${NAME_EDITING_CLASS}`,
  ) as HTMLInputElement | null;
  if (input) {
    input.value = data.label;
  }
}
```

**问题:**

- Story 8.6 集成后，`updateData()` 会在每个 simulation tick 被调用。如果用户正在编辑名称，每次 tick 都会用 `data.label`（来自 GraphState 的旧值）覆盖 input.value，导致：
  1. 用户输入的字符被覆盖
  2. 光标位置重置到末尾

- 测试 TC-26 验证了"编辑时 `_preEditName` 不更新"，但未验证"编辑时 input.value 不被覆盖"。实际上，当前实现会覆盖 input.value。

**分析:**

- spec AC6 说 "updateData re-renders name, color dot, and data text"，未明确编辑时的行为。
- Dev Notes 说 "Update pre-edit name when NOT editing"，暗示编辑时不应更新名称显示。
- 当前实现更新了 input.value，这与 Dev Notes 的暗示矛盾。

**修复方案:**

```typescript
// 编辑时跳过 name 更新（用户正在输入，不应被覆盖）
if (!this._isEditing && this._nameEl) {
  this._nameEl.textContent = data.label;
}
// 删除编辑时更新 input.value 的分支
```

**风险:** 低 — 编辑模式下名称尚未提交到 GraphState，`data.label` 仍是旧值，覆盖 input.value 没有合理用途。

---

#### P3-3: `toolbar.css` 缺少 `.toolbar__color-dot--hidden` 修饰类（Subtask 2.6 未实现）

**文件:** `toolbar.css`

**问题:**

- Story spec Task 2 Subtask 2.6 要求: "`.toolbar__color-dot--hidden` styles (display: none — for Stock)"
- 实际实现使用内联样式 `this._colorDotEl.style.display = 'none'`（L176）而非 BEM 修饰类。
- AC19 说 "hidden via CSS `display: none` or omitted entirely"，内联样式技术上满足 AC，但违反了 Subtask 2.6 的 BEM 规范和 AC25 的 BEM 强制要求。

**建议:**

- 添加 `.toolbar__color-dot--hidden { display: none; }` 到 CSS
- 修改 `updateData()` 使用 `classList.add/remove` 而非内联样式

```typescript
// 修改后
if (data.moduleType === "stock") {
  this._colorDotEl.classList.add(`${COLOR_DOT_CLASS}--hidden`);
} else {
  this._colorDotEl.classList.remove(`${COLOR_DOT_CLASS}--hidden`);
  // ...
}
```

---

## AC 验证矩阵

| AC   | 描述                         | 状态 | 验证依据                                         |
| ---- | ---------------------------- | ---- | ------------------------------------------------ |
| AC1  | Show on select               | ✅   | TC-02: show() 创建 DOM 并 append 到 body         |
| AC2  | Hide on deselect             | ✅   | TC-04, TC-05: hide() 移除 DOM，幂等              |
| AC3  | Source/Sink data format      | ✅   | TC-07, TC-09: color dot + name + data text       |
| AC4  | Stock data format            | ✅   | TC-08: 无 color dot，dataTextColor 应用          |
| AC5  | Position update              | ✅   | TC-06: left/top CSS 属性正确设置                 |
| AC6  | Data update                  | ✅   | TC-10: show() 前调用安全                         |
| AC7  | Styling per UX-DR1           | ✅   | toolbar.css 匹配所有设计令牌                     |
| AC8  | Enter edit mode via click    | ✅   | TC-11: span→input，focus+select，回调触发        |
| AC9  | Commit via Enter             | ✅   | TC-12, TC-13: trim + 截断 + 回调                 |
| AC10 | Commit via blur              | ✅   | TC-16: blur 触发 commit                          |
| AC11 | Revert via Escape            | ✅   | TC-17: 还原 + stopPropagation + 回调             |
| AC12 | Empty name fallback          | ✅   | TC-14, TC-15: 空白→类型默认值                    |
| AC13 | 50-char max                  | ✅   | TC-13: maxlength + 截断                          |
| AC14 | Edit state visual            | ✅   | CSS `.toolbar__name--editing` 匹配               |
| AC15 | Keyboard suppression         | ✅   | InputManager `isEditingTarget()` 自动处理        |
| AC16 | Escape layered exit          | ✅   | TC-18: 非编辑时 Escape 不拦截                    |
| AC17 | Color dot display            | ✅   | TC-19: mousedown 触发回调                        |
| AC18 | Color dot interaction        | ✅   | TC-19: preventDefault + stopPropagation          |
| AC19 | Stock excludes color dot     | ⚠️   | TC-20: display:none 但用内联样式非 BEM 类 (P3-3) |
| AC20 | Constructor lightweight      | ✅   | TC-01: 无 DOM 访问                               |
| AC21 | show() creates and mounts    | ✅   | TC-02, TC-03: 幂等                               |
| AC22 | hide() removes and cleans    | ✅   | TC-04: 监听器先移除再 remove                     |
| AC23 | destroy() full teardown      | ✅   | TC-23: 多次调用安全                              |
| AC24 | Immutable Boundary #1        | ✅   | TC-25: 仅导入 Vec2                               |
| AC25 | BEM CSS enforcement          | ⚠️   | 缺少 `--hidden` 修饰类 (P3-3)                    |
| AC26 | z-index custom property      | ✅   | layout.css: `--z-toolbar: 100`                   |
| AC27 | ToolbarData interface        | ✅   | 接口定义匹配 spec                                |
| AC28 | Callback injection interface | ✅   | 4 个回调匹配 spec                                |
| AC29 | B2 resolved                  | ✅   | AC16 实现                                        |
| AC30 | DEFER-2b addressed           | ✅   | onColorDotClick 回调就绪                         |

---

## 亮点

1. **Escape 分层退出实现精确:** `_enterEditMode()` 的 keydown 监听器只在编辑时绑定到 input 元素，非编辑时无监听器拦截 Escape，自然冒泡至 InputManager。这完全符合 AC16 的"分层退出"语义。

2. **`_preEditName` 同步逻辑正确:** `updateData()` 在非编辑时更新 `_preEditName`，编辑时保留原值。TC-26 验证了这一行为，确保 Escape 还原到编辑前的值。

3. **DOM 清理顺序正确:** `hide()` 遵循 "removeEventListener → parentNode?.remove() → nullify" 顺序，符合 Enforcement Rule 5。

4. **防御性编程:** 所有回调调用前都有 `if (this._options)` 守卫，所有 DOM 操作前都有 null 检查。

5. **类型安全:** `ToolbarData` 和 `ToolbarControllerOptions` 接口定义清晰，`moduleType` 使用字面量联合类型。

---

## InputManager 集成交叉验证

验证了 `InputManager.ts` 中与 ToolbarController 集成相关的代码：

1. **`isEditingName` 标志 (L209):** InputManager 在 Enter 键处理中设置 `isEditingName = true` (L1384)。Story 8.6 需将此路径连接到 `ToolbarController.startEditing()`。

2. **`onToolbarNameClick` / `onColorDotClick` 回调 (L363, L366):** 已前向声明，签名匹配 ToolbarController 的回调接口（但 InputManager 版本接收 `moduleId` 参数，ToolbarController 版本无参数 — Story 8.6 接线时需适配）。

3. **`_isColorPickerOpen` (L212):** 仍有 `@ts-ignore TS6133`，符合 AC30 的预期（Story 8.6 接线后移除）。

4. **Escape 处理 (L1333-1356):** InputManager 的 Escape handler 在非拖拽状态下调用 `onModuleSelect(null)` 取消选择。ToolbarController 在编辑时 `stopPropagation()` 阻止此路径，非编辑时不阻止 — 集成正确。

5. **`isEditingTarget()` (L137-145):** 检查 `document.activeElement` 是否为 `HTMLInputElement`。ToolbarController 的 name input 是 `<input>` 元素，自动被此检查覆盖 — AC15 满足。

---

## 修复优先级

| 优先级 | 缺陷                                   | 工作量       | 截止            |
| ------ | -------------------------------------- | ------------ | --------------- |
| 🔴 P2  | P2-1: `_options` 类型转换反模式        | 小（~5 行）  | Story 8.6 前    |
| 🔴 P2  | P2-2: 测试文件 `node:fs` 导致 tsc 失败 | 小（~15 行） | 立即（阻塞 CI） |
| 🟡 P3  | P3-1: click 监听器绑定分散             | 小（注释）   | 任意            |
| 🟡 P3  | P3-2: 编辑时 input.value 被覆盖        | 小（~3 行）  | Story 8.6 前    |
| 🟡 P3  | P3-3: 缺少 BEM `--hidden` 修饰类       | 小（~5 行）  | 任意            |

---

## 测试验证

```
npx vitest run src/ui/overlays/ToolbarController.test.ts
✓ 26 tests passed (237ms)
```

所有 26 个测试通过，覆盖 AC1-AC28 的核心行为。

**但注意:** `npx tsc --noEmit` 报 4 个错误（全部在测试文件中），主实现文件无错误。
