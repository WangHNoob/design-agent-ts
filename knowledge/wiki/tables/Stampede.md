---
type: table_schema
title: "表族 Stampede"
group: "Stampede"
table_count: 8
---

# 表族 `Stampede`

共 8 张表。数据源：`knowledge/gamedata/`。

## 成员表清单
| 表名 | 字段数 | 相对路径 |
|------|--------|----------|
| `Stampede/StampedeFightLandRoom` | 9 | Stampede/StampedeFightLandRoom.xlsx |
| `Stampede/StampedeGatherType` | 5 | Stampede/StampedeGatherType.xlsx |
| `Stampede/StampedeScoreReward` | 6 | Stampede/StampedeScoreReward.xlsx |
| `Stampede/StampedeTask` | 7 | Stampede/StampedeTask.xlsx |
| `Stampede/StampedeTaskGroup` | 5 | Stampede/StampedeTaskGroup.xlsx |
| `Stampede/_StampedeOpen` | 11 | Stampede/_StampedeOpen.xlsx |
| `Stampede/_StampedeOpenServer` | 5 | Stampede/_StampedeOpenServer.xlsx |
| `Stampede/_StampedeResource` | 3 | Stampede/_StampedeResource.xlsx |

## 字段明细
### `Stampede/StampedeFightLandRoom`
- `roomDictId` · `name` · `icon` · `minLev` · `maxLev` · `campNum` · `sceneId` · `bornArea`
- `reviveNum`

**出向外键** (1):
- `sceneId` → `Scene/Scene`

### `Stampede/StampedeGatherType`
- `gaterValType` · `changeItemId` · `changePer` · `coinType` · `valCost`

### `Stampede/StampedeScoreReward`
- `id` · `minScore` · `maxScore` · `rewards` · `rewardPer` · `coinType`

### `Stampede/StampedeTask`
- `taskId` · `taskType` · `taskTitle` · `taskDesc` · `taskTarget1` · `taskTarget2` · `taskReward`

### `Stampede/StampedeTaskGroup`
- `id` · `taskGroupType` · `taskGroup` · `groupTitle` · `DAILY = 1;//每日`

### `Stampede/_StampedeOpen`
- `id` · `startTime` · `endTime` · `rewardEndTime` · `afternoonTime` · `nightTime` · `minScore` · `winPer`
- `losePer` · `baseScore` · `killScore`

### `Stampede/_StampedeOpenServer`
- `id` · `fromServer` · `toServer` · `ipAdd` · `ipPort`

### `Stampede/_StampedeResource`
- `id` · `addScore` · `gaterVal`
