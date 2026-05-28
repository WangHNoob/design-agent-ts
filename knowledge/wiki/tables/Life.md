---
type: table_schema
title: "表族 _Life"
group: "_Life"
table_count: 2
---

# 表族 `_Life`

共 2 张表。数据源：`knowledge/gamedata/`。

## 成员表清单
| 表名 | 字段数 | 相对路径 |
|------|--------|----------|
| `_LifeSkillDecomposeQualityRandom` | 7 | _LifeSkillDecomposeQualityRandom.xlsx |
| `_LifeSkillDecomposeTypeRandom` | 6 | _LifeSkillDecomposeTypeRandom.xlsx |

## 字段明细
### `_LifeSkillDecomposeQualityRandom`
- `id` · `skillType` · `level` · `type` · `quality` · `itemId` · `numRate`

**出向外键** (1):
- `itemId` → `Item`

### `_LifeSkillDecomposeTypeRandom`
- `id` · `skillType` · `level` · `type` · `quality` · `weight`
