---
type: table_schema
title: "表族 _Equip"
group: "_Equip"
table_count: 6
---

# 表族 `_Equip`

共 6 张表。数据源：`knowledge/gamedata/`。

## 成员表清单
| 表名 | 字段数 | 相对路径 |
|------|--------|----------|
| `_EquipDecompose` | 5 | _EquipDecompose.xlsx |
| `_EquipExtraFightPower` | 4 | _EquipExtraFightPower.xlsx |
| `_EquipNewReIdentify` | 8 | _EquipNewReIdentify.xlsx |
| `_EquipPunchRandom` | 4 | _EquipPunchRandom.xlsx |
| `_EquipRandNum` | 10 | _EquipRandNum.xlsx |
| `_EquipRandProp` | 35 | _EquipRandProp.xlsx |

## 字段明细
### `_EquipDecompose`
- `id` · `equipLevel` · `equipQuality` · `refineLevel` · `rewards`

### `_EquipExtraFightPower`
- `7` · `1` · `999` · `3`

### `_EquipNewReIdentify`
- `自增ID` · `固定属性组Id` · `随机属性组ID` · `属性Id` · `初始值` · `最大值` · `修正范围值` · `修正幂值`

### `_EquipPunchRandom`
- `ID` · `装备等级` · `孔数` · `权重`

### `_EquipRandNum`
- `randId` · `useLevel` · `equipQuality` · `isSuit` · `randNum` · `weight` · `overLoadWeight` · `addFactor`
- `rarePropNums` · `overLoadrarePropNums`

### `_EquipRandProp`
- `int` · `int` · `int` · `int` · `int` · `string` · `string` · `string`
- `string` · `string` · `string` · `string` · `string` · `string` · `string` · `int`
- `int` · `int` · `int` · `int` · `int` · `int` · `int` · `int`
- `int` · `int` · `int` · `int` · `int` · `int` · `int` · `int`
- `int` · `int` · `int`
