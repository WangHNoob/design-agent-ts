---
type: table_schema
title: "表族 Gem"
group: "Gem"
table_count: 4
---

# 表族 `Gem`

共 4 张表。数据源：`knowledge/gamedata/`。

## 成员表清单
| 表名 | 字段数 | 相对路径 |
|------|--------|----------|
| `Gem` | 20 | Gem.xlsx |
| `GemMaster` | 7 | GemMaster.xlsx |
| `GemMemory` | 4 | GemMemory.xlsx |
| `GemPreset` | 3 | GemPreset.xlsx |

## 字段明细
### `Gem`
- `gemId` · `level` · `color` · `addProp` · `gemCost` · `otherCost` · `asSource` · `type`
- `classicType` · `classicTypeName` · `classicTypeOrder` · `buffDesc` · `powerFactorD` · `powerFactorB` · `powerFactorC` · `composeLevel`
- `decomposeCost` · `decomposeGet` · `composeCost` · `composeBaseProp`

### `GemMaster`
- `id` · `level` · `conditions` · `addProp` · `perAddProp` · `powerFightB` · `powerFightC`

### `GemMemory`
- `memoryId` · `defaultName` · `isUnlock` · `unlockItems`

### `GemPreset`
- `gemPresetId` · `classicType` · `gemPresetGroup`
