---
type: table_schema
title: "表族 Op"
group: "Op"
table_count: 2
---

# 表族 `Op`

共 2 张表。数据源：`knowledge/gamedata/`。

## 成员表清单
| 表名 | 字段数 | 相对路径 |
|------|--------|----------|
| `OpDexActiveValueReward` | 12 | OpDexActiveValueReward.xlsx |
| `OpDexNostalgiaReward` | 6 | OpDexNostalgiaReward.xlsx |

## 字段明细
### `OpDexActiveValueReward`
- `barId` · `stage` · `activeType` · `activeNum` · `powerFactorD` · `rewardName` · `property` · `propertyPercent`
- `buff` · `activeValueName` · `desc` · `powerFactorB`

### `OpDexNostalgiaReward`
- `ID` · `Type` · `rewards` · `titleId` · `name` · `desc`

**出向外键** (1):
- `titleId` → `Title`
