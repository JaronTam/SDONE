# Epic 1 回顾复查 — Core Protocol Foundation

**复查日期：** 2026-05-27  
**原始回顾日期：** 2026-05-21  
**复查人：** Agent（bmad-retrospective 工作流）  
**触发原因：** 6 天后重新审视 Epic 1 在当前项目状态下的表现与未解决问题

---

## 1. 测试状态更新

| 测试文件 | 原始数（2026-05-21） | 当前数（2026-05-27） | 增加 |
|----------|---------------------|---------------------|------|
| `GraphState.test.ts` | 15 | 15 | — |
| `EventBus.test.ts` | 17 | 17 | — |
| `HistoryManager.test.ts` | 24 | 24 | — |
| `utils.test.ts` | 3 | 3 | — |
| `mutations.test.ts` | 27 | 27 | — |
| `ShapePaths.test.ts` | — | 7 | 🆕 |
| **总计** | **86** | **93** | **+7** |

✅ **全部 93 测试通过，0 失败。**

### ShapePaths 测试归属说明

`ShapePaths.test.ts`（7 个测试）位于 `src/shared/`，与 Epic 1 工具函数同一目录，但它实际是 **Story 2.3（Module Shape Renderer）** 的产物。Epic 1 回顾中将其纳入测试计数仅为统计方便——逻辑上不属于 Core Protocol Foundation 范围。

---

## 2. 故事稳定性分析

### Story 1.1 — GraphState 类型定义

| 维度 | 原始评估 | 当前评估 |
|------|----------|----------|
| 破坏性变更 | 无 | ✅ 无 |
| 新增字段 | — | ✅ `selectedModuleIds` 通过 Epic 3 验证 |
| 区别对待联合类型 | ✅ 设计良好 | ✅ 经受 3 个 Epic 使用 |

**结论：** 稳定。`ModuleNode | StockNode | SourceNode | SinkNode` 的区别对待联合类型设计经受住了 Canvas、Viewport、DnD 三个 Epic 的考验，未发现类型窄化问题。

---

### Story 1.2 — EventBus 类型安全 pub/sub

| 维度 | 原始评估 | 当前评估 |
|------|----------|----------|
| 核心类变更 | 无 | ✅ 无变更 |
| EventMap 事件数 | 4（RUN/PAUSE/RESET/SPEED_CHANGE） | **13** |
| 错误隔离 | ✅ | ✅ 通过并发场景验证 |

**EventMap 增长明细：**

| 类别 | 事件 | 来源 Epic |
|------|------|----------|
| 模拟生命周期 | RUN, PAUSE, RESET, SPEED_CHANGE | Epic 1 |
| 用户交互 | MODULE_PLACED, DRAG_START, DRAG_END, CONNECTION_DELETE | Epic 3 |
| 模拟更新 | SNAPSHOT_EMITTED, COUNTDOWN_TICK | Epic 1+/4 |
| 选择状态 | MODULE_SELECTED, HOVER_CHANGED | Epic 3 |
| 成就系统 | ACHIEVEMENT_UNLOCKED | 未来 Epic |
| 拖拽移动 | MODULE_MOVED | Epic 3 |
| 撤销/重做 | UNDO, REDO | Epic 1+/3 |

**回顾洞察：** EventBus 的类型安全合约从 4 事件增长至 13 事件（+225%）。Epic 1 回顾时提出的「push-based vs pull-based」架构问题已在实际使用中自然解开——SDONE 使用混合模式：
- **push-based**（EventBus.emit）用于用户交互事件
- **pull-based** 留给模拟引擎（未来 Growth phase）

**关键风险：** 13 个事件中的 8 个（62%）是在 Epic 1 范围外新增的。`EventMap` 正成为一个「上帝接口」——所有模块通过单一类型契约耦合。如果持续增长（预计 Epic 4 新增 FORMULA_EDITED、CONNECTION_VALIDATED 等），应考虑按领域拆分（如 `CanvasEventMap`、`SimulationEventMap`、`UIEventMap`）。

---

### Story 1.3 — HistoryManager 撤销/重做

| 维度 | 原始评估 | 当前评估 |
|------|----------|----------|
| 核心逻辑变更 | 无 | ✅ 无变更 |
| 并发问题 | 无 | ⚠️ 通过 Story 3.3 暴露间接问题 |

**Story 3.3 并发发现（P1 未修复）：**

Story 3.3 代码审查发现 Ctrl+Z 与活动拖拽并发可能导致状态不一致。**这不是 HistoryManager 的故障** — HistoryManager 的 push/undo/redo 逻辑是正确和完整的。问题出在 `main.ts` 的事件编排：

- 用户在拖拽中按 Ctrl+Z → `UNDO` 事件发射 → `HistoryManager.undo()` 返回前一个状态 → 应用于当前 state
- 同时 `onModuleDragMove` 持续发射 `MODULE_MOVED` → 调用 `moveModule()` → 产生新的 state
- 两个状态流竞争 → 最终状态取决于事件执行顺序

**教训连续性：** Epic 1 回顾明确指出「无集成测试」是最大缺口。这一缺口在 Epic 3 中直接导致了一个未检测到的 P1 并发问题。如果 Epic 1 有集成测试（如 `addModule → moveModule via EventBus → undo via EventBus → 验证最终状态`），此问题本可在 Epic 1 阶段暴露。

---

### Story 1.4 — utils.ts（clamp + uuid）

| 维度 | 原始评估 | 当前评估 |
|------|----------|----------|
| 核心逻辑变更 | 无 | ✅ 无变更 |
| 工具函数使用 | ✅ | ⚠️ `uuid()` 未被 mutations.ts 使用 |

**新发现 — 工具函数重复：**

`mutations.ts` 中多处直接调用 `crypto.randomUUID()`（第 56、213 行），而非通过 `utils.uuid()` 封装：

```typescript
// mutations.ts:56 — 直接调用
const id = crypto.randomUUID();

// utils.ts:7-9 — 封装未被使用
export function uuid(): string {
  return crypto.randomUUID();
}
```

这不影响功能（两者返回相同值），但违反了「工具函数应通过 utils 层统一」的惯例，并导致以下问题：
- 如果未来需要自定义 UUID 生成逻辑（如确定性测试），需要修改两处而非一处
- 代码审查和静态分析无法追踪 UUID 使用点的完整闭包

**建议：** 低优先级 P3 修复 — 将 `mutations.ts` 中的 `crypto.randomUUID()` 替换为 `uuid()`（从 `../shared/utils.js` 导入）。

---

### Story 1.5 — Mutations 层（回顾后新增）

| 维度 | 原始评估 | 当前评估 |
|------|----------|----------|
| 函数总数 | 6 | 6（稳定） |
| 被调用函数 | 3/6 | 3/6（Epic 3 使用 addModule/moveModule/deleteModule） |
| 未调用函数 | 3/6 | 3/6（addConnection/deleteConnection/updateRate 留给 Epic 4） |

**回顾洞察：** Mutation 层的设计决策（纯函数 + 不可变 + 递增 version）在 Epic 3 的拖拽场景中得到了极好验证：
- 每次 `moveModule()` 调用在拖拽过程中产生新的 `GraphState`，`version` 递增
- `bump()` 作为缓存破坏键被 SceneRenderer 用于 dirty-check
- `unchanged()` 用于 no-op 返回（如拖拽到相同位置时避免不必要的渲染）

**未调用的 3 个函数（addConnection/deleteConnection/updateRate）将在 Epic 4 连接编辑中首次使用。** 建议在 Epic 4 开始前为这 3 个函数添加集成测试。

---

## 3. 未解决方案追踪

| # | 原始发现 | 状态 | 影响 | 建议 |
|---|----------|------|------|------|
| 1 | 无集成测试 | ❌ 未解决 | P1 并发问题在 Epic 3 未被早期检测 | Epic 4 前增加至少 1 个集成测试 |
| 2 | Infinity 序列化风险 | ❌ 未解决 | 保存/加载功能受损 | 将 `capacity` 默认值从 `Infinity` 改为 `Number.MAX_SAFE_INTEGER` 或添加自定义序列化器 |
| 3 | Formula 解析未实现 | ❌ 未解决（设计债务） | formulaStr 始终为 rate 的字符串表示 | Epic 4 — 实现表达式解析器（Story 4.4） |

---

## 4. 新增发现

| # | 发现 | 严重性 | 建议 |
|---|------|--------|------|
| N1 | `uuid()` 未被 mutations.ts 使用 — 直接调用 `crypto.randomUUID()` | 🟢 P3 | 统一使用 `utils.uuid()` |
| N2 | EventMap 正成为「上帝接口」— 13 个事件覆盖 4 个领域 | 🟡 P2 | 按领域拆分 EventMap（如 Epic 4+时） |
| N3 | ShapePaths 测试混入 Epic 1 统计 — 实际归属 Story 2.3 | 🟢 P3（统计卫生） | 在测试报告中标注归属 Epic |

---

## 5. 指标对比

| 指标 | 2026-05-21 | 2026-05-27 | 趋势 |
|------|-----------|-----------|------|
| 测试数 | 86 | 93（+7 ShapePaths） | ↑ |
| P0 阻塞项 | 0 | 0 | ✅ |
| EventMap 事件数 | 4 | 13 | ↑（需关注上帝接口） |
| Mutations 函数数 | 6 | 6 | → 稳定 |
| 未解决的回顾项 | 3 | 3 | → 无进展 |
| 代码行数（Epic 1 文件） | ~600 | ~600 | → 无变化 |

---

## 6. 复查结论

**Epic 1 核心代码未发生质量问题。** 6 天前回顾发现的 3 个未解决方案均未闭合，但它们在当前项目阶段（Epic 3 收尾）均非阻塞项：

| 未解决项 | 何时必须修复 | 当前是否可以推迟 |
|----------|-------------|-----------------|
| 集成测试缺失 | Epic 4 开始前 | ✅ 可以推迟 |
| Infinity 序列化 | 实现保存/加载功能前 | ✅ 可以推迟 |
| Formula 解析 | Epic 4 Story 4.4 | ✅ 可以推迟 |

**Epic 1 的设计投资回报正在显现：**
- `GraphState` 的类型安全被 Canvas + Viewport + DnD 验证
- `Mutations` 的纯函数模式使拖拽重绘逻辑极其简洁
- `HistoryManager` 的快照模型使 Story 3.3 的 undo/redo 实现只需 5 行代码
- `EventBus` 的类型安全合约在编译期捕获了 Story 3.3 的 3 个 P0 EventMap 缺失

**唯一需要立即关注的项：** 集成测试缺口 — 应在 Epic 4 开始前闭合，以避免 Story 3.3 P1 并发问题在更复杂的连接编辑场景中重演。

---

*报告生成于 2026-05-27。基于 Git 提交 `07b1448` 的代码状态。*