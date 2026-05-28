---
type: table_schema
title: "表族 Bag"
group: "Bag"
table_count: 2
---

# 表族 `Bag`

共 2 张表。数据源：`knowledge/gamedata/`。

## 成员表清单
| 表名 | 字段数 | 相对路径 |
|------|--------|----------|
| `BagBuy` | 5 | BagBuy.xlsx |
| `BagConfig` | 9 | BagConfig.xlsx |

## 字段明细
### `BagBuy`
- `id` · `cellId` · `currencyType` · `switchFlag` · `currencyNum`

### `BagConfig`
- `configId` · `bagType` · `cellTotalNumber` · `freeCellNumber` · `rowNumber` · `rowOffer` · `pageMax` · `isUnlimit`
- `defaultOpen`

**出向外键** (1):
- `configId` → `config/Config`
