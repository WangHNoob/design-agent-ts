---
type: table_schema
title: "表族 Scene"
group: "Scene"
table_count: 32
---

# 表族 `Scene`

共 32 张表。数据源：`knowledge/gamedata/`。

## 成员表清单
| 表名 | 字段数 | 相对路径 |
|------|--------|----------|
| `Scene/Scene` | 6 | Scene/Scene.xlsx |
| `Scene/SceneArea` | 11 | Scene/SceneArea.xlsx |
| `Scene/SceneAutoGather` | 5 | Scene/SceneAutoGather.xlsx |
| `Scene/SceneBotMonster` | 9 | Scene/SceneBotMonster.xlsx |
| `Scene/SceneBuff` | 11 | Scene/SceneBuff.xlsx |
| `Scene/SceneClient` | 35 | Scene/SceneClient.xlsx |
| `Scene/SceneCustomModel` | 5 | Scene/SceneCustomModel.xlsx |
| `Scene/SceneDogz` | 12 | Scene/SceneDogz.xlsx |
| `Scene/SceneEvent` | 4 | Scene/SceneEvent.xlsx |
| `Scene/SceneExtra` | 12 | Scene/SceneExtra.xlsx |
| `Scene/SceneFlyMounts` | 7 | Scene/SceneFlyMounts.xlsx |
| `Scene/SceneFootPrintArea` | 2 | Scene/SceneFootPrintArea.xlsx |
| `Scene/SceneInteractiveObj` | 13 | Scene/SceneInteractiveObj.xlsx |
| `Scene/SceneMonster` | 14 | Scene/SceneMonster.xlsx |
| `Scene/SceneMonsterArea` | 6 | Scene/SceneMonsterArea.xlsx |
| `Scene/SceneMounts` | 17 | Scene/SceneMounts.xlsx |
| `Scene/SceneNpc` | 30 | Scene/SceneNpc.xlsx |
| `Scene/SceneNpcExtra` | 6 | Scene/SceneNpcExtra.xlsx |
| `Scene/SceneObjectAction` | 4 | Scene/SceneObjectAction.xlsx |
| `Scene/ScenePath` | 7 | Scene/ScenePath.xlsx |
| `Scene/SceneResource` | 17 | Scene/SceneResource.xlsx |
| `Scene/SceneResourceDetail` | 23 | Scene/SceneResourceDetail.xlsx |
| `Scene/SceneSafeArea` | 4 | Scene/SceneSafeArea.xlsx |
| `Scene/SceneSeaPort` | 5 | Scene/SceneSeaPort.xlsx |
| `Scene/SceneTransformPoint` | 18 | Scene/SceneTransformPoint.xlsx |
| `Scene/SceneTriggerArea` | 5 | Scene/SceneTriggerArea.xlsx |
| `Scene/ScriptableModel` | 4 | Scene/ScriptableModel.xlsx |
| `Scene/_SceneEnemyGroup` | 8 | Scene/_SceneEnemyGroup.xlsx |
| `Scene/_SceneInteractiveObjEvent` | 5 | Scene/_SceneInteractiveObjEvent.xlsx |
| `Scene/_SceneObjectMoveMode` | 10 | Scene/_SceneObjectMoveMode.xlsx |
| `Scene/_ScenePvpReward` | 4 | Scene/_ScenePvpReward.xlsx |
| `Scene/_SceneResourceRefresh` | 5 | Scene/_SceneResourceRefresh.xlsx |

## 字段明细
### `Scene/Scene`
- `id` · `name` · `type` · `aoiType` · `regionId` · `specialAreaType`

**入向外键** (25):
- `DefenseFight/DefenseFightChapter.sceneId` → 本表
- `HomeLand/HomeDefaultDress.sceneId` → 本表
- `PlotClip.SceneId` → 本表
- `PlotTimeline.SceneId` → 本表
- `Scene/SceneArea.sceneId` → 本表
- `Scene/SceneAutoGather.sceneId` → 本表
- `Scene/SceneBotMonster.SceneId` → 本表
- `Scene/SceneInteractiveObj.sceneId` → 本表
- `Scene/SceneMonsterArea.sceneId` → 本表
- `Scene/SceneNpc.sceneId` → 本表
- … 其余 15 条见 `_tables/table_fk_registry.json`

### `Scene/SceneArea`
- `id` · `sceneId` · `positionId` · `centerX` · `centerZ` · `directionX` · `directionZ` · `type`
- `paramss` · `seek_radius` · `navGroupId`

**出向外键** (1):
- `sceneId` → `Scene/Scene`

**入向外键** (1):
- `Scene/ScenePath.sceneAreaId` → 本表

### `Scene/SceneAutoGather`
- `id` · `sceneId` · `detailId` · `position` · `type`

**出向外键** (1):
- `sceneId` → `Scene/Scene`

### `Scene/SceneBotMonster`
- `MonstersId` · `SceneId` · `Level` · `Name` · `Position` · `IsTaskMonster` · `MaxDistance` · `monsterIcon`
- `EnemysId`

**出向外键** (1):
- `SceneId` → `Scene/Scene`

### `Scene/SceneBuff`
- `sceneBuffId` · `buffType` · `valueEffect` · `basePercentEffect` · `currentPercentEffect` · `duration` · `tickTime` · `replaceType`
- `priority` · `saveType` · `showOrNot`

### `Scene/SceneClient`
- `id` · `sceneText` · `sceneName` · `sceneResName` · `miniMap` · `bigMap` · `enableBigMap` · `enableWorldMap`
- `bgSound` · `firstEnterPlotSeqId` · `cameraParam` · `fightSceneId` · `offsetX` · `offsetY` · `mapSizeX` · `mapSizeZ`
- `minimapOriginX` · `minimapOriginY` · `minimapScaleX` · `minimapScaleY` · `bigmapOffsetX` · `bigmapOffsetY` · `bigmapScaleX` · `bigmapScaleY`
- `mapRotation` · `sceneIcon` · `sceneEvent` · `fieldViewLevel` · `fieldViewSortIndex` · `fieldViewOpenConfig` · `airDoorCheck` · `miniMapGroup`
- `sceneEventNPCCull` · `blessTreePath` · `shanxingIcon`

**入向外键** (1):
- `autoChess/AutoChessMapShop.sceneClientId` → 本表

### `Scene/SceneCustomModel`
- `id` · `scriptableModel` · `scaleX` · `scaleY` · `scaleZ`

### `Scene/SceneDogz`
- `dogzId` · `modelId` · `followRadius` · `offset` · `patrolArea` · `patrolSpeed` · `showLimit` · `standbyAction`
- `interval` · `patrolweight` · `standbyWeight` · `shareRotation`

### `Scene/SceneEvent`
- `eventName` · `eventId` · `eventType` · `checkDistance`

### `Scene/SceneExtra`
- `id` · `bornX` · `bornZ` · `directionX` · `directionZ` · `defaultPosId` · `pkType` · `requiredPlayerLevel`
- `requiredFinishedTaskIds` · `canBot` · `checkVisited` · `LoopTaskRaid`

### `Scene/SceneFlyMounts`
- `id` · `mountId` · `scneId` · `canFly` · `flyHeight` · `cameraPosOffset` · `cameraHeightOffset`

### `Scene/SceneFootPrintArea`
- `id` · `footPrintPdId`

### `Scene/SceneInteractiveObj`
- `id` · `sceneId` · `positionId` · `name` · `modelId` · `modelScale` · `openAniName` · `effectId`
- `openEffectId` · `radius` · `belongModule` · `type` · `requiredTaskTargetId`

**出向外键** (1):
- `sceneId` → `Scene/Scene`

### `Scene/SceneMonster`
- `monsterId` · `level` · `modelId` · `name` · `directionX` · `directionZ` · `patrolRange` · `warnRange`
- `pursueRange` · `friendly` · `enemys` · `isTaskMonster` · `clickEvent` · `eventArgs`

### `Scene/SceneMonsterArea`
- `id` · `sceneId` · `positionId` · `refreshTime` · `type` · `ratio`

**出向外键** (1):
- `sceneId` → `Scene/Scene`

### `Scene/SceneMounts`
- `id` · `modelId` · `offset` · `showLimit` · `effects` · `effectRoot` · `goOn` · `onRoot`
- `goOff` · `offRoot` · `timeDelta` · `propAdd` · `sceneLimit` · `mainRideOnIcon` · `mainRideOffIcon` · `alwaysAnimate`
- `eventEffect`

### `Scene/SceneNpc`
- `id` · `sceneId` · `positionId` · `name` · `modelId` · `modelScale` · `inHouse` · `defaultAniName`
- `defaultDialogFaceAniName` · `animNames` · `defaultDialog` · `defaultReply` · `directionX` · `directionZ` · `canMove` · `canRotate`
- `iconId` · `type` · `isTaskNpc` · `showOnMap` · `clickEvent` · `eventArgs` · `colliderArgs` · `seekOffsetX`
- `seekOffsetZ` · `modelOffset` · `ParticleIds` · `ParticleArgs` · `isAlwaysShow` · `dialogTitle`

**出向外键** (2):
- `sceneId` → `Scene/Scene`
- `ParticleIds` → `fight/Particle`

### `Scene/SceneNpcExtra`
- `id` · `isShow` · `taskIdRanges` · `dailyTaskLevelRanges` · `targetIdRanges` · `delayRemove`

### `Scene/SceneObjectAction`
- `id` · `actionType` · `actionArgs` · `actionDuration`

### `Scene/ScenePath`
- `id` · `pathId` · `nodeId` · `sceneAreaId` · `eventName` · `eventArgs` · `pauseTime`

**出向外键** (1):
- `sceneAreaId` → `Scene/SceneArea`

### `Scene/SceneResource`
- `id` · `level` · `sceneId` · `positionId` · `detailId` · `content` · `type` · `alwaysShow`
- `taskCollection` · `targetIds` · `showOnMap` · `isMiniGame` · `miniGameCollectCount` · `miniGameSingleCollectTime` · `miniGameDifficulty` · `miniGameRewards`
- `fishCameraPrbPath`

**出向外键** (1):
- `sceneId` → `Scene/Scene`

### `Scene/SceneResourceDetail`
- `id` · `name` · `modelId` · `effectId` · `times` · `result` · `resourceLevel` · `refreshTime`
- `level` · `keepTime` · `type` · `iconType` · `playHeadEffect` · `countDownType` · `playEffect` · `effectIdAndRate`
- `position` · `rotation` · `scale` · `directionX` · `directionZ` · `costEnergy` · `addExp`

### `Scene/SceneSafeArea`
- `id` · `sceneId` · `positionId` · `pkType`

**出向外键** (1):
- `sceneId` → `Scene/Scene`

### `Scene/SceneSeaPort`
- `id` · `sceneId` · `positionId` · `radius` · `sceneEffectId`

**出向外键** (2):
- `sceneId` → `Scene/Scene`
- `sceneEffectId` → `SceneEffect`

### `Scene/SceneTransformPoint`
- `id` · `sceneId` · `positionId` · `transformRadius` · `targetSceneId` · `targetPositionId` · `name` · `modelId`
- `plotId` · `messageboxTitle` · `messageboxContent` · `sceneEffectId` · `requiredPlayerLevel` · `requiredFinishedTaskIds` · `transferType` · `transferRes`
- `transferAnimRes` · `showOnMap`

**出向外键** (3):
- `plotId` → `Plot`
- `sceneId` → `Scene/Scene`
- `sceneEffectId` → `SceneEffect`

### `Scene/SceneTriggerArea`
- `id` · `sceneId` · `positionId` · `statusType` · `triggerName`

**出向外键** (1):
- `sceneId` → `Scene/Scene`

### `Scene/ScriptableModel`
- `ModelId` · `ModelResPath` · `ModelDes` · `Height`

### `Scene/_SceneEnemyGroup`
- `groupId` · `expAdd` · `heroExpAdd` · `intimacyAdd` · `dropGroupIds` · `specialDropGroupIds` · `dropBuffIds` · `taskDropGroupIds`

**出向外键** (1):
- `dropGroupIds` → `_DropGroup`

### `Scene/_SceneInteractiveObjEvent`
- `id` · `interactiveObjId` · `eventType` · `eventContent` · `eventWeight`

### `Scene/_SceneObjectMoveMode`
- `模式ID` · `模式类型
1:固定路径
2:范围内随机` · `循环次数
(无限填0)` · `是否反向循环
(0否1是)` · `路径ID(固定路径时填写)` · `圆半径(区域时填写)` · `一次循环的停顿时间(毫秒)` · `循环全部结束的事件`
- `循环全部结束的事件参数` · `备注`

### `Scene/_ScenePvpReward`
- `7` · `1` · `9999` · `4`

### `Scene/_SceneResourceRefresh`
- `唯一ID` · `所属场景ID` · `资源类型(1伐木2采集3钓鱼4挖矿
5大航海打捞
6大航海救人
7大航海捕鱼
8大航海潜水10限时采集)` · `采集物等级` · `刷出的最大数量`
