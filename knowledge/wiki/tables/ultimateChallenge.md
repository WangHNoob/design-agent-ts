---
type: table_schema
title: "表族 ultimateChallenge"
group: "ultimateChallenge"
table_count: 10
---

# 表族 `ultimateChallenge`

共 10 张表。数据源：`knowledge/gamedata/`。

## 成员表清单
| 表名 | 字段数 | 相对路径 |
|------|--------|----------|
| `ultimateChallenge/UltimateBossSkill` | 4 | ultimateChallenge/UltimateBossSkill.xlsx |
| `ultimateChallenge/UltimateChapter` | 19 | ultimateChallenge/UltimateChapter.xlsx |
| `ultimateChallenge/UltimateDeduct` | 4 | ultimateChallenge/UltimateDeduct.xlsx |
| `ultimateChallenge/UltimateEntry` | 6 | ultimateChallenge/UltimateEntry.xlsx |
| `ultimateChallenge/UltimateRank` | 4 | ultimateChallenge/UltimateRank.xlsx |
| `ultimateChallenge/UltimateRankReward` | 5 | ultimateChallenge/UltimateRankReward.xlsx |
| `ultimateChallenge/UltimateRole` | 7 | ultimateChallenge/UltimateRole.xlsx |
| `ultimateChallenge/UltimateScoreReward` | 6 | ultimateChallenge/UltimateScoreReward.xlsx |
| `ultimateChallenge/_UltimateExtraScore` | 5 | ultimateChallenge/_UltimateExtraScore.xlsx |
| `ultimateChallenge/_UltimateFightReward` | 3 | ultimateChallenge/_UltimateFightReward.xlsx |

## 字段明细
### `ultimateChallenge/UltimateBossSkill`
- `id` · `skillIcon` · `skillName` · `skillDesc`

### `ultimateChallenge/UltimateChapter`
- `id` · `chapter` · `difficulty` · `diffDesc` · `openLevel` · `openTime` · `baseIntegral` · `coefficient`
- `commonEnemyId` · `fixedEntry` · `challengeEntry` · `isShow` · `recommendFight` · `chapterNumTitle` · `chapterTitle` · `chapterDesc`
- `chapterIcon` · `skillId` · `newServer`

**出向外键** (2):
- `commonEnemyId` → `CommonEnemy`
- `skillId` → `fight/Skill`

### `ultimateChallenge/UltimateDeduct`
- `id` · `difficult` · `roundNum` · `deductScore`

### `ultimateChallenge/UltimateEntry`
- `entryId` · `entryType` · `fightBuffId` · `integral` · `desc` · `resultDesc`

**出向外键** (1):
- `fightBuffId` → `fight/FightBuff`

### `ultimateChallenge/UltimateRank`
- `id` · `levelBefore` · `levelAfter` · `levelName`

### `ultimateChallenge/UltimateRankReward`
- `id` · `rankId` · `rankBefore` · `rankAfter` · `itemReward`

### `ultimateChallenge/UltimateRole`
- `id` · `chapter` · `day` · `recommend` · `ban` · `entrys` · `desc`

### `ultimateChallenge/UltimateScoreReward`
- `id` · `rankId` · `chapter` · `needScore` · `itemReward` · `desc`

### `ultimateChallenge/_UltimateExtraScore`
- `id` · `entryType` · `difficult` · `param` · `addScore`

### `ultimateChallenge/_UltimateFightReward`
- `id` · `integralRange` · `reward`
