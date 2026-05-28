---
type: table_schema
title: "表族 UnionSLG"
group: "UnionSLG"
table_count: 19
---

# 表族 `UnionSLG`

共 19 张表。数据源：`knowledge/gamedata/`。

## 成员表清单
| 表名 | 字段数 | 相对路径 |
|------|--------|----------|
| `UnionSLG/UnionSLGDeclareWarCopy` | 7 | UnionSLG/UnionSLGDeclareWarCopy.xlsx |
| `UnionSLG/UnionSLGGrade` | 6 | UnionSLG/UnionSLGGrade.xlsx |
| `UnionSLG/UnionSLGPersonSkill` | 12 | UnionSLG/UnionSLGPersonSkill.xlsx |
| `UnionSLG/UnionSLGPersonSkillPassLev` | 2 | UnionSLG/UnionSLGPersonSkillPassLev.xlsx |
| `UnionSLG/UnionSLGPersonSkillPassLevReward` | 4 | UnionSLG/UnionSLGPersonSkillPassLevReward.xlsx |
| `UnionSLG/UnionSLGPersonSkillPassType` | 4 | UnionSLG/UnionSLGPersonSkillPassType.xlsx |
| `UnionSLG/UnionSLGPersonSkillPointChange` | 5 | UnionSLG/UnionSLGPersonSkillPointChange.xlsx |
| `UnionSLG/UnionSLGRank` | 5 | UnionSLG/UnionSLGRank.xlsx |
| `UnionSLG/UnionSLGRankReward` | 8 | UnionSLG/UnionSLGRankReward.xlsx |
| `UnionSLG/UnionSLGRegisterIsland` | 19 | UnionSLG/UnionSLGRegisterIsland.xlsx |
| `UnionSLG/UnionSLGSetCopyIsland` | 7 | UnionSLG/UnionSLGSetCopyIsland.xlsx |
| `UnionSLG/UnionSLGStage` | 7 | UnionSLG/UnionSLGStage.xlsx |
| `UnionSLG/UnionSLGTask` | 8 | UnionSLG/UnionSLGTask.xlsx |
| `UnionSLG/UnionSLGTechnologyLine` | 10 | UnionSLG/UnionSLGTechnologyLine.xlsx |
| `UnionSLG/UnionSLGTurretCarrying` | 3 | UnionSLG/UnionSLGTurretCarrying.xlsx |
| `UnionSLG/UnionSLGWarReport` | 4 | UnionSLG/UnionSLGWarReport.xlsx |
| `UnionSLG/_UnionSLGDeclareWarStage` | 6 | UnionSLG/_UnionSLGDeclareWarStage.xlsx |
| `UnionSLG/_UnionSLGSeason` | 5 | UnionSLG/_UnionSLGSeason.xlsx |
| `UnionSLG/_UnionSLGServerGroup` | 4 | UnionSLG/_UnionSLGServerGroup.xlsx |

## 字段明细
### `UnionSLG/UnionSLGDeclareWarCopy`
- `id` · `difficultyRange` · `mapID` · `attackScore` · `copyName` · `copyReward` · `copyText`

### `UnionSLG/UnionSLGGrade`
- `id` · `gradeGroup` · `grade` · `name` · `icon` · `unionActiveMin`

### `UnionSLG/UnionSLGPersonSkill`
- `skillId` · `preSkill` · `cost` · `skillType` · `skillParam` · `viewHierarychy` · `viewVertical` · `icon`
- `info` · `lineSkillId` · `size` · `title`

**出向外键** (1):
- `skillId` → `fight/Skill`

### `UnionSLG/UnionSLGPersonSkillPassLev`
- `lev` · `upgradeExp`

### `UnionSLG/UnionSLGPersonSkillPassLevReward`
- `id` · `type` · `lev` · `reward`

### `UnionSLG/UnionSLGPersonSkillPassType`
- `type` · `isFree` · `unlockCost` · `icon`

### `UnionSLG/UnionSLGPersonSkillPointChange`
- `id` · `minTimes` · `maxTimes` · `cost` · `reward`

### `UnionSLG/UnionSLGRank`
- `id` · `name` · `rankType` · `maxNum` · `maxNumShow`

### `UnionSLG/UnionSLGRankReward`
- `id` · `grade` · `rewardType` · `param` · `reward` · `title` · `actionPictorial` · `rewardTypeName`

### `UnionSLG/UnionSLGRegisterIsland`
- `id` · `grade` · `type` · `islandNameInSLG` · `islandLevel` · `camp` · `isOccupy` · `whichStageUnlocked`
- `isDeclareWar` · `occupationDegree` · `occupationDegreeHowMuch` · `wages` · `wagesHowLong` · `bonus` · `bonusHowMany` · `isInbound`
- `linkIsland` · `inboundNum` · `garrisonDecreased`

### `UnionSLG/UnionSLGSetCopyIsland`
- `id` · `isWeekUnlock` · `mapID` · `attackScore` · `copyName` · `copyReward` · `copyText`

### `UnionSLG/UnionSLGStage`
- `id` · `stage` · `sort` · `stageName` · `littleStageName` · `littleStageDesc` · `stageDesc`

### `UnionSLG/UnionSLGTask`
- `id` · `grade` · `basicType` · `type` · `param1` · `param2` · `rewards` · `taskText`

### `UnionSLG/UnionSLGTechnologyLine`
- `id` · `type` · `technologyLevel` · `technologyType` · `technologyparam1` · `technologyparam2` · `upLevelCost` · `technologyShopLevel`
- `deatil` · `totalDetail`

### `UnionSLG/UnionSLGTurretCarrying`
- `id` · `turretType` · `carryNum`

### `UnionSLG/UnionSLGWarReport`
- `id` · `type` · `param` · `desc`

### `UnionSLG/_UnionSLGDeclareWarStage`
- `declareWarStage` · `declareWarLastTime` · `declareWarWeekDay` · `declareWarWeekTime` · `isIsLandUnlock` · `declareWarIcon`

### `UnionSLG/_UnionSLGSeason`
- `id` · `season` · `isWhatServer` · `isWhatGradeGroup` · `openTime`

### `UnionSLG/_UnionSLGServerGroup`
- `id` · `grade` · `serverIds` · `note`
