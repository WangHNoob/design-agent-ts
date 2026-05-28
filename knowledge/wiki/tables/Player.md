---
type: table_schema
title: "表族 _Player"
group: "_Player"
table_count: 3
---

# 表族 `_Player`

共 3 张表。数据源：`knowledge/gamedata/`。

## 成员表清单
| 表名 | 字段数 | 相对路径 |
|------|--------|----------|
| `_PlayerDataTableNames` | 2 | _PlayerDataTableNames.xlsx |
| `_PlayerGetRewards` | 10 | _PlayerGetRewards.xlsx |
| `_PlayerShopBuyCount` | 2 | _PlayerShopBuyCount.xlsx |

## 字段明细
### `_PlayerDataTableNames`
- `tableName` · `returnFlag`

### `_PlayerGetRewards`
- `id` · `type` · `param` · `reward` · `canGetNum` · `popUPType` · `popUPText` · `startTime`
- `endTime` · `channelIdList`

### `_PlayerShopBuyCount`
- `level` · `numLimit`
