---
type: table_schema
title: "表族 World"
group: "World"
table_count: 2
---

# 表族 `World`

共 2 张表。数据源：`knowledge/gamedata/`。

## 成员表清单
| 表名 | 字段数 | 相对路径 |
|------|--------|----------|
| `WorldMap` | 6 | WorldMap.xlsx |
| `WorldSubMap` | 6 | WorldSubMap.xlsx |

## 字段明细
### `WorldMap`
- `id` · `mapName` · `mapIcon` · `pos` · `taskTipIndex` · `posRect`

**入向外键** (1):
- `ship/ShipTradeTask.worldMapId` → 本表

### `WorldSubMap`
- `id` · `mapId` · `mapName` · `mapIcon` · `levelLimit` · `sceneId`

**出向外键** (1):
- `sceneId` → `Scene/Scene`
