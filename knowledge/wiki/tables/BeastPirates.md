---
type: table_schema
title: "表族 BeastPirates"
group: "BeastPirates"
table_count: 24
---

# 表族 `BeastPirates`

共 24 张表。数据源：`knowledge/gamedata/`。

## 成员表清单
| 表名 | 字段数 | 相对路径 |
|------|--------|----------|
| `BeastPirates/BeastPiratesBattleIntent` | 8 | BeastPirates/BeastPiratesBattleIntent.xlsx |
| `BeastPirates/BeastPiratesBoss` | 14 | BeastPirates/BeastPiratesBoss.xlsx |
| `BeastPirates/BeastPiratesBossBuff` | 7 | BeastPirates/BeastPiratesBossBuff.xlsx |
| `BeastPirates/BeastPiratesBossSkill` | 5 | BeastPirates/BeastPiratesBossSkill.xlsx |
| `BeastPirates/BeastPiratesDonate` | 4 | BeastPirates/BeastPiratesDonate.xlsx |
| `BeastPirates/BeastPiratesFourStageBoss` | 12 | BeastPirates/BeastPiratesFourStageBoss.xlsx |
| `BeastPirates/BeastPiratesOneStageCopy` | 13 | BeastPirates/BeastPiratesOneStageCopy.xlsx |
| `BeastPirates/BeastPiratesPassLevel` | 9 | BeastPirates/BeastPiratesPassLevel.xlsx |
| `BeastPirates/BeastPiratesPassTask` | 13 | BeastPirates/BeastPiratesPassTask.xlsx |
| `BeastPirates/BeastPiratesRaid/BeastPiratesRaid` | 9 | BeastPirates/BeastPiratesRaid/BeastPiratesRaid.xlsx |
| `BeastPirates/BeastPiratesRaid/_BeastPiratesRaidNotice` | 2 | BeastPirates/BeastPiratesRaid/_BeastPiratesRaidNotice.xlsx |
| `BeastPirates/BeastPiratesRankReward` | 5 | BeastPirates/BeastPiratesRankReward.xlsx |
| `BeastPirates/BeastPiratesSpecialDonate` | 5 | BeastPirates/BeastPiratesSpecialDonate.xlsx |
| `BeastPirates/BeastPiratesStage` | 5 | BeastPirates/BeastPiratesStage.xlsx |
| `BeastPirates/BeastPiratesStronghold` | 12 | BeastPirates/BeastPiratesStronghold.xlsx |
| `BeastPirates/BeastPiratesStrongholdBoss` | 14 | BeastPirates/BeastPiratesStrongholdBoss.xlsx |
| `BeastPirates/BeastPiratesStrongholdEntry` | 5 | BeastPirates/BeastPiratesStrongholdEntry.xlsx |
| `BeastPirates/BeastPiratesStrongholdReport` | 3 | BeastPirates/BeastPiratesStrongholdReport.xlsx |
| `BeastPirates/BeastPiratesTime` | 2 | BeastPirates/BeastPiratesTime.xlsx |
| `BeastPirates/BeastPiratesUnionRaid/BeastPiratesUnionRaid` | 13 | BeastPirates/BeastPiratesUnionRaid/BeastPiratesUnionRaid.xlsx |
| `BeastPirates/BeastPiratesUnionRaid/BeastPiratesUnionRaidReward` | 3 | BeastPirates/BeastPiratesUnionRaid/BeastPiratesUnionRaidReward.xlsx |
| `BeastPirates/BeastPiratesUnionRaid/_BeastPiratesUnionRaidNotice` | 2 | BeastPirates/BeastPiratesUnionRaid/_BeastPiratesUnionRaidNotice.xlsx |
| `BeastPirates/_BeastPiratesFourStageBlood` | 4 | BeastPirates/_BeastPiratesFourStageBlood.xlsx |
| `BeastPirates/_BeastPiratesServerGroup` | 6 | BeastPirates/_BeastPiratesServerGroup.xlsx |

## 字段明细
### `BeastPirates/BeastPiratesBattleIntent`
- `id` · `type` · `buffIds` · `unLockLevel` · `level` · `maxExp` · `unlockInfo` · `icon`

**出向外键** (1):
- `buffIds` → `fight/_Buff`

### `BeastPirates/BeastPiratesBoss`
- `bossId` · `bossType` · `maxChallengeNum` · `enemyGroupId` · `bossSkillIds` · `buffUpLimit` · `rewards` · `bossName`
- `bossIcon` · `bossDesc` · `bossLevel` · `bossTimeInfo` · `fightMapId` · `groupId`

### `BeastPirates/BeastPiratesBossBuff`
- `id` · `buffId` · `buffName` · `bossId` · `buffDesc` · `buffIcon` · `buffUnlock`

**出向外键** (1):
- `buffId` → `fight/_Buff`

### `BeastPirates/BeastPiratesBossSkill`
- `bossSkillId` · `buffId` · `skillName` · `skillDesc` · `skillIcon`

**出向外键** (1):
- `buffId` → `fight/_Buff`

### `BeastPirates/BeastPiratesDonate`
- `id` · `needProp` · `contribute` · `icon`

### `BeastPirates/BeastPiratesFourStageBoss`
- `bossId` · `bossSkillIds` · `bossBloodSkillIds` · `unlockHpPercen` · `rewards` · `enemyGroupId` · `fightMapId` · `bossName`
- `bossIcon` · `bossDesc` · `heroFashionId` · `groupId`

**出向外键** (1):
- `heroFashionId` → `HeroFashion`

### `BeastPirates/BeastPiratesOneStageCopy`
- `copyId` · `fristRewards` · `rewards` · `copyGroup` · `copyIndex` · `copyName` · `fighting` · `unlockInfo`
- `sweepParam` · `enemyGroupId` · `enemyGroupId2` · `fightMapId` · `groupId`

### `BeastPirates/BeastPiratesPassLevel`
- `id` · `type` · `level` · `lowAward` · `highAward` · `upLevelExp` · `isImportantLevel` · `lowTitleId`
- `highTitleId`

### `BeastPirates/BeastPiratesPassTask`
- `id` · `descr` · `type` · `needTimes` · `exp` · `rewards` · `texture` · `desc`
- `targetId` · `playerExp` · `opentime` · `endtime` · `groupId`

### `BeastPirates/BeastPiratesRaid/BeastPiratesRaid`
- `id` · `time` · `reward` · `bossName` · `bossIcon` · `runMapId` · `levelName` · `levelText`
- `bossSkillIds`

### `BeastPirates/BeastPiratesRaid/_BeastPiratesRaidNotice`
- `Id` · `notice`

### `BeastPirates/BeastPiratesRankReward`
- `id` · `type` · `startRank` · `endRank` · `rewards`

### `BeastPirates/BeastPiratesSpecialDonate`
- `id` · `needProp` · `contribute` · `volition` · `volitionInfo`

### `BeastPirates/BeastPiratesStage`
- `stageId` · `stageType` · `name` · `desc` · `groupId`

### `BeastPirates/BeastPiratesStronghold`
- `id` · `strongholdType` · `name` · `opentime` · `endtime` · `groupId` · `rewards` · `simpleBossId`
- `difficultyBossId` · `guildEntryIds` · `extraIntegral` · `icon`

### `BeastPirates/BeastPiratesStrongholdBoss`
- `bossId` · `bossType` · `enemyGroupId` · `enemyGroupId2` · `bossSkillIds` · `entryIds` · `basePoint` · `fight`
- `bossName` · `bossIcon` · `heroFashionId` · `fightMapId` · `bossDesc` · `bossLevel`

**出向外键** (1):
- `heroFashionId` → `HeroFashion`

### `BeastPirates/BeastPiratesStrongholdEntry`
- `entryId` · `entryType` · `maxNum` · `integral` · `entryInfo`

### `BeastPirates/BeastPiratesStrongholdReport`
- `id` · `Type` · `Text`

### `BeastPirates/BeastPiratesTime`
- `id` · `groupId`

### `BeastPirates/BeastPiratesUnionRaid/BeastPiratesUnionRaid`
- `id` · `copyType` · `copyStage` · `fightMapId` · `groupId` · `enemyGroupId` · `bossName` · `bossIcon`
- `copyName` · `copyText` · `bossSkillIds` · `heroFashionId` · `enemyHeroIds`

**出向外键** (1):
- `heroFashionId` → `HeroFashion`

### `BeastPirates/BeastPiratesUnionRaid/BeastPiratesUnionRaidReward`
- `id` · `progress` · `rewards`

### `BeastPirates/BeastPiratesUnionRaid/_BeastPiratesUnionRaidNotice`
- `Id` · `notice`

### `BeastPirates/_BeastPiratesFourStageBlood`
- `id` · `bossid` · `时间` · `血量变化`

### `BeastPirates/_BeastPiratesServerGroup`
- `id` · `stageType` · `serverIds` · `bossorder1` · `bossorder2` · `bossorder3`
