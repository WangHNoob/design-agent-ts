---
type: table_schema
title: "表族 SecretPlaceFight"
group: "SecretPlaceFight"
table_count: 7
---

# 表族 `SecretPlaceFight`

共 7 张表。数据源：`knowledge/gamedata/`。

## 成员表清单
| 表名 | 字段数 | 相对路径 |
|------|--------|----------|
| `SecretPlaceFight/SecretPlaceFightChpater` | 9 | SecretPlaceFight/SecretPlaceFightChpater.xlsx |
| `SecretPlaceFight/SecretPlaceFightChpaterGroup` | 12 | SecretPlaceFight/SecretPlaceFightChpaterGroup.xlsx |
| `SecretPlaceFight/SecretPlaceFightCondition` | 4 | SecretPlaceFight/SecretPlaceFightCondition.xlsx |
| `SecretPlaceFight/SecretPlaceFightRankReward` | 4 | SecretPlaceFight/SecretPlaceFightRankReward.xlsx |
| `SecretPlaceFight/SecretPlaceFightRecomandHero` | 4 | SecretPlaceFight/SecretPlaceFightRecomandHero.xlsx |
| `SecretPlaceFight/SecretPlaceFightScoreReward` | 3 | SecretPlaceFight/SecretPlaceFightScoreReward.xlsx |
| `SecretPlaceFight/_SecretPlaceFightOpen` | 2 | SecretPlaceFight/_SecretPlaceFightOpen.xlsx |

## 字段明细
### `SecretPlaceFight/SecretPlaceFightChpater`
- `chapterId` · `difficulty` · `chapterName` · `chapterDesc` · `groupId` · `enemyGroupId` · `exScore` · `fightMapId`
- `recFightPower`

### `SecretPlaceFight/SecretPlaceFightChpaterGroup`
- `groupId` · `openLev` · `conditionId` · `limitHeroNum` · `winConditionStr` · `groupName` · `groupDesc` · `groupIcon`
- `recomandHeroIdentify` · `recLv` · `recomandHero` · `groupType`

### `SecretPlaceFight/SecretPlaceFightCondition`
- `conditionId` · `rule` · `desc` · `descDetial`

### `SecretPlaceFight/SecretPlaceFightRankReward`
- `id` · `rankStart` · `rankEnd` · `reward`

### `SecretPlaceFight/SecretPlaceFightRecomandHero`
- `heroId` · `enemyid` · `level` · `starLv`

**出向外键** (1):
- `heroId` → `Hero`

### `SecretPlaceFight/SecretPlaceFightScoreReward`
- `id` · `score` · `reward`

### `SecretPlaceFight/_SecretPlaceFightOpen`
- `openId` · `settlementTimeStr`
