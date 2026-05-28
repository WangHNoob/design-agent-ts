---
type: table_schema
title: "表族 ServerChallenge"
group: "ServerChallenge"
table_count: 10
---

# 表族 `ServerChallenge`

共 10 张表。数据源：`knowledge/gamedata/`。

## 成员表清单
| 表名 | 字段数 | 相对路径 |
|------|--------|----------|
| `ServerChallenge/Overlord/OverlordBoss` | 14 | ServerChallenge/Overlord/OverlordBoss.xlsx |
| `ServerChallenge/Overlord/OverlordBossSkill` | 4 | ServerChallenge/Overlord/OverlordBossSkill.xlsx |
| `ServerChallenge/Overlord/OverlordRankReward` | 4 | ServerChallenge/Overlord/OverlordRankReward.xlsx |
| `ServerChallenge/Overlord/OverlordTask` | 6 | ServerChallenge/Overlord/OverlordTask.xlsx |
| `ServerChallenge/Overlord/ServerChallengeTime` | 4 | ServerChallenge/Overlord/ServerChallengeTime.xlsx |
| `ServerChallenge/ServerChallenge` | 13 | ServerChallenge/ServerChallenge.xlsx |
| `ServerChallenge/ServerChallengeHero` | 6 | ServerChallenge/ServerChallengeHero.xlsx |
| `ServerChallenge/ServerChallengeRankReward` | 4 | ServerChallenge/ServerChallengeRankReward.xlsx |
| `ServerChallenge/_ServerChallengePointReward` | 4 | ServerChallenge/_ServerChallengePointReward.xlsx |
| `ServerChallenge/_ServerChallengeStar` | 7 | ServerChallenge/_ServerChallengeStar.xlsx |

## 字段明细
### `ServerChallenge/Overlord/OverlordBoss`
- `id` · `enemyGroupId` · `startTime` · `endTime` · `rewardTime` · `taskIds` · `skillids` · `bossName`
- `bossIcon` · `bossDesc` · `heroFashionId` · `mapId` · `dailyMaxTimes` · `rewards`

**出向外键** (2):
- `heroFashionId` → `HeroFashion`
- `skillids` → `fight/Skill`

### `ServerChallenge/Overlord/OverlordBossSkill`
- `bossSkillId` · `skillName` · `skillDesc` · `skillIcon`

### `ServerChallenge/Overlord/OverlordRankReward`
- `id` · `bossId` · `rank` · `reward`

### `ServerChallenge/Overlord/OverlordTask`
- `id` · `name` · `desc` · `conditions` · `needTime` · `rewards`

### `ServerChallenge/Overlord/ServerChallengeTime`
- `id` · `type` · `startTime` · `endTime`

### `ServerChallenge/ServerChallenge`
- `bossId` · `enemyId` · `allHP` · `skills` · `headIcon` · `modelId` · `heroId` · `heroPosX`
- `heroPosY` · `heroPosZ` · `heroScale` · `isSpecial` · `specialReward`

**出向外键** (1):
- `heroId` → `Hero`

### `ServerChallenge/ServerChallengeHero`
- `id` · `time` · `hero` · `isChange` · `topText` · `timeText`

### `ServerChallenge/ServerChallengeRankReward`
- `id` · `startRank` · `endRank` · `reward`

### `ServerChallenge/_ServerChallengePointReward`
- `id` · `startPoint` · `endPoint` · `reward`

### `ServerChallenge/_ServerChallengeStar`
- `id` · `1星` · `2星` · `3星` · `4星` · `5星` · `6星`
