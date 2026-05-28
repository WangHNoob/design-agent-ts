---
type: table_schema
title: "表族 hideTreasure"
group: "hideTreasure"
table_count: 8
---

# 表族 `hideTreasure`

共 8 张表。数据源：`knowledge/gamedata/`。

## 成员表清单
| 表名 | 字段数 | 相对路径 |
|------|--------|----------|
| `hideTreasure/HideTreasureEquipPool` | 9 | hideTreasure/HideTreasureEquipPool.xlsx |
| `hideTreasure/HideTreasureFormationHeroPosition` | 13 | hideTreasure/HideTreasureFormationHeroPosition.xlsx |
| `hideTreasure/HideTreasureHeroPool` | 36 | hideTreasure/HideTreasureHeroPool.xlsx |
| `hideTreasure/HideTreasurePositionPool` | 10 | hideTreasure/HideTreasurePositionPool.xlsx |
| `hideTreasure/HideTreasureRewardPool` | 4 | hideTreasure/HideTreasureRewardPool.xlsx |
| `hideTreasure/HideTreasureShipPool` | 11 | hideTreasure/HideTreasureShipPool.xlsx |
| `hideTreasure/HideTreasureType` | 4 | hideTreasure/HideTreasureType.xlsx |
| `hideTreasure/_HideTreasureShipSkill` | 3 | hideTreasure/_HideTreasureShipSkill.xlsx |

## 字段明细
### `hideTreasure/HideTreasureEquipPool`
- `equipId` · `name` · `intro` · `icon` · `addProps` · `suitAddProp` · `suitAddPropPercent` · `suitIntro`
- `score`

### `hideTreasure/HideTreasureFormationHeroPosition`
- `id` · `heroPositionX` · `heroPositionY` · `heroPositionZ` · `heroRotationX` · `heroRotationY` · `heroRotationZ` · `cameraPositionX`
- `cameraPositionY` · `cameraPositionZ` · `cameraRotationX` · `cameraRotationY` · `cameraRotationZ`

### `hideTreasure/HideTreasureHeroPool`
- `heroId` · `DefaultSkill` · `defaultSkillLevel` · `skill1AIWeight` · `skill1` · `skill1Level` · `skill2AIWeight` · `skill2`
- `skill2Level` · `skill3AIWeight` · `skill3` · `skill3Level` · `ultimateSkillAIWeight` · `ultimateSkill` · `ultimateSkillLevel` · `activeSkills`
- `skills` · `passiveSkills` · `atk` · `def` · `hp` · `speed` · `cri` · `anticri`
- `hit` · `dodge` · `cridamage` · `block` · `antiblock` · `antiwhole` · `skillAI` · `blockdamage`
- `critreat` · `cameraOffsetX` · `cameraOffsetY` · `cameraOffsetZ`

**出向外键** (1):
- `heroId` → `Hero`

### `hideTreasure/HideTreasurePositionPool`
- `positionId` · `type` · `positionValue` · `weight` · `shipId` · `speed` · `cruiseRedius` · `battlingRedius`
- `shellingRedius` · `radarRedius`

**出向外键** (1):
- `shipId` → `ship/Ship`

### `hideTreasure/HideTreasureRewardPool`
- `id` · `type` · `item` · `weight`

### `hideTreasure/HideTreasureShipPool`
- `shipId` · `supply` · `addProps` · `speed` · `canBeFound` · `canFire` · `skillIcon` · `skillDesc`
- `battlingRedius` · `shellingRedius` · `radarRedius`

**出向外键** (1):
- `shipId` → `ship/Ship`

### `hideTreasure/HideTreasureType`
- `type` · `maxNum` · `refreshIntenal` · `modelScale`

### `hideTreasure/_HideTreasureShipSkill`
- `skillId` · `effectType` · `effectValue`

**出向外键** (1):
- `skillId` → `fight/Skill`
