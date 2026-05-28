---
type: table_schema
title: "表族 FestivalBattlePass"
group: "FestivalBattlePass"
table_count: 5
---

# 表族 `FestivalBattlePass`

共 5 张表。数据源：`knowledge/gamedata/`。

## 成员表清单
| 表名 | 字段数 | 相对路径 |
|------|--------|----------|
| `FestivalBattlePass/FestivalBattlePassGroup` | 4 | FestivalBattlePass/FestivalBattlePassGroup.xlsx |
| `FestivalBattlePass/FestivalBattlePassLevel` | 10 | FestivalBattlePass/FestivalBattlePassLevel.xlsx |
| `FestivalBattlePass/FestivalBattlePassSession` | 4 | FestivalBattlePass/FestivalBattlePassSession.xlsx |
| `FestivalBattlePass/FestivalBattlePassShopPic` | 5 | FestivalBattlePass/FestivalBattlePassShopPic.xlsx |
| `FestivalBattlePass/FestivalBattlePassTask` | 8 | FestivalBattlePass/FestivalBattlePassTask.xlsx |

## 字段明细
### `FestivalBattlePass/FestivalBattlePassGroup`
- `id` · `sessionId` · `pay` · `price`

### `FestivalBattlePass/FestivalBattlePassLevel`
- `id` · `sessionId` · `passLevel` · `needExperience` · `levelReward` · `diamondLevelReward` · `moneyLevelReward` · `levelTitle`
- `LoopReward` · `isImportant`

### `FestivalBattlePass/FestivalBattlePassSession`
- `id` · `sessionId` · `sessionStartTime` · `sessionCloseTime`

### `FestivalBattlePass/FestivalBattlePassShopPic`
- `passID` · `titlePic` · `tabPic` · `cheakPic` · `backgroundPic`

### `FestivalBattlePass/FestivalBattlePassTask`
- `id` · `sessionId` · `taskType` · `descr` · `needTimes` · `exp` · `texture` · `targetId`
