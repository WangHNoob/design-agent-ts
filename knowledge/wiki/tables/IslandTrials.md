---
type: table_schema
title: "表族 IslandTrials"
group: "IslandTrials"
table_count: 7
---

# 表族 `IslandTrials`

共 7 张表。数据源：`knowledge/gamedata/`。

## 成员表清单
| 表名 | 字段数 | 相对路径 |
|------|--------|----------|
| `IslandTrials/IslandTrialsActivityTime` | 4 | IslandTrials/IslandTrialsActivityTime.xlsx |
| `IslandTrials/IslandTrialsBuffGroup` | 9 | IslandTrials/IslandTrialsBuffGroup.xlsx |
| `IslandTrials/IslandTrialsCopy` | 13 | IslandTrials/IslandTrialsCopy.xlsx |
| `IslandTrials/IslandTrialsDifficult` | 2 | IslandTrials/IslandTrialsDifficult.xlsx |
| `IslandTrials/IslandTrialsEntrance` | 6 | IslandTrials/IslandTrialsEntrance.xlsx |
| `IslandTrials/IslandTrialsRankReward` | 6 | IslandTrials/IslandTrialsRankReward.xlsx |
| `IslandTrials/StarCollectedReward` | 2 | IslandTrials/StarCollectedReward.xlsx |

## 字段明细
### `IslandTrials/IslandTrialsActivityTime`
- `id` · `activity` · `startTime` · `endTime`

### `IslandTrials/IslandTrialsBuffGroup`
- `id` · `buffGroup` · `buffAll` · `buffType` · `buffDesc` · `raidStarContion` · `conflict` · `showScoreUp`
- `attackScoreChange`

### `IslandTrials/IslandTrialsCopy`
- `id` · `islandTrialsEntrance` · `difficult` · `difficultTitle` · `enemyGroup` · `mapID` · `buffGroup` · `attackScore`
- `levelName` · `unlockLevel` · `raidStarContion` · `islandTrialsStarReward` · `copyText`

### `IslandTrials/IslandTrialsDifficult`
- `difficult` · `difficultTitle`

### `IslandTrials/IslandTrialsEntrance`
- `id` · `activity` · `bossInfo` · `startMinutesEarly` · `stopChallengeTime` · `rankChallengeGroupID`

### `IslandTrials/IslandTrialsRankReward`
- `id` · `rankGroupID` · `rank` · `headTitleReward` · `itemReward` · `mailId`

### `IslandTrials/StarCollectedReward`
- `starNumber` · `reward`
