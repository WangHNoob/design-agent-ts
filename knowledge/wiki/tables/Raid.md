---
type: table_schema
title: "表族 Raid"
group: "Raid"
table_count: 16
---

# 表族 `Raid`

共 16 张表。数据源：`knowledge/gamedata/`。

## 成员表清单
| 表名 | 字段数 | 相对路径 |
|------|--------|----------|
| `RaidBeginCondition` | 4 | RaidBeginCondition.xlsx |
| `RaidChapter` | 8 | RaidChapter.xlsx |
| `RaidEnemy` | 63 | RaidEnemy.xlsx |
| `RaidMainStoryEpisode` | 5 | RaidMainStoryEpisode.xlsx |
| `RaidRunMap` | 12 | RaidRunMap.xlsx |
| `RaidRunMapBox` | 7 | RaidRunMapBox.xlsx |
| `RaidRunMapBuff` | 10 | RaidRunMapBuff.xlsx |
| `RaidRunMapEnemyGroup` | 24 | RaidRunMapEnemyGroup.xlsx |
| `RaidRunMapWinCondition` | 5 | RaidRunMapWinCondition.xlsx |
| `RaidSailLogAllPassReward` | 4 | RaidSailLogAllPassReward.xlsx |
| `RaidSailLogChapter` | 4 | RaidSailLogChapter.xlsx |
| `RaidSailLogEpisode` | 10 | RaidSailLogEpisode.xlsx |
| `RaidSideStoryEpisode` | 3 | RaidSideStoryEpisode.xlsx |
| `RaidStarContion` | 2 | RaidStarContion.xlsx |
| `RaidSweepEpisode` | 18 | RaidSweepEpisode.xlsx |
| `RaidSweepStarRewards` | 4 | RaidSweepStarRewards.xlsx |

## 字段明细
### `RaidBeginCondition`
- `id` · `conditionGroupId` · `type` · `content`

### `RaidChapter`
- `chapterId` · `chapterType` · `name` · `introIndex` · `nextChapterId` · `showIndex` · `chapterIcon` · `chapterBackground`

### `RaidEnemy`
- `id` · `所属回刷副本Id` · `英雄Id` · `等级` · `位置` · `普攻技能` · `普攻技能等级` · `主动技能1AI权重`
- `主动技能1` · `主动技能1等级` · `主动技能2AI权重` · `主动技能2` · `主动技能2等级` · `主动技能3AI权重` · `主动技能3` · `主动技能3等级`
- `大招AI权重` · `大招` · `大招等级` · `被动技能` · `被动技能等级` · `攻击` · `防御` · `血量`
- `速度` · `暴击` · `抗暴` · `命中` · `闪避` · `暴击伤害系数` · `治疗暴击率` · `暴击治疗系数`
- `格挡` · `格挡伤害` · `破击` · `效果命中` · `效果回避` · `伤害加成` · `伤害减免` · `治疗加成`
- `治疗减免` · `真实伤害` · `毒` · `雷` · `电` · `火` · `冰` · `水`
- `光` · `暗` · `风` · `全` · `真实免伤` · `抗毒` · `抗雷` · `抗电`
- `抗火` · `抗冰` · `抗水` · `抗光` · `抗暗` · `抗风` · `抗全`

### `RaidMainStoryEpisode`
- `episodeId` · `nextEpisodeId` · `chapterId` · `runMapId` · `openLevel`

### `RaidRunMap`
- `runMapId` · `autoEnterFight` · `dropShowItems` · `recommendLevel` · `desc` · `image` · `sceneEventConfig` · `sceneMapId`
- `beginConditionGroupId` · `beginCOndtionDesc` · `strongBoss` · `fightPoint`

### `RaidRunMapBox`
- `BoxId` · `episodeId` · `boxType` · `reward` · `BoxEffect0` · `BoxEffect1` · `BoxRes`

### `RaidRunMapBuff`
- `raidSceneBuffId` · `canRemove` · `duration` · `interval` · `applyForever` · `buffApplyType` · `buffApplyParams` · `buffStateEffectId`
- `buffApplyCameraEffect` · `buffApplyAnim`

### `RaidRunMapEnemyGroup`
- `groupId` · `episodeId` · `modelId` · `modelScale` · `bornX` · `bornY` · `bornZ` · `bornFaceTo`
- `RotateSpeed` · `RestTime` · `PursueR` · `PursueAcc` · `PursueSpeed` · `ViewR` · `WanderSpeed` · `DeadParticleId`
- `BornParticleId` · `loopMonster` · `isBoss` · `fightSceneId` · `priority` · `plotId0` · `plotId1` · `mutexBox`

### `RaidRunMapWinCondition`
- `storyConditionId` · `runMapId` · `winType` · `extraValue` · `title`

### `RaidSailLogAllPassReward`
- `id` · `type` · `needNum` · `reward`

### `RaidSailLogChapter`
- `sailLogChapterId` · `heroId` · `openIntimacyLevel` · `sailLogChapterName`

**出向外键** (1):
- `heroId` → `Hero`

### `RaidSailLogEpisode`
- `sailLogEpisodeId` · `sailLogChapterId` · `difficulty` · `reward` · `star3reward` · `sailLogEpisodeName` · `sailLogEpisodeImage` · `starCondition`
- `fightPoint` · `showReward`

### `RaidSideStoryEpisode`
- `episodeId` · `runMapId` · `openLevel`

### `RaidStarContion`
- `conditionType` · `text`

### `RaidSweepEpisode`
- `sweepEpisodeId` · `openLimitPreEpisode` · `chapterId` · `showIndex` · `showFastSweep` · `name` · `introIndex` · `difficulty`
- `costItems` · `openLimitLevel` · `openExtraParams` · `fightTimes` · `resetTimes` · `dropShowItems` · `fightSceneId` · `starCondition`
- `episedDes` · `fightPoint`

### `RaidSweepStarRewards`
- `id` · `needStar` · `isHard` · `rewards`
