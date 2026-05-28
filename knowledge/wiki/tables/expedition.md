---
type: table_schema
title: "表族 expedition"
group: "expedition"
table_count: 7
---

# 表族 `expedition`

共 7 张表。数据源：`knowledge/gamedata/`。

## 成员表清单
| 表名 | 字段数 | 相对路径 |
|------|--------|----------|
| `expedition/ExpeditionConditionType` | 2 | expedition/ExpeditionConditionType.xlsx |
| `expedition/ExpeditionLevel` | 7 | expedition/ExpeditionLevel.xlsx |
| `expedition/ExpeditionMission` | 8 | expedition/ExpeditionMission.xlsx |
| `expedition/ExpeditionMissionCondition` | 4 | expedition/ExpeditionMissionCondition.xlsx |
| `expedition/ExpeditionMissionName` | 4 | expedition/ExpeditionMissionName.xlsx |
| `expedition/_ExpeditionMissionConditionGroup` | 8 | expedition/_ExpeditionMissionConditionGroup.xlsx |
| `expedition/_ExpeditionMissionRewards` | 11 | expedition/_ExpeditionMissionRewards.xlsx |

## 字段明细
### `expedition/ExpeditionConditionType`
- `conditionType` · `text`

### `expedition/ExpeditionLevel`
- `level` · `levelName` · `playerLevel` · `missionNumLimit` · `heroNum` · `conditionNum` · `dayMaxMissionNum`

### `expedition/ExpeditionMission`
- `missionId` · `missionLevel` · `minute` · `fixedReward` · `addHeroExp` · `dropGroup` · `bigRewardDropGroup` · `bigRewardPreView`

### `expedition/ExpeditionMissionCondition`
- `id` · `conditionType` · `param0` · `param1`

### `expedition/ExpeditionMissionName`
- `id` · `name` · `description` · `missionIcon`

### `expedition/_ExpeditionMissionConditionGroup`
- `id` · `level` · `condition0` · `condition1` · `condition2` · `condition3` · `condition4` · `condition5`

### `expedition/_ExpeditionMissionRewards`
- `id` · `远征任务` · `ssr组` · `ssr组概率` · `ssr组最多出现次数` · `sr组` · `sr组概率` · `sr组最多出现次数`
- `r组（保底）` · `刷新次数From` · `刷新次数To`
