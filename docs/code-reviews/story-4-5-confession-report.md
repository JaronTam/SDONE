# Story 4.5 — Rate Editor Panel 接线记录

## 本轮修改（main.ts）

1. `onRateSubmit` — 历史快照改为突变之前推送（撤销顺序修正）
2. `onRateSubmit` — 增加无变化防护 + 版本检查
3. `onModuleDelete` — 增加 `rateEditorPanel.setConnection(null)`
4. `onConnectionDelete` — 增加 `rateEditorPanel.setConnection(null)`

## 矛盾

### 1. 12 次提交未发现差距
- RateEditorPanel.test.ts 从一开始就存在，但 main.ts 接线未对照测试逐条验证

### 2. Spec vs 测试的撤销语义矛盾
- AC2/AC7 写了「POST-mutation push」
- 测试文件实际上按「PRE-mutation push」来写
- 测试是最权威的行为契约

### 3. Cross-cutting concern 遗漏
- 模块删除/连线删除时未清除右侧面板
- Story spec 未显式列出此场景

## 教训
- 测试 > spec：当两者矛盾时以测试为准
- 接线代码必须对照测试逐条验证
- Cross-cutting concern（删除→清除面板）容易遗漏