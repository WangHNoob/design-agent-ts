---
type: table_schema
title: "表族 treasureSea"
group: "treasureSea"
table_count: 9
---

# 表族 `treasureSea`

共 9 张表。数据源：`knowledge/gamedata/`。

## 成员表清单
| 表名 | 字段数 | 相对路径 |
|------|--------|----------|
| `treasureSea/BoxTypeWeightConfig` | 5 | treasureSea/BoxTypeWeightConfig.xlsx |
| `treasureSea/CommonRewardPool` | 7 | treasureSea/CommonRewardPool.xlsx |
| `treasureSea/CostDiamondByPlayTimes` | 4 | treasureSea/CostDiamondByPlayTimes.xlsx |
| `treasureSea/CruiseArea` | 3 | treasureSea/CruiseArea.xlsx |
| `treasureSea/EventFight` | 8 | treasureSea/EventFight.xlsx |
| `treasureSea/LuckValueNode` | 2 | treasureSea/LuckValueNode.xlsx |
| `treasureSea/MissionDispatch` | 7 | treasureSea/MissionDispatch.xlsx |
| `treasureSea/MistyArea` | 3 | treasureSea/MistyArea.xlsx |
| `treasureSea/SeaAreaPosition` | 5 | treasureSea/SeaAreaPosition.xlsx |

## 字段明细
### `treasureSea/BoxTypeWeightConfig`
- `id` · `type` · `boxType` · `weight` · `luckValue`

### `treasureSea/CommonRewardPool`
- `id` · `boxType` · `itemType` · `playerLevelLimit` · `item` · `luckValue` · `weight`

### `treasureSea/CostDiamondByPlayTimes`
- `id` · `type` · `playTimes` · `needDiamond`

### `treasureSea/CruiseArea`
- `cruiseId` · `centerPos` · `radius`

### `treasureSea/EventFight`
- `id` · `playerLevel` · `sceneMapId` · `enemyGroupId` · `shipId` · `fixedReward` · `randReward` · `prop`

**出向外键** (1):
- `shipId` → `ship/Ship`

### `treasureSea/LuckValueNode`
- `id` · `luckValue`

### `treasureSea/MissionDispatch`
- `id` · `missionType` · `fixedReward` · `randReward` · `prop` · `randRewardTimes` · `missionName`

### `treasureSea/MistyArea`
- `areaId` · `effectName` · `positionValue`

### `treasureSea/SeaAreaPosition`
- `id` · `areaId` · `positionId` · `positionValue` · `weight`
