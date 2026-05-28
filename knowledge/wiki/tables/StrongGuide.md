---
type: table_schema
title: "表族 StrongGuide"
group: "StrongGuide"
table_count: 2
---

# 表族 `StrongGuide`

共 2 张表。数据源：`knowledge/gamedata/`。

## 成员表清单
| 表名 | 字段数 | 相对路径 |
|------|--------|----------|
| `StrongGuide/StrongGuide` | 5 | StrongGuide/StrongGuide.xlsx |
| `StrongGuide/StrongGuideTarget` | 7 | StrongGuide/StrongGuideTarget.xlsx |

## 字段明细
### `StrongGuide/StrongGuide`
- `strongGuideID` · `strongGuideName` · `leftIcon` · `rightIcon` · `guideTypeId`

**入向外键** (1):
- `NewStrongGuide/NewStrongGuide.strongGuideID` → 本表

### `StrongGuide/StrongGuideTarget`
- `targetID` · `strongGuideName` · `guideID` · `switchName` · `guideType` · `target` · `explanatoryText`

**出向外键** (1):
- `guideID` → `Guide/Guide`
