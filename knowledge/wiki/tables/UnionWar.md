---
type: table_schema
title: "表族 UnionWar"
group: "UnionWar"
table_count: 8
---

# 表族 `UnionWar`

共 8 张表。数据源：`knowledge/gamedata/`。

## 成员表清单
| 表名 | 字段数 | 相对路径 |
|------|--------|----------|
| `UnionWar/UnionWarGrade` | 5 | UnionWar/UnionWarGrade.xlsx |
| `UnionWar/UnionWarRank` | 5 | UnionWar/UnionWarRank.xlsx |
| `UnionWar/UnionWarReward` | 7 | UnionWar/UnionWarReward.xlsx |
| `UnionWar/UnionWarRoundStage` | 7 | UnionWar/UnionWarRoundStage.xlsx |
| `UnionWar/UnionWarSeason` | 3 | UnionWar/UnionWarSeason.xlsx |
| `UnionWar/UnionWarServerGroup` | 6 | UnionWar/UnionWarServerGroup.xlsx |
| `UnionWar/UnionWarStage` | 10 | UnionWar/UnionWarStage.xlsx |
| `UnionWar/UnionWarTeamFight` | 4 | UnionWar/UnionWarTeamFight.xlsx |

## 字段明细
### `UnionWar/UnionWarGrade`
- `id` · `grade` · `name` · `icon` · `unionActiveMin`

### `UnionWar/UnionWarRank`
- `id` · `name` · `rankType` · `maxNum` · `maxNumShow`

### `UnionWar/UnionWarReward`
- `id` · `grade` · `rewardType` · `param` · `reward` · `title` · `rewardTypeName`

### `UnionWar/UnionWarRoundStage`
- `id` · `roundStage` · `sort` · `name` · `lastTime` · `stateDesc` · `detailDesc`

### `UnionWar/UnionWarSeason`
- `id` · `season` · `openTime`

### `UnionWar/UnionWarServerGroup`
- `id` · `severDay` · `serverGroup` · `teamNumMax` · `teamContFightRule` · `fightAttrBanList`

### `UnionWar/UnionWarStage`
- `id` · `stage` · `sort` · `stageName` · `stageDesc` · `isInterval` · `round` · `roundStage`
- `roundStageName` · `lastTime`

### `UnionWar/UnionWarTeamFight`
- `id` · `rule` · `fightTimes` · `addBuff`
