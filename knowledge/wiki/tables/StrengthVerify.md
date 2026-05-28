---
type: table_schema
title: "表族 StrengthVerify"
group: "StrengthVerify"
table_count: 3
---

# 表族 `StrengthVerify`

共 3 张表。数据源：`knowledge/gamedata/`。

## 成员表清单
| 表名 | 字段数 | 相对路径 |
|------|--------|----------|
| `StrengthVerify/StrengthVerifyRankReward` | 6 | StrengthVerify/StrengthVerifyRankReward.xlsx |
| `StrengthVerify/StrengthVerifyReward` | 5 | StrengthVerify/StrengthVerifyReward.xlsx |
| `StrengthVerify/StrengthVerifyType` | 9 | StrengthVerify/StrengthVerifyType.xlsx |

## 字段明细
### `StrengthVerify/StrengthVerifyRankReward`
- `rewardId` · `minRank` · `maxRank` · `reward` · `type` · `title`

### `StrengthVerify/StrengthVerifyReward`
- `rewardId` · `value` · `reward` · `type` · `conditionDes`

### `StrengthVerify/StrengthVerifyType`
- `verifyType` · `dateNum` · `openTime` · `closeTime` · `paramName` · `rankDes` · `rankThreshold` · `rankRequestDes`
- `rankTitle`
