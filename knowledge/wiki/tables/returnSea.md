---
type: table_schema
title: "表族 returnSea"
group: "returnSea"
table_count: 22
---

# 表族 `returnSea`

共 22 张表。数据源：`knowledge/gamedata/`。

## 成员表清单
| 表名 | 字段数 | 相对路径 |
|------|--------|----------|
| `returnSea/ReturnSeaGiftLoginReward` | 2 | returnSea/ReturnSeaGiftLoginReward.xlsx |
| `returnSea/ReturnSeaGoToNewServerSeeReward` | 2 | returnSea/ReturnSeaGoToNewServerSeeReward.xlsx |
| `returnSea/ReturnSeaHero2D` | 16 | returnSea/ReturnSeaHero2D.xlsx |
| `returnSea/ReturnSeaNewServerReward` | 4 | returnSea/ReturnSeaNewServerReward.xlsx |
| `returnSea/ReturnSeaPrayTask` | 7 | returnSea/ReturnSeaPrayTask.xlsx |
| `returnSea/ReturnSeaPrayTotalReward` | 2 | returnSea/ReturnSeaPrayTotalReward.xlsx |
| `returnSea/ReturnSeaSelectHero` | 5 | returnSea/ReturnSeaSelectHero.xlsx |
| `returnSea/ReturnSeaSubPages` | 4 | returnSea/ReturnSeaSubPages.xlsx |
| `returnSea/ReturnSeaTrainActivityTasks` | 6 | returnSea/ReturnSeaTrainActivityTasks.xlsx |
| `returnSea/ReturnSeaTrainDailySignIn` | 3 | returnSea/ReturnSeaTrainDailySignIn.xlsx |
| `returnSea/ReturnSeaTrainFightPower` | 4 | returnSea/ReturnSeaTrainFightPower.xlsx |
| `returnSea/ReturnSeaTrainResourceCost` | 6 | returnSea/ReturnSeaTrainResourceCost.xlsx |
| `returnSea/ReturnSeaTrainTotalReward` | 2 | returnSea/ReturnSeaTrainTotalReward.xlsx |
| `returnSea/ReturnSeaUIConfig` | 2 | returnSea/ReturnSeaUIConfig.xlsx |
| `returnSea/_RetrunSeaLeaveDay` | 4 | returnSea/_RetrunSeaLeaveDay.xlsx |
| `returnSea/_ReturnSeaExtraReward` | 3 | returnSea/_ReturnSeaExtraReward.xlsx |
| `returnSea/_ReturnSeaGiftConfig` | 4 | returnSea/_ReturnSeaGiftConfig.xlsx |
| `returnSea/_ReturnSeaLevelReward` | 4 | returnSea/_ReturnSeaLevelReward.xlsx |
| `returnSea/_ReturnSeaOpenCondition` | 4 | returnSea/_ReturnSeaOpenCondition.xlsx |
| `returnSea/_ReturnSeaOpenServer` | 5 | returnSea/_ReturnSeaOpenServer.xlsx |
| `returnSea/_ReturnSeaPray` | 4 | returnSea/_ReturnSeaPray.xlsx |
| `returnSea/_ReturnSeaShowHero` | 2 | returnSea/_ReturnSeaShowHero.xlsx |

## 字段明细
### `returnSea/ReturnSeaGiftLoginReward`
- `day` · `rewards`

### `returnSea/ReturnSeaGoToNewServerSeeReward`
- `vipLevel` · `reward`

### `returnSea/ReturnSeaHero2D`
- `id` · `heroPath` · `heroWH` · `heroPos` · `heroScaleX` · `heroScaleY` · `text` · `textPos`
- `textScaleX` · `textScaleY` · `660` · `2048` · `0.322265625` · `760` · `2048` · `0.37109375`

### `returnSea/ReturnSeaNewServerReward`
- `id` · `vipLevel` · `day` · `reward`

### `returnSea/ReturnSeaPrayTask`
- `taskId` · `taskType` · `taskTarget` · `taskDesc` · `rewards` · `jumpId` · `title`

### `returnSea/ReturnSeaPrayTotalReward`
- `targetVal` · `rewards`

### `returnSea/ReturnSeaSelectHero`
- `id` · `name` · `imagePath` · `description` · `descriptionDetail`

### `returnSea/ReturnSeaSubPages`
- `id` · `name` · `path` · `redpoint`

### `returnSea/ReturnSeaTrainActivityTasks`
- `id` · `任务类型` · `任务参数` · `任务奖励` · `rewardVal` · `描述`

### `returnSea/ReturnSeaTrainDailySignIn`
- `day` · `rewards` · `description`

### `returnSea/ReturnSeaTrainFightPower`
- `id` · `addPowerVal` · `rewards` · `addPowerDesc`

### `returnSea/ReturnSeaTrainResourceCost`
- `id` · `costType` · `costTraget` · `costId` · `rewards` · `costDesc`

### `returnSea/ReturnSeaTrainTotalReward`
- `targetVal` · `rewards`

### `returnSea/ReturnSeaUIConfig`
- `id` · `value`

### `returnSea/_RetrunSeaLeaveDay`
- `id` · `开始天数` · `结束天数` · `倍数`

### `returnSea/_ReturnSeaExtraReward`
- `id` · `道具类型` · `道具Id`

### `returnSea/_ReturnSeaGiftConfig`
- `7` · `1` · `9999` · `10`

### `returnSea/_ReturnSeaLevelReward`
- `7` · `1` · `9999` · `3`

### `returnSea/_ReturnSeaOpenCondition`
- `id` · `触发类型` · `触发参数` · `持续天数`

### `returnSea/_ReturnSeaOpenServer`
- `id` · `开始server` · `结束server` · `回流活动开启` · `回流条件`

### `returnSea/_ReturnSeaPray`
- `7` · `1` · `9999` · `10`

### `returnSea/_ReturnSeaShowHero`
- `time` · `heroId`

**出向外键** (1):
- `heroId` → `Hero`
