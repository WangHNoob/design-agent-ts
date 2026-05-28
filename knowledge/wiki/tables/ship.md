---
type: table_schema
title: "表族 ship"
group: "ship"
table_count: 20
---

# 表族 `ship`

共 20 张表。数据源：`knowledge/gamedata/`。

## 成员表清单
| 表名 | 字段数 | 相对路径 |
|------|--------|----------|
| `ship/Ship` | 26 | ship/Ship.xlsx |
| `ship/ShipMaker` | 6 | ship/ShipMaker.xlsx |
| `ship/ShipModel` | 34 | ship/ShipModel.xlsx |
| `ship/ShipParticle` | 3 | ship/ShipParticle.xlsx |
| `ship/ShipProp` | 6 | ship/ShipProp.xlsx |
| `ship/ShipPropRate` | 5 | ship/ShipPropRate.xlsx |
| `ship/ShipReform` | 13 | ship/ShipReform.xlsx |
| `ship/ShipSkill` | 4 | ship/ShipSkill.xlsx |
| `ship/ShipSkillAttributeConfig` | 10 | ship/ShipSkillAttributeConfig.xlsx |
| `ship/ShipTradeEvent` | 7 | ship/ShipTradeEvent.xlsx |
| `ship/ShipTradeLevel` | 4 | ship/ShipTradeLevel.xlsx |
| `ship/ShipTradeRewardAdd` | 5 | ship/ShipTradeRewardAdd.xlsx |
| `ship/ShipTradeTask` | 16 | ship/ShipTradeTask.xlsx |
| `ship/SkillToShip` | 4 | ship/SkillToShip.xlsx |
| `ship/_ShipSkillGroupToQualityConfig` | 4 | ship/_ShipSkillGroupToQualityConfig.xlsx |
| `ship/_ShipSkillResetGroupConfig` | 6 | ship/_ShipSkillResetGroupConfig.xlsx |
| `ship/_ShipTradeMapRandom` | 4 | ship/_ShipTradeMapRandom.xlsx |
| `ship/_ShipTradeQualityRandom` | 4 | ship/_ShipTradeQualityRandom.xlsx |
| `ship/_ShipTradeTaskRandom` | 5 | ship/_ShipTradeTaskRandom.xlsx |
| `ship/_ShipTradeTime` | 4 | ship/_ShipTradeTime.xlsx |

## 字段明细
### `ship/Ship`
- `shipId` · `shipName` · `modelId` · `shipIcon` · `isValid` · `canBuild` · `itemSubLevel` · `shipDesc`
- `iconOffsetX` · `iconOffsetY` · `shipRadius` · `usfSkills` · `itemInfoIcon` · `iconScale` · `skillUnlockCondition` · `chorusUnlockCondition`
- `shipPropList` · `sResolve` · `resolveItem` · `nojoin` · `planUnlockCosts` · `backdrop` · `海军战舰` · `string`
- `float` · `float`

**入向外键** (13):
- `SeaArea/GvoShip.shipId` → 本表
- `SeaArea/SeaAreaShipSkill.shipId` → 本表
- `SeaAreaBattle/SeaAreaMonster.shipId` → 本表
- `hideTreasure/HideTreasurePositionPool.shipId` → 本表
- `hideTreasure/HideTreasureShipPool.shipId` → 本表
- `ship/ShipMaker.shipId` → 本表
- `ship/ShipParticle.shipId` → 本表
- `ship/ShipPropRate.shipId` → 本表
- `ship/ShipReform.shipId` → 本表
- `ship/ShipTradeRewardAdd.shipId` → 本表
- … 其余 3 条见 `_tables/table_fk_registry.json`

### `ship/ShipMaker`
- `shipId` · `level` · `costTime` · `resourceCost` · `energyCost` · `addExp`

**出向外键** (1):
- `shipId` → `ship/Ship`

### `ship/ShipModel`
- `id` · `ModelId` · `UFModelScale` · `UFModelOffset` · `Radius` · `ShipFactoryOffset` · `ShipFactoryEuler` · `ShipFactoryScale`
- `ShipBuildCompleteAniName` · `ShipBuildCompleteOffset` · `ShipBuildCompleteScale` · `WharfOffset` · `WharfEuler` · `WharfScale` · `ShipTradeOffset` · `ShipTradeEuler`
- `ShipTradeScale` · `AcShipScale` · `AcRightPosOffset` · `ACLeftPosOffset` · `hitPosOffset` · `rightFirePosOffset` · `leftFirePosOffset` · `STModelScale`
- `SeaAreaScale` · `SeaAreaDockOffset` · `SeaAreaDockEulerY` · `SeaAreaDockScale` · `SeaAreaShipDraft` · `RBWModelScale` · `RBWModelOffset` · `SeaportOffset`
- `SeaportEuler` · `SeaportScal`

**入向外键** (1):
- `DefenseFight/DefenseFightEnemy.shipModelId` → 本表

### `ship/ShipParticle`
- `shipId` · `particle` · `offect`

**出向外键** (1):
- `shipId` → `ship/Ship`

### `ship/ShipProp`
- `propId` · `propName` · `icon` · `desc` · `isReTro` · `heroPropType`

### `ship/ShipPropRate`
- `id` · `shipId` · `propId` · `rate` · `extraValue`

**出向外键** (1):
- `shipId` → `ship/Ship`

### `ship/ShipReform`
- `id` · `shipId` · `reformLevel` · `reformCost` · `propList` · `speed` · `food` · `warehouse`
- `pointLimit` · `itemUseLimit` · `powerFactorB` · `powerFactorD` · `isReTro`

**出向外键** (1):
- `shipId` → `ship/Ship`

### `ship/ShipSkill`
- `shipSkillId` · `skillName` · `skillIcon` · `skillDesc`

**入向外键** (1):
- `ship/SkillToShip.shipSkillId` → 本表

### `ship/ShipSkillAttributeConfig`
- `attributeId` · `descript` · `descRule` · `descGrade` · `descType` · `icon` · `autoType` · `powerFactorB`
- `powerFactorC` · `powerFactorD`

### `ship/ShipTradeEvent`
- `eventId` · `tradeType` · `higherType` · `lowerType` · `eventDesc` · `eventResult` · `weight`

### `ship/ShipTradeLevel`
- `tradeLevel` · `maxCount` · `exp` · `doCount`

### `ship/ShipTradeRewardAdd`
- `shipId` · `addQuality` · `add` · `itemQuality` · `itemRewards`

**出向外键** (1):
- `shipId` → `ship/Ship`

### `ship/ShipTradeTask`
- `tradeId` · `name` · `icon` · `tradeType` · `worldMapId` · `quality` · `limit` · `addGold`
- `costTime` · `voyage` · `tradeDesc` · `costFood` · `costRes` · `infoVal` · `previewRewards` · `rewards`

**出向外键** (1):
- `worldMapId` → `WorldMap`

### `ship/SkillToShip`
- `id` · `shipId` · `shipSkillId` · `level`

**出向外键** (2):
- `shipId` → `ship/Ship`
- `shipSkillId` → `ship/ShipSkill`

### `ship/_ShipSkillGroupToQualityConfig`
- `7` · `1` · `9999` · `2`

### `ship/_ShipSkillResetGroupConfig`
- `自增id` · `船Id` · `最小次数` · `品质组概率` · `战船洗练组类型` · `幸运品质组附加权重`

### `ship/_ShipTradeMapRandom`
- `7` · `1` · `999` · `3`

### `ship/_ShipTradeQualityRandom`
- `7` · `1` · `9999` · `4`

### `ship/_ShipTradeTaskRandom`
- `自增id` · `等级要求` · `地图` · `品质` · `任务随机`

### `ship/_ShipTradeTime`
- `7` · `1` · `999` · `3`
