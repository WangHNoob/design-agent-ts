---
type: table_schema
title: "表族 URHeroIntensify"
group: "URHeroIntensify"
table_count: 1
---

# 表族 `URHeroIntensify`

共 1 张表。数据源：`knowledge/gamedata/`。

## 成员表清单
| 表名 | 字段数 | 相对路径 |
|------|--------|----------|
| `URHeroIntensify/URHeroIntensify` | 11 | URHeroIntensify/URHeroIntensify.xlsx |

## 字段明细
### `URHeroIntensify/URHeroIntensify`
- `id` · `heroId` · `star` · `phase` · `isMaxLv` · `itemCost` · `coinCost` · `propNum`
- `propFactor` · `propPercent` · `skillID`

**出向外键** (2):
- `heroId` → `Hero`
- `skillID` → `fight/Skill`
