---
type: table_schema
title: "表族 openServerActivity"
group: "openServerActivity"
table_count: 7
---

# 表族 `openServerActivity`

共 7 张表。数据源：`knowledge/gamedata/`。

## 成员表清单
| 表名 | 字段数 | 相对路径 |
|------|--------|----------|
| `openServerActivity/CarnivalGroup` | 4 | openServerActivity/CarnivalGroup.xlsx |
| `openServerActivity/CarnivalGroupReward` | 6 | openServerActivity/CarnivalGroupReward.xlsx |
| `openServerActivity/CarnivalTask` | 8 | openServerActivity/CarnivalTask.xlsx |
| `openServerActivity/CarnivalTaskGroup` | 5 | openServerActivity/CarnivalTaskGroup.xlsx |
| `openServerActivity/CarnivalTaskModuleTarget` | 2 | openServerActivity/CarnivalTaskModuleTarget.xlsx |
| `openServerActivity/OpenServerActivityReward` | 4 | openServerActivity/OpenServerActivityReward.xlsx |
| `openServerActivity/_OpenServerActivityTime` | 4 | openServerActivity/_OpenServerActivityTime.xlsx |

## 字段明细
### `openServerActivity/CarnivalGroup`
- `groupId` · `startDay` · `endDay` · `isNew`

### `openServerActivity/CarnivalGroupReward`
- `id` · `groupId` · `carnivalExp` · `reward` · `isHighReward` · `icon`

### `openServerActivity/CarnivalTask`
- `taskId` · `taskType` · `taskTitle` · `taskDesc` · `taskTarget1` · `taskTarget2` · `carnivalExp` · `taskReward`

### `openServerActivity/CarnivalTaskGroup`
- `taskGroupId` · `openDay` · `groupId` · `taskGroup` · `groupName`

### `openServerActivity/CarnivalTaskModuleTarget`
- `taskTypeId` · `moduleTargetId`

### `openServerActivity/OpenServerActivityReward`
- `id` · `type` · `threshold` · `reward`

### `openServerActivity/_OpenServerActivityTime`
- `7` · `1` · `9999` · `3`
