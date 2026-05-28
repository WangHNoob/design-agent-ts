---
type: table_schema
title: "表族 bloodyfight"
group: "bloodyfight"
table_count: 2
---

# 表族 `bloodyfight`

共 2 张表。数据源：`knowledge/gamedata/`。

## 成员表清单
| 表名 | 字段数 | 相对路径 |
|------|--------|----------|
| `bloodyfight/BloodyFightRaid` | 7 | bloodyfight/BloodyFightRaid.xlsx |
| `bloodyfight/BloodyFightRaidTollgate` | 11 | bloodyfight/BloodyFightRaidTollgate.xlsx |

## 字段明细
### `bloodyfight/BloodyFightRaid`
- `id` · `raidName` · `thumbnail` · `requiredPlayerLevel` · `dropShowItems` · `sweepCost` · `sweepCount`

### `bloodyfight/BloodyFightRaidTollgate`
- `id` · `tollgateName` · `raidId` · `bossImage` · `isBoss` · `starConditions` · `starAwardsShowItems` · `requiredHeroLevel`
- `requiredHeroCount` · `chestAwardsShowItems` · `desc`
