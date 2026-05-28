---
type: table_schema
title: "表族 turnTable"
group: "turnTable"
table_count: 5
---

# 表族 `turnTable`

共 5 张表。数据源：`knowledge/gamedata/`。

## 成员表清单
| 表名 | 字段数 | 相对路径 |
|------|--------|----------|
| `turnTable/_TurnTableLuckLimit` | 4 | turnTable/_TurnTableLuckLimit.xlsx |
| `turnTable/_TurnTablePool` | 7 | turnTable/_TurnTablePool.xlsx |
| `turnTable/_TurnTableProb` | 6 | turnTable/_TurnTableProb.xlsx |
| `turnTable/_TurnTableRand` | 6 | turnTable/_TurnTableRand.xlsx |
| `turnTable/_TurnTableShop` | 9 | turnTable/_TurnTableShop.xlsx |

## 字段明细
### `turnTable/_TurnTableLuckLimit`
- `id` · `score` · `luckLimit` · `turnTableType`

### `turnTable/_TurnTablePool`
- `id` · `turnTableType` · `type` · `num` · `shopId` · `precious` · `weight`

### `turnTable/_TurnTableProb`
- `id` · `type` · `score` · `luckProb` · `specialProb` · `turnTableType`

### `turnTable/_TurnTableRand`
- `id` · `type` · `score` · `level` · `poolNum` · `turnTableType`

### `turnTable/_TurnTableShop`
- `shopId` · `shopInfo` · `numLimitType` · `numLimit` · `startTime` · `endTime` · `position` · `resetScore`
- `score`

**入向外键** (1):
- `turnTableNew/TurnTableNewType.turnTableShopId` → 本表
