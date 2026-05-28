---
type: table_schema
title: "表族 _Buff"
group: "_Buff"
table_count: 2
---

# 表族 `_Buff`

共 2 张表。数据源：`knowledge/gamedata/`。

## 成员表清单
| 表名 | 字段数 | 相对路径 |
|------|--------|----------|
| `_Buff` | 20 | _Buff.xlsx |
| `_BuffCondition` | 5 | _BuffCondition.xlsx |

## 字段明细
### `_Buff`
- `BuffId` · `BuffClass` · `Round` · `BeforeActiveCount` · `AfterActiveCount` · `ActiveUntilRoundEnd` · `AttCount` · `DefCount`
- `LimitedCount` · `AccumIdCount` · `AccumGroupCount` · `CoverByBuffGroup` · `CanBeCleared` · `PerFactor` · `Factor` · `SomeData`
- `AdditionalBuffs` · `BuffGroup` · `IsDebuff` · `ClearAfterDie`

### `_BuffCondition`
- `条件类型` · `条件参数` · `EmptyKey-D2` · `注释` · `EmptyKey-F2`
