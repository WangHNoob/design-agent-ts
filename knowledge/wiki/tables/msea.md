---
type: table_schema
title: "表族 msea"
group: "msea"
table_count: 10
---

# 表族 `msea`

共 10 张表。数据源：`knowledge/gamedata/`。

## 成员表清单
| 表名 | 字段数 | 相对路径 |
|------|--------|----------|
| `msea/MSea` | 11 | msea/MSea.xlsx |
| `msea/MSeaIsland` | 5 | msea/MSeaIsland.xlsx |
| `msea/MSeaItem` | 2 | msea/MSeaItem.xlsx |
| `msea/MSeaSearchLevel` | 2 | msea/MSeaSearchLevel.xlsx |
| `msea/_MSeaBoss` | 7 | msea/_MSeaBoss.xlsx |
| `msea/_MSeaInteractionThingEffect` | 8 | msea/_MSeaInteractionThingEffect.xlsx |
| `msea/_MSeaInteractionThingEffectItem` | 5 | msea/_MSeaInteractionThingEffectItem.xlsx |
| `msea/_MSeaIslandTransPointPos` | 10 | msea/_MSeaIslandTransPointPos.xlsx |
| `msea/_MSeaRandomPos` | 6 | msea/_MSeaRandomPos.xlsx |
| `msea/_MSeaShop` | 6 | msea/_MSeaShop.xlsx |

## 字段明细
### `msea/MSea`
- `id` · `场景Id` · `名字` · `等级限制` · `EmptyKey-E2` · `暗怪检查周期（秒）` · `宝藏图奖励` · `EmptyKey-H2`
- `EmptyKey-I2` · `EmptyKey-J2` · `EmptyKey-K2`

### `msea/MSeaIsland`
- `islandId` · `sceneMapId` · `modelId` · `modelScale` · `islandRadius`

### `msea/MSeaItem`
- `itemId` · `maxCarryNum`

**出向外键** (1):
- `itemId` → `Item`

### `msea/MSeaSearchLevel`
- `level` · `exp`

### `msea/_MSeaBoss`
- `bossId` · `type(1.海岛boss,2隐藏boss,3海上boss，4暗怪)` · `seaId` · `monsterId` · `weight` · `treasureFrag` · `增加的探索值`

### `msea/_MSeaInteractionThingEffect`
- `id` · `互动物件Id` · `海域Id` · `效果类型` · `效果内容(1空，2怪群Id,3怪群Id，4奖励)` · `权重` · `藏宝图碎片(碎片编号，概率) -1表示不获得的概率` · `增加的探索值`

### `msea/_MSeaInteractionThingEffectItem`
- `id` · `互动物件Id(interactiveObjId)` · `使用的道具` · `效果类型` · `权重`

### `msea/_MSeaIslandTransPointPos`
- `id` · `transPosId(场景传送表里的Id)` · `islandId` · `类型` · `相对于岛的X` · `相对于岛的Z` · `传送后的位置X` · `传送后的位置Z`
- `传送后的方向X` · `传送后的方向Z`

### `msea/_MSeaRandomPos`
- `id` · `岛屿的场景地图Id` · `类型` · `EmptyKey-D2` · `EmptyKey-E2` · `EmptyKey-F2`

### `msea/_MSeaShop`
- `id` · `level` · `items` · `cost` · `discount` · `weight`
