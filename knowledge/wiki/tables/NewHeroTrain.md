---
type: table_schema
title: "表族 NewHeroTrain"
group: "NewHeroTrain"
table_count: 4
---

# 表族 `NewHeroTrain`

共 4 张表。数据源：`knowledge/gamedata/`。

## 成员表清单
| 表名 | 字段数 | 相对路径 |
|------|--------|----------|
| `NewHeroTrain/NewHeroTrain` | 11 | NewHeroTrain/NewHeroTrain.xlsx |
| `NewHeroTrain/NewPerfectTrain` | 6 | NewHeroTrain/NewPerfectTrain.xlsx |
| `NewHeroTrain/_NewHeroTrainItem` | 4 | NewHeroTrain/_NewHeroTrainItem.xlsx |
| `NewHeroTrain/_NewHeroTrainValue` | 5 | NewHeroTrain/_NewHeroTrainValue.xlsx |

## 字段明细
### `NewHeroTrain/NewHeroTrain`
- `id` · `trainType` · `trainLevel` · `heroLevel` · `trainProgress` · `costItems` · `addProp` · `addPropPercent`
- `allProp` · `allPropPercent` · `pageType`

### `NewHeroTrain/NewPerfectTrain`
- `id` · `trainLevel` · `addProp` · `addPropPercent` · `powerFactorB` · `powerFactorD`

### `NewHeroTrain/_NewHeroTrainItem`
- `id` · `oldItem` · `newItem` · `exchange`

### `NewHeroTrain/_NewHeroTrainValue`
- `id` · `level` · `oldValue` · `newValue` · `exchange`
