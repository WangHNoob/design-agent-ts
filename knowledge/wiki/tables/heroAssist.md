---
type: table_schema
title: "表族 heroAssist"
group: "heroAssist"
table_count: 4
---

# 表族 `heroAssist`

共 4 张表。数据源：`knowledge/gamedata/`。

## 成员表清单
| 表名 | 字段数 | 相对路径 |
|------|--------|----------|
| `heroAssist/FormationLev` | 9 | heroAssist/FormationLev.xlsx |
| `heroAssist/FormationLevClassic` | 11 | heroAssist/FormationLevClassic.xlsx |
| `heroAssist/FormationUpgradeItem` | 5 | heroAssist/FormationUpgradeItem.xlsx |
| `heroAssist/HeroAssist` | 14 | heroAssist/HeroAssist.xlsx |

## 字段明细
### `heroAssist/FormationLev`
- `id` · `formationId` · `level` · `upgradeExp` · `propAdd` · `propAddPercent` · `upgradeDesc` · `assistHeroNum`
- `descIndex`

**出向外键** (1):
- `formationId` → `Formation`

### `heroAssist/FormationLevClassic`
- `id` · `formationId` · `level` · `upgradeItem` · `UniExchange` · `upPos` · `upPosDesc` · `propAdd`
- `propAddPercent` · `buffDesc` · `descIndex`

**出向外键** (1):
- `formationId` → `Formation`

### `heroAssist/FormationUpgradeItem`
- `id` · `itemId` · `addExp` · `GroupNum` · `GroupSort`

**出向外键** (1):
- `itemId` → `Item`

### `heroAssist/HeroAssist`
- `id` · `heroId` · `orderNum` · `unlockCondition` · `isOpen` · `propAdd` · `propAddPercent` · `fightBuffId`
- `skillId` · `powerFactorD` · `descIndex` · `descIcon` · `powerFactorB` · `powerFactorC`

**出向外键** (3):
- `heroId` → `Hero`
- `fightBuffId` → `fight/FightBuff`
- `skillId` → `fight/Skill`
