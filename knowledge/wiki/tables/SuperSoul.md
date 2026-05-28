---
type: table_schema
title: "表族 SuperSoul"
group: "SuperSoul"
table_count: 9
---

# 表族 `SuperSoul`

共 9 张表。数据源：`knowledge/gamedata/`。

## 成员表清单
| 表名 | 字段数 | 相对路径 |
|------|--------|----------|
| `SuperSoul/SuperSoul` | 4 | SuperSoul/SuperSoul.xlsx |
| `SuperSoul/SuperSoulAdvancedAmend` | 10 | SuperSoul/SuperSoulAdvancedAmend.xlsx |
| `SuperSoul/SuperSoulAmendCost` | 3 | SuperSoul/SuperSoulAmendCost.xlsx |
| `SuperSoul/SuperSoulAmendQualityText` | 3 | SuperSoul/SuperSoulAmendQualityText.xlsx |
| `SuperSoul/SuperSoulAmendType` | 5 | SuperSoul/SuperSoulAmendType.xlsx |
| `SuperSoul/SuperSoulAmendTypeText` | 2 | SuperSoul/SuperSoulAmendTypeText.xlsx |
| `SuperSoul/SuperSoulAmendTypeWeight` | 14 | SuperSoul/SuperSoulAmendTypeWeight.xlsx |
| `SuperSoul/SuperSoulBuff` | 8 | SuperSoul/SuperSoulBuff.xlsx |
| `SuperSoul/SuperSoulExp` | 7 | SuperSoul/SuperSoulExp.xlsx |

## 字段明细
### `SuperSoul/SuperSoul`
- `heroId` · `iconName` · `superSoulBuff` · `superSoulName`

**出向外键** (1):
- `heroId` → `Hero`

### `SuperSoul/SuperSoulAdvancedAmend`
- `id` · `HeroId` · `unlockCondition` · `unlockAttribute` · `unlockBuff` · `priority` · `name` · `Image`
- `desc` · `bigImage`

**出向外键** (1):
- `HeroId` → `Hero`

### `SuperSoul/SuperSoulAmendCost`
- `amendNumberType` · `multiplyCost` · `amendCost`

### `SuperSoul/SuperSoulAmendQualityText`
- `id` · `TypeText` · `TypeColor`

### `SuperSoul/SuperSoulAmendType`
- `amendType` · `limitCostItem` · `weight` · `itemWeight` · `isMust`

### `SuperSoul/SuperSoulAmendTypeText`
- `id` · `TypeText`

### `SuperSoul/SuperSoulAmendTypeWeight`
- `id` · `attributeType` · `amendAttribute` · `attributeLowerLimit` · `attributeUpperLimit` · `amendBuff` · `weight` · `amendShow`
- `amendNumber` · `overHaulSpawnUp` · `itemOverHaulPercentage` · `itemWightPercentage` · `typeQuality` · `97`

### `SuperSoul/SuperSoulBuff`
- `id` · `soulId` · `star` · `property` · `buffId` · `fightPower` · `needExp` · `buffDesc`

**出向外键** (1):
- `buffId` → `fight/_Buff`

### `SuperSoul/SuperSoulExp`
- `id` · `exp` · `type` · `weight` · `quality` · `name` · `icon`
