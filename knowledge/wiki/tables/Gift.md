---
type: table_schema
title: "表族 Gift"
group: "Gift"
table_count: 5
---

# 表族 `Gift`

共 5 张表。数据源：`knowledge/gamedata/`。

## 成员表清单
| 表名 | 字段数 | 相对路径 |
|------|--------|----------|
| `GiftChoosenPermanentConfig` | 22 | GiftChoosenPermanentConfig.xlsx |
| `GiftChoosenPermanentReward` | 2 | GiftChoosenPermanentReward.xlsx |
| `GiftLeftType` | 5 | GiftLeftType.xlsx |
| `GiftPermanentConfig` | 28 | GiftPermanentConfig.xlsx |
| `GiftTabConfig` | 3 | GiftTabConfig.xlsx |

## 字段明细
### `GiftChoosenPermanentConfig`
- `礼包Id` · `礼包名称` · `开服后持续小时数` · `奖励（前端要求此字段不可变，一定要变的，新增礼包）` · `价格` · `真实价格` · `消费类型` · `标签类型`
- `刷新类型` · `限购类型` · `限购次数` · `折扣` · `图标下标` · `计费点Id` · `开始日期（yyyy-MM-dd HH:mm:ss）` · `结束日期（yyyy-MM-dd HH:mm:ss）`
- `页类型（0限购，1限时）` · `是否重置` · `是否隐藏` · `菜单类型` · `售卖服务器类型` · `新服持续天数`

### `GiftChoosenPermanentReward`
- `id` · `rewards`

### `GiftLeftType`
- `titleid` · `showname` · `sort` · `ishide` · `redpointid`

**出向外键** (1):
- `titleid` → `Title`

### `GiftPermanentConfig`
- `礼包Id` · `礼包名称` · `开服后持续小时数` · `奖励` · `价格` · `真实价格` · `消费类型` · `标签类型`
- `刷新类型` · `限购类型` · `限购次数` · `折扣` · `图标下标` · `计费点Id` · `开始日期（yyyy-MM-dd HH:mm:ss）` · `结束日期（yyyy-MM-dd HH:mm:ss）`
- `页类型（0限购，1限时）` · `是否重置` · `是否隐藏` · `菜单类型` · `售卖服务器类型` · `新服持续天数` · `排序` · `所属标签`
- `自选礼包活动中可选道具池` · `自选可以选几个` · `防盖表经典怀旧判断` · `EmptyKey-AB2`

### `GiftTabConfig`
- `id` · `weight` · `tabName`
