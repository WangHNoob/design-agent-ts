---
type: table_schema
title: "表族 autoChess"
group: "autoChess"
table_count: 18
---

# 表族 `autoChess`

共 18 张表。数据源：`knowledge/gamedata/`。

## 成员表清单
| 表名 | 字段数 | 相对路径 |
|------|--------|----------|
| `autoChess/AutoChessAwards` | 4 | autoChess/AutoChessAwards.xlsx |
| `autoChess/AutoChessExtraHeroPack` | 6 | autoChess/AutoChessExtraHeroPack.xlsx |
| `autoChess/AutoChessGrade` | 12 | autoChess/AutoChessGrade.xlsx |
| `autoChess/AutoChessGroup` | 9 | autoChess/AutoChessGroup.xlsx |
| `autoChess/AutoChessHero` | 11 | autoChess/AutoChessHero.xlsx |
| `autoChess/AutoChessHeroChess` | 41 | autoChess/AutoChessHeroChess.xlsx |
| `autoChess/AutoChessHeroRare` | 4 | autoChess/AutoChessHeroRare.xlsx |
| `autoChess/AutoChessMapShop` | 8 | autoChess/AutoChessMapShop.xlsx |
| `autoChess/AutoChessRound` | 6 | autoChess/AutoChessRound.xlsx |
| `autoChess/AutoChessSeasionTitle` | 7 | autoChess/AutoChessSeasionTitle.xlsx |
| `autoChess/AutoChessSeriesRound` | 4 | autoChess/AutoChessSeriesRound.xlsx |
| `autoChess/AutoChessShieldMoodAni` | 3 | autoChess/AutoChessShieldMoodAni.xlsx |
| `autoChess/AutoChessWeeklyTask` | 10 | autoChess/AutoChessWeeklyTask.xlsx |
| `autoChess/_AutoChessEnmeyChess` | 8 | autoChess/_AutoChessEnmeyChess.xlsx |
| `autoChess/_AutoChessOpen` | 5 | autoChess/_AutoChessOpen.xlsx |
| `autoChess/_autoChessRandomPool` | 5 | autoChess/_autoChessRandomPool.xlsx |
| `autoChess/autoChessGroupBuffDesc` | 4 | autoChess/autoChessGroupBuffDesc.xlsx |
| `autoChess/autoChessLevel` | 4 | autoChess/autoChessLevel.xlsx |

## 字段明细
### `autoChess/AutoChessAwards`
- `id` · `scoreChangeRatio` · `rewards` · `desc`

### `autoChess/AutoChessExtraHeroPack`
- `packetId` · `heroIds` · `price` · `packageIcon` · `packageName` · `packagebg`

**出向外键** (1):
- `heroIds` → `Hero`

### `autoChess/AutoChessGrade`
- `grade` · `rankType` · `minScore` · `maxScore` · `weekReward` · `seasonReward` · `gradeTypeName` · `gradeName`
- `subGradeType` · `gradeIconSmall` · `gradeIcon` · `gradeTextIcon`

### `autoChess/AutoChessGroup`
- `acHeroGroup` · `groupType` · `flagAssetId` · `desc` · `altasName` · `type` · `buffId` · `groupDesc`
- `groupSkillName`

**出向外键** (1):
- `buffId` → `fight/_Buff`

### `autoChess/AutoChessHero`
- `heroId` · `rare` · `acHeroGroups` · `shopModelScale` · `shopModelRote` · `ShopOffsetX` · `ShopOffsetY` · `ShopOffsetZ`
- `fieldModelScale` · `chessId` · `heroStyle`

**出向外键** (1):
- `heroId` → `Hero`

### `autoChess/AutoChessHeroChess`
- `chessId` · `heroId` · `star` · `sortScore` · `nextLevelChessId` · `buyPrice` · `sellPrice` · `hpCost`
- `summonHpCost` · `DefaultSkill` · `defaultSkillLevel` · `skill1AIWeight` · `skill1` · `skill1Level` · `skill2AIWeight` · `skill2`
- `skill2Level` · `skill3AIWeight` · `skill3` · `skill3Level` · `ultimateSkillAIWeight` · `ultimateSkill` · `ultimateSkillLevel` · `activeSkills`
- `skills` · `passiveSkills` · `atk` · `def` · `hp` · `speed` · `cri` · `anticri`
- `hit` · `dodge` · `cridamage` · `block` · `antiblock` · `antiwhole` · `skillAI` · `blockdamage`
- `critreat`

**出向外键** (1):
- `heroId` → `Hero`

### `autoChess/AutoChessHeroRare`
- `rare` · `rareDesc` · `rareFrameIcon` · `rareFlagIcon`

### `autoChess/AutoChessMapShop`
- `mapId` · `type` · `monthCardId` · `itemId` · `sceneClientId` · `mapIcon` · `bgTexture` · `mainPageBgTexture`

**出向外键** (2):
- `itemId` → `Item`
- `sceneClientId` → `Scene/SceneClient`

### `autoChess/AutoChessRound`
- `roundId` · `baseGold` · `winGold` · `roundExp` · `costHp` · `enemyGroupId`

### `autoChess/AutoChessSeasionTitle`
- `seasonTitleId` · `titleRank` · `titleIcon` · `titleRankStart` · `titleRankEnd` · `isSpecialTitle` · `specialTitleIcon`

### `autoChess/AutoChessSeriesRound`
- `seriesRound` · `winGold` · `loseGold` · `winDes`

### `autoChess/AutoChessShieldMoodAni`
- `id` · `modelId` · `shieldMoodAniNames`

### `autoChess/AutoChessWeeklyTask`
- `taskId` · `taskTarget` · `groupId` · `taskReward` · `taskName` · `taskIcon` · `taskDesc` · `isFestTask`
- `festCoinNum` · `taskType`

### `autoChess/_AutoChessEnmeyChess`
- `id` · `棋子Id` · `站位` · `组Id` · `等级` · `名字` · `头像` · `船Id`

### `autoChess/_AutoChessOpen`
- `赛季id` · `开启时间` · `结束时间` · `发奖时间` · `玩法结束时间`

### `autoChess/_autoChessRandomPool`
- `id` · `池子组` · `棋子Id` · `数量` · `EmptyKey-E2`

### `autoChess/autoChessGroupBuffDesc`
- `id` · `acHeroGroup` · `needHeroNum` · `desc`

### `autoChess/autoChessLevel`
- `level` · `upGradeExp` · `maxChessNum` · `chessRareWeight`
