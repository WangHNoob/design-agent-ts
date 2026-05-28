---
type: table_schema
title: "表族 holiday"
group: "holiday"
table_count: 10
---

# 表族 `holiday`

共 10 张表。数据源：`knowledge/gamedata/`。

## 成员表清单
| 表名 | 字段数 | 相对路径 |
|------|--------|----------|
| `holiday/HolidayActivityType` | 9 | holiday/HolidayActivityType.xlsx |
| `holiday/HolidayDailyLogin` | 5 | holiday/HolidayDailyLogin.xlsx |
| `holiday/HolidayText` | 2 | holiday/HolidayText.xlsx |
| `holiday/HolidayType` | 7 | holiday/HolidayType.xlsx |
| `holiday/_HolidayConfig` | 3 | holiday/_HolidayConfig.xlsx |
| `holiday/_HolidayContinuousPay` | 5 | holiday/_HolidayContinuousPay.xlsx |
| `holiday/_HolidayDiamondCost` | 4 | holiday/_HolidayDiamondCost.xlsx |
| `holiday/_HolidayExtraDropConfig` | 7 | holiday/_HolidayExtraDropConfig.xlsx |
| `holiday/_HolidayExtraDropItemConfig` | 5 | holiday/_HolidayExtraDropItemConfig.xlsx |
| `holiday/_HolidayExtraDropReward` | 4 | holiday/_HolidayExtraDropReward.xlsx |

## 字段明细
### `holiday/HolidayActivityType`
- `holidayActivityType` · `holidayActivityOpen` · `startTime` · `endTime` · `holidayActivityTitle` · `holidayActivityDesc` · `transferTarget` · `backImage`
- `resPath`

### `holiday/HolidayDailyLogin`
- `day` · `loginDate` · `reward` · `itemBtnIcon` · `itemDesc`

### `holiday/HolidayText`
- `holidayType` · `holidayDesc`

### `holiday/HolidayType`
- `holidayType` · `holidayDesc` · `holidayPrefix` · `holidayTitle` · `holidayResName` · `holidayUIAtlasName` · `holidayTitleName`

### `holiday/_HolidayConfig`
- `id` · `值` · `描述`

### `holiday/_HolidayContinuousPay`
- `id` · `下一个id` · `充值钻石数` · `奖励` · `图标`

### `holiday/_HolidayDiamondCost`
- `7` · `1` · `999` · `3`

### `holiday/_HolidayExtraDropConfig`
- `玩法类型` · `是否有掉落次数限制` · `掉落次数` · `掉落权重` · `道具数量配置` · `图标` · `标题`

### `holiday/_HolidayExtraDropItemConfig`
- `自增id` · `等级下限` · `等级上限` · `道具id` · `可获得物品展示`

### `holiday/_HolidayExtraDropReward`
- `7` · `1` · `999` · `3`
