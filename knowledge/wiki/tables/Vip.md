---
type: table_schema
title: "表族 Vip"
group: "Vip"
table_count: 5
---

# 表族 `Vip`

共 5 张表。数据源：`knowledge/gamedata/`。

## 成员表清单
| 表名 | 字段数 | 相对路径 |
|------|--------|----------|
| `Vip/CycleVip` | 9 | Vip/CycleVip.xlsx |
| `Vip/CycleVipOpen` | 3 | Vip/CycleVipOpen.xlsx |
| `Vip/Vip` | 4 | Vip/Vip.xlsx |
| `Vip/VipPrivilege` | 4 | Vip/VipPrivilege.xlsx |
| `Vip/_OpenServerVipShop` | 5 | Vip/_OpenServerVipShop.xlsx |

## 字段明细
### `Vip/CycleVip`
- `cycleVipLevel` · `needCycleVipExp` · `needCycleVipLevel` · `resetTime` · `resetExpTime` · `cycleVipLevelReward` · `cycleVipHomeReward` · `cycleVipTitleReward`
- `cycleVipActionPictorial`

### `Vip/CycleVipOpen`
- `id` · `开始时间` · `结束时间`

### `Vip/Vip`
- `level` · `needExp` · `levelReward` · `VipPrivilege`

### `Vip/VipPrivilege`
- `id` · `VipPrivilegeIcon` · `VipPrivilegeName` · `VipPrivilegeDesc`

### `Vip/_OpenServerVipShop`
- `shopItemId` · `needVip` · `showDay` · `currencyInfo` · `itemInfo`

**出向外键** (1):
- `shopItemId` → `shop/_ShopItem`
