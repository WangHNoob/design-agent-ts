---
type: table_schema
title: "表族 spring"
group: "spring"
table_count: 3
---

# 表族 `spring`

共 3 张表。数据源：`knowledge/gamedata/`。

## 成员表清单
| 表名 | 字段数 | 相对路径 |
|------|--------|----------|
| `spring/SpringCookLevel` | 7 | spring/SpringCookLevel.xlsx |
| `spring/SpringCookbook` | 9 | spring/SpringCookbook.xlsx |
| `spring/SpringSpeedUpItem` | 4 | spring/SpringSpeedUpItem.xlsx |

## 字段明细
### `spring/SpringCookLevel`
- `id` · `level` · `exp` · `opNum` · `levelReward` · `lvRwdType` · `lvUpPlotId`

### `spring/SpringCookbook`
- `dishId` · `dishName` · `level` · `needTime` · `rewards` · `desc` · `dishExp` · `dishIcon`
- `maxCookNum`

### `spring/SpringSpeedUpItem`
- `id` · `itemRes` · `speedUpTime` · `desc`
