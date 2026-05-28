---
type: table_schema
title: "表族 warChess"
group: "warChess"
table_count: 26
---

# 表族 `warChess`

共 26 张表。数据源：`knowledge/gamedata/`。

## 成员表清单
| 表名 | 字段数 | 相对路径 |
|------|--------|----------|
| `warChess/WarChessActorType` | 3 | warChess/WarChessActorType.xlsx |
| `warChess/WarChessChapter` | 23 | warChess/WarChessChapter.xlsx |
| `warChess/WarChessChapterCondition` | 6 | warChess/WarChessChapterCondition.xlsx |
| `warChess/WarChessChapterGroup` | 7 | warChess/WarChessChapterGroup.xlsx |
| `warChess/WarChessChapterMap` | 7 | warChess/WarChessChapterMap.xlsx |
| `warChess/WarChessChapterMapNormal` | 5 | warChess/WarChessChapterMapNormal.xlsx |
| `warChess/WarChessEnemy` | 5 | warChess/WarChessEnemy.xlsx |
| `warChess/WarChessGuide` | 11 | warChess/WarChessGuide.xlsx |
| `warChess/WarChessHero` | 22 | warChess/WarChessHero.xlsx |
| `warChess/WarChessHeroBuyHP` | 2 | warChess/WarChessHeroBuyHP.xlsx |
| `warChess/WarChessHeroLev` | 2 | warChess/WarChessHeroLev.xlsx |
| `warChess/WarChessHeroStar` | 4 | warChess/WarChessHeroStar.xlsx |
| `warChess/WarChessSceneCameraArea` | 8 | warChess/WarChessSceneCameraArea.xlsx |
| `warChess/WarChessSceneResouce` | 10 | warChess/WarChessSceneResouce.xlsx |
| `warChess/WarChessSinglePK` | 4 | warChess/WarChessSinglePK.xlsx |
| `warChess/WarChessSkill` | 8 | warChess/WarChessSkill.xlsx |
| `warChess/WarChessUnit` | 8 | warChess/WarChessUnit.xlsx |
| `warChess/WarChessUnitRewardBox` | 4 | warChess/WarChessUnitRewardBox.xlsx |
| `warChess/_WarChessAI` | 4 | warChess/_WarChessAI.xlsx |
| `warChess/_WarChessAIAction` | 4 | warChess/_WarChessAIAction.xlsx |
| `warChess/_WarChessAICondition` | 8 | warChess/_WarChessAICondition.xlsx |
| `warChess/_WarChessAIConditionLogic` | 2 | warChess/_WarChessAIConditionLogic.xlsx |
| `warChess/_WarChessAIDecision` | 6 | warChess/_WarChessAIDecision.xlsx |
| `warChess/_WarChessAITarget` | 6 | warChess/_WarChessAITarget.xlsx |
| `warChess/_WarChessEvent` | 7 | warChess/_WarChessEvent.xlsx |
| `warChess/_WarChessEventCondition` | 5 | warChess/_WarChessEventCondition.xlsx |

## 字段明细
### `warChess/WarChessActorType`
- `typeId` · `typeName` · `typeIcon`

### `warChess/WarChessChapter`
- `chapterId` · `orderNum` · `chapterName` · `chapterDesc` · `mapId` · `chapterBackground` · `mapLenth` · `mapWidth`
- `firstPlay` · `maxRound` · `gridWidth` · `gridHeight` · `beginPos` · `groupId` · `isTrainChapter` · `reward`
- `recommendedLevel` · `gridOrder` · `anchoredPosition` · `recomandHero` · `enemyIcon` · `skipChapterHeroXP` · `isDifficultyChapter`

### `warChess/WarChessChapterCondition`
- `id` · `chapterId` · `conditionType` · `conditionEnum` · `tragetNum` · `desc`

### `warChess/WarChessChapterGroup`
- `groupId` · `orderNum` · `groupName` · `groupDesc` · `maxTrainNum` · `unlockFrontChapterId` · `refreshTime`

### `warChess/WarChessChapterMap`
- `id` · `chapterId` · `posX` · `posY` · `unitType` · `objectId` · `direction`

### `warChess/WarChessChapterMapNormal`
- `id` · `chapterId` · `posX` · `posY` · `objectId`

### `warChess/WarChessEnemy`
- `enemyId` · `getExp` · `heroId` · `warChessLev` · `AI`

**出向外键** (1):
- `heroId` → `Hero`

### `warChess/WarChessGuide`
- `id` · `isFullTransparent` · `allowClickAnyWhere` · `dialogPosX` · `dialogPosY` · `dialogWidth` · `dialogHeight` · `text`
- `showFocusRect` · `gridId` · `focusPath`

### `warChess/WarChessHero`
- `heroId` · `moveRange` · `fightBackCount` · `defaultSkillId` · `heroType` · `heroStyle` · `atk` · `def`
- `hp` · `speed` · `cri` · `anticri` · `hit` · `dodge` · `activeSkills` · `skills`
- `passiveSkills` · `canJoinTeam` · `moveAnimation` · `moveType` · `rushBeginParticle` · `rushEndParticle`

**出向外键** (1):
- `heroId` → `Hero`

### `warChess/WarChessHeroBuyHP`
- `buyTimes` · `buyPrice`

### `warChess/WarChessHeroLev`
- `level` · `exp`

### `warChess/WarChessHeroStar`
- `id` · `heroId` · `star` · `porpAdd`

**出向外键** (1):
- `heroId` → `Hero`

### `warChess/WarChessSceneCameraArea`
- `mapId` · `cameraMoveTopLimit` · `cameraMoveBottomLimit` · `cameraMoveLeftLimit` · `cameraMoveRightLimit` · `cameraMaxHeight` · `cameraMinHeight` · `cameraInitialHeight`

### `warChess/WarChessSceneResouce`
- `id` · `chapterId` · `modelId` · `posX` · `posY` · `posZ` · `direction` · `scale`
- `gridPosX` · `gridPosY`

### `warChess/WarChessSinglePK`
- `id` · `mapId` · `leftPos` · `rightPos`

### `warChess/WarChessSkill`
- `skillId` · `attRange` · `rangeType` · `skillOffset` · `needChooseNextPos` · `skillEffectType` · `additionalParams` · `selectGridRule`

**出向外键** (1):
- `skillId` → `fight/Skill`

### `warChess/WarChessUnit`
- `ID` · `Type` · `Param` · `Effective` · `Icon` · `Name` · `Des` · `effectId`

### `warChess/WarChessUnitRewardBox`
- `boxId` · `reward` · `scope` · `modelId`

### `warChess/_WarChessAI`
- `AIID` · `conditionOrder` · `conditionLogic` · `decision`

### `warChess/_WarChessAIAction`
- `actionID` · `type` · `parameter1` · `parameter2`

### `warChess/_WarChessAICondition`
- `conditionId` · `conditionType` · `deviation` · `conditionParam1` · `conditionParam2` · `conditionParam3` · `conditionParam4` · `conditionParam5`

### `warChess/_WarChessAIConditionLogic`
- `conditionLogicId` · `aiCondition`

### `warChess/_WarChessAIDecision`
- `id` · `decisionID` · `decisionOrder` · `conditionLogic` · `target` · `action`

### `warChess/_WarChessAITarget`
- `id` · `targetId` · `targetWeight1` · `targetType1` · `targetParam1` · `targetParam2`

### `warChess/_WarChessEvent`
- `eventID` · `chapterId` · `eventType` · `conditionLogic` · `buffId` · `extendParam` · `limitCount`

**出向外键** (1):
- `buffId` → `fight/_Buff`

### `warChess/_WarChessEventCondition`
- `conditionId` · `conditionType` · `conditionParam1` · `conditionParam2` · `conditionParam3`
