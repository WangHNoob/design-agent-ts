---
type: table_schema
title: "表族 MysteryShop"
group: "MysteryShop"
table_count: 5
---

# 表族 `MysteryShop`

共 5 张表。数据源：`knowledge/gamedata/`。

## 成员表清单
| 表名 | 字段数 | 相对路径 |
|------|--------|----------|
| `MysteryShop/MysteryShopBuy` | 5 | MysteryShop/MysteryShopBuy.xlsx |
| `MysteryShop/MysteryShopRefresh` | 3 | MysteryShop/MysteryShopRefresh.xlsx |
| `MysteryShop/MysteryShopSell` | 3 | MysteryShop/MysteryShopSell.xlsx |
| `MysteryShop/MysteryShopTime` | 7 | MysteryShop/MysteryShopTime.xlsx |
| `MysteryShop/_MysteryShopShelf` | 4 | MysteryShop/_MysteryShopShelf.xlsx |

## 字段明细
### `MysteryShop/MysteryShopBuy`
- `id` · `itemInfo` · `costinfo` · `discount` · `quality`

### `MysteryShop/MysteryShopRefresh`
- `id` · `cost` · `luckvalueplus`

### `MysteryShop/MysteryShopSell`
- `id` · `itemInfo` · `costinfo`

### `MysteryShop/MysteryShopTime`
- `id` · `startTime` · `endTime` · `openTime` · `heroFashionId` · `actionId` · `luckvaluemax`

**出向外键** (1):
- `heroFashionId` → `HeroFashion`

### `MysteryShop/_MysteryShopShelf`
- `id` · `槽位id` · `商品池权重` · `幸运池权重`
