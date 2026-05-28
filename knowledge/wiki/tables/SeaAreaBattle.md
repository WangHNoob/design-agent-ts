---
type: table_schema
title: "表族 SeaAreaBattle"
group: "SeaAreaBattle"
table_count: 4
---

# 表族 `SeaAreaBattle`

共 4 张表。数据源：`knowledge/gamedata/`。

## 成员表清单
| 表名 | 字段数 | 相对路径 |
|------|--------|----------|
| `SeaAreaBattle/SeaAreaBattleConfig` | 3 | SeaAreaBattle/SeaAreaBattleConfig.xlsx |
| `SeaAreaBattle/SeaAreaBattleFortress` | 3 | SeaAreaBattle/SeaAreaBattleFortress.xlsx |
| `SeaAreaBattle/SeaAreaBattleFortressDetail` | 6 | SeaAreaBattle/SeaAreaBattleFortressDetail.xlsx |
| `SeaAreaBattle/SeaAreaMonster` | 4 | SeaAreaBattle/SeaAreaMonster.xlsx |

## 字段明细
### `SeaAreaBattle/SeaAreaBattleConfig`
- `id` · `redAirBox` · `blueAirBox`

### `SeaAreaBattle/SeaAreaBattleFortress`
- `id` · `type` · `position`

### `SeaAreaBattle/SeaAreaBattleFortressDetail`
- `fortressType` · `affectDistance` · `duration` · `addProps` · `refreshCD` · `desc`

### `SeaAreaBattle/SeaAreaMonster`
- `id` · `shipId` · `fightGroupId` · `attackRange`

**出向外键** (1):
- `shipId` → `ship/Ship`
