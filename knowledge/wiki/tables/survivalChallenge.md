---
type: table_schema
title: "表族 survivalChallenge"
group: "survivalChallenge"
table_count: 9
---

# 表族 `survivalChallenge`

共 9 张表。数据源：`knowledge/gamedata/`。

## 成员表清单
| 表名 | 字段数 | 相对路径 |
|------|--------|----------|
| `survivalChallenge/BloodChapter` | 8 | survivalChallenge/BloodChapter.xlsx |
| `survivalChallenge/BloodConfig` | 2 | survivalChallenge/BloodConfig.xlsx |
| `survivalChallenge/_survivalFetter` | 4 | survivalChallenge/_survivalFetter.xlsx |
| `survivalChallenge/_survivalFetterAddition` | 3 | survivalChallenge/_survivalFetterAddition.xlsx |
| `survivalChallenge/_survivalHero` | 6 | survivalChallenge/_survivalHero.xlsx |
| `survivalChallenge/_survivalSpeedAddition` | 2 | survivalChallenge/_survivalSpeedAddition.xlsx |
| `survivalChallenge/survivalLevel` | 6 | survivalChallenge/survivalLevel.xlsx |
| `survivalChallenge/survivalLevelReward` | 2 | survivalChallenge/survivalLevelReward.xlsx |
| `survivalChallenge/survivalResetCost` | 2 | survivalChallenge/survivalResetCost.xlsx |

## 字段明细
### `survivalChallenge/BloodChapter`
- `id` · `bossImage` · `bgImage` · `isBoss` · `award` · `enemyName` · `chapterName` · `round`

### `survivalChallenge/BloodConfig`
- `id` · `value`

### `survivalChallenge/_survivalFetter`
- `id` · `fetterId` · `heroId` · `selfAddition`

**出向外键** (1):
- `heroId` → `Hero`

### `survivalChallenge/_survivalFetterAddition`
- `fetterId` · `fetterAddition` · `allAddition`

### `survivalChallenge/_survivalHero`
- `id` · `heroId` · `star` · `selfAddition` · `haloAddition` · `professionAddition`

**出向外键** (1):
- `heroId` → `Hero`

### `survivalChallenge/_survivalSpeedAddition`
- `speed` · `addition`

### `survivalChallenge/survivalLevel`
- `id` · `level` · `heroId` · `fightPower` · `speed` · `star`

**出向外键** (1):
- `heroId` → `Hero`

### `survivalChallenge/survivalLevelReward`
- `level` · `reward`

### `survivalChallenge/survivalResetCost`
- `num` · `cost`
