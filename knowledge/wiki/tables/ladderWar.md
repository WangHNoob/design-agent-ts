---
type: table_schema
title: "表族 ladderWar"
group: "ladderWar"
table_count: 3
---

# 表族 `ladderWar`

共 3 张表。数据源：`knowledge/gamedata/`。

## 成员表清单
| 表名 | 字段数 | 相对路径 |
|------|--------|----------|
| `ladderWar/_LadderWarRankReward` | 5 | ladderWar/_LadderWarRankReward.xlsx |
| `ladderWar/_LadderWarSupportReward` | 3 | ladderWar/_LadderWarSupportReward.xlsx |
| `ladderWar/_LadderWarTimeConfig` | 3 | ladderWar/_LadderWarTimeConfig.xlsx |

## 字段明细
### `ladderWar/_LadderWarRankReward`
- `id` · `type` · `ranking` · `reward` · `titleId`

**出向外键** (1):
- `titleId` → `Title`

### `ladderWar/_LadderWarSupportReward`
- `id` · `round` · `reward`

### `ladderWar/_LadderWarTimeConfig`
- `timeType` · `days` · `doTime`
