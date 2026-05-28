---
type: table_schema
title: "表族 integral"
group: "integral"
table_count: 40
---

# 表族 `integral`

共 40 张表。数据源：`knowledge/gamedata/`。

## 成员表清单
| 表名 | 字段数 | 相对路径 |
|------|--------|----------|
| `integral/IntegraChat` | 5 | integral/IntegraChat.xlsx |
| `integral/Integral2V2SeasonEndDuanweiReward` | 6 | integral/Integral2V2SeasonEndDuanweiReward.xlsx |
| `integral/Integral2V2chengfa` | 4 | integral/Integral2V2chengfa.xlsx |
| `integral/IntegralArenaRankReward` | 8 | integral/IntegralArenaRankReward.xlsx |
| `integral/IntegralArenaReward` | 7 | integral/IntegralArenaReward.xlsx |
| `integral/IntegralConfuseBuff` | 3 | integral/IntegralConfuseBuff.xlsx |
| `integral/IntegralConfuseHero` | 3 | integral/IntegralConfuseHero.xlsx |
| `integral/IntegralConfuseTime` | 6 | integral/IntegralConfuseTime.xlsx |
| `integral/IntegralFightAI` | 7 | integral/IntegralFightAI.xlsx |
| `integral/IntegralHonorScoreRule` | 6 | integral/IntegralHonorScoreRule.xlsx |
| `integral/IntegralHonorTagScore` | 7 | integral/IntegralHonorTagScore.xlsx |
| `integral/IntegralHonorTask` | 7 | integral/IntegralHonorTask.xlsx |
| `integral/IntegralHonorTechTree` | 9 | integral/IntegralHonorTechTree.xlsx |
| `integral/IntegralHonorTime` | 5 | integral/IntegralHonorTime.xlsx |
| `integral/IntegralHonorUnionReward` | 5 | integral/IntegralHonorUnionReward.xlsx |
| `integral/IntegralHonorUnionScore` | 3 | integral/IntegralHonorUnionScore.xlsx |
| `integral/IntegralHonorUnionUp` | 4 | integral/IntegralHonorUnionUp.xlsx |
| `integral/IntegralMasterFightBuff` | 10 | integral/IntegralMasterFightBuff.xlsx |
| `integral/IntegralRank` | 7 | integral/IntegralRank.xlsx |
| `integral/IntegralTask` | 9 | integral/IntegralTask.xlsx |
| `integral/IntegralZoneName` | 3 | integral/IntegralZoneName.xlsx |
| `integral/_Integral2V2Robot` | 8 | integral/_Integral2V2Robot.xlsx |
| `integral/_Integral2V2RobotRank` | 5 | integral/_Integral2V2RobotRank.xlsx |
| `integral/_Integral2V2Time` | 5 | integral/_Integral2V2Time.xlsx |
| `integral/_IntegralArenaArea` | 13 | integral/_IntegralArenaArea.xlsx |
| `integral/_IntegralArenaSeason` | 4 | integral/_IntegralArenaSeason.xlsx |
| `integral/_IntegralConfuseWeek` | 5 | integral/_IntegralConfuseWeek.xlsx |
| `integral/_IntegralContinueRisk` | 8 | integral/_IntegralContinueRisk.xlsx |
| `integral/_IntegralFightChange` | 16 | integral/_IntegralFightChange.xlsx |
| `integral/_IntegralFightPowerMatch` | 9 | integral/_IntegralFightPowerMatch.xlsx |
| `integral/_IntegralFightPowerRobot` | 5 | integral/_IntegralFightPowerRobot.xlsx |
| `integral/_IntegralFightReward` | 8 | integral/_IntegralFightReward.xlsx |
| `integral/_IntegralLevel` | 6 | integral/_IntegralLevel.xlsx |
| `integral/_IntegralMasterDisableHero` | 3 | integral/_IntegralMasterDisableHero.xlsx |
| `integral/_IntegralMatch` | 4 | integral/_IntegralMatch.xlsx |
| `integral/_IntegralMirror` | 11 | integral/_IntegralMirror.xlsx |
| `integral/_IntegralRisk` | 8 | integral/_IntegralRisk.xlsx |
| `integral/_IntegralRobot` | 9 | integral/_IntegralRobot.xlsx |
| `integral/_IntegralRobotHeroAI` | 10 | integral/_IntegralRobotHeroAI.xlsx |
| `integral/_IntegralServer` | 18 | integral/_IntegralServer.xlsx |

## 字段明细
### `integral/IntegraChat`
- `chatId` · `mood` · `chatInfo` · `rate` · `moodName`

### `integral/Integral2V2SeasonEndDuanweiReward`
- `id` · `integralBefore` · `integralAfter` · `integralReward` · `duanweiReward` · `chengfa`

### `integral/Integral2V2chengfa`
- `id` · `type` · `param` · `text`

### `integral/IntegralArenaRankReward`
- `id` · `areaType` · `rankBefore` · `rankAfter` · `matchCount` · `rankReward` · `titleReward` · `cupPicName`

### `integral/IntegralArenaReward`
- `id` · `areaType` · `integralBefore` · `integralAfter` · `matchCount` · `integralReward` · `duanweiReward`

### `integral/IntegralConfuseBuff`
- `buffId` · `buff1Name` · `buff1Desc`

**出向外键** (1):
- `buffId` → `fight/_Buff`

### `integral/IntegralConfuseHero`
- `seasonId` · `useHeros` · `specialHeroes`

### `integral/IntegralConfuseTime`
- `seasonId` · `startTime` · `playerEndTime` · `rewardTime` · `activityEndTime` · `timeText`

### `integral/IntegralFightAI`
- `id` · `channel` · `needScore` · `scoreLimit` · `eneryId` · `fightbuffs` · `rewards`

### `integral/IntegralHonorScoreRule`
- `id` · `duan` · `addCondition` · `limitNum` · `activeNum` · `integralScoreAdd`

### `integral/IntegralHonorTagScore`
- `id` · `areaType` · `type` · `param` · `tagScoreAdd` · `ration` · `manyTimes`

### `integral/IntegralHonorTask`
- `id` · `type` · `isUnionTask` · `param` · `rewards` · `addUnionScore` · `taskText`

### `integral/IntegralHonorTechTree`
- `id` · `areaType` · `level` · `upLevelCost` · `shopLevel` · `dailyRewards` · `dailyUnionScore` · `deatil`
- `totalDetail`

### `integral/IntegralHonorTime`
- `id` · `startTime` · `playerEndTime` · `rewardTime` · `activityEndTime`

### `integral/IntegralHonorUnionReward`
- `id` · `areaType` · `type` · `rank` · `reward`

### `integral/IntegralHonorUnionScore`
- `id` · `rank` · `ratio`

### `integral/IntegralHonorUnionUp`
- `id` · `areaType` · `honorUp` · `honorDown`

### `integral/IntegralMasterFightBuff`
- `id` · `buffName` · `buffDesc` · `scene` · `positiveHeros` · `positiveDesc` · `negativeHeros` · `negativeDesc`
- `backgroundRes` · `foregroundRes`

### `integral/IntegralRank`
- `id` · `areaType` · `integralBefore` · `integralAfter` · `integralRankId` · `integralRankIcon` · `integralRankName`

### `integral/IntegralTask`
- `taskId` · `taskName` · `taskTarget` · `taskReward` · `taskRandom` · `taskIcon` · `taskDesc` · `taskPool`
- `areaType`

### `integral/IntegralZoneName`
- `id` · `serverIds` · `zoneName`

### `integral/_Integral2V2Robot`
- `自增id，robotPlayerId` · `积分` · `showNickName` · `showIcon` · `showPlayerLevel` · `showFightPower` · `eneryGroups` · `weight`

### `integral/_Integral2V2RobotRank`
- `id` · `rank` · `probability` · `winprobability` · `loseprobability`

### `integral/_Integral2V2Time`
- `id` · `startTime` · `playerEndTime` · `rewardTime` · `activityEndTime`

### `integral/_IntegralArenaArea`
- `areaType` · `needCard` · `forbidEquipment` · `defaultFormation` · `openTime` · `initialIntegral` · `expandTime` · `expandIntegral`
- `weekDeductIntegral` · `deductLowLimit` · `FightFailLowLimit` · `FightWinHighLimit` · `repeatMatchControl`

### `integral/_IntegralArenaSeason`
- `id` · `areaType` · `StartTime` · `CloseTime`

### `integral/_IntegralConfuseWeek`
- `id` · `赛季id` · `第几周` · `buff ID 集合` · `、`

### `integral/_IntegralContinueRisk`
- `id` · `week` · `riskLevel` · `sendMail` · `autoBannedPlayer` · `bannedMinute` · `deductIntegral` · `autoDeduct`

### `integral/_IntegralFightChange`
- `id` · `areaType` · `integralRange` · `winExtra` · `failExtra` · `continuousWinMatch` · `continuousWinIntegral` · `weekDeductIntegral`
- `sameDayMaxMatchCount` · `initFightPower` · `fightPowerExpand` · `integralK` · `limitWeekFightCount` · `masterDeductScore` · `extraDeductSucc` · `extraDeductFail`

### `integral/_IntegralFightPowerMatch`
- `id` · `minScore` · `maxScore` · `minFightPower` · `maxFightPower` · `minWinProb` · `maxWinProb` · `minProbs`
- `maxProbs`

### `integral/_IntegralFightPowerRobot`
- `id` · `minFightPower` · `maxFightPower` · `strongFightPowerRange` · `weakFightPowerRange`

### `integral/_IntegralFightReward`
- `id` · `areaType` · `fightResult` · `rewards` · `goldCoefficient` · `dropGroup` · `maxCount` · `rate`

### `integral/_IntegralLevel`
- `id` · `minLevel` · `maxLevel` · `expandLevel` · `minexpandLevel` · `maxexpandLevel`

### `integral/_IntegralMasterDisableHero`
- `id` · `匹配战区ID（channel）` · `禁用角色`

### `integral/_IntegralMatch`
- `id` · `卡区id` · `时间节点` · `服务器范围`

### `integral/_IntegralMirror`
- `id` · `areaType` · `intervalBefore` · `intervalAfter` · `minIntegral` · `maxIntegral` · `normalFight` · `minFight`
- `maxFight` · `timeRate` · `failNumRobot`

### `integral/_IntegralRisk`
- `level` · `needIntegral` · `checkFightIntegral` · `sendMail` · `autoBannedPlayer` · `bannedMinute` · `deductIntegral` · `autoDeduct`

### `integral/_IntegralRobot`
- `areaType` · `heroType` · `heroPlace` · `heroQuality` · `heroLevel` · `heroStar` · `heroBreach` · `formationId`
- `robotNumber`

**出向外键** (1):
- `formationId` → `Formation`

### `integral/_IntegralRobotHeroAI`
- `自增id` · `英雄id` · `新服标记` · `普攻` · `主动技能` · `奥义` · `特殊技能（例如小菊和黑胡子）` · `全部技能`
- `技能释放顺序` · `策划备注`

### `integral/_IntegralServer`
- `id` · `serverIds` · `seasonWeek` · `newVersionStartDate` · `channel` · `excludeHeroIds` · `天梯巅峰赛挑战机器人对应的id（IntegralFightAI）` · `巅峰赛对应的胜率表ID`
- `matchGroup` · `masterMatchGroup` · `honorMatchGroup` · `honorMatchGroupS2` · `honorMatchGroupS3` · `meleeMatchGroup` · `是否使用新的天梯Ai策略` · `镜像新老区`
- `EmptyKey-G2` · `EmptyKey-H2`
