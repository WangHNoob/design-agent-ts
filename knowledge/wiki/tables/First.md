---
type: table_schema
title: "表族 First"
group: "First"
table_count: 3
---

# 表族 `First`

共 3 张表。数据源：`knowledge/gamedata/`。

## 成员表清单
| 表名 | 字段数 | 相对路径 |
|------|--------|----------|
| `FirstRecharge` | 3 | FirstRecharge.xlsx |
| `FirstRechargeTask` | 7 | FirstRechargeTask.xlsx |
| `FirstRechargeTaskGroup` | 7 | FirstRechargeTaskGroup.xlsx |

## 字段明细
### `FirstRecharge`
- `id` · `day` · `reward`

### `FirstRechargeTask`
- `id` · `groupType` · `taskType` · `target` · `reward` · `title` · `icon`

### `FirstRechargeTaskGroup`
- `groupType` · `unlockPayVal` · `continueDay` · `showModel` · `title` · `reward` · `getRewardType`
