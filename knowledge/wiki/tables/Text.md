---
type: table_schema
title: "表族 Text"
group: "Text"
table_count: 2
---

# 表族 `Text`

共 2 张表。数据源：`knowledge/gamedata/`。

## 成员表清单
| 表名 | 字段数 | 相对路径 |
|------|--------|----------|
| `Text` | 4 | Text.xlsx |
| `TextModule` | 6 | TextModule.xlsx |

## 字段明细
### `Text`
- `id` · `文字` · `EmptyKey-C2` · `EmptyKey-D2`

### `TextModule`
- `id` · `文字` · `EmptyKey-C2` · `EmptyKey-D2` · `EmptyKey-E2` · `EmptyKey-F2`

**入向外键** (1):
- `Guide/GuideStepExtra.textModuleId` → 本表
