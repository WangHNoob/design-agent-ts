---
type: table_schema
title: "表族 Show"
group: "Show"
table_count: 2
---

# 表族 `Show`

共 2 张表。数据源：`knowledge/gamedata/`。

## 成员表清单
| 表名 | 字段数 | 相对路径 |
|------|--------|----------|
| `ShowTeam` | 3 | ShowTeam.xlsx |
| `ShowTheirDepartments` | 5 | ShowTheirDepartments.xlsx |

## 字段明细
### `ShowTeam`
- `id` · `switchCondition` · `copyId`

### `ShowTheirDepartments`
- `id` · `ClassGroup` · `HeroID` · `Title` · `ishide`

**出向外键** (1):
- `HeroID` → `Hero`
