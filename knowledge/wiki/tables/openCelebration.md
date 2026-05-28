---
type: table_schema
title: "表族 openCelebration"
group: "openCelebration"
table_count: 6
---

# 表族 `openCelebration`

共 6 张表。数据源：`knowledge/gamedata/`。

## 成员表清单
| 表名 | 字段数 | 相对路径 |
|------|--------|----------|
| `openCelebration/OpenCelebration` | 6 | openCelebration/OpenCelebration.xlsx |
| `openCelebration/OpenCelebrationDaily` | 9 | openCelebration/OpenCelebrationDaily.xlsx |
| `openCelebration/OpenCelebrationDailyGift` | 3 | openCelebration/OpenCelebrationDailyGift.xlsx |
| `openCelebration/OpenCelebrationDailyGiftPrice` | 5 | openCelebration/OpenCelebrationDailyGiftPrice.xlsx |
| `openCelebration/OpenCelebrationTask` | 8 | openCelebration/OpenCelebrationTask.xlsx |
| `openCelebration/OpenCelebrationTaskGroup` | 3 | openCelebration/OpenCelebrationTaskGroup.xlsx |

## 字段明细
### `openCelebration/OpenCelebration`
- `id` · `openServerDay` · `maxTaskDay` · `continueDay` · `endReward` · `endRewardTarget`

### `openCelebration/OpenCelebrationDaily`
- `day` · `taskGroups` · `dailyLoginReward` · `dailyPayNum` · `shopId` · `dailyPayReward` · `dailyBuyGift` · `icon`
- `giftIcon`

### `openCelebration/OpenCelebrationDailyGift`
- `giftId` · `giftPrice` · `giftReward`

### `openCelebration/OpenCelebrationDailyGiftPrice`
- `id` · `giftId` · `buyTimes` · `giftPrice` · `giftDisscount`

### `openCelebration/OpenCelebrationTask`
- `taskId` · `taskType` · `taskTitle` · `taskDesc` · `taskTarget1` · `taskTarget2` · `taskTargetDesc` · `TaskReward`

### `openCelebration/OpenCelebrationTaskGroup`
- `groupId` · `groupName` · `taskGroup`
