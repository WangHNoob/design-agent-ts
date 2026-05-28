---
type: table_schema
title: "表族 Team"
group: "Team"
table_count: 3
---

# 表族 `Team`

共 3 张表。数据源：`knowledge/gamedata/`。

## 成员表清单
| 表名 | 字段数 | 相对路径 |
|------|--------|----------|
| `TeamFormationAdvice` | 2 | TeamFormationAdvice.xlsx |
| `TeamTarget` | 15 | TeamTarget.xlsx |
| `TeamTaskSuccorBubble` | 4 | TeamTaskSuccorBubble.xlsx |

## 字段明细
### `TeamFormationAdvice`
- `id` · `description`

### `TeamTarget`
- `targetId` · `targetNameIndex` · `targetType` · `targetSubNameIndex` · `levelLow` · `levelHigh` · `showOrder` · `formationAdvice`
- `targetCheckType` · `needMemberNum` · `autoGetTarget` · `autoFilling` · `fillCount` · `isShow` · `hasRobot`

### `TeamTaskSuccorBubble`
- `id` · `content` · `duration` · `isSynShowInUI`
