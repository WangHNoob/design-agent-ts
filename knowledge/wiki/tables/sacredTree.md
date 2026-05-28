---
type: table_schema
title: "表族 sacredTree"
group: "sacredTree"
table_count: 4
---

# 表族 `sacredTree`

共 4 张表。数据源：`knowledge/gamedata/`。

## 成员表清单
| 表名 | 字段数 | 相对路径 |
|------|--------|----------|
| `sacredTree/SacredTreeAward` | 4 | sacredTree/SacredTreeAward.xlsx |
| `sacredTree/SacredTreeCount` | 6 | sacredTree/SacredTreeCount.xlsx |
| `sacredTree/SacredTreeWord` | 3 | sacredTree/SacredTreeWord.xlsx |
| `sacredTree/_SacredTreePool` | 17 | sacredTree/_SacredTreePool.xlsx |

## 字段明细
### `sacredTree/SacredTreeAward`
- `awardId` · `awardInfo` · `worth` · `weight`

### `sacredTree/SacredTreeCount`
- `num` · `refreshCost` · `lotteryCost1` · `lotteryCost2` · `fixedAward` · `lotteryAward`

### `sacredTree/SacredTreeWord`
- `id` · `remainNum` · `content`

### `sacredTree/_SacredTreePool`
- `自增id` · `每日刷新次数` · `价值信息` · `权重` · `EmptyKey-E2` · `EmptyKey-F2` · `EmptyKey-G2` · `EmptyKey-H2`
- `EmptyKey-I2` · `EmptyKey-J2` · `EmptyKey-K2` · `EmptyKey-L2` · `EmptyKey-M2` · `EmptyKey-N2` · `EmptyKey-O2` · `EmptyKey-P2`
- `EmptyKey-Q2`
