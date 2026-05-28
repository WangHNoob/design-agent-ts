---
type: table_schema
title: "表族 Declare"
group: "Declare"
table_count: 4
---

# 表族 `Declare`

共 4 张表。数据源：`knowledge/gamedata/`。

## 成员表清单
| 表名 | 字段数 | 相对路径 |
|------|--------|----------|
| `Declare/DeclareSeason` | 8 | Declare/DeclareSeason.xlsx |
| `Declare/DeclareValue` | 5 | Declare/DeclareValue.xlsx |
| `Declare/UnionDeclareGroup` | 4 | Declare/UnionDeclareGroup.xlsx |
| `Declare/UnionDeclareTime` | 6 | Declare/UnionDeclareTime.xlsx |

## 字段明细
### `Declare/DeclareSeason`
- `id` · `openTime` · `endTime` · `personalDailyTime` · `unionLevelLimit` · `unionMemberLimit` · `unionHateValue` · `unionCost`

### `Declare/DeclareValue`
- `id` · `changeType` · `param` · `showText` · `showType`

### `Declare/UnionDeclareGroup`
- `id` · `member` · `addScore` · `title`

### `Declare/UnionDeclareTime`
- `id` · `startTime` · `selctStageTime` · `deployStageTime` · `readyStageTime` · `fightStageTime`
