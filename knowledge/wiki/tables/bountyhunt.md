---
type: table_schema
title: "表族 bountyhunt"
group: "bountyhunt"
table_count: 9
---

# 表族 `bountyhunt`

共 9 张表。数据源：`knowledge/gamedata/`。

## 成员表清单
| 表名 | 字段数 | 相对路径 |
|------|--------|----------|
| `bountyhunt/BossSkills` | 4 | bountyhunt/BossSkills.xlsx |
| `bountyhunt/BountyHuntBoss` | 17 | bountyhunt/BountyHuntBoss.xlsx |
| `bountyhunt/BountyHuntBossReward` | 7 | bountyhunt/BountyHuntBossReward.xlsx |
| `bountyhunt/BountyHuntChat` | 9 | bountyhunt/BountyHuntChat.xlsx |
| `bountyhunt/PrisonConfig` | 11 | bountyhunt/PrisonConfig.xlsx |
| `bountyhunt/_BountyHuntBossLevel` | 4 | bountyhunt/_BountyHuntBossLevel.xlsx |
| `bountyhunt/_BountyHuntBossLevelOpenTime` | 4 | bountyhunt/_BountyHuntBossLevelOpenTime.xlsx |
| `bountyhunt/_PrisonBossPos` | 6 | bountyhunt/_PrisonBossPos.xlsx |
| `bountyhunt/_PrisonWardenFight` | 5 | bountyhunt/_PrisonWardenFight.xlsx |

## 字段明细
### `bountyhunt/BossSkills`
- `skillId` · `icon` · `skillName` · `description`

**出向外键** (1):
- `skillId` → `fight/Skill`

### `bountyhunt/BountyHuntBoss`
- `bossId` · `areaId` · `headIcon` · `sceneIcon` · `bossSkill` · `scale` · `hpOffsetX` · `hpOffsetY`
- `iconOffsetX` · `iconOffsetY` · `place` · `lastKillShowRewards` · `limitLevel` · `openWeek` · `openTime` · `continueTime`
- `bossType`

### `bountyhunt/BountyHuntBossReward`
- `id` · `bossId` · `maxRank` · `minRank` · `maxBossLev` · `minBossLev` · `showRewards`

### `bountyhunt/BountyHuntChat`
- `id` · `chatType` · `replyType` · `text` · `replyText` · `animName` · `replyAnimName` · `effectId`
- `replyEffectId`

### `bountyhunt/PrisonConfig`
- `prisonId` · `场景ID` · `起始等级>=` · `结束等级<=` · `需要完成的任务Id` · `监狱区域场景编辑ID` · `出狱的场景Id` · `出狱点位置Id`
- `押运起始点` · `押运路径` · `EmptyKey-K2`

### `bountyhunt/_BountyHuntBossLevel`
- `id` · `bossId` · `等级` · `对应的怪物Id`

### `bountyhunt/_BountyHuntBossLevelOpenTime`
- `id` · `openTimeMin` · `openTimeMax` · `bossLev`

### `bountyhunt/_PrisonBossPos`
- `posId` · `prisonId` · `场景ID` · `场景编辑ID` · `复活时间随机配置` · `怪物随机配置`

### `bountyhunt/_PrisonWardenFight`
- `id` · `prisonId` · `次数` · `典狱长怪群Id` · `协助好友的典守卫怪群Id`
