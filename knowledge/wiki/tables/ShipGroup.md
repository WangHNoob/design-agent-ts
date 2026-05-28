---
type: table_schema
title: "表族 ShipGroup"
group: "ShipGroup"
table_count: 12
---

# 表族 `ShipGroup`

共 12 张表。数据源：`knowledge/gamedata/`。

## 成员表清单
| 表名 | 字段数 | 相对路径 |
|------|--------|----------|
| `ShipGroup/ShipGroupPlayerScoreReward` | 6 | ShipGroup/ShipGroupPlayerScoreReward.xlsx |
| `ShipGroup/ShipGroupRankReward` | 7 | ShipGroup/ShipGroupRankReward.xlsx |
| `ShipGroup/ShipGroupTask` | 8 | ShipGroup/ShipGroupTask.xlsx |
| `ShipGroup/ShipGroupTaskGroup` | 7 | ShipGroup/ShipGroupTaskGroup.xlsx |
| `ShipGroup/ShipGroupTaskGroupReward` | 4 | ShipGroup/ShipGroupTaskGroupReward.xlsx |
| `ShipGroup/ShipGroupTrialBoss` | 5 | ShipGroup/ShipGroupTrialBoss.xlsx |
| `ShipGroup/ShipGroupTrialBuff` | 4 | ShipGroup/ShipGroupTrialBuff.xlsx |
| `ShipGroup/ShipGroupTrialPrice` | 3 | ShipGroup/ShipGroupTrialPrice.xlsx |
| `ShipGroup/ShipGroupTrialProp` | 4 | ShipGroup/ShipGroupTrialProp.xlsx |
| `ShipGroup/ShipGroupTrialRankReward` | 8 | ShipGroup/ShipGroupTrialRankReward.xlsx |
| `ShipGroup/_ShipGroupSeason` | 5 | ShipGroup/_ShipGroupSeason.xlsx |
| `ShipGroup/_ShipGroupServer` | 4 | ShipGroup/_ShipGroupServer.xlsx |

## 字段明细
### `ShipGroup/ShipGroupPlayerScoreReward`
- `id` · `serverGroup` · `minScore` · `maxScore` · `reward` · `titleId`

**出向外键** (1):
- `titleId` → `Title`

### `ShipGroup/ShipGroupRankReward`
- `id` · `serverGroup` · `minRank` · `maxRank` · `reward` · `titleId` · `actionPictorialId`

**出向外键** (1):
- `titleId` → `Title`

### `ShipGroup/ShipGroupTask`
- `taskId` · `taskType` · `taskTitle` · `taskDesc` · `taskTarget1` · `taskTarget2` · `addScore` · `taskReward`

### `ShipGroup/ShipGroupTaskGroup`
- `id` · `serverGroup` · `taskGroupType` · `taskGroup` · `groupTitle` · `DAILY = 1;` · `//每日`

### `ShipGroup/ShipGroupTaskGroupReward`
- `rewardId` · `taskGroupType` · `valNum` · `reward`

### `ShipGroup/ShipGroupTrialBoss`
- `bossID` · `bossProp` · `buff` · `modelId` · `bossName`

### `ShipGroup/ShipGroupTrialBuff`
- `id` · `desc` · `target` · `buffId`

**出向外键** (1):
- `buffId` → `fight/_Buff`

### `ShipGroup/ShipGroupTrialPrice`
- `id` · `PurchaseTimes` · `Cost`

### `ShipGroup/ShipGroupTrialProp`
- `id` · `name` · `desc` · `icon`

### `ShipGroup/ShipGroupTrialRankReward`
- `id` · `reward` · `score` · `titleId` · `actionPictorialId` · `minRank` · `maxRank` · `serverGroup`

**出向外键** (1):
- `titleId` → `Title`

### `ShipGroup/_ShipGroupSeason`
- `赛季id` · `开启时间` · `活動開始時間` · `排名展示時間` · `結束時間`

### `ShipGroup/_ShipGroupServer`
- `serverGroup` · `fromServer` · `toServer` · `serverIds`
