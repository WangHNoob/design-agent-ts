---
type: table_schema
title: "表族 TreasureHuntingGame"
group: "TreasureHuntingGame"
table_count: 2
---

# 表族 `TreasureHuntingGame`

共 2 张表。数据源：`knowledge/gamedata/`。

## 成员表清单
| 表名 | 字段数 | 相对路径 |
|------|--------|----------|
| `TreasureHuntingGame/TreasureHuntingGamesMap` | 10 | TreasureHuntingGame/TreasureHuntingGamesMap.xlsx |
| `TreasureHuntingGame/TreasureHuntingGamesTask` | 6 | TreasureHuntingGame/TreasureHuntingGamesTask.xlsx |

## 字段明细
### `TreasureHuntingGame/TreasureHuntingGamesMap`
- `id` · `piecesNum` · `mapCost` · `piecesCost` · `dropGroup` · `treasureLocal` · `rValue` · `senceId`
- `TreasureMapImage` · `isOpen`

### `TreasureHuntingGame/TreasureHuntingGamesTask`
- `id` · `taskType` · `taskCost` · `reward` · `describe` · `position`
