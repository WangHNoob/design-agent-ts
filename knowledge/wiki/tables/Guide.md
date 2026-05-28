---
type: table_schema
title: "表族 Guide"
group: "Guide"
table_count: 7
---

# 表族 `Guide`

共 7 张表。数据源：`knowledge/gamedata/`。

## 成员表清单
| 表名 | 字段数 | 相对路径 |
|------|--------|----------|
| `Guide/Guide` | 7 | Guide/Guide.xlsx |
| `Guide/GuideExtra` | 2 | Guide/GuideExtra.xlsx |
| `Guide/GuideStep` | 3 | Guide/GuideStep.xlsx |
| `Guide/GuideStepButtonPath` | 4 | Guide/GuideStepButtonPath.xlsx |
| `Guide/GuideStepEnvironment` | 3 | Guide/GuideStepEnvironment.xlsx |
| `Guide/GuideStepExtra` | 15 | Guide/GuideStepExtra.xlsx |
| `Guide/GuideTrigger` | 3 | Guide/GuideTrigger.xlsx |

## 字段明细
### `Guide/Guide`
- `guideId` · `canSkip` · `keyStep` · `hasNextGuide` · `nextGuideId` · `nextGuideStepId` · `trustClient`

**入向外键** (5):
- `CelebrationPerson/CelebrationPersonTrialStage.guideId` → 本表
- `Guide/GuideExtra.guideId` → 本表
- `Guide/GuideStep.guideId` → 本表
- `NewStrongGuide/NewStrongGuideTarget.guideID` → 本表
- `StrongGuide/StrongGuideTarget.guideID` → 本表

### `Guide/GuideExtra`
- `guideId` · `TriggerPrefabId`

**出向外键** (1):
- `guideId` → `Guide/Guide`

### `Guide/GuideStep`
- `tag` · `guideId` · `stepId`

**出向外键** (1):
- `guideId` → `Guide/Guide`

### `Guide/GuideStepButtonPath`
- `环境预制Id` · `环境类型` · `EmptyKey-C2` · `Type`

### `Guide/GuideStepEnvironment`
- `EnvPrefabId` · `EnvType` · `Param`

### `Guide/GuideStepExtra`
- `tag` · `envPrefabId` · `type` · `maskType` · `isAlpha0` · `isRaycast` · `param` · `dialogType`
- `dialogPosX` · `dialogPosY` · `dialogWidth` · `dialogHeight` · `textModuleId` · `frameType` · `skipSide`

**出向外键** (1):
- `textModuleId` → `TextModule`

### `Guide/GuideTrigger`
- `TriggerName` · `TriggerType` · `TriggerParam`
