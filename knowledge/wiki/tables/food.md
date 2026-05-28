---
type: table_schema
title: "表族 food"
group: "food"
table_count: 2
---

# 表族 `food`

共 2 张表。数据源：`knowledge/gamedata/`。

## 成员表清单
| 表名 | 字段数 | 相对路径 |
|------|--------|----------|
| `food/Food` | 12 | food/Food.xlsx |
| `food/FoodEffect` | 8 | food/FoodEffect.xlsx |

## 字段明细
### `food/Food`
- `foodId` · `foodName` · `effect` · `necessary` · `unnecessary` · `food` · `coproductRate` · `coproduct`
- `label` · `unlock` · `effectId` · `menuLabel`

### `food/FoodEffect`
- `id` · `type` · `expireRule` · `durationTime` · `maxNum` · `reach` · `reachText` · `canOffSet`
