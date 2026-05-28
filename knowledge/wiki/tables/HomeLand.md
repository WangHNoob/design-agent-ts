---
type: table_schema
title: "表族 HomeLand"
group: "HomeLand"
table_count: 28
---

# 表族 `HomeLand`

共 28 张表。数据源：`knowledge/gamedata/`。

## 成员表清单
| 表名 | 字段数 | 相对路径 |
|------|--------|----------|
| `HomeLand/HomeBuffIcon` | 0 | HomeLand/HomeBuffIcon.xlsx |
| `HomeLand/HomeBuildingCondition` | 4 | HomeLand/HomeBuildingCondition.xlsx |
| `HomeLand/HomeBuildingLev` | 14 | HomeLand/HomeBuildingLev.xlsx |
| `HomeLand/HomeBuildingProduceFormula` | 12 | HomeLand/HomeBuildingProduceFormula.xlsx |
| `HomeLand/HomeBuildingProduceFormulaType` | 4 | HomeLand/HomeBuildingProduceFormulaType.xlsx |
| `HomeLand/HomeBuildingType` | 18 | HomeLand/HomeBuildingType.xlsx |
| `HomeLand/HomeDefaultDress` | 4 | HomeLand/HomeDefaultDress.xlsx |
| `HomeLand/HomeGridArea` | 0 | HomeLand/HomeGridArea.xlsx |
| `HomeLand/HomeGridPlot` | 0 | HomeLand/HomeGridPlot.xlsx |
| `HomeLand/HomeHero` | 3 | HomeLand/HomeHero.xlsx |
| `HomeLand/HomeHeroBuff` | 0 | HomeLand/HomeHeroBuff.xlsx |
| `HomeLand/HomeHeroSkill` | 0 | HomeLand/HomeHeroSkill.xlsx |
| `HomeLand/HomeLandDress` | 21 | HomeLand/HomeLandDress.xlsx |
| `HomeLand/HomeLandDressCategory` | 5 | HomeLand/HomeLandDressCategory.xlsx |
| `HomeLand/HomeLandDressGrid` | 21 | HomeLand/HomeLandDressGrid.xlsx |
| `HomeLand/HomeLandDressNpc` | 9 | HomeLand/HomeLandDressNpc.xlsx |
| `HomeLand/HomeLobbyLevelUpEffect` | 0 | HomeLand/HomeLobbyLevelUpEffect.xlsx |
| `HomeLand/HomeNewUserTask` | 9 | HomeLand/HomeNewUserTask.xlsx |
| `HomeLand/HomeProsperity` | 8 | HomeLand/HomeProsperity.xlsx |
| `HomeLand/HomeRobRefreshCost` | 2 | HomeLand/HomeRobRefreshCost.xlsx |
| `HomeLand/HomeTaskIcon` | 3 | HomeLand/HomeTaskIcon.xlsx |
| `HomeLand/_HomeCreamGroup` | 4 | HomeLand/_HomeCreamGroup.xlsx |
| `HomeLand/_HomeEnemyGroup` | 4 | HomeLand/_HomeEnemyGroup.xlsx |
| `HomeLand/_HomeRobGroup` | 4 | HomeLand/_HomeRobGroup.xlsx |
| `HomeLand/_HomeRobPercent` | 4 | HomeLand/_HomeRobPercent.xlsx |
| `HomeLand/_HomeTaskConvert` | 4 | HomeLand/_HomeTaskConvert.xlsx |
| `HomeLand/_HomeTaskGroup` | 4 | HomeLand/_HomeTaskGroup.xlsx |
| `HomeLand/_HomeTaskIndex` | 7 | HomeLand/_HomeTaskIndex.xlsx |

## 字段明细
### `HomeLand/HomeBuffIcon`
_未读取到字段（文件可能为空或 header 解析失败）_

### `HomeLand/HomeBuildingCondition`
- `id` · `buildingType` · `unLockLevel` · `count`

### `HomeLand/HomeBuildingLev`
- `id` · `buildingType` · `level` · `unLockLevel` · `upgradeCost` · `upgradeTime` · `modelPath` · `modelEffect`
- `upgradeProsperity` · `prosperity` · `removeReturn` · `attributes` · `param` · `miniMapPartsId`

**出向外键** (1):
- `miniMapPartsId` → `MiniMapParts`

### `HomeLand/HomeBuildingProduceFormula`
- `formulaId` · `buildingType` · `level` · `creamToProcessPer` · `formulaType` · `produceItems` · `needProcess` · `needTime`
- `needCream` · `needItems` · `needHeroPower` · `cancelReturnItems`

### `HomeLand/HomeBuildingProduceFormulaType`
- `formulaType` · `buildingType` · `formulaTypeDesc` · `rewardIcon`

### `HomeLand/HomeBuildingType`
- `id` · `isFixed` · `buildingName` · `buildingDesc` · `icon` · `modelId` · `animatorPath` · `npcName`
- `dialogId` · `npcChat` · `nameImage` · `detailIcon` · `unLockModel` · `audio` · `detailDesc` · `descpics`
- `descTitles` · `priority`

**出向外键** (1):
- `dialogId` → `Dialog`

### `HomeLand/HomeDefaultDress`
- `id` · `sceneId` · `dressGridId` · `defaultId`

**出向外键** (1):
- `sceneId` → `Scene/Scene`

### `HomeLand/HomeGridArea`
_未读取到字段（文件可能为空或 header 解析失败）_

### `HomeLand/HomeGridPlot`
_未读取到字段（文件可能为空或 header 解析失败）_

### `HomeLand/HomeHero`
- `heroId` · `maxEnergy` · `skills`

**出向外键** (1):
- `heroId` → `Hero`

### `HomeLand/HomeHeroBuff`
_未读取到字段（文件可能为空或 header 解析失败）_

### `HomeLand/HomeHeroSkill`
_未读取到字段（文件可能为空或 header 解析失败）_

### `HomeLand/HomeLandDress`
- `dressId` · `dressType` · `modelPath` · `dressGridId` · `unlockCost` · `beforeDressId` · `prosperity` · `dressSkill`
- `star` · `name` · `desc` · `smallIcon` · `bigIcon` · `miniMapPartsId` · `buyEffectId` · `param`
- `airBoxEventId` · `giftId` · `validTime` · `getWay` · `Bridge = 1;//桥梁`

**出向外键** (1):
- `miniMapPartsId` → `MiniMapParts`

### `HomeLand/HomeLandDressCategory`
- `categoryId` · `dressIds` · `name` · `star` · `icon`

### `HomeLand/HomeLandDressGrid`
- `dressGridId` · `defaultDressId` · `dressType` · `lockModelPath` · `posX` · `posY` · `posZ` · `cameraPositionX`
- `cameraPositionY` · `cameraPositionZ` · `cameraRotationX` · `cameraRotationY` · `cameraRotationZ` · `cameraFOV` · `UIPosX` · `UIPosY`
- `UIPosZ` · `icon` · `name` · `isSceneGrid` · `Landscape = 2;//景观`

### `HomeLand/HomeLandDressNpc`
- `npcId` · `showType` · `npcType` · `npcLevel` · `dressId` · `isReward` · `reward` · `firstRewardTime`
- `nextRewardTime`

### `HomeLand/HomeLobbyLevelUpEffect`
_未读取到字段（文件可能为空或 header 解析失败）_

### `HomeLand/HomeNewUserTask`
- `taskId` · `taskType` · `targetOne` · `targetTwo` · `targetThree` · `reward` · `taskName` · `taskSummarize`
- `taskDese`

### `HomeLand/HomeProsperity`
- `id` · `prosperity` · `buffIds` · `buffName` · `resDes` · `powerFactorB` · `powerFactorC` · `powerFactorD`

**出向外键** (1):
- `buffIds` → `fight/_Buff`

### `HomeLand/HomeRobRefreshCost`
- `times` · `cost`

### `HomeLand/HomeTaskIcon`
- `taskId` · `IconName` · `inFriendHome`

### `HomeLand/_HomeCreamGroup`
- `7` · `1` · `9999` · `3`

### `HomeLand/_HomeEnemyGroup`
- `7` · `1` · `9999` · `2`

### `HomeLand/_HomeRobGroup`
- `7` · `1` · `9999` · `4`

### `HomeLand/_HomeRobPercent`
- `7` · `1` · `9999` · `4`

### `HomeLand/_HomeTaskConvert`
- `7` · `1` · `9999` · `4`

### `HomeLand/_HomeTaskGroup`
- `7` · `1` · `9999` · `4`

### `HomeLand/_HomeTaskIndex`
- `主键` · `任务栏id` · `家园等级` · `最小等级限制` · `最大等级限制` · `组id` · `权重`
