---
type: table_schema
title: "表族 Title"
group: "Title"
table_count: 2
---

# 表族 `Title`

共 2 张表。数据源：`knowledge/gamedata/`。

## 成员表清单
| 表名 | 字段数 | 相对路径 |
|------|--------|----------|
| `Title` | 12 | Title.xlsx |
| `TitleUIOffSet` | 4 | TitleUIOffSet.xlsx |

## 字段明细
### `Title`
- `titleId` · `icon` · `titleName` · `titleDes` · `targetDes` · `addProp` · `itemIcon` · `TitleDynamicPath`
- `titleProcess` · `powerFactorB` · `powerFactorC` · `powerFactorD`

**入向外键** (8):
- `GiftLeftType.titleid` → 本表
- `OpDexNostalgiaReward.titleId` → 本表
- `ShipGroup/ShipGroupPlayerScoreReward.titleId` → 本表
- `ShipGroup/ShipGroupRankReward.titleId` → 本表
- `ShipGroup/ShipGroupTrialRankReward.titleId` → 本表
- `explore/ExploreRankReward.titleId` → 本表
- `fairPlay/FairPlaySeasonRankReward.titleId` → 本表
- `ladderWar/_LadderWarRankReward.titleId` → 本表

### `TitleUIOffSet`
- `modelId` · `titleY` · `titleScale` · `titleX`
