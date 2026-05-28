---
type: table_schema
title: "表族 desperateChallenge"
group: "desperateChallenge"
table_count: 8
---

# 表族 `desperateChallenge`

共 8 张表。数据源：`knowledge/gamedata/`。

## 成员表清单
| 表名 | 字段数 | 相对路径 |
|------|--------|----------|
| `desperateChallenge/DesperateChallengeBossAdd` | 3 | desperateChallenge/DesperateChallengeBossAdd.xlsx |
| `desperateChallenge/DesperateChallengeChapter` | 7 | desperateChallenge/DesperateChallengeChapter.xlsx |
| `desperateChallenge/DesperateChallengeChapterExplain` | 4 | desperateChallenge/DesperateChallengeChapterExplain.xlsx |
| `desperateChallenge/DesperateChallengeRankReward` | 7 | desperateChallenge/DesperateChallengeRankReward.xlsx |
| `desperateChallenge/DesperateChallengeReward` | 3 | desperateChallenge/DesperateChallengeReward.xlsx |
| `desperateChallenge/DesperateChallengeStage` | 3 | desperateChallenge/DesperateChallengeStage.xlsx |
| `desperateChallenge/DesperateChallengeTime` | 5 | desperateChallenge/DesperateChallengeTime.xlsx |
| `desperateChallenge/DesperateChallengeWeekRule` | 4 | desperateChallenge/DesperateChallengeWeekRule.xlsx |

## 字段明细
### `desperateChallenge/DesperateChallengeBossAdd`
- `id` · `bossId` · `addL`

### `desperateChallenge/DesperateChallengeChapter`
- `id` · `name` · `hp` · `bigIcon` · `smallIcon` · `explainSpecialBuffId` · `position`

### `desperateChallenge/DesperateChallengeChapterExplain`
- `id` · `title` · `resource` · `text`

### `desperateChallenge/DesperateChallengeRankReward`
- `id` · `type` · `week` · `rankMin` · `rankMax` · `rewards` · `text`

### `desperateChallenge/DesperateChallengeReward`
- `id` · `killBossNum` · `rewards`

### `desperateChallenge/DesperateChallengeStage`
- `stage` · `needCircleNum` · `groupIds`

### `desperateChallenge/DesperateChallengeTime`
- `id` · `startTime` · `playerEndTime` · `rewardTime` · `activityEndTime`

### `desperateChallenge/DesperateChallengeWeekRule`
- `id` · `level` · `startState` · `week2UpNum`
