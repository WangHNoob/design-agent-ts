---
type: table_schema
title: "表族 CatchAction"
group: "CatchAction"
table_count: 5
---

# 表族 `CatchAction`

共 5 张表。数据源：`knowledge/gamedata/`。

## 成员表清单
| 表名 | 字段数 | 相对路径 |
|------|--------|----------|
| `CatchAction/CatchActionBackAgainCost` | 3 | CatchAction/CatchActionBackAgainCost.xlsx |
| `CatchAction/CatchActionReward` | 3 | CatchAction/CatchActionReward.xlsx |
| `CatchAction/CatchActionSuccessRandReward` | 2 | CatchAction/CatchActionSuccessRandReward.xlsx |
| `CatchAction/_CatchActionNavyRandNum` | 6 | CatchAction/_CatchActionNavyRandNum.xlsx |
| `CatchAction/_CatchActionProp` | 3 | CatchAction/_CatchActionProp.xlsx |

## 字段明细
### `CatchAction/CatchActionBackAgainCost`
- `id` · `cost` · `iconType`

### `CatchAction/CatchActionReward`
- `id` · `totalSuccessNum` · `award`

### `CatchAction/CatchActionSuccessRandReward`
- `id` · `award`

### `CatchAction/_CatchActionNavyRandNum`
- `自增id` · `随机类型` · `数量` · `权重` · `玩家成功play次数区间` · `数量上限`

### `CatchAction/_CatchActionProp`
- `id` · `step` · `persent`
