---
type: table_schema
title: "表族 Limit"
group: "Limit"
table_count: 4
---

# 表族 `Limit`

共 4 张表。数据源：`knowledge/gamedata/`。

## 成员表清单
| 表名 | 字段数 | 相对路径 |
|------|--------|----------|
| `LimitBuyEquip` | 5 | LimitBuyEquip.xlsx |
| `LimitChallengeLevel` | 17 | LimitChallengeLevel.xlsx |
| `LimitChallengeReset` | 2 | LimitChallengeReset.xlsx |
| `LimitChallengeReward` | 3 | LimitChallengeReward.xlsx |

## 字段明细
### `LimitBuyEquip`
- `id` · `itemId` · `groupId` · `weight` · `itemType`

**出向外键** (1):
- `itemId` → `Item`

### `LimitChallengeLevel`
- `id` · `level` · `bossId` · `needHeroLevel` · `condition1` · `conditionReward1` · `conditionText1` · `condition2`
- `conditionReward2` · `conditionText2` · `condition3` · `conditionReward3` · `conditionText3` · `bossPicture` · `normalReward` · `sweepItem`
- `isBooss`

### `LimitChallengeReset`
- `resetNumber` · `needItem`

### `LimitChallengeReward`
- `id` · `needIntegral` · `reward`
