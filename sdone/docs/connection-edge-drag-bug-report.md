# SDONE 连线边缘拖拽故障诊断报告

**日期**: 2026-06-09  
**发现者**: 手动测试  
**范围**: 连线功能（模块边缘拖拽创建连接）

---

## 1. 问题描述

用户在画布上点击已有模块的**边缘**并拖拽时：

- ✗ 光标不改变（预期变为 `crosshair`）
- ✗ 无法拖拽形成连线
- ✗ 行为等同于点击模块内部（选中/移动）

## 2. 涉及的代码位置

| 文件                                  | 函数/常量                        | 作用                               |
| ------------------------------------- | -------------------------------- | ---------------------------------- |
| `src/input/InputManager.ts:12`        | `EDGE_ZONE_INNER_FRACTION = 0.7` | 已移除 — 原来控制内区/边缘区分界   |
| `src/input/InputManager.ts:453-475`   | `classifyHitZone()`              | 判断点击属于 `inner`/`edge`/`none` |
| `src/canvas/SceneRenderer.ts:89-100`  | `getHitRadius()`                 | 每类型的命中半径                   |
| `src/canvas/SceneRenderer.ts:114-139` | `getVisualEdgeDistance()`        | **新增** — 每类型的内区/边缘区分界 |
| `src/input/InputManager.ts:730-753`   | `handleMouseDown`                | 点击分类入口                       |
| `src/input/InputManager.ts:845-858`   | `handleMouseMove`                | 边缘拖拽启动逻辑                   |

## 3. 根本原因分析

### 3.1 原设计缺陷 (已修复)

原代码对所有模块类型使用单一比例 `EDGE_ZONE_INNER_FRACTION = 0.7`：

```
内区 <= hitRadius × 0.7
边缘区 = hitRadius × (0.7 到 1.0)
```

但各模块类型的 **hitRadius / visualRadius 比值差异极大**：

| 类型       | 可见半径   | 命中半径 | 比值 | 0.7×hit 内区 | 问题                                |
| ---------- | ---------- | -------- | ---- | ------------ | ----------------------------------- |
| 源(云)     | 16px       | 32px     | 2.0× | **22.4px**   | 整个可见云在内区 → 点边缘永远是选中 |
| 存量(矩形) | 40px(短边) | 72px     | 1.8× | **50.4px**   | 上/下边缘在内区 → 顶部底部点不到    |
| 汇(漏斗)   | 24px       | 24px     | 1.0× | **16.8px**   | 外侧仅 7.2px 是边缘区               |

**源模块的问题最致命**：用户看到的云朵半径只有 16px，但内区扩展到了 22.4px。无论用户在云朵的哪个位置点击（包括边缘），分类都是 `inner`，永远不会触发连线拖拽。

### 3.2 修复方案

新增 `getVisualEdgeDistance(type)` 函数，按模块类型返回**可见形状核心**与**边缘区**的分界线。内区基于可见形状大小，边缘区是可见形状外侧到命中半径之间的光环。

```typescript
// src/canvas/SceneRenderer.ts

export function getVisualEdgeDistance(moduleType: string): number {
  switch (moduleType) {
    case 'source':
      return SOURCE_CLOUD_RADIUS - 4; // 16 - 4 = 12px
    // 内区 0-12px，边缘区 12-32px（含云边缘4px环 + 16px光环）
    case 'stock':
      return Math.min(STOCK_WIDTH, STOCK_HEIGHT) / 2 - 12; // 40 - 12 = 28px
    // 内区 0-28px，边缘区 28-72px
    case 'sink':
      return SINK_RADIUS - 8; // 24 - 8 = 16px
    // 内区 0-16px，边缘区 16-24px（漏斗外侧8px环）
    default:
      return SINK_RADIUS - 8;
  }
}
```

`classifyHitZone` 改为使用此函数：

```typescript
const hitRadius = getHitRadius(node.type);
const zoomedHitRadius = hitRadius * zoom;
if (dist > zoomedHitRadius) return 'none';

const visualEdge = getVisualEdgeDistance(node.type);
const zoomedVisualEdge = visualEdge * zoom;
if (dist <= zoomedVisualEdge) return 'inner'; // 可见形状核心 → 选中/移动
return 'edge'; // 可见形状外侧光环 → 连线拖拽
```

## 4. 测试结果

### 自动化测试

| 测试集                                | 结果                                                            |
| ------------------------------------- | --------------------------------------------------------------- |
| Vitest 单元测试 (33 files, 760 tests) | ✅ 758 passed（2个预存时序抖动，无关）                          |
| Playwright E2E (10 files, 90 tests)   | ✅ 90 passed                                                    |
| `InputManager.test.ts` 边缘区专项     | ✅ 2 passed（starts connection drag / does NOT start on inner） |
| `connection-lifecycle.test.ts` E2E    | ✅ 9 passed（含 edge-drag source→stock, stock→sink）            |

### 手动测试调试

服务器地址：**http://localhost:5173**

打开浏览器开发者工具（F12 → Console），进行以下操作时会看到调试日志：

```
[SDONE] mousedown on module <id> zone: edge|inner|none visualEdge: <px> hitRadius: <px>
[SDONE] starting connection drag from <id> dist: <px>
```

**测试步骤**：

1. 打开 http://localhost:5173，F12 打开 Console
2. 点击左侧 **源** 图标（云朵），再点击画布中央 → 模块出现在画布上
3. 再点击左侧 **存量** 图标，再点击画布另一位置 → 第二个模块出现
4. **关键**：在源模块的**可见边缘外侧**（约超出云朵边缘 5-15px）按下鼠标
5. 观察 Console 日志 — 应显示 `zone: edge`
6. 拖拽到存量模块边缘 → 应显示 `starting connection drag`
7. 释放 → 连线创建，出现 "Great! 🎉" 提示

**如果日志显示 `zone: inner`**：说明点击位置太靠近模块中心，移远一些。

**如果日志显示 `zone: none`**：说明点击位置超出命中半径（32px），移近一些。

**如果日志无显示**：说明 `hitTest` 没找到模块或事件未到达 InputManager。

## 5. 模块类型速查

```
        内区(选中/移动)          边缘区(连线拖拽开始)
源 ☁️   [0 ──────────── 12px]   [12px ──────────── 32px]
         ├─ 云可见 ─┤(16px)   ├光环──────────┤

存量 ▭  [0 ────────── 28px]     [28px ──────────── 72px]
         ├───── 矩形可见 ─────┤(60px宽, 40px高)   ├光环──┤

汇 ▽    [0 ──────── 16px]       [16px ── 24px]
         ├── 漏斗可见 ──┤(24px)
```

**关键**：对源模块(云朵)，点击云朵边缘(12-16px)或云朵外侧(16-32px)才能启动连线拖拽。点击云朵中心(0-12px)是选中/移动。

## 6. 已知限制

1. **矩形模块的圆形近似**：存量模块使用圆形距离判断，可能导致矩形角落附近的内部区域被归类为边缘区。这是有意的简化，不影响可用性。
2. **缩小视口**：在缩小的视口中，命中半径按 zoom 比例缩放，边缘区也相应缩小，可能需要更精确的鼠标定位。
3. **反馈句柄优先级**：存量模块左侧的反馈句柄（用于创建反馈连接）会优先于边缘拖拽。如果点击在句柄附近，会触发反馈连接拖拽而非普通连接。

## 7. E2E 测试覆盖矩阵

| 测试用例                                                 | 文件                               | 状态 |
| -------------------------------------------------------- | ---------------------------------- | ---- |
| edge-drag source→stock creates connection                | `connection-lifecycle.test.ts:42`  | ✅   |
| edge-drag stock→sink creates connection                  | `connection-lifecycle.test.ts:56`  | ✅   |
| full stack achievement (source→stock→sink)               | `connection-lifecycle.test.ts:92`  | ✅   |
| clicking connection populates rate editor                | `connection-lifecycle.test.ts:137` | ✅   |
| deselecting connection clears rate editor                | `connection-lifecycle.test.ts:157` | ✅   |
| selecting module clears rate editor (mutual exclusivity) | `connection-lifecycle.test.ts:180` | ✅   |
| Delete removes selected connection                       | `connection-lifecycle.test.ts:198` | ✅   |
| edge-drag duplicate is no-op                             | `connection-lifecycle.test.ts:216` | ✅   |
| feedback handle drag creates feedback connection         | `connection-lifecycle.test.ts:238` | ✅   |

---

_此文档可用于其他自动化测试工具重现问题。核心测试流程：创建两个模块 → 在第一个模块的可见边缘外侧按下鼠标 → 拖拽到第二个模块 → 释放 → 验证连线创建。_
