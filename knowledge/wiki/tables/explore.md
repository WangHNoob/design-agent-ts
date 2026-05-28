---
type: table_schema
title: "表族 explore"
group: "explore"
table_count: 5
---

# 表族 `explore`

共 5 张表。数据源：`knowledge/gamedata/`。

## 成员表清单
| 表名 | 字段数 | 相对路径 |
|------|--------|----------|
| `explore/ExploreBoss` | 13 | explore/ExploreBoss.xlsx |
| `explore/ExploreExtraConditionPool` | 14 | explore/ExploreExtraConditionPool.xlsx |
| `explore/ExploreExtraScore` | 7 | explore/ExploreExtraScore.xlsx |
| `explore/ExploreRankReward` | 6 | explore/ExploreRankReward.xlsx |
| `explore/ExploreScoreReward` | 2 | explore/ExploreScoreReward.xlsx |

## 字段明细
### `explore/ExploreBoss`
- `bossId` · `displayHeroId` · `displayBattleReward` · `costItem` · `power` · `grade` · `BossInfoId` · `heroId`
- `BgImage` · `XAxis` · `YAxis` · `ZAxis` · `scale`

**出向外键** (2):
- `heroId` → `Hero`
- `BossInfoId` → `fight/BossInfo`

### `explore/ExploreExtraConditionPool`
- `id` · `bossId` · `type` · `param` · `是否是进阶条件` · `关联进阶id` · `额外奖励是否需要击败敌人` · `额外积分`
- `额外代币等奖励` · `是否推送跑马灯` · `跑马灯描述` · `权重` · `条件别称` · `是否推送飘字`

### `explore/ExploreExtraScore`
- `id` · `bossId` · `type` · `param` · `score` · `descri` · `resultDesc`

### `explore/ExploreRankReward`
- `id` · `rankStart` · `rankEnd` · `reward` · `titleIcon` · `titleId`

**出向外键** (1):
- `titleId` → `Title`

### `explore/ExploreScoreReward`
- `id` · `reward`
