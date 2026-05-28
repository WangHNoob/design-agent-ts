---
type: table_schema
title: "表族 NewStrongGuide"
group: "NewStrongGuide"
table_count: 3
---

# 表族 `NewStrongGuide`

共 3 张表。数据源：`knowledge/gamedata/`。

## 成员表清单
| 表名 | 字段数 | 相对路径 |
|------|--------|----------|
| `NewStrongGuide/NewStrongGuide` | 3 | NewStrongGuide/NewStrongGuide.xlsx |
| `NewStrongGuide/NewStrongGuideTarget` | 5 | NewStrongGuide/NewStrongGuideTarget.xlsx |
| `NewStrongGuide/NewStrongGuideType` | 3 | NewStrongGuide/NewStrongGuideType.xlsx |

## 字段明细
### `NewStrongGuide/NewStrongGuide`
- `strongGuideID` · `strongGuideName` · `guideTypeId`

**出向外键** (1):
- `strongGuideID` → `StrongGuide/StrongGuide`

### `NewStrongGuide/NewStrongGuideTarget`
- `targetID` · `strongGuideName` · `guideID` · `gameModuleID` · `explanatoryText`

**出向外键** (1):
- `guideID` → `Guide/Guide`

### `NewStrongGuide/NewStrongGuideType`
- `guideTypeId` · `name` · `explanatoryText`
