---
type: table_schema
title: "表族 FightManeuver"
group: "FightManeuver"
table_count: 1
---

# 表族 `FightManeuver`

共 1 张表。数据源：`knowledge/gamedata/`。

## 成员表清单
| 表名 | 字段数 | 相对路径 |
|------|--------|----------|
| `FightManeuver/FightManeuver` | 17 | FightManeuver/FightManeuver.xlsx |

## 字段明细
### `FightManeuver/FightManeuver`
- `id` · `type` · `heroId` · `name` · `DefaultSkill` · `hp` · `act` · `def`
- `speed` · `cri` · `anticri` · `cridamage` · `anticridamge` · `hit` · `dodge` · `antiblock`
- `block`

**出向外键** (1):
- `heroId` → `Hero`
