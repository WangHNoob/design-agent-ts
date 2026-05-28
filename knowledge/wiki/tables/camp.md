---
type: table_schema
title: "表族 camp"
group: "camp"
table_count: 3
---

# 表族 `camp`

共 3 张表。数据源：`knowledge/gamedata/`。

## 成员表清单
| 表名 | 字段数 | 相对路径 |
|------|--------|----------|
| `camp/campBuff` | 5 | camp/campBuff.xlsx |
| `camp/campHero` | 7 | camp/campHero.xlsx |
| `camp/campLevel` | 6 | camp/campLevel.xlsx |

## 字段明细
### `camp/campBuff`
- `campBuffId` · `conditionType` · `conditionParam` · `fightBuff` · `buffDesc`

### `camp/campHero`
- `campId` · `allHero` · `coreHero` · `open` · `campName` · `campIcon` · `ifShow`

### `camp/campLevel`
- `id` · `campId` · `campLevel` · `upCost` · `campbuff` · `campDesc`
