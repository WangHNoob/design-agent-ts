---
type: table_schema
title: "表族 turnTableNew"
group: "turnTableNew"
table_count: 2
---

# 表族 `turnTableNew`

共 2 张表。数据源：`knowledge/gamedata/`。

## 成员表清单
| 表名 | 字段数 | 相对路径 |
|------|--------|----------|
| `turnTableNew/TurnTableNewType` | 12 | turnTableNew/TurnTableNewType.xlsx |
| `turnTableNew/_TurnTableNewShop` | 10 | turnTableNew/_TurnTableNewShop.xlsx |

## 字段明细
### `turnTableNew/TurnTableNewType`
- `type` · `turnTableOneTimesNeedItem` · `turnTableShopId` · `turnTableLevelOpen` · `turnTableCycleNum` · `turnTableExchangeGetItem` · `turnJuanShopGoodIndex` · `turnTableExchangeNeedScore`
- `turnTableFiveTimesPreciousLimit` · `mailID` · `turnTableBuyOne` · `turnTableBuyFive`

**出向外键** (1):
- `turnTableShopId` → `turnTable/_TurnTableShop`

### `turnTableNew/_TurnTableNewShop`
- `shopId` · `shopInfo` · `type` · `numLimitType` · `numLimit` · `position` · `resetScore` · `score`
- `precious` · `weight`
