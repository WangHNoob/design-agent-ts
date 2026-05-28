---
type: table_schema
title: "表族 shop"
group: "shop"
table_count: 7
---

# 表族 `shop`

共 7 张表。数据源：`knowledge/gamedata/`。

## 成员表清单
| 表名 | 字段数 | 相对路径 |
|------|--------|----------|
| `shop/ShopItemBuyInfo` | 4 | shop/ShopItemBuyInfo.xlsx |
| `shop/ShopItemUse` | 3 | shop/ShopItemUse.xlsx |
| `shop/_ShopItem` | 28 | shop/_ShopItem.xlsx |
| `shop/_ShopPages` | 5 | shop/_ShopPages.xlsx |
| `shop/_ShopRefreshCost` | 4 | shop/_ShopRefreshCost.xlsx |
| `shop/_ShopRefreshRule` | 5 | shop/_ShopRefreshRule.xlsx |
| `shop/_ShopType` | 7 | shop/_ShopType.xlsx |

## 字段明细
### `shop/ShopItemBuyInfo`
- `id` · `goodIndex` · `buyTimes` · `price`

### `shop/ShopItemUse`
- `itemId` · `useType` · `useFunc`

**出向外键** (1):
- `itemId` → `Item`

### `shop/_ShopItem`
- `货物index` · `商店类型` · `group类型` · `货币info` · `货物info` · `商品开启时间` · `商品关闭时间` · `折扣率`
- `折扣开始时间` · `折扣结束时间` · `所属分页` · `模型资源` · `单次购买最大值` · `是否支持赠送` · `限购数据` · `限购额外参数`
- `是否下架` · `排序id` · `可见条件` · `拓展字段-购买前置条件` · `随机权重` · `是否根据次数配置价格` · `价格刷新条件` · `是否珍贵商品`
- `防盖表经典怀旧判断` · `EmptyKey-Y2` · `EmptyKey-Z2` · `EmptyKey-AA2`

**入向外键** (1):
- `Vip/_OpenServerVipShop.shopItemId` → 本表

### `shop/_ShopPages`
- `psId` · `page` · `shopType` · `pageIndex` · `pageName`

### `shop/_ShopRefreshCost`
- `7` · `1` · `9999` · `4`

### `shop/_ShopRefreshRule`
- `唯一id` · `商店类型` · `格子Id` · `循环次数` · `重要道具次数`

### `shop/_ShopType`
- `商店类型` · `商店名称` · `商店格子数` · `商店刷新类型` · `刷新条件` · `商店开启条件（任务）` · `每日最大刷新次数`
