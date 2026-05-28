---
type: table_schema
title: "表族 _Arena"
group: "_Arena"
table_count: 4
---

# 表族 `_Arena`

共 4 张表。数据源：`knowledge/gamedata/`。

## 成员表清单
| 表名 | 字段数 | 相对路径 |
|------|--------|----------|
| `_ArenaFightReward` | 5 | _ArenaFightReward.xlsx |
| `_ArenaHighRankReward` | 3 | _ArenaHighRankReward.xlsx |
| `_ArenaRobotEquipment` | 6 | _ArenaRobotEquipment.xlsx |
| `_ArenaRobotHero` | 8 | _ArenaRobotHero.xlsx |

## 字段明细
### `_ArenaFightReward`
- `id` · `fightResult` · `rewards` · `goldCoefficient` · `dropGroup`

### `_ArenaHighRankReward`
- `id` · `rank` · `rewards`

### `_ArenaRobotEquipment`
- `id` · `cardGroup` · `heroId` · `heroLevel` · `heroStarLevel` · `equipmentInfo`

**出向外键** (1):
- `heroId` → `Hero`

### `_ArenaRobotHero`
- `id` · `beforeRank` · `behindRank` · `heroSSR` · `heroSR` · `heroR` · `formationId` · `level`

**出向外键** (1):
- `formationId` → `Formation`
