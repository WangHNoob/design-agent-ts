---
type: table_schema
title: "表族 opFilmRed"
group: "opFilmRed"
table_count: 6
---

# 表族 `opFilmRed`

共 6 张表。数据源：`knowledge/gamedata/`。

## 成员表清单
| 表名 | 字段数 | 相对路径 |
|------|--------|----------|
| `opFilmRed/CollectionActivity` | 9 | opFilmRed/CollectionActivity.xlsx |
| `opFilmRed/CollectionActivityUI` | 2 | opFilmRed/CollectionActivityUI.xlsx |
| `opFilmRed/WorldTask` | 7 | opFilmRed/WorldTask.xlsx |
| `opFilmRed/WorldTaskUI` | 3 | opFilmRed/WorldTaskUI.xlsx |
| `opFilmRed/_OPFROpenTime` | 4 | opFilmRed/_OPFROpenTime.xlsx |
| `opFilmRed/_OPFRWorldTaskServer` | 5 | opFilmRed/_OPFRWorldTaskServer.xlsx |

## 字段明细
### `opFilmRed/CollectionActivity`
- `Id` · `sortId` · `taskName` · `gotoPage` · `btnPos` · `timePos` · `back` · `startTime`
- `endTime`

### `opFilmRed/CollectionActivityUI`
- `Id` · `titlePicture`

### `opFilmRed/WorldTask`
- `taskId` · `taskType` · `taskName` · `taskParam` · `taskTargets` · `rewards` · `gotoPage`

### `opFilmRed/WorldTaskUI`
- `Id` · `hero2d` · `title`

### `opFilmRed/_OPFROpenTime`
- `id` · `类型` · `开始时间` · `结束时间`

### `opFilmRed/_OPFRWorldTaskServer`
- `id` · `开始server` · `结束server` · `任务组` · `期数`
