---
type: table_schema
title: "表族 yearactivity"
group: "yearactivity"
table_count: 9
---

# 表族 `yearactivity`

共 9 张表。数据源：`knowledge/gamedata/`。

## 成员表清单
| 表名 | 字段数 | 相对路径 |
|------|--------|----------|
| `yearactivity/YearDailySignIn` | 2 | yearactivity/YearDailySignIn.xlsx |
| `yearactivity/YearFunActivityQA` | 6 | yearactivity/YearFunActivityQA.xlsx |
| `yearactivity/YearFunActivityRiddle` | 4 | yearactivity/YearFunActivityRiddle.xlsx |
| `yearactivity/_YearActivityBuff` | 7 | yearactivity/_YearActivityBuff.xlsx |
| `yearactivity/_YearActivityChapter` | 6 | yearactivity/_YearActivityChapter.xlsx |
| `yearactivity/_YearActivityStage` | 17 | yearactivity/_YearActivityStage.xlsx |
| `yearactivity/_YearActivityTask` | 4 | yearactivity/_YearActivityTask.xlsx |
| `yearactivity/_YearActivityTaskInfo` | 4 | yearactivity/_YearActivityTaskInfo.xlsx |
| `yearactivity/_YearFunActivity` | 4 | yearactivity/_YearFunActivity.xlsx |

## 字段明细
### `yearactivity/YearDailySignIn`
- `dayNum` · `rewards`

### `yearactivity/YearFunActivityQA`
- `questionId` · `questionType` · `questionText` · `answerText` · `answerValue` · `yesReward`

### `yearactivity/YearFunActivityRiddle`
- `questionId` · `questionText` · `answerValue` · `yesReward`

### `yearactivity/_YearActivityBuff`
- `id` · `buffId` · `weight` · `chapter` · `buffIcon` · `buffContent` · `buffEffect`

**出向外键** (1):
- `buffId` → `fight/_Buff`

### `yearactivity/_YearActivityChapter`
- `id` · `killNum` · `fightSceneId` · `openTime` · `endTime` · `fightCount`

### `yearactivity/_YearActivityStage`
- `id` · `chapter` · `stage` · `costItems` · `enemyGroupId` · `boxItems` · `items` · `fightSceneId`
- `monsterId` · `stageType` · `repeatAttack` · `attackTimes` · `refreshTimes` · `infoPanelBgId` · `skipWeight` · `refreshCost`
- `sweepItems`

### `yearactivity/_YearActivityTask`
- `id` · `award` · `subtype` · `times`

### `yearactivity/_YearActivityTaskInfo`
- `id` · `subtype` · `title` · `content`

### `yearactivity/_YearFunActivity`
- `7` · `1` · `9999` · `12`
