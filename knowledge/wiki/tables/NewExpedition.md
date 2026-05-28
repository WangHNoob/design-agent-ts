---
type: table_schema
title: "表族 NewExpedition"
group: "NewExpedition"
table_count: 7
---

# 表族 `NewExpedition`

共 7 张表。数据源：`knowledge/gamedata/`。

## 成员表清单
| 表名 | 字段数 | 相对路径 |
|------|--------|----------|
| `NewExpedition/NewExpeditionCondition` | 8 | NewExpedition/NewExpeditionCondition.xlsx |
| `NewExpedition/NewExpeditionConditionType` | 4 | NewExpedition/NewExpeditionConditionType.xlsx |
| `NewExpedition/NewExpeditionExCondition` | 3 | NewExpedition/NewExpeditionExCondition.xlsx |
| `NewExpedition/NewExpeditionLevel` | 7 | NewExpedition/NewExpeditionLevel.xlsx |
| `NewExpedition/NewExpeditionLucky` | 6 | NewExpedition/NewExpeditionLucky.xlsx |
| `NewExpedition/NewExpeditionMission` | 13 | NewExpedition/NewExpeditionMission.xlsx |
| `NewExpedition/NewExpeditionMissionPool` | 6 | NewExpedition/NewExpeditionMissionPool.xlsx |

## 字段明细
### `NewExpedition/NewExpeditionCondition`
- `id` · `requirement` · `conditionType` · `conditionNumber` · `requireConParam` · `algorithmType` · `conditionText` · `ClassGroup`

### `NewExpedition/NewExpeditionConditionType`
- `id` · `algorithmId` · `number1` · `number2`

### `NewExpedition/NewExpeditionExCondition`
- `id` · `condList` · `descri`

### `NewExpedition/NewExpeditionLevel`
- `id` · `playerLevelFrom` · `playerLevelTo` · `dayMaxMissionNum` · `doingMissionNumLimit` · `missionNumLimit` · `levelName`

### `NewExpedition/NewExpeditionLucky`
- `id` · `playerLevelFrom` · `playerLevelTo` · `LuckyPlusA` · `LuckySubtractB` · `LuckyDivideC`

### `NewExpedition/NewExpeditionMission`
- `id` · `missionName` · `missionPool` · `missionHard` · `missionTime` · `expeditionRoleNumber` · `notEnough` · `addHeroExp`
- `missionReward` · `weight` · `standardFightingCapacity` · `conditions` · `missionIcon`

### `NewExpedition/NewExpeditionMissionPool`
- `id` · `playerLevelFrom` · `playerLevelTo` · `missionType` · `missionQuality` · `weight`
