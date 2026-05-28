---
type: table_schema
title: "表族 SeaExplore"
group: "SeaExplore"
table_count: 7
---

# 表族 `SeaExplore`

共 7 张表。数据源：`knowledge/gamedata/`。

## 成员表清单
| 表名 | 字段数 | 相对路径 |
|------|--------|----------|
| `SeaExplore/SeaExploreBuffGroup` | 11 | SeaExplore/SeaExploreBuffGroup.xlsx |
| `SeaExplore/SeaExploreCopy` | 11 | SeaExplore/SeaExploreCopy.xlsx |
| `SeaExplore/SeaExploreIncome` | 4 | SeaExplore/SeaExploreIncome.xlsx |
| `SeaExplore/SeaExploreOpen` | 14 | SeaExplore/SeaExploreOpen.xlsx |
| `SeaExplore/SeaExploreRandReward` | 4 | SeaExplore/SeaExploreRandReward.xlsx |
| `SeaExplore/SeaExploreTask` | 5 | SeaExplore/SeaExploreTask.xlsx |
| `SeaExplore/SeaExploreTrigger` | 9 | SeaExplore/SeaExploreTrigger.xlsx |

## 字段明细
### `SeaExplore/SeaExploreBuffGroup`
- `id` · `buffGroup` · `buffSelf` · `buffEnemy` · `buffType` · `buffDesc` · `raidStarContion` · `conflict`
- `scoreUp` · `showScoreUp` · `attackScoreChange`

### `SeaExplore/SeaExploreCopy`
- `id` · `isNewServer` · `isBoss` · `bossInfo` · `enemyGroup` · `mapID` · `buffGroup` · `attackScore`
- `levelName` · `unlockLevel` · `copyText`

### `SeaExplore/SeaExploreIncome`
- `id` · `lowLimit` · `maxLimit` · `rateTitle`

### `SeaExplore/SeaExploreOpen`
- `id` · `startTime` · `playFinishTime` · `endTime` · `cost` · `dailySupply1` · `dailySupply2` · `rewardShow`
- `gainExplore` · `maxSelfExplore` · `ShareLimit` · `dailyShareLimit` · `messageConutDown` · `shareCd`

### `SeaExplore/SeaExploreRandReward`
- `id` · `ExploreTime` · `seaExreward` · `rand`

### `SeaExplore/SeaExploreTask`
- `id` · `taskType` · `desc` · `needNum1` · `taskReward`

### `SeaExplore/SeaExploreTrigger`
- `id` · `taskType` · `desc` · `longDesc` · `leftPicture` · `descPicture` · `weight` · `guarantee`
- `countDown`
