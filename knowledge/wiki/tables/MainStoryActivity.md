---
type: table_schema
title: "表族 MainStoryActivity"
group: "MainStoryActivity"
table_count: 3
---

# 表族 `MainStoryActivity`

共 3 张表。数据源：`knowledge/gamedata/`。

## 成员表清单
| 表名 | 字段数 | 相对路径 |
|------|--------|----------|
| `MainStoryActivity/MainStoryActivity` | 9 | MainStoryActivity/MainStoryActivity.xlsx |
| `MainStoryActivity/MainStoryActivityDifficulty` | 6 | MainStoryActivity/MainStoryActivityDifficulty.xlsx |
| `MainStoryActivity/MainStoryActivityLevel` | 10 | MainStoryActivity/MainStoryActivityLevel.xlsx |

## 字段明细
### `MainStoryActivity/MainStoryActivity`
- `id` · `period` · `displayTime` · `openTime` · `durationHours` · `name` · `desc` · `levelGroup`
- `playerNum`

### `MainStoryActivity/MainStoryActivityDifficulty`
- `id` · `serverDay` · `isNewServer` · `time` · `showTime` · `attrAdd`

### `MainStoryActivity/MainStoryActivityLevel`
- `id` · `name` · `levelGroup` · `enemyGroup` · `mapID` · `fightPower` · `passReward` · `taskId`
- `taskName` · `raidMapImageId`
