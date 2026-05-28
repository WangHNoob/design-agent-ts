---
type: table_schema
title: "表族 gvoPlace"
group: "gvoPlace"
table_count: 2
---

# 表族 `gvoPlace`

共 2 张表。数据源：`knowledge/gamedata/`。

## 成员表清单
| 表名 | 字段数 | 相对路径 |
|------|--------|----------|
| `gvoPlace/GvoPlaceChapter` | 13 | gvoPlace/GvoPlaceChapter.xlsx |
| `gvoPlace/GvoPlaceTollgate` | 15 | gvoPlace/GvoPlaceTollgate.xlsx |

## 字段明细
### `gvoPlace/GvoPlaceChapter`
- `id` · `chapterName` · `nextChapterId` · `belongSceneMapId` · `monsterModel` · `hangScene` · `sceneCameraPosition` · `sceneCameraRotation`
- `landslideCameraP` · `landslideCameraR` · `shipsPosition` · `landslideShipsPosition` · `npcId`

### `gvoPlace/GvoPlaceTollgate`
- `唯一ID` · `关卡名称` · `所属章节ID` · `下一关卡的ID` · `怪组ID` · `展示Icon` · `通关奖励
（掉落组，多个逗号分隔）` · `战斗地图ID`
- `碾压血量百分比
(比如一半填50)` · `最少收货时间
（秒）` · `挂机奖励货币
(每小时产多少)` · `挂机奖励
（掉落组，多个逗号分隔）` · `挂机奖励收取时间
（秒）` · `挂机奖励货币上限` · `分组`
