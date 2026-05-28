---
type: table_schema
title: "表族 timeLimitTreasure"
group: "timeLimitTreasure"
table_count: 3
---

# 表族 `timeLimitTreasure`

共 3 张表。数据源：`knowledge/gamedata/`。

## 成员表清单
| 表名 | 字段数 | 相对路径 |
|------|--------|----------|
| `timeLimitTreasure/TimeLimitTreasureReward` | 5 | timeLimitTreasure/TimeLimitTreasureReward.xlsx |
| `timeLimitTreasure/TimeLimitTreasureType` | 7 | timeLimitTreasure/TimeLimitTreasureType.xlsx |
| `timeLimitTreasure/_TimeLimitTreasureConfig` | 4 | timeLimitTreasure/_TimeLimitTreasureConfig.xlsx |

## 字段明细
### `timeLimitTreasure/TimeLimitTreasureReward`
- `id` · `type` · `day` · `reward` · `isHighReward`

### `timeLimitTreasure/TimeLimitTreasureType`
- `id` · `title` · `titleImage` · `bgImage` · `CostItem` · `OpenTime` · `number`

### `timeLimitTreasure/_TimeLimitTreasureConfig`
- `id` · `notLoginDay` · `openCD` · `mailReward`
