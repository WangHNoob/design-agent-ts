---
type: table_schema
title: "表族 bless"
group: "bless"
table_count: 4
---

# 表族 `bless`

共 4 张表。数据源：`knowledge/gamedata/`。

## 成员表清单
| 表名 | 字段数 | 相对路径 |
|------|--------|----------|
| `bless/BlessTask` | 6 | bless/BlessTask.xlsx |
| `bless/SpringFestivalBlessingConfig` | 8 | bless/SpringFestivalBlessingConfig.xlsx |
| `bless/SpringFestivalBlessingSceneConfig` | 3 | bless/SpringFestivalBlessingSceneConfig.xlsx |
| `bless/_BlessLottery` | 6 | bless/_BlessLottery.xlsx |

## 字段明细
### `bless/BlessTask`
- `id` · `type` · `num` · `reward` · `description` · `title`

### `bless/SpringFestivalBlessingConfig`
- `id` · `cameraPositionX` · `cameraPositionY` · `cameraPositionZ` · `cameraRotationX` · `cameraRotationY` · `cameraRotationZ` · `cameraFOV`

### `bless/SpringFestivalBlessingSceneConfig`
- `sceneId` · `treeSceneAreaId` · `treePath`

**出向外键** (1):
- `sceneId` → `Scene/Scene`

### `bless/_BlessLottery`
- `id` · `随机池类型` · `权重` · `幸运值` · `奖励` · `EmptyKey-F2`
