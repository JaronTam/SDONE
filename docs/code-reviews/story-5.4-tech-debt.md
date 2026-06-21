# Story 5.4 技术债务审查

> 日期：2026-06-02  
> 审查范围：`InputManager.ts`、`SceneRenderer.ts`、`main.ts` 中的连接悬停高亮 & 工具提示功能

---

## 1. 性能：悬停检测 O(n) 全表扫描

**位置**：`InputManager.hitTestConnection()` 第 479-497 行

每次 `mousemove` 在空闲状态下遍历**所有**连接，计算屏幕空间点到线段的距离。对于超过 ~200 条连接的图场景，每帧可能消耗数百次 `pointToSegmentDistance` 调用。

**建议**：当连接数 > 50 时，采用空间分箱（screen-space spatial binning）或限制仅在二维画布视口内的连接上迭代（先按画布视口裁剪节点，再只检测包含至少一个可见端点的连接）。

**优先级**：低（当前节点数较小，不影响用户体验）

---

## 2. 数据竞态：hover 触发与渲染帧之间缺少原子性保证

**位置**：`InputManager.handleMouseMove()` 第 655-658 行 → `main.ts` 第 91-99 行

流程：

1. `hitTestConnection()` 返回 `hoveredId`
2. 触发 `onConnectionHover(hoveredId, screenPos)`
3. `main.ts` 读取 `currentState.connections[connectionId]` 以获取 rate 文本

在步骤 1 和步骤 3 之间，用户操作（例如删除连接）可能使连接失效。`currentState.connections[connectionId]` 可能返回 `undefined`。当前代码通过 `conn ? ... : null` 优雅地处理了此情况，但如果 hover 的连接在鼠标移动后被删除，**工具提示将保留**，直到下一次 `mousemove`。

**建议**：每帧渲染前验证 `tooltipText` 对应的连接是否仍然存在（在 `SceneRenderer.tick()` 或 `main.ts` 循环中）。

**优先级**：低（需要精确时序才能触发，影响为短暂显示陈旧提示）

---

## 3. 悬停止清除时传递无效坐标

**位置**：`InputManager.clearHoveredConnection()` 第 521-526 行

```typescript
public clearHoveredConnection(): void {
  if (this.hoveredConnectionId !== null) {
    this.hoveredConnectionId = null;
    this.onConnectionHover?.(null, vec2(0, 0));  // ← (0,0) 是有效的屏幕坐标
  }
}
```

`main.ts` 无条件设置 `sceneRenderer.tooltipScreenPos = screenPos`，即使在清除操作中也是如此。虽然没有工具提示文本渲染（`tooltipText` 已被清除），但 `tooltipScreenPos` 被设置为 `(0,0)`，即画布左上角。如果 `drawHoverTooltip` 被错误地以非空文本调用，工具提示将短暂出现在左上角。

**建议**：当 connectionId 为 null 时，同时清除 `tooltipScreenPos = null`，或让 `main.ts` handler 检查空值：

```typescript
inputManager.onConnectionHover = (connectionId, screenPos) => {
  if (connectionId) {
    const conn = currentState.connections[connectionId];
    sceneRenderer.tooltipText = conn ? `${conn.rate}x` : null;
    sceneRenderer.tooltipScreenPos = screenPos;
  } else {
    sceneRenderer.tooltipText = null;
    sceneRenderer.tooltipScreenPos = null; // 添加此行
  }
};
```

**优先级**：低（当前无可见错误，但属于防御性编程缺失）

---

## 4. 悬停止发光线条宽度缺少可配置性

**位置**：`SceneRenderer.drawConnections()` 内联硬编码值

悬停止的线条宽度使用 `CONNECTION_LINE_WIDTH + 1.5`（即 2.5 + 1.5 = 4.0px），发光模糊半径固定为 18px，发光透明度固定为 0.35。这些值在内联逻辑中硬编码，而非定义为命名常量。

**建议**：将这些值提取为 `CONNECTION_HOVER_WIDTH_DELTA`、`CONNECTION_HOVER_GLOW_BLUR` 和 `CONNECTION_HOVER_GLOW_ALPHA` 常量，与其他渲染常量（第 161-167 行）保持一致。

**优先级**：极低（仅限代码风格，非功能性）

---

## 5. 工具提示无障碍性

**位置**：`SceneRenderer.drawHoverTooltip()` 第 ~410-430 行

工具提示使用 Canvas 2D `fillText` 直接渲染。屏幕阅读器无法访问此内容，用户也无法选中、复制或与之交互。HTML 工具提示叠加层会更具可访问性且更易于样式化。

**建议**：对于非 Canvas 工具提示的未来迭代，考虑使用绝对定位的 `<div>`。

**优先级**：极低（v1 产品需求外）

---

## 6. 测试覆盖缺口：缺少悬停集成测试

**位置**：`InputManager.test.ts`（64 个测试）

现有测试覆盖了 `hitTest`、拖拽和双击逻辑，但没有专门验证以下内容的测试：

- 鼠标悬停在连接上时 `getHoveredConnectionId()` 返回正确的 ID
- 在模块拖拽期间 `onConnectionHover` **不**触发（空闲状态保护）
- `clearHoveredConnection()` 触发 `onConnectionHover(null, ...)`
- 鼠标离开画布时正确清除悬停状态

**建议**：为上述场景添加 3-4 个针对性测试。

**优先级**：中（回归安全网）

---

## 总结

| #   | 问题                           | 严重程度 | 可操作性              |
| --- | ------------------------------ | -------- | --------------------- |
| 1   | O(n) 连接扫描，无空间索引      | 低       | 节点数 > 100 时可操作 |
| 2   | hover 回调与渲染之间的数据竞态 | 低       | 已有 null 守卫        |
| 3   | 清除操作传递 (0,0) 坐标        | 低       | 单行修复              |
| 4   | 内联硬编码的发光/宽度值        | 极低     | 提取为常量            |
| 5   | 无屏幕阅读器可访问性           | 极低     | v2 功能               |
| 6   | 缺少悬停集成测试               | 中       | 3-4 个新测试          |

**整体评估**：Story 5.4 实现干净，无阻塞性技术债务。列出的项目均非关键项，不会影响功能或用户体验。项目 #3 和 #6 是唯一建议在下一个迭代中处理的项目。
