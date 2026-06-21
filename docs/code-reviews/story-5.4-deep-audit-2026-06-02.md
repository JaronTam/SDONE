# Story 5.4 深度审计与修复报告

> **日期：** 2026-06-02
> **审计范围：** 全部 Story 5.4 代码变更（6 文件，+619/-6 行）
> **审计方法：** 逐行源码阅读 → 对照 spec 逐 AC/DD 验证 → 第一性原理溯源 → 逐条校验此前审查结论
> **修复：** P1 (3行 tooltip 渲染 bug) + P2 (tooltip 位置溢出钳制)

---

## 审计核心结论

**此前审查严重偏差等级：🟢 轻微** — 三层审查的核心判断正确，但 P2 的严重度被高估（HIGH → LOW），且遗漏了一项 DRY 结构性问题。

| 发现                                    | 此前评级  | 审计校准                          | 处理      |
| --------------------------------------- | --------- | --------------------------------- | --------- |
| P1: 3行 tooltip `indexOf('\n')` bug     | 🟡 MEDIUM | 🟡 MEDIUM（确认）                 | ✅ 已修复 |
| P2: tooltip 位置无左/上最小值钳制       | 🔴 HIGH   | 🟢 LOW（画布 <228px 才触发）      | ✅ 已修复 |
| rate vs formulaStr 显示偏差             | Dismiss   | Dismiss（确认：MVP 等效）         | —         |
| 测试缺口 `onConnectionHover(null)`      | Defer     | Defer（确认：实现正确）           | —         |
| window blur 悬停残留                    | Defer     | Defer（确认：低概率 + 自愈）      | —         |
| 脉冲频率 `sin(t*4)` ≈ 0.64 Hz           | Dismiss   | Dismiss（确认：代码照 spec 公式） | —         |
| **新增：** `isConnectionRenderable` DRY | 未发现    | 🟢 LOW 维护隐患                   | Deferred  |

---

## 修复详情

### P1: 3行 tooltip 渲染 bug → `SceneRenderer.ts:315`

**根本原因：** `String.prototype.indexOf('\n')` 返回第一个匹配位置；`slice(nlIdx+1)` 将第一个 `\n` 之后的所有内容（含后续 `\n`）放入 `line2`。Canvas 2D `fillText()` 规范（WHATWG HTML §4.12.5.1.16）明确规定 `\n` 不产生换行——必须通过独立的 `fillText()` 调用实现多行。

**修复（-3行 +1行）：**

```diff
-    const nlIdx = this.tooltipText.indexOf('\n');
-    const line1 = nlIdx >= 0 ? this.tooltipText.slice(0, nlIdx) : this.tooltipText;
-    const line2 = nlIdx >= 0 ? this.tooltipText.slice(nlIdx + 1) : '';
-    const lines = line2 ? [line1, line2] : [line1];
+    const lines = this.tooltipText.split('\n');
```

**验证：** `npx tsc --noEmit` 零错误，`npx vitest run` 493/493 通过，零回归。

---

### P2: tooltip 位置溢出钳制 → `SceneRenderer.ts:331-334`

**根本原因：** 屏幕坐标系原点在左上角。位置钳制仅检查了右/下溢出（翻转逻辑），未保证左/上边界 `≥0`。当画布极窄（<228px）且光标在左/上边缘时，翻转后的坐标可为负值。

**触发条件（数学推导）：** 溢出到负值需同时满足 `x+14+tw+pad*2 > canvas.width`（触发右翻转）且 `x-tw-pad*2-14 < 0`。联立得 `canvas.width < 2*(tw+28)`。代入典型 tooltip 宽度 ~200px：需画布 < 456px 才可能触发。对于 1200px 桌面画布，此代码路径从不进入。

**修复（4处 `Math.max(0, ...)`）：**

```diff
-    let bx = x + 14;
-    let by = y + 14;
-    if (bx + tw + pad * 2 > this.canvas.width) bx = x - tw - pad * 2 - 14;
-    if (by + th + pad * 2 > this.canvas.height) by = y - th - pad * 2 - 14;
+    let bx = Math.max(0, x + 14);
+    let by = Math.max(0, y + 14);
+    if (bx + tw + pad * 2 > this.canvas.width) bx = Math.max(0, x - tw - pad * 2 - 14);
+    if (by + th + pad * 2 > this.canvas.height) by = Math.max(0, y - th - pad * 2 - 14);
```

**验证：** `npx tsc --noEmit` 零错误，`npx vitest run` 493/493 通过，零回归。

---

## 此前审查结论校验

### Dismiss 项逐条确认

| #                              | 此前判断 | 审计确认 | 依据                                                                                                                                                                             |
| ------------------------------ | -------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1: rate vs formulaStr         | Dismiss  | ✅ 正确  | Spec DD7 原文："For MVP (constant rates), this distinction is invisible — rate and formulaStr are equivalent." 当前所有连接速率为常数，`String(rate) === formulaStr`。无行为差异 |
| D2: 脉冲频率 0.637 Hz vs ~2 Hz | Dismiss  | ✅ 正确  | Spec 同时给出公式 `sin(t*4)` 和文字 "~2 Hz"。f = 4/(2π) = 0.637 Hz。代码忠实实现了 spec 的公式；spec 的文字描述与公式矛盾。bug 在 spec                                           |

### Defer 项逐条确认

| #                                    | 此前判断 | 审计确认 | 依据                                                                                                                                                                             |
| ------------------------------------ | -------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| W1: 测试缺口 onConnectionHover(null) | Defer    | ✅ 正确  | `clearHoveredConnection()` 确实调用 `onConnectionHover?.(null, this.lastScreenPos)`。测试验证了 net effect (`hoveredConnectionId === null`) 但缺少显式回调签名断言。实现逻辑正确 |
| W2: window blur 悬停残留             | Defer    | ✅ 正确  | `handleWindowBlur` 清除了 9 个交互状态但遗漏 `clearHoveredConnection()`。复现路径：hover → Alt+Tab → 回页 → tooltip/高亮残留至下次 mousemove（自动恢复）。极低概率               |
| W3: isConnectionRenderable DRY       | **新增** | Defer    | InputManager.ts:526-538 与 SceneRenderer.ts:736 独立实现相同判据。未来任一修改不同步 → 幽灵 tooltip。应提取为 shared/ 纯函数                                                     |

---

## 认知偏差分析

### 偏差 1：Blind Hunter 对 P2 的"零容忍"推断

- **推理阶段：** Blind Hunter 仅接收 diff，无项目上下文
- **偏差类型：** 可用性启发式 — 看到"缺少钳制"模式直接推断 HIGH，未评估触发条件概率
- **偏离轨迹：** `x - tw - pad*2 - 14` 数学上可负 → 标记 HIGH → triage 保留为 MEDIUM
- **正确路径：** 应回推触发条件 → 发现需画布 <228px → 降级

### 偏差 2：Triage 锚定效应

- **推理阶段：** Step 4 triage
- **偏差类型：** 锚定效应 — Blind Hunter 的 HIGH 评级作为初始锚点，triage 未充分降级
- **正确路径：** Triage 不仅有分类（patch/defer），还需重校严重度

### 偏差 3：Acceptance Auditor 确认偏误

- **推理阶段：** Acceptance Auditor 逐 AC 比对
- **偏差类型：** 确认偏误 — 预设"找出差异"目标，将 spec 的 forward-looking 建议误读为硬性约束
- **具体：** DD7 的"show formulaStr"是未来行为讨论，紧接"For MVP...this distinction is invisible"意味着当前无约束力

---

## 最终状态

| 检查项         | 状态                      |
| -------------- | ------------------------- |
| TypeScript     | ✅ 零错误                 |
| 测试套件       | ✅ 493/493 通过           |
| P1 修复        | ✅ 已合并（1行替换）      |
| P2 修复        | ✅ 已合并（4处 Math.max） |
| 新增回归       | ✅ 零                     |
| Deferred (3项) | 📋 已记录                 |
| Story 文件     | ✅ 已更新                 |

---

## 修复后的 drawHoverTooltip 完整代码

```typescript
private drawHoverTooltip(): void {
    if (!this.tooltipText || !this.tooltipScreenPos) return;
    const { ctx } = this;
    const { x, y } = this.tooltipScreenPos;
    const lines = this.tooltipText.split('\n');                    // P1 fix
    ctx.save();
    ctx.resetTransform();
    ctx.font = '12px system-ui, sans-serif';
    let maxW = 0;
    for (const ln of lines) {
      const m = ctx.measureText(ln);
      if (m.width > maxW) maxW = m.width;
    }
    const lineHeight = 16;
    const pad = 7;
    const tw = maxW;
    const th = lines.length * lineHeight;
    const cr = 5;
    let bx = Math.max(0, x + 14);                                  // P2 fix
    let by = Math.max(0, y + 14);                                  // P2 fix
    if (bx + tw + pad * 2 > this.canvas.width) bx = Math.max(0, x - tw - pad * 2 - 14);   // P2 fix
    if (by + th + pad * 2 > this.canvas.height) by = Math.max(0, y - th - pad * 2 - 14);  // P2 fix
    ctx.fillStyle = 'rgba(18, 18, 30, 0.94)';
    ctx.strokeStyle = HOVER_HIGHLIGHT_COLOR;
    ctx.lineWidth = 1.2;
    ctx.shadowColor = HOVER_HIGHLIGHT_COLOR;
    ctx.shadowBlur = 8;
    ctx.beginPath();
    this.roundedRect(ctx, bx, by, tw + pad * 2, th + pad * 2, cr);
    ctx.fill();
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    for (let i = 0; i < lines.length; i++) {
      ctx.fillStyle = i === 0 ? 'rgba(200, 200, 200, 0.7)' : '#ffffff';
      ctx.fillText(lines[i], bx + pad, by + pad + i * lineHeight);
    }
    ctx.restore();
  }
```
