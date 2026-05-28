---
type: table_schema
title: "表族 potential"
group: "potential"
table_count: 3
---

# 表族 `potential`

共 3 张表。数据源：`knowledge/gamedata/`。

## 成员表清单
| 表名 | 字段数 | 相对路径 |
|------|--------|----------|
| `potential/PotentialHero` | 7 | potential/PotentialHero.xlsx |
| `potential/TreasureNode` | 8 | potential/TreasureNode.xlsx |
| `potential/TreasureNodeLevel` | 7 | potential/TreasureNodeLevel.xlsx |

## 字段明细
### `potential/PotentialHero`
- `heroId` · `starCondition` · `levelCondition` · `breach` · `extraEffectType` · `extraEffectParam` · `extraEffectDesc`

**出向外键** (1):
- `heroId` → `Hero`

### `potential/TreasureNode`
- `nodeId` · `heroId` · `nodeType` · `onlyDisplay` · `icon` · `desc` · `nodePos` · `name`

**出向外键** (1):
- `heroId` → `Hero`

### `potential/TreasureNodeLevel`
- `id` · `nodeId` · `level` · `needItem` · `fightBuffId` · `prop` · `desc`

**出向外键** (1):
- `fightBuffId` → `fight/FightBuff`
