---
type: table_schema
title: "表族 return"
group: "return"
table_count: 11
---

# 表族 `return`

共 11 张表。数据源：`knowledge/gamedata/`。

## 成员表清单
| 表名 | 字段数 | 相对路径 |
|------|--------|----------|
| `return/PlayerReturnLoginBackgroundImage` | 2 | return/PlayerReturnLoginBackgroundImage.xlsx |
| `return/_PlayerReturnBaseData` | 7 | return/_PlayerReturnBaseData.xlsx |
| `return/_PlayerReturnCondition` | 11 | return/_PlayerReturnCondition.xlsx |
| `return/_PlayerReturnExp` | 5 | return/_PlayerReturnExp.xlsx |
| `return/_PlayerReturnExpBuff` | 5 | return/_PlayerReturnExpBuff.xlsx |
| `return/_PlayerReturnGift` | 3 | return/_PlayerReturnGift.xlsx |
| `return/_PlayerReturnGiftGroup` | 2 | return/_PlayerReturnGiftGroup.xlsx |
| `return/_PlayerReturnGiftPrice` | 4 | return/_PlayerReturnGiftPrice.xlsx |
| `return/_PlayerReturnLoginReward` | 5 | return/_PlayerReturnLoginReward.xlsx |
| `return/_PlayerReturnRechargeGroup` | 2 | return/_PlayerReturnRechargeGroup.xlsx |
| `return/_PlayerReturnRechargeReward` | 4 | return/_PlayerReturnRechargeReward.xlsx |

## 字段明细
### `return/PlayerReturnLoginBackgroundImage`
- `rechargeGroupId` · `playerReturnLoginImg`

### `return/_PlayerReturnBaseData`
- `id` · `openDayMin` · `openDayMax` · `totalContinueDay` · `nextOpenCD` · `openLevel` · `openLevelMax`

### `return/_PlayerReturnCondition`
- `id` · `day` · `levMin` · `levMax` · `offlineDayMin` · `offlineDayMax` · `payMoneyMin` · `payMoneyMax`
- `rechargeGroupId` · `giftGroupId` · `loginRewardId`

### `return/_PlayerReturnExp`
- `id` · `offlineDayMin` · `offlineDayMax` · `offlineDay` · `offlineFactor`

### `return/_PlayerReturnExpBuff`
- `id` · `offlineDayMin` · `levelMin` · `expRate` · `continuousTime`

### `return/_PlayerReturnGift`
- `giftId` · `giftGroupId` · `giftReward`

### `return/_PlayerReturnGiftGroup`
- `giftGroupId` · `giftGroupDesc`

### `return/_PlayerReturnGiftPrice`
- `id` · `giftId` · `buyTimes` · `giftPrice`

### `return/_PlayerReturnLoginReward`
- `id` · `offlineDay` · `day` · `reward` · `price`

### `return/_PlayerReturnRechargeGroup`
- `rechargeGroupId` · `rechargeGroupDesc`

### `return/_PlayerReturnRechargeReward`
- `rechargeRewardId` · `rechargeGroupId` · `payMoney` · `reward`
