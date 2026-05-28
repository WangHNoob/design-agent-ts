---
type: table_schema
title: "表族 lawlessLand"
group: "lawlessLand"
table_count: 4
---

# 表族 `lawlessLand`

共 4 张表。数据源：`knowledge/gamedata/`。

## 成员表清单
| 表名 | 字段数 | 相对路径 |
|------|--------|----------|
| `lawlessLand/_LawlessLandBuff` | 4 | lawlessLand/_LawlessLandBuff.xlsx |
| `lawlessLand/_LawlessLandFightLand` | 16 | lawlessLand/_LawlessLandFightLand.xlsx |
| `lawlessLand/_LawlessLandOpen` | 4 | lawlessLand/_LawlessLandOpen.xlsx |
| `lawlessLand/_LawlessLandOpenServer` | 3 | lawlessLand/_LawlessLandOpenServer.xlsx |

## 字段明细
### `lawlessLand/_LawlessLandBuff`
- `buffId` · `buffType` · `contTime` · `param`

**出向外键** (1):
- `buffId` → `fight/_Buff`

### `lawlessLand/_LawlessLandFightLand`
- `fightLandId` · `applyTime` · `groupTime` · `enterTime` · `fightTime` · `settleTime` · `campNum` · `campMaxNum`
- `minApplyNum` · `sceneId` · `bornArea` · `openServerDay` · `reviveNum` · `finalScore` · `scoreFactor` · `winScore`

**出向外键** (1):
- `sceneId` → `Scene/Scene`

### `lawlessLand/_LawlessLandOpen`
- `id` · `startTime` · `endTime` · `fightLandId`

### `lawlessLand/_LawlessLandOpenServer`
- `id` · `fromServer` · `toServer`
