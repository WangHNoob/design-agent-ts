---
type: table_schema
title: "表族 navigationPass"
group: "navigationPass"
table_count: 5
---

# 表族 `navigationPass`

共 5 张表。数据源：`knowledge/gamedata/`。

## 成员表清单
| 表名 | 字段数 | 相对路径 |
|------|--------|----------|
| `navigationPass/NavigationPassActive` | 4 | navigationPass/NavigationPassActive.xlsx |
| `navigationPass/NavigationPassLevel` | 9 | navigationPass/NavigationPassLevel.xlsx |
| `navigationPass/NavigationPassServerReward` | 5 | navigationPass/NavigationPassServerReward.xlsx |
| `navigationPass/NavigationPassTask` | 11 | navigationPass/NavigationPassTask.xlsx |
| `navigationPass/NavigationPassTime` | 4 | navigationPass/NavigationPassTime.xlsx |

## 字段明细
### `navigationPass/NavigationPassActive`
- `id` · `level` · `needExp` · `award`

### `navigationPass/NavigationPassLevel`
- `id` · `type` · `level` · `lowAward` · `highAward` · `upLevelExp` · `isImportantLevel` · `lowTitleId`
- `highTitleId`

### `navigationPass/NavigationPassServerReward`
- `id` · `timeId` · `isNewServer` · `serverRange` · `rewardType`

### `navigationPass/NavigationPassTask`
- `id` · `taskType` · `descr` · `type` · `needTimes` · `exp` · `active` · `texture`
- `desc` · `targetId` · `playerExp`

### `navigationPass/NavigationPassTime`
- `id` · `startTime` · `endTime` · `type`
