# Story 8.2 代码审查修复报告

**修复日期:** 2026-06-14
**审查报告:** `docs/code-reviews/story-8-2-code-review-2026-06-14.md`
**测试状态:** 88/88 InputManager 测试通过，822/822 全套测试通过
**Context7 验证:** TypeScript 官方文档确认字面量类型拓宽行为（DECISION-1）；Vitest 文档验证 spy/回调测试模式

---

## 修复清单

| ID         | 严重度 | 标题                                                  | 状态                         |
| ---------- | ------ | ----------------------------------------------------- | ---------------------------- |
| PATCH-1    | 🔴 P2  | `isEditingName` 鼠标取消选择时未重置                  | ✅ 已修复                    |
| PATCH-1a   | 🔴 P2  | `isEditingName` 选择变更时未重置（深度审计发现）      | ✅ 已修复                    |
| PATCH-2    | 🔴 P2  | hit-test 函数未过滤到已选模块                         | ✅ 已修复                    |
| PATCH-3    | 🟡 P3  | `hoveredDiamond`/`hoveredHandle` 鼠标取消选择时未清理 | ✅ 已修复（与 PATCH-1 合并） |
| PATCH-4    | 🟡 P3  | `handleMouseLeave` 未清理 diamond/handle hover 状态   | ✅ 已修复                    |
| PATCH-5    | 🟡 P3  | Enter 键二次按下违反 AC9 规范                         | ✅ 已修复                    |
| DECISION-1 | 🟡 P3  | hover 状态字段类型拓宽丢失联合类型精度                | ✅ 已修复（用户选择 A）      |

---

## 修复详情

### PATCH-1 + PATCH-3: `isEditingName`/hover 状态鼠标取消选择时未重置

**修复方式:** 提取 `resetSelectionState()` 公共方法，在 Escape handler 和 `handleMouseUp` 的两个 `onModuleSelect(null)` 调用点统一调用。

**变更文件:** `sdone/src/input/InputManager.ts`

**变更内容:**

1. 新增 `resetSelectionState()` 方法（L224-229）:

```typescript
private resetSelectionState(): void {
  this.isEditingName = false;
  this._isColorPickerOpen = false;
  this.hoveredDiamond = null;
  this.hoveredHandle = null;
}
```

2. Escape handler（L1312-1313）: 替换 4 行手动重置为 `this.resetSelectionState()`

3. `handleMouseUp` 两个 `onModuleSelect(null)` 调用点后添加 `this.resetSelectionState()`

---

### PATCH-1a: `isEditingName` 选择变更时未重置（深度审计发现）

**发现来源:** 深度审计发现 PATCH-1 修复不完整 — `resetSelectionState()` 仅在 `onModuleSelect(null)` 时调用，未在 `onModuleSelect(hitId)`（选择变更）时调用。

**修复方式:** 在 `handleMouseUp` 的 `onModuleSelect(hitId)` 调用点后也添加 `resetSelectionState()`。

**变更文件:** `sdone/src/input/InputManager.ts`

**变更内容:**

```typescript
this.onModuleSelect?.(hitId);
// PATCH-1a fix: reset selection-scoped state on selection change
// (clicking a different module also needs reset, not just deselect)
this.resetSelectionState();
```

**遗漏路径:**

```
1. 选中模块 A → 按 Enter → isEditingName = true
2. 点击模块 B → onModuleSelect('B') → isEditingName 仍为 true
3. 按 Enter → !isEditingName 为 false → Enter 被静默吞掉
```

---

### PATCH-2: hit-test 函数未过滤到已选模块

**修复方式:** 在 hover 检测块中，对 hit-test 结果按 `selectedModuleIdProvider` 返回的 ID 进行过滤。

**变更文件:** `sdone/src/input/InputManager.ts`

**变更内容:**

```typescript
// PATCH-2 fix: only report hover for the selected module
const selectedId = this.selectedModuleIdProvider?.();

// Diamond hover
const rawDiamondHit = this.hitTestConnectionPointInstance(current);
const diamondHit =
  rawDiamondHit && rawDiamondHit.moduleId === selectedId ? rawDiamondHit : null;

// Handle hover
const rawHandleHit = this.hitTestResizeHandleInstance(current);
const handleHit =
  rawHandleHit && rawHandleHit.moduleId === selectedId ? rawHandleHit : null;
```

---

### PATCH-4: `handleMouseLeave` 未清理 diamond/handle hover 状态

**修复方式:** 在 `handleMouseLeave` 中添加 diamond/handle hover 清理逻辑，触发 `onDiamondHover`/`onHandleHover` 回调传递 `null`。

**变更文件:** `sdone/src/input/InputManager.ts`

**变更内容:**

```typescript
// PATCH-4 fix: clear diamond/handle hover on cursor leave
if (this.hoveredDiamond !== null) {
  this.hoveredDiamond = null;
  this.onDiamondHover?.(null, null, this.lastScreenPos);
}
if (this.hoveredHandle !== null) {
  this.hoveredHandle = null;
  this.onHandleHover?.(null, null, this.lastScreenPos);
}
```

---

### PATCH-5: Enter 键二次按下违反 AC9 规范

**修复方式:** 重构 Enter handler，当模块选中时 Enter 永远不调用 `onModulePlaceAtCenter`。

**变更文件:** `sdone/src/input/InputManager.ts`, `sdone/src/input/InputManager.test.ts`

**变更内容:**

```typescript
// PATCH-5 fix: when a module is selected, Enter NEVER places a new module (AC9)
if (e.code === "Enter") {
  e.preventDefault();
  if (this.isDragging) return;
  if (this.selectedModuleIdProvider?.() != null) {
    if (!this.isEditingName) {
      this.isEditingName = true;
    }
    // When a module is selected, Enter NEVER places a new module (AC9)
  } else {
    // IDLE state: V1.0 behavior preserved
    this.onModulePlaceAtCenter?.();
  }
  return;
}
```

测试更新：`"second Enter when already editing falls through to onModulePlaceAtCenter"` → `"second Enter when already editing does NOT place module (AC9)"`，断言从 `toHaveBeenCalledTimes(1)` 改为 `not.toHaveBeenCalled()`。

---

### DECISION-1: hover 状态字段类型拓宽丢失联合类型精度

**用户决策:** A — 修复（恢复精确联合类型）

**修复方式:** 将 `hoveredDiamond`/`hoveredHandle` 字段和 instance wrapper 返回类型从 `string` 改为精确联合类型。

**变更文件:** `sdone/src/input/InputManager.ts`

**变更内容:**

```typescript
// 之前
private hoveredDiamond: { moduleId: string; edge: string } | null = null;
private hoveredHandle: { moduleId: string; corner: string } | null = null;

// 之后
private hoveredDiamond: { moduleId: string; edge: 'top' | 'bottom' | 'left' | 'right' } | null = null;
private hoveredHandle: { moduleId: string; corner: 'nw' | 'ne' | 'sw' | 'se' } | null = null;
```

Instance wrapper 返回类型同步更新。

---

## 验证

| 测试套件             | 结果       |
| -------------------- | ---------- |
| InputManager.test.ts | 88/88 ✅   |
| 全套测试             | 822/822 ✅ |

---

## 未修复项（DEFER/DISMISS）

| ID        | 严重度 | 处置                                                                          |
| --------- | ------ | ----------------------------------------------------------------------------- |
| DEFER-1   | ⚪ P4  | `classifyHitZone` 死代码 + `@ts-ignore` — Story 8.5 后评估                    |
| DEFER-2   | ⚪ P4  | `_isResizing`/`_isColorPickerOpen` 前向声明 + `@ts-ignore` — Story 8.5 后清理 |
| DISMISS-1 | ⚪ P4  | `isDragging` getter 未包含 `_isResizing` — Story 8.5 职责                     |
| DISMISS-2 | ⚪ P4  | `!= null` 松散等号缺少解释注释 — 可选改进                                     |
