---
type: table_schema
title: "表族 UnionBounty"
group: "UnionBounty"
table_count: 4
---

# 表族 `UnionBounty`

共 4 张表。数据源：`knowledge/gamedata/`。

## 成员表清单
| 表名 | 字段数 | 相对路径 |
|------|--------|----------|
| `UnionBounty/UnionBountyGroup` | 10 | UnionBounty/UnionBountyGroup.xlsx |
| `UnionBounty/UnionBountyGroupTask` | 8 | UnionBounty/UnionBountyGroupTask.xlsx |
| `UnionBounty/UnionBountyRankReward` | 4 | UnionBounty/UnionBountyRankReward.xlsx |
| `UnionBounty/UnionBountyRewardEfficiency` | 4 | UnionBounty/UnionBountyRewardEfficiency.xlsx |

## 字段明细
### `UnionBounty/UnionBountyGroup`
- `groupId` · `cost` · `groupLevel` · `reward` · `extraReward` · `minusFactor` · `effFactor` · `showGroupName`
- `showArea` · `bossPicture`

### `UnionBounty/UnionBountyGroupTask`
- `id` · `groupId` · `taskId` · `enemyGroupId` · `bossId` · `isLast` · `showTaskName` · `EnemyScene`

### `UnionBounty/UnionBountyRankReward`
- `id` · `rankBefore` · `rankAfter` · `rewards`

### `UnionBounty/UnionBountyRewardEfficiency`
- `id` · `levelMin` · `levelMax` · `levelEffFactor`
