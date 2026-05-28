---
type: table_schema
title: "表族 Attainment"
group: "Attainment"
table_count: 11
---

# 表族 `Attainment`

共 11 张表。数据源：`knowledge/gamedata/`。

## 成员表清单
| 表名 | 字段数 | 相对路径 |
|------|--------|----------|
| `Attainment/AttainmentBlessItemUI` | 3 | Attainment/AttainmentBlessItemUI.xlsx |
| `Attainment/AttainmentBlessTalk` | 3 | Attainment/AttainmentBlessTalk.xlsx |
| `Attainment/AttainmentCollectProgress` | 3 | Attainment/AttainmentCollectProgress.xlsx |
| `Attainment/AttainmentMainPageImage` | 8 | Attainment/AttainmentMainPageImage.xlsx |
| `Attainment/AttainmentSubPage` | 12 | Attainment/AttainmentSubPage.xlsx |
| `Attainment/AttainmentTask` | 6 | Attainment/AttainmentTask.xlsx |
| `Attainment/AttainmentTaskTab` | 6 | Attainment/AttainmentTaskTab.xlsx |
| `Attainment/AttainmentUIConfig` | 2 | Attainment/AttainmentUIConfig.xlsx |
| `Attainment/_AttainmentTaskType` | 4 | Attainment/_AttainmentTaskType.xlsx |
| `Attainment/_AttainmentTreeItem` | 4 | Attainment/_AttainmentTreeItem.xlsx |
| `Attainment/_AttainmentTreeRule` | 5 | Attainment/_AttainmentTreeRule.xlsx |

## 字段明细
### `Attainment/AttainmentBlessItemUI`
- `id` · `rope` · `bell`

### `Attainment/AttainmentBlessTalk`
- `Id` · `rule` · `text`

### `Attainment/AttainmentCollectProgress`
- `id` · `reward` · `progress`

### `Attainment/AttainmentMainPageImage`
- `id` · `buttonPic` · `position` · `duration` · `animationFirstPosition` · `alpha` · `open` · `waitTime`

### `Attainment/AttainmentSubPage`
- `id` · `jumpId` · `buttonPic` · `closebuttonPic` · `buttonText` · `position` · `duration` · `animationFirstPosition`
- `alpha` · `anchorType` · `MessageTips` · `KV`

### `Attainment/AttainmentTask`
- `Id` · `reward` · `SliderMax` · `description` · `taskName` · `jumpId`

### `Attainment/AttainmentTaskTab`
- `Id` · `buttonName` · `imagePath` · `selectText` · `lockText` · `lockMessageBox`

### `Attainment/AttainmentUIConfig`
- `id` · `value`

### `Attainment/_AttainmentTaskType`
- `7` · `1` · `9999` · `2`

### `Attainment/_AttainmentTreeItem`
- `id` · `奖励` · `数量` · `稀有度`

### `Attainment/_AttainmentTreeRule`
- `id` · `起始抽数` · `结束抽数` · `物品组` · `权重`
