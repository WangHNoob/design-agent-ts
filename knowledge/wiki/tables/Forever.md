---
type: table_schema
title: "表族 Forever"
group: "Forever"
table_count: 2
---

# 表族 `Forever`

共 2 张表。数据源：`knowledge/gamedata/`。

## 成员表清单
| 表名 | 字段数 | 相对路径 |
|------|--------|----------|
| `ForeverItemLimit` | 2 | ForeverItemLimit.xlsx |
| `ForeverItemProperty` | 5 | ForeverItemProperty.xlsx |

## 字段明细
### `ForeverItemLimit`
- `itemId` · `limitTimes`

**出向外键** (1):
- `itemId` → `Item`

### `ForeverItemProperty`
- `7` · `1` · `9999` · `2` · `ID`
