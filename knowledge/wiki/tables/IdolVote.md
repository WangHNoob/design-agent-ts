---
type: table_schema
title: "表族 IdolVote"
group: "IdolVote"
table_count: 5
---

# 表族 `IdolVote`

共 5 张表。数据源：`knowledge/gamedata/`。

## 成员表清单
| 表名 | 字段数 | 相对路径 |
|------|--------|----------|
| `IdolVote/IdolChallenge` | 7 | IdolVote/IdolChallenge.xlsx |
| `IdolVote/IdolInfo` | 6 | IdolVote/IdolInfo.xlsx |
| `IdolVote/IdolReward` | 5 | IdolVote/IdolReward.xlsx |
| `IdolVote/IdolTask` | 6 | IdolVote/IdolTask.xlsx |
| `IdolVote/_IdolPeriods` | 5 | IdolVote/_IdolPeriods.xlsx |

## 字段明细
### `IdolVote/IdolChallenge`
- `id` · `copyId` · `needTicket` · `rewards` · `title` · `bgIcon` · `copyDesc`

### `IdolVote/IdolInfo`
- `idolId` · `heroId` · `actionId` · `modelId` · `challengeId` · `idolicon`

**出向外键** (1):
- `heroId` → `Hero`

### `IdolVote/IdolReward`
- `id` · `type` · `rankMin` · `rankMax` · `rewards`

### `IdolVote/IdolTask`
- `id` · `taskType` · `param` · `title` · `rewards` · `jumpId`

### `IdolVote/_IdolPeriods`
- `id` · `startTime` · `playerEndTime` · `rewardTime` · `activityEndTime`
