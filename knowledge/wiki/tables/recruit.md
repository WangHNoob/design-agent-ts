---
type: table_schema
title: "表族 _Recruit"
group: "_Recruit"
table_count: 3
---

# 表族 `_Recruit`

共 3 张表。数据源：`knowledge/gamedata/`。

## 成员表清单
| 表名 | 字段数 | 相对路径 |
|------|--------|----------|
| `_RecruitFreeReward` | 2 | _RecruitFreeReward.xlsx |
| `_RecruitGroup` | 3 | _RecruitGroup.xlsx |
| `_RecruitReward` | 4 | _RecruitReward.xlsx |

## 字段明细
### `_RecruitFreeReward`
- `id` · `heroId`

**出向外键** (1):
- `heroId` → `Hero`

### `_RecruitGroup`
- `groupId` · `type` · `weight`

### `_RecruitReward`
- `id` · `heroId` · `groupId` · `weight`

**出向外键** (1):
- `heroId` → `Hero`
