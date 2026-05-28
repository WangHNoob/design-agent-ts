---
type: table_schema
title: "表族 harvestSeason"
group: "harvestSeason"
table_count: 6
---

# 表族 `harvestSeason`

共 6 张表。数据源：`knowledge/gamedata/`。

## 成员表清单
| 表名 | 字段数 | 相对路径 |
|------|--------|----------|
| `harvestSeason/HarvestBoxUI` | 2 | harvestSeason/HarvestBoxUI.xlsx |
| `harvestSeason/HarvestGameModuleTarget` | 6 | harvestSeason/HarvestGameModuleTarget.xlsx |
| `harvestSeason/HarvestScene` | 10 | harvestSeason/HarvestScene.xlsx |
| `harvestSeason/HarvestSeasonActiveReward` | 4 | harvestSeason/HarvestSeasonActiveReward.xlsx |
| `harvestSeason/HarvestSeasonDailyTask` | 3 | harvestSeason/HarvestSeasonDailyTask.xlsx |
| `harvestSeason/HarvestSeasonTask` | 10 | harvestSeason/HarvestSeasonTask.xlsx |

## 字段明细
### `harvestSeason/HarvestBoxUI`
- `id` · `icon`

### `harvestSeason/HarvestGameModuleTarget`
- `id` · `guideType` · `args` · `switchName` · `openRule` · `activityId`

### `harvestSeason/HarvestScene`
- `id` · `position` · `rotation` · `scale` · `scenePath` · `assetPath` · `animation` · `controllerPath`
- `cameraPos` · `cameraRotation`

### `harvestSeason/HarvestSeasonActiveReward`
- `id` · `type` · `needActive` · `reward`

### `harvestSeason/HarvestSeasonDailyTask`
- `id` · `tasks` · `text`

### `harvestSeason/HarvestSeasonTask`
- `id` · `taskType` · `descr` · `type` · `needTimes` · `active` · `reward` · `texture`
- `desc` · `targetId`
