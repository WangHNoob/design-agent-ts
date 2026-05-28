---
type: table_schema
title: "表族 Plot"
group: "Plot"
table_count: 9
---

# 表族 `Plot`

共 9 张表。数据源：`knowledge/gamedata/`。

## 成员表清单
| 表名 | 字段数 | 相对路径 |
|------|--------|----------|
| `Plot` | 22 | Plot.xlsx |
| `PlotAudio` | 3 | PlotAudio.xlsx |
| `PlotClip` | 7 | PlotClip.xlsx |
| `PlotEpisodeStep` | 9 | PlotEpisodeStep.xlsx |
| `PlotFight` | 2 | PlotFight.xlsx |
| `PlotFightEnemy` | 16 | PlotFightEnemy.xlsx |
| `PlotFightEnemyAI` | 4 | PlotFightEnemyAI.xlsx |
| `PlotText` | 8 | PlotText.xlsx |
| `PlotTimeline` | 5 | PlotTimeline.xlsx |

## 字段明细
### `Plot`
- `id` · `plotSeqId` · `plotStepID` · `plotType` · `plotParam1` · `plotParam2` · `plotParam3` · `inStyle`
- `outStyle` · `hideNpc` · `hidePlayer` · `hideOtherPlayers` · `hideUI` · `disableBgm` · `isOnlyOnce` · `playerStartPosId`
- `playerEndPosId` · `barrageTimeLen` · `barrageOpen` · `blackInTime` · `blackOutTime` · `notSkip`

**入向外键** (3):
- `Scene/SceneTransformPoint.plotId` → 本表
- `_barrage.plotId` → 本表
- `union/UnionBuildingLev.plotId` → 本表

### `PlotAudio`
- `id` · `audio` · `enable`

### `PlotClip`
- `PlotClipId` · `PlotName` · `PoltResName` · `PoltSequenceResName` · `SceneId` · `Position` · `Euler`

**出向外键** (1):
- `SceneId` → `Scene/Scene`

### `PlotEpisodeStep`
- `PlotEpisodeStepId` · `PlotEpsiodeId` · `Step` · `TalkerName` · `TalkerPortrait` · `TalkerPos` · `CameraType` · `Content`
- `Duration`

### `PlotFight`
- `PlotFightId` · `IsGuide`

**入向外键** (1):
- `PlotFightEnemy.PlotFightId` → 本表

### `PlotFightEnemy`
- `id` · `PlotFightId` · `SailorId` · `Camp` · `FpId` · `Hp` · `Anger` · `Atk`
- `Def` · `Speed` · `DefaultSkil` · `Skill1` · `Skill2` · `Skill3` · `PassiveSkill` · `UltimateSkill`

**出向外键** (1):
- `PlotFightId` → `PlotFight`

**入向外键** (1):
- `PlotFightEnemyAI.PlotFightEnemyId` → 本表

### `PlotFightEnemyAI`
- `id` · `PlotFightEnemyId` · `SkillId` · `Weight`

**出向外键** (2):
- `PlotFightEnemyId` → `PlotFightEnemy`
- `SkillId` → `fight/Skill`

### `PlotText`
- `id` · `文字` · `音频` · `EmptyKey-D2` · `EmptyKey-E2` · `EmptyKey-F2` · `EmptyKey-G2` · `EmptyKey-H2`

### `PlotTimeline`
- `PlotTimelineId` · `PlotTimelineName` · `SceneId` · `Position` · `Euler`

**出向外键** (1):
- `SceneId` → `Scene/Scene`
