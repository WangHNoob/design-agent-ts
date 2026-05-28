---
type: table_schema
title: "表族 task"
group: "task"
table_count: 17
---

# 表族 `task`

共 17 张表。数据源：`knowledge/gamedata/`。

## 成员表清单
| 表名 | 字段数 | 相对路径 |
|------|--------|----------|
| `task/_DailyTask` | 4 | task/_DailyTask.xlsx |
| `task/_LoopRewardByLevel` | 6 | task/_LoopRewardByLevel.xlsx |
| `task/_LoopTaskBase` | 14 | task/_LoopTaskBase.xlsx |
| `task/_LoopTaskGroup` | 3 | task/_LoopTaskGroup.xlsx |
| `task/_LoopTaskRandom` | 8 | task/_LoopTaskRandom.xlsx |
| `task/_LoopTaskReward` | 11 | task/_LoopTaskReward.xlsx |
| `task/_LoopTaskRewardRate` | 4 | task/_LoopTaskRewardRate.xlsx |
| `task/_OperationToTaskTarget` | 6 | task/_OperationToTaskTarget.xlsx |
| `task/_TaskBase` | 26 | task/_TaskBase.xlsx |
| `task/_TaskChapter` | 6 | task/_TaskChapter.xlsx |
| `task/_TaskConfig` | 4 | task/_TaskConfig.xlsx |
| `task/_TaskConvoyPath` | 6 | task/_TaskConvoyPath.xlsx |
| `task/_TaskEvent` | 5 | task/_TaskEvent.xlsx |
| `task/_TaskFightReward` | 5 | task/_TaskFightReward.xlsx |
| `task/_TaskReward` | 3 | task/_TaskReward.xlsx |
| `task/_TaskSkipConfig` | 4 | task/_TaskSkipConfig.xlsx |
| `task/_TaskTarget` | 11 | task/_TaskTarget.xlsx |

## 字段明细
### `task/_DailyTask`
- `任务ID` · `任务类型，单人2001；组队2002` · `任务级别
S(1), //s级任务
A(2), //a级任务
B(3), //b级任务
C(4), //c级任务
D(5),` · `ICON`

### `task/_LoopRewardByLevel`
- `id` · `loopId` · `lv` · `loopReward` · `teamReward` · `loopDropGroupIds`

### `task/_LoopTaskBase`
- `loopId` · `loopType` · `loopName` · `loopDesc` · `loopNum` · `seeCondition` · `getCondition` · `autoGet`
- `getType` · `canDoNum` · `rateTimes` · `rate` · `loopReward` · `resetRate`

### `task/_LoopTaskGroup`
- `type` · `taskIds` · `timesLimit`

### `task/_LoopTaskRandom`
- `id` · `loopId` · `sceneMapId` · `minLevel` · `typeRandom` · `levelRegion` · `maxLevel` · `isSingle`

### `task/_LoopTaskReward`
- `level` · `loopOneReward` · `loopTwoReward` · `loopThreeReward` · `loopFourReward` · `loopFiveReward` · `teamLoopOneReward` · `teamLoopTwoReward`
- `teamLoopThreeReward` · `teamLoopFourReward` · `teamLoopFiveReward`

### `task/_LoopTaskRewardRate`
- `id` · `loopId` · `loopStep` · `rate`

### `task/_OperationToTaskTarget`
- `自增id` · `操作类型` · `参数` · `初级任务目标` · `二级任务目标` · `EmptyKey-F2`

### `task/_TaskBase`
- `taskId` · `taskType` · `taskName` · `taskDesc` · `loopId` · `level` · `preTaskIds` · `nextTaskId`
- `seeCondition` · `getCondition` · `taskTargetIds` · `getType` · `handOverType` · `taskRewardIds` · `resetRate` · `failCondition`
- `taskItems` · `giveUpType` · `canGetAnotherOrNot` · `timeControl` · `andrVersionControl` · `gwVersionControl` · `yhVersionControl` · `iosVersionControl`
- `nextTaskTime` · `controlTaskId`

**出向外键** (2):
- `taskRewardIds` → `task/_TaskReward`
- `taskTargetIds` → `task/_TaskTarget`

### `task/_TaskChapter`
- `taskId` · `chapterId` · `chapterDesc` · `chapterScheduleStart` · `chapterScheduleEnd` · `chapterReward`

### `task/_TaskConfig`
- `id` · `taskType` · `entranceId` · `conditionStr`

### `task/_TaskConvoyPath`
- `pathId` · `path` · `resetTickNum` · `enemyGroupIds` · `sceneMapId` · `rewardId`

### `task/_TaskEvent`
- `自增id` · `任务id` · `任务操作` · `触发事件类型` · `参数`

### `task/_TaskFightReward`
- `奖励id` · `玩家增加的经验` · `英雄增加的经验` · `英雄增加的亲密度` · `道具奖励`

### `task/_TaskReward`
- `taskRewardId` · `taskReward` · `professionReward`

**入向外键** (1):
- `task/_TaskBase.taskRewardIds` → 本表

### `task/_TaskSkipConfig`
- `7` · `1` · `999` · `2`

### `task/_TaskTarget`
- `taskTargetId` · `taskTargetDesc` · `type` · `param1` · `param2` · `param3` · `trustClient` · `disableCheckPoint`
- `nextTargetId` · `townRunMapId` · `transAreaId`

**出向外键** (1):
- `townRunMapId` → `TownRunMap`

**入向外键** (1):
- `task/_TaskBase.taskTargetIds` → 本表
