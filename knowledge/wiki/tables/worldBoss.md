---
type: table_schema
title: "表族 worldBoss"
group: "worldBoss"
table_count: 6
---

# 表族 `worldBoss`

共 6 张表。数据源：`knowledge/gamedata/`。

## 成员表清单
| 表名 | 字段数 | 相对路径 |
|------|--------|----------|
| `worldBoss/NewWPBoss` | 9 | worldBoss/NewWPBoss.xlsx |
| `worldBoss/NewWPBossRage` | 3 | worldBoss/NewWPBossRage.xlsx |
| `worldBoss/NewWPBossRankReward` | 4 | worldBoss/NewWPBossRankReward.xlsx |
| `worldBoss/NewWPBossRefresh` | 4 | worldBoss/NewWPBossRefresh.xlsx |
| `worldBoss/WorldPersonBoss` | 14 | worldBoss/WorldPersonBoss.xlsx |
| `worldBoss/WorldTeamBoss` | 7 | worldBoss/WorldTeamBoss.xlsx |

## 字段明细
### `worldBoss/NewWPBoss`
- `id` · `heroId` · `enemyId` · `name` · `refreshGroup` · `groupWeight` · `headIcon` · `showSkill`
- `desc`

**出向外键** (1):
- `heroId` → `Hero`

### `worldBoss/NewWPBossRage`
- `id` · `hpRange` · `color`

### `worldBoss/NewWPBossRankReward`
- `id` · `rankType` · `rankRange` · `reward`

### `worldBoss/NewWPBossRefresh`
- `id` · `weekDay` · `round` · `bossId`

### `worldBoss/WorldPersonBoss`
- `id` · `level` · `timeType` · `randomPos` · `monsterId` · `heroId` · `itemId` · `extraMonsterId`
- `needItemNum` · `prob` · `name` · `headIcon` · `place` · `itemIds`

**出向外键** (3):
- `heroId` → `Hero`
- `itemId` → `Item`
- `itemIds` → `Item`

### `worldBoss/WorldTeamBoss`
- `id` · `type` · `monsterId` · `rewards` · `name` · `headIcon` · `place`
