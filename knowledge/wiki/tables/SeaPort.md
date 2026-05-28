---
type: table_schema
title: "表族 SeaPort"
group: "SeaPort"
table_count: 5
---

# 表族 `SeaPort`

共 5 张表。数据源：`knowledge/gamedata/`。

## 成员表清单
| 表名 | 字段数 | 相对路径 |
|------|--------|----------|
| `SeaPort/SeaPortBuilding` | 5 | SeaPort/SeaPortBuilding.xlsx |
| `SeaPort/SeaPortBuildingLev` | 10 | SeaPort/SeaPortBuildingLev.xlsx |
| `SeaPort/SeaPortSeaArea` | 9 | SeaPort/SeaPortSeaArea.xlsx |
| `SeaPort/SeaPortStrategy` | 10 | SeaPort/SeaPortStrategy.xlsx |
| `SeaPort/SeaportEntry` | 3 | SeaPort/SeaportEntry.xlsx |

## 字段明细
### `SeaPort/SeaPortBuilding`
- `buildingType` · `buildingName` · `initLev` · `showPic` · `desc`

### `SeaPort/SeaPortBuildingLev`
- `id` · `buildingType` · `buildingLev` · `upgradeCost` · `preBuildLevId` · `shipParkType` · `shipParkNum` · `strategyType`
- `strategyNum` · `buildingDesc`

### `SeaPort/SeaPortSeaArea`
- `seaAreaType` · `dropGroup` · `minShipLev` · `cost` · `extraRewards` · `continueTime` · `seaAreaPic` · `seaAreaName`
- `resourceIcon`

### `SeaPort/SeaPortStrategy`
- `id` · `type` · `fightBuffId` · `usfId` · `weight` · `entryId` · `quality` · `strategyName`
- `strategyDesc` · `strategyIcon`

**出向外键** (1):
- `fightBuffId` → `fight/FightBuff`

### `SeaPort/SeaportEntry`
- `entryId` · `turnCost` · `seaFightCost`
