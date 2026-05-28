---
type: table_schema
title: "表族 UnionBoss"
group: "UnionBoss"
table_count: 3
---

# 表族 `UnionBoss`

共 3 张表。数据源：`knowledge/gamedata/`。

## 成员表清单
| 表名 | 字段数 | 相对路径 |
|------|--------|----------|
| `UnionBoss/UnionBossModel` | 9 | UnionBoss/UnionBossModel.xlsx |
| `UnionBoss/UnionBossOverallReward` | 2 | UnionBoss/UnionBossOverallReward.xlsx |
| `UnionBoss/UnionBossTask` | 5 | UnionBoss/UnionBossTask.xlsx |

## 字段明细
### `UnionBoss/UnionBossModel`
- `id` · `modelPath` · `ratation` · `scale` · `position` · `animationName` · `AnimatorControllerPath` · `buttonIcon`
- `sailorModel`

### `UnionBoss/UnionBossOverallReward`
- `rank` · `reward`

### `UnionBoss/UnionBossTask`
- `id` · `reward` · `description` · `bossId` · `bossLev`
