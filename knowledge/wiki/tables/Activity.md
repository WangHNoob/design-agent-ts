---
type: table_schema
title: "表族 Activity"
group: "Activity"
table_count: 4
---

# 表族 `Activity`

共 4 张表。数据源：`knowledge/gamedata/`。

## 成员表清单
| 表名 | 字段数 | 相对路径 |
|------|--------|----------|
| `ActivityData` | 11 | ActivityData.xlsx |
| `ActivityRaid` | 8 | ActivityRaid.xlsx |
| `ActivityRaidChapter` | 8 | ActivityRaidChapter.xlsx |
| `ActivityWeekPVPTask` | 8 | ActivityWeekPVPTask.xlsx |

## 字段明细
### `ActivityData`
- `typeId` · `name` · `rank` · `modelId` · `position` · `rotation` · `scale` · `sortType`
- `bgImage` · `activityName` · `prefabName`

### `ActivityRaid`
- `raidId` · `raidType` · `bgName` · `buffName` · `raidName` · `openTime` · `costItems` · `titleImage`

### `ActivityRaidChapter`
- `chapterId` · `raidId` · `preChapterId` · `level` · `limitLevel` · `difficulty` · `showItems` · `fightPoint`

### `ActivityWeekPVPTask`
- `id` · `type` · `task` · `param` · `rewards` · `text` · `jump` · `target`
