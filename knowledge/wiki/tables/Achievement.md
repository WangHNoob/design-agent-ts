---
type: table_schema
title: "表族 _Achievement"
group: "_Achievement"
table_count: 2
---

# 表族 `_Achievement`

共 2 张表。数据源：`knowledge/gamedata/`。

## 成员表清单
| 表名 | 字段数 | 相对路径 |
|------|--------|----------|
| `_AchievementCondition` | 6 | _AchievementCondition.xlsx |
| `_AchievementLevel` | 3 | _AchievementLevel.xlsx |

## 字段明细
### `_AchievementCondition`
- `id` · `achievementId` · `type` · `target` · `external` · `description`

**出向外键** (1):
- `achievementId` → `Achievement`

### `_AchievementLevel`
- `level` · `point` · `reward`
