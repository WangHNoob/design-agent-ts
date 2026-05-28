---
type: table_schema
title: "表族 Dialog"
group: "Dialog"
table_count: 2
---

# 表族 `Dialog`

共 2 张表。数据源：`knowledge/gamedata/`。

## 成员表清单
| 表名 | 字段数 | 相对路径 |
|------|--------|----------|
| `Dialog` | 57 | Dialog.xlsx |
| `DialogOption` | 9 | DialogOption.xlsx |

## 字段明细
### `Dialog`
- `dialogId` · `nextDialogId` · `title` · `content` · `bg` · `actorType1` · `actorType2` · `actorType3`
- `actorType4` · `actorType5` · `actor1` · `actor2` · `actor3` · `actor4` · `actor5` · `offsetX1`
- `offsetY1` · `offsetX2` · `offsetY2` · `offsetX3` · `offsetY3` · `offsetX4` · `offsetY4` · `offsetX5`
- `offsetY5` · `angle1` · `angle2` · `angle3` · `angle4` · `angle5` · `scale1` · `scale2`
- `scale3` · `scale4` · `scale5` · `focusActors` · `talkerActors` · `hideUI` · `hidePlayer` · `hideOtherPlayer`
- `hideNpc` · `clickInterval` · `isSubDialog` · `canCancel` · `openEvent` · `openEventArgs` · `closeEvent` · `closeEventArgs`
- `actorArgs` · `bgm` · `audio` · `isBootstrap` · `bootstrapMode` · `effectArgs` · `cameraImage` · `cameraEffect`
- `postEffect`

**入向外键** (3):
- `DialogOption.dialogId` → 本表
- `HomeLand/HomeBuildingType.dialogId` → 本表
- `SeaArea/_GvoRescueOption.dialogId` → 本表

### `DialogOption`
- `id` · `dialogId` · `optionId` · `icon` · `text` · `nextDialogId` · `clickEvent` · `clickEventArgs`
- `condition`

**出向外键** (1):
- `dialogId` → `Dialog`
