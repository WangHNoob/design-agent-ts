---
type: table_schema
title: "表族 MultiTeamFight"
group: "MultiTeamFight"
table_count: 13
---

# 表族 `MultiTeamFight`

共 13 张表。数据源：`knowledge/gamedata/`。

## 成员表清单
| 表名 | 字段数 | 相对路径 |
|------|--------|----------|
| `MultiTeamFight/MutiTeamFightBuff` | 10 | MultiTeamFight/MutiTeamFightBuff.xlsx |
| `MultiTeamFight/MutiTeamFightRankReward` | 7 | MultiTeamFight/MutiTeamFightRankReward.xlsx |
| `MultiTeamFight/MutiTeamFightRanklimit` | 8 | MultiTeamFight/MutiTeamFightRanklimit.xlsx |
| `MultiTeamFight/MutiTeamFightReward` | 4 | MultiTeamFight/MutiTeamFightReward.xlsx |
| `MultiTeamFight/_DictMultiTeamFightFuncConfig` | 5 | MultiTeamFight/_DictMultiTeamFightFuncConfig.xlsx |
| `MultiTeamFight/_FightFuncClose` | 5 | MultiTeamFight/_FightFuncClose.xlsx |
| `MultiTeamFight/_MultiTeamFightAllServerMatch` | 4 | MultiTeamFight/_MultiTeamFightAllServerMatch.xlsx |
| `MultiTeamFight/_MultiTeamFightContinueScoreRule` | 7 | MultiTeamFight/_MultiTeamFightContinueScoreRule.xlsx |
| `MultiTeamFight/_MultiTeamFightExtraScoreRule` | 5 | MultiTeamFight/_MultiTeamFightExtraScoreRule.xlsx |
| `MultiTeamFight/_MultiTeamFightMatchRule` | 11 | MultiTeamFight/_MultiTeamFightMatchRule.xlsx |
| `MultiTeamFight/_MultiTeamFightRobotodds` | 4 | MultiTeamFight/_MultiTeamFightRobotodds.xlsx |
| `MultiTeamFight/_MultiTeamFightTime` | 6 | MultiTeamFight/_MultiTeamFightTime.xlsx |
| `MultiTeamFight/_MutiTeamFightRobot` | 7 | MultiTeamFight/_MutiTeamFightRobot.xlsx |

## 字段明细
### `MultiTeamFight/MutiTeamFightBuff`
- `id` · `buffName` · `buffDesc` · `scene` · `positiveHeros` · `positiveDesc` · `negativeHeros` · `negativeDesc`
- `backgroundRes` · `foregroundRes`

### `MultiTeamFight/MutiTeamFightRankReward`
- `id` · `type` · `rank` · `rankname` · `rkname` · `rankicon` · `reward`

### `MultiTeamFight/MutiTeamFightRanklimit`
- `id` · `rank` · `rankname` · `rkname` · `rankicon` · `ranktext` · `hideid` · `IsStartPromotion`

### `MultiTeamFight/MutiTeamFightReward`
- `id` · `type` · `conditions` · `reward`

### `MultiTeamFight/_DictMultiTeamFightFuncConfig`
- `id` · `funcType` · `duanType` · `param` · `paramString`

### `MultiTeamFight/_FightFuncClose`
- `id` · `fightType` · `duanType` · `funcType` · `effectType`

### `MultiTeamFight/_MultiTeamFightAllServerMatch`
- `7` · `1` · `999` · `2`

### `MultiTeamFight/_MultiTeamFightContinueScoreRule`
- `自增id` · `积分下限` · `积分上限` · `推送对手分段增加值` · `推送对手分段减少值` · `连胜提高匹配分数段` · `连败降低匹配分数段`

### `MultiTeamFight/_MultiTeamFightExtraScoreRule`
- `自增id` · `积分差值下限` · `积分差值上限` · `胜利额外加分` · `失败额外扣分`

### `MultiTeamFight/_MultiTeamFightMatchRule`
- `自增id` · `积分下限` · `积分上限` · `推送对手分段增加值` · `推送对手分段减少值` · `连胜提高匹配分数段，用于匹配` · `连败降低匹配分数段，用于匹配` · `连胜积分变化，用于计算积分`
- `连败积分变化，用于计算积分` · `是否全服匹配` · `是否仅本段位匹配`

### `MultiTeamFight/_MultiTeamFightRobotodds`
- `id` · `rank` · `num` · `weight`

### `MultiTeamFight/_MultiTeamFightTime`
- `id` · `startTime` · `playerEndTime` · `rewardTime` · `activityEndTime` · `effectBuffId`

### `MultiTeamFight/_MutiTeamFightRobot`
- `自增id，robotPlayerId` · `积分` · `showNickName` · `showIcon` · `showPlayerLevel` · `showFightPower` · `eneryGroups`
