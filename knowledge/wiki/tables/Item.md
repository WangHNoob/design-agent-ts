---
type: table_schema
title: "表族 _Item"
group: "_Item"
table_count: 2
---

# 表族 `_Item`

共 2 张表。数据源：`knowledge/gamedata/`。

## 成员表清单
| 表名 | 字段数 | 相对路径 |
|------|--------|----------|
| `_ItemPrice` | 4 | _ItemPrice.xlsx |
| `_ItemUseLimit` | 3 | _ItemUseLimit.xlsx |

## 字段明细
### `_ItemPrice`
- `7` · `1` · `9999` · `4`

### `_ItemUseLimit`
- `itemId` · `limitRate` · `limitTimes`

**出向外键** (1):
- `itemId` → `Item`
