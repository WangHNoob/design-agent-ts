---
type: table_schema
title: "表族 SeaArea"
group: "SeaArea"
table_count: 18
---

# 表族 `SeaArea`

共 18 张表。数据源：`knowledge/gamedata/`。

## 成员表清单
| 表名 | 字段数 | 相对路径 |
|------|--------|----------|
| `SeaArea/GvoMonsterShip` | 9 | SeaArea/GvoMonsterShip.xlsx |
| `SeaArea/GvoRegion` | 4 | SeaArea/GvoRegion.xlsx |
| `SeaArea/GvoShip` | 12 | SeaArea/GvoShip.xlsx |
| `SeaArea/GvoShipLoadState` | 4 | SeaArea/GvoShipLoadState.xlsx |
| `SeaArea/GvoTask` | 5 | SeaArea/GvoTask.xlsx |
| `SeaArea/SeaAreaInfo` | 13 | SeaArea/SeaAreaInfo.xlsx |
| `SeaArea/SeaAreaIslandInfo` | 7 | SeaArea/SeaAreaIslandInfo.xlsx |
| `SeaArea/SeaAreaNavMesh` | 6 | SeaArea/SeaAreaNavMesh.xlsx |
| `SeaArea/SeaAreaPlayerStatistics` | 4 | SeaArea/SeaAreaPlayerStatistics.xlsx |
| `SeaArea/SeaAreaSceneChunk` | 3 | SeaArea/SeaAreaSceneChunk.xlsx |
| `SeaArea/SeaAreaSceneInfo` | 7 | SeaArea/SeaAreaSceneInfo.xlsx |
| `SeaArea/SeaAreaShipSkill` | 5 | SeaArea/SeaAreaShipSkill.xlsx |
| `SeaArea/SeaAreaShopSwap` | 6 | SeaArea/SeaAreaShopSwap.xlsx |
| `SeaArea/SeaAreaSpecialArea` | 9 | SeaArea/SeaAreaSpecialArea.xlsx |
| `SeaArea/_GvoMonster` | 17 | SeaArea/_GvoMonster.xlsx |
| `SeaArea/_GvoRescueOption` | 6 | SeaArea/_GvoRescueOption.xlsx |
| `SeaArea/_GvoResource` | 8 | SeaArea/_GvoResource.xlsx |
| `SeaArea/_GvoTaskRefreshCost` | 4 | SeaArea/_GvoTaskRefreshCost.xlsx |

## 字段明细
### `SeaArea/GvoMonsterShip`
- `id` · `ModelId` · `scale` · `materialName` · `sprayEffectId` · `fireEffectRadius` · `shellEffectId` · `shipMotionlessEffectId`
- `SeaAreaShipDraft`

### `SeaArea/GvoRegion`
- `id` · `regionId` · `levelDesc` · `levelTaskRate`

### `SeaArea/GvoShip`
- `shipId` · `isOpen` · `defaultSkillId` · `accSkillId` · `otherSkillIds` · `sprayEffectId` · `fireEffectRadius` · `shellEffectId`
- `shipMotionlessEffectId` · `shipSize` · `hangUpSkill` · `desc`

**出向外键** (1):
- `shipId` → `ship/Ship`

### `SeaArea/GvoShipLoadState`
- `id` · `state` · `resourceNum` · `buffs`

### `SeaArea/GvoTask`
- `taskId` · `quality` · `minLevel` · `maxLevel` · `icon`

### `SeaArea/SeaAreaInfo`
- `sceneId` · `regionId` · `name` · `desc` · `buffName` · `buffDesc` · `buffIcon` · `recommendShips`
- `showImage` · `recommendShipLevel` · `worldMapShipPosX` · `worldMapShipPosY` · `isOpenInWorldMap`

**出向外键** (1):
- `sceneId` → `Scene/Scene`

### `SeaArea/SeaAreaIslandInfo`
- `id` · `name` · `desc` · `showImage` · `sceneId` · `npcId` · `seaSceneId`

**出向外键** (1):
- `sceneId` → `Scene/Scene`

### `SeaArea/SeaAreaNavMesh`
- `id` · `sceneId` · `top_left` · `top_right` · `bottom_right` · `bottom_left`

**出向外键** (1):
- `sceneId` → `Scene/Scene`

### `SeaArea/SeaAreaPlayerStatistics`
- `typeId` · `typeName` · `typeIcon` · `isFloat`

### `SeaArea/SeaAreaSceneChunk`
- `id` · `sceneId` · `resPath`

**出向外键** (1):
- `sceneId` → `Scene/Scene`

### `SeaArea/SeaAreaSceneInfo`
- `id` · `chunkLength` · `laodType` · `chunkCount` · `chunkOffsetPosY` · `cameraDirOffset` · `checkInterval`

### `SeaArea/SeaAreaShipSkill`
- `id` · `shipId` · `skillName` · `skillIcon` · `skillDesc`

**出向外键** (1):
- `shipId` → `ship/Ship`

### `SeaArea/SeaAreaShopSwap`
- `id` · `orginItem` · `targetItem` · `display` · `selectDesc` · `dialogDesc`

### `SeaArea/SeaAreaSpecialArea`
- `id` · `sceneId` · `specAreaPosX` · `specAreaPosZ` · `specAreaScale` · `specAreaColorR` · `specAreaColorG` · `specAreaColorB`
- `specAreaColorA`

**出向外键** (1):
- `sceneId` → `Scene/Scene`

### `SeaArea/_GvoMonster`
- `monsterId` · `atk` · `def` · `maxHp` · `cri` · `anticri` · `antiblock` · `block`
- `hit` · `dodge` · `cridamage` · `anticridamage` · `defaultSkillId` · `enemyType` · `dropGroupIds` · `shipEnergy`
- `shipSize`

**出向外键** (1):
- `dropGroupIds` → `_DropGroup`

### `SeaArea/_GvoRescueOption`
- `optionId` · `optionText` · `dialogId` · `enemyGroupId` · `costPercent` · `awardPercent`

**出向外键** (1):
- `dialogId` → `Dialog`

### `SeaArea/_GvoResource`
- `resourceDetailId` · `drops` · `fishingProgressMax` · `fishingProgressSucc` · `fishingTimes` · `rescues` · `salvageAdds` · `pvpObtain`

### `SeaArea/_GvoTaskRefreshCost`
- `7` · `1` · `999` · `2`
